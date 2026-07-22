// BLDRS_element_properties GLTF extension — writer + reader.
//
// Carries the IFC element-properties tables (item properties +
// property sets) inside the GLB cache artifact so the Properties
// panel can render on cache-hit without a live IFC parser. The
// extension's reach includes every entity transitively referenced
// from a spatial-tree element — the Properties panel's renderer
// walks `IfcReferenceValue` (`{type: 5, value: expressID}`) values
// via `@bldrs-ai/ifclib`'s `deref`, which calls back into
// `model.getItemProperties(refId)`. A cache that only had spatial-
// tree leaves would dead-end at the first reference.
//
// Companion to `src/loader/bldrsSpatialTree.js`. See
// `design/new/viewer-replacement.md` §3b.iii default-on gating and
// `design/new/glb-model-sharing.md` §"Extension catalogue".
//
// Wire shape (binary container in a glTF bufferView) — the
// **block-indexed** format, schema 0.13.0+:
//
//   [0..3]   magic  "BPRI" (Bldrs PRoperties Indexed)
//   [4..7]   u32 LE container format version (currently 1)
//   [8..11]  u32 LE byteLength of the gzipped header JSON
//   [12..)   gzipped header JSON
//   [then]   concatenated per-block gzip members
//
// Header JSON:
//
//   {
//     blocks:       [[byteOffset, byteLength], ...],  // into the block
//                                                     // region (starts
//                                                     // right after the
//                                                     // header bytes)
//     blockIds:     [[expressID, ...], ...],          // ids per block,
//                                                     // same order
//     propertySets: { [productExpressID]: [psetExpressID, ...] },
//   }
//
// Each block decompresses to a standalone JSON object
// `{"<expressID>": {...shallow IFC entity data}, ...}` of about
// BLOCK_TARGET_CHARS uncompressed. The union of all blocks is the
// `itemProperties` closure: every entity reachable via references
// from spatial-tree elements (products, their properties, referenced
// types, owner histories, etc.). `propertySets` is the product→psetIds
// index — the consumer rebuilds the pset array per product by
// fetching each pset id as a record.
//
// Why blocks + an index instead of one gzipped JSON document (the
// pre-0.13.0 format): decompressing a monolithic payload needs the
// whole JSON as ONE JS string, and V8 caps strings at ~512MiB —
// PSB-class models exceed that and the old reader died in pako's
// string join (`RangeError: Invalid string length`) before
// `JSON.parse` even ran. Worse, even under the cap the parse
// materialised the full multi-GB object graph for a panel that shows
// one element at a time. The indexed format keeps reads bounded: one
// ~1MB block inflates + parses per miss, LRU-cached. There is no
// legacy-format read path — an old payload raises a "clear your
// local cache" alert instead (the cache-key schema bump already
// makes locally cached old artifacts read as a miss; the alert
// covers GLBs that arrive as files).
//
// Why split psets into an id index instead of inlining per product:
// psets are shared across many products in typical IFCs (one
// `Pset_WallCommon` referenced by every wall). Deduplicating
// via shared IDs keeps the artifact 3-5× smaller than inlining.
//
// Reader is **lazy** — the `afterRoot` hook stores the container
// bytes and per-entity accessors on `userData.bldrsElementProperties`.
// The header (index + pset table) decodes on the first
// `model.getItemProperties` / `model.getPropertySets` call; record
// blocks decode on demand. A load that never opens the Properties
// panel pays nothing.
//
// TODO(viewer-replacement Phase 5+): same untrusted-input concern as
// `bldrsSpatialTree.js`. Today the writer is in-browser and trusted;
// shape validation is minimal. Once GLBs arrive from arbitrary user
// browsers (originator-side share), enforce the full validation pass
// per `design/new/glb-model-sharing.md` §"Validation and trust" —
// size ceilings (decompressed payload up to a hard cap; the doc
// suggests 100MB), HTML-strip on user-authored strings before any
// DOM render, integrity check (every key in `propertySets` exists
// as a product in `itemProperties`).
import * as pako from 'pako'
import {IFCRELDEFINESBYPROPERTIES} from 'web-ifc'
import useStore from '../store/useStore'
import {yieldToBrowser} from '../utils/scheduling'
import {glbInfo, glbVerbose} from './glbLog'


export const BLDRS_ELEMENT_PROPERTIES_EXTENSION_NAME = 'BLDRS_element_properties'

// Container magic "BPRI" as a LE u32 (bytes 0x42 0x50 0x52 0x49 on
// disk). Distinct from the gzip magic (0x1f 0x8b) that opened every
// pre-0.13.0 payload — the reader tells the two formats apart by
// these leading bytes alone.
const CONTAINER_MAGIC = 0x49525042
const CONTAINER_VERSION = 1
// magic u32 + version u32 + headerByteLength u32.
const CONTAINER_HEADER_BYTES = 12
const GZIP_MAGIC_0 = 0x1f
const GZIP_MAGIC_1 = 0x8b

// Target uncompressed JSON chars per record block. Bounds every
// reader-side string/parse to ~this size regardless of model scale
// (the whole point of the format — see the header comment), while
// keeping the block count low enough that the header's per-block
// index stays trivial (a PSB-class ~800MB closure is ~800 blocks).
// Also the writer-side flush threshold: records concatenate into a
// small string buffer until a block fills — per-record gzip calls
// would pay setup overhead millions of times; one giant join would
// recreate the whole-payload-resident problem the streaming writer
// exists to avoid.
const BLOCK_TARGET_CHARS = 1048576 // 1 MiB

// Decoded (inflated + parsed) blocks the reader keeps hot, LRU.
// Properties-panel access patterns hop between a product's block and
// the blocks holding its psets / owner history / material refs —
// a handful of ~1MB blocks covers that working set.
const BLOCK_CACHE_MAX = 16


/**
 * Incremental writer for the block-indexed container. Both capture
 * paths feed it: the streaming sweep adds records as it walks the
 * parsed model (never holding the closure as one object graph), the
 * slow BFS path adds them from its materialised map. Memory held is
 * O(compressed blocks + id lists + one uncompressed block).
 */
export class ElementPropertiesContainerWriter {
  /**
   * @param {number} [blockTargetChars] uncompressed chars per block —
   *   tests pass a small value to force multi-block containers
   */
  constructor(blockTargetChars = BLOCK_TARGET_CHARS) {
    this.blockTargetChars = blockTargetChars
    this.gzippedBlocks = []
    this.blockIds = []
    this.curParts = []
    this.curIds = []
    this.curChars = 0
    this.recordCount = 0
  }

  /**
   * Append one entity record to the container.
   *
   * @param {number} expressID
   * @param {object} props shallow IFC entity data (JSON-serialisable)
   */
  addRecord(expressID, props) {
    const rec = `"${expressID}":${JSON.stringify(props)}`
    this.curParts.push(rec)
    this.curIds.push(expressID)
    this.curChars += rec.length
    this.recordCount++
    if (this.curChars >= this.blockTargetChars) {
      this.flushBlock()
    }
  }

  /** Gzip the pending records into a finished block. */
  flushBlock() {
    if (this.curIds.length === 0) {
      return
    }
    this.gzippedBlocks.push(pako.gzip(`{${this.curParts.join(',')}}`))
    this.blockIds.push(this.curIds)
    this.curParts = []
    this.curIds = []
    this.curChars = 0
  }

  /**
   * Flush and assemble the final container bytes.
   *
   * @param {object} [propertySets] product→psetIds index
   * @return {Uint8Array}
   */
  finish(propertySets) {
    this.flushBlock()
    const blocks = []
    let offset = 0
    for (const block of this.gzippedBlocks) {
      blocks.push([offset, block.byteLength])
      offset += block.byteLength
    }
    const header = {blocks, blockIds: this.blockIds, propertySets: propertySets ?? {}}
    const headerGz = pako.gzip(JSON.stringify(header))
    const out = new Uint8Array(CONTAINER_HEADER_BYTES + headerGz.byteLength + offset)
    const dv = new DataView(out.buffer)
    dv.setUint32(0, CONTAINER_MAGIC, true)
    dv.setUint32(4, CONTAINER_VERSION, true)
    dv.setUint32(8, headerGz.byteLength, true)
    out.set(headerGz, CONTAINER_HEADER_BYTES)
    let p = CONTAINER_HEADER_BYTES + headerGz.byteLength
    for (const block of this.gzippedBlocks) {
      out.set(block, p)
      p += block.byteLength
    }
    return out
  }
}


/**
 * Encode a fully-materialised `{itemProperties, propertySets}` pair
 * into container bytes. Used by the slow capture path (whose BFS
 * already holds the closure as one object) and by tests.
 *
 * @param {object} itemProperties expressID → record
 * @param {object} propertySets productID → psetIds
 * @param {number} [blockTargetChars]
 * @return {Uint8Array}
 */
export function encodeElementProperties(itemProperties, propertySets, blockTargetChars = BLOCK_TARGET_CHARS) {
  const writer = new ElementPropertiesContainerWriter(blockTargetChars)
  for (const id of Object.keys(itemProperties)) {
    writer.addRecord(Number(id), itemProperties[id])
  }
  return writer.finish(propertySets)
}


/**
 * Parse a container's fixed preamble + gzipped header. Throws on
 * anything malformed — callers translate to their own degrade path.
 *
 * @param {Uint8Array} bytes
 * @return {{header: object, blocksStart: number}} `blocksStart` is
 *   the byte offset of the block region within `bytes`
 */
function parseContainerHeader(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < CONTAINER_HEADER_BYTES) {
    throw new Error('container too short')
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (dv.getUint32(0, true) !== CONTAINER_MAGIC) {
    throw new Error('bad container magic')
  }
  const version = dv.getUint32(4, true)
  if (version !== CONTAINER_VERSION) {
    throw new Error(`unsupported container version ${version}`)
  }
  const headerLen = dv.getUint32(8, true)
  const blocksStart = CONTAINER_HEADER_BYTES + headerLen
  if (blocksStart > bytes.byteLength) {
    throw new Error(`header length ${headerLen} exceeds container ${bytes.byteLength}`)
  }
  const header = JSON.parse(pako.ungzip(bytes.subarray(CONTAINER_HEADER_BYTES, blocksStart), {to: 'string'}))
  if (!header || typeof header !== 'object' ||
      !Array.isArray(header.blocks) || !Array.isArray(header.blockIds) ||
      header.blocks.length !== header.blockIds.length ||
      !header.propertySets || typeof header.propertySets !== 'object') {
    throw new Error('malformed container header')
  }
  return {header, blocksStart}
}


/**
 * Decode an entire container back to the materialised
 * `{itemProperties, propertySets}` pair. Test/tooling helper — the
 * runtime read path stays per-block (`makeElementPropertiesPayload`)
 * precisely so it never has to do this.
 *
 * @param {Uint8Array} bytes container bytes
 * @return {object} `{itemProperties, propertySets}`
 */
export function decodeElementProperties(bytes) {
  const {header, blocksStart} = parseContainerHeader(bytes)
  const itemProperties = {}
  for (const [offset, byteLength] of header.blocks) {
    const blockBytes = bytes.subarray(blocksStart + offset, blocksStart + offset + byteLength)
    Object.assign(itemProperties, JSON.parse(pako.ungzip(blockBytes, {to: 'string'})))
  }
  return {itemProperties, propertySets: header.propertySets}
}

// Cooperative-yield interval for the fast-path entity walk + the
// reachability BFS. The fast path iterates every parsed IFC entity
// (millions for big models, mostly geometric primitives); without a
// yield the main thread blocks the user's hover-pick / camera-
// controls for the full duration. 5000 entities per yield trades
// ~5-10 macrotask hops on a mid-size IFC for a freeze-free write —
// the perf overhead of the await + setTimeout(0) is in the
// microseconds range per yield, well below what's perceptible.
const ENTITIES_PER_YIELD = 5000

// IFC reference-value type discriminant. `web-ifc-three` (and Conway
// at the same layer) serialise references between entities as
// `{type: 5, value: expressID}`. The writer's BFS scanner looks for
// this shape to identify edges in the reference graph.
const IFC_REF_TYPE = 5

// Bound the closure walk so a hostile or pathological model can't
// trap the writer in an unbounded expansion. Real IFCs reach tens of
// thousands of unique entities from the spatial tree; the ceiling is
// far above that.
const MAX_CLOSURE_SIZE = 1_000_000

// Bound the recursion the closure scan descends into when looking
// for references inside a single entity's value tree. `IfcLocalPlacement`
// chains and nested property values get deep but not THIS deep; the
// ceiling exists as JS-stack defense against adversarial inputs.
const MAX_VALUE_DEPTH = 100

// Field names whose ref-chains are NOT followed during the closure
// BFS — these are the geometric / placement chains that bottom out
// in IfcCartesianPoint / IfcDirection / IfcPolyloop etc. The
// Properties panel skips these top-level fields entirely
// (`itemProperties.jsx#prettyProps` returns null for them), so the
// transitive entities behind them are dead weight in the cache.
// Filtering here cuts Snowdon's captured set from ~2.7M entities
// (every parsed IFC entity, dominated by geometric primitives) to
// ~30-50k (IfcRoot products + their psets / quantities / materials
// / classifications / owner history). Net cache impact: ~35MB
// compressed → ~1MB compressed for the properties payload.
//
// Kept deliberately loose to avoid false negatives — these four
// field names cover the geometric backbone but property-specific
// chains (HasProperties, Quantities, NominalValue refs) are NOT
// blocked, so the Properties panel surface stays complete.
const GEOMETRIC_FIELD_NAMES = new Set([
  'Representation',
  'ObjectPlacement',
  'RepresentationContexts',
  'Representations',
])


/**
 * Walk an entity's value subtree and collect any IFC reference IDs
 * (`{type: 5, value: <expressID>}` shape). Returns a new array of
 * unique IDs found. Used by the BFS to extend the closure work queue.
 *
 * Skips the four geometric / placement field names — chasing those
 * pulls in every IfcCartesianPoint / IfcDirection / IfcPolyloop in
 * the file (millions of entities on real models) without any
 * Properties-panel use case for the data.
 *
 * @param {*} value any subtree under an IFC entity's data
 * @param {Array<number>} acc accumulator for IDs found (mutated)
 * @param {number} depth recursion depth — bounded by `MAX_VALUE_DEPTH`
 */
function collectRefIds(value, acc, depth = 0) {
  if (value === null || value === undefined) {
    return
  }
  if (depth >= MAX_VALUE_DEPTH) {
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectRefIds(item, acc, depth + 1)
    }
    return
  }
  if (typeof value !== 'object') {
    return
  }
  // IFC reference shape: {type: 5, value: <expressID>}.
  if (value.type === IFC_REF_TYPE && typeof value.value === 'number') {
    acc.push(value.value)
    return
  }
  // Plain object — recurse into each value, except geometric chains.
  // Top-level only: once we're INSIDE a non-geometric field, the
  // sub-tree might still legally hold refs we care about (e.g. an
  // IfcMaterialLayerSetUsage has nested refs). The skip is per-key
  // at depth=0 in the entity's body where field names are
  // meaningful, not inside arbitrary nested structures.
  for (const key of Object.keys(value)) {
    if (depth === 0 && GEOMETRIC_FIELD_NAMES.has(key)) {
      continue
    }
    collectRefIds(value[key], acc, depth + 1)
  }
}


/**
 * Walk a spatial-structure tree and return every node's expressID.
 * The result seeds the closure BFS — these are the products the
 * Properties panel can display directly.
 *
 * @param {object|null|undefined} root spatial-tree root node
 * @return {Array<number>}
 */
function collectSpatialTreeIds(root) {
  const ids = []
  const visit = (node) => {
    if (!node || typeof node.expressID !== 'number') {
      return
    }
    ids.push(node.expressID)
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        visit(child)
      }
    }
  }
  visit(root)
  return ids
}


/**
 * Capture the element-properties closure for a model from an
 * IfcManager-like source. Tries the streaming sync-bulk path first
 * (`captureBldrsElementPropertiesStreaming` — reaches into the Conway
 * adapter's parsed model, iterates synchronously, and gzips the wire
 * JSON incrementally so the full property closure is never resident
 * as one JS object graph), falling back to the slow per-entity async
 * BFS for environments that don't expose the adapter internals
 * (tests, non-Conway loaders).
 *
 * Both paths produce the same decoded record set (same entities,
 * same pset index) so the cached artifact is equivalent regardless
 * of which path ran. The streaming path is ~100× faster on large
 * IFCs (no Promise per entity) AND fixed-memory: peak retained heap
 * is O(reachable ids + one record) instead of O(all parsed records).
 *
 * Returns `{compressedBytes: Uint8Array}` — the block-indexed
 * container (see the header comment), ready to embed as a bufferView
 * payload (pass to `injectGlbExtensions` as `precompressed`) — or
 * `null` when no manager is available (non-IFC sources, cache-hit
 * GLB with no live parser).
 *
 * @param {object|null|undefined} ifcManager IfcManager-like.
 * @param {number} modelID
 * @param {object|null|undefined} spatialTree the JSON tree
 *   `captureBldrsSpatialTree` returned. Acts as the BFS seed for the
 *   slow path; the streaming path ignores it (scans all entities).
 * @return {Promise<object|null>}
 */
export async function captureBldrsElementProperties(ifcManager, modelID, spatialTree) {
  if (!ifcManager) {
    return null
  }
  const compressedBytes = await captureBldrsElementPropertiesStreaming(ifcManager, modelID)
  if (compressedBytes !== null) {
    return {compressedBytes}
  }
  const slow = await captureBldrsElementPropertiesSlow(ifcManager, modelID, spatialTree)
  if (slow === null) {
    return null
  }
  return {compressedBytes: encodeElementProperties(slow.itemProperties, slow.propertySets)}
}


// NOTE (bench, SKYLARK 7.8M entities, conway 1.372-1.374): an earlier
// revision also released conway's entity cache every 200k getLines
// mid-sweep, to bound the descriptor transient. Once the release
// became real (conway >= 1.373; it was an optional-chained no-op on
// 1.372) that tick REGRESSED both axes it was meant to protect:
// sweep time 19-22s -> 31-47s (each wipe forces vtable + descriptor
// re-growth churn) and process heap 1.6GB -> 3.3GB (the churn outruns
// the GC). Letting the sweep run uncapped holds the SoA descriptor
// transient (~1GB on 9M-entity IFCs) exactly as the shipped #1589
// behavior did, and the single release in the `finally` below still
// returns it when the sweep ends.


/**
 * Streaming sync-bulk capture path. Reaches into the Conway adapter's
 * internal `IfcApiProxyIfc` to get the upstream Conway `IfcStepModel`
 * and walks it synchronously, gzipping records into container blocks
 * incrementally — the full property closure is NEVER resident as one
 * JS object graph.
 * Peak retained memory is O(reachable ids + pset index + one record +
 * compressed output) instead of the old fast path's O(every parsed
 * record) (~GBs on 100MB-class IFCs before the reachability filter
 * could prune).
 *
 * Two sweeps, identical decoded output to the old capture-then-filter
 * fast path:
 *   1. Root-seed scan via sync `proxy.getLine`. Preferred enumeration
 *      is conway's `RootExpressIDs` (≥1.383) — the type index yields
 *      just the IfcRoot-derived ids, skipping the ~96% of records that
 *      are geometric resources without materialising a descriptor per
 *      record. Fallback (older conway, degenerate iterators) is the
 *      legacy linear scan of every parsed entity. Either way,
 *      IfcRoot-derived entities (`GlobalId` present — products, rels,
 *      psets) are serialized into the stream immediately and their
 *      non-geometric refs queued. `IfcRelDefinesByProperties` entities
 *      additionally feed the product→psetIds index in the same pass.
 *      Records not kept are dropped on the spot.
 *   2. Ref-closure drain: queued ids (non-root entities reachable from
 *      a root — property values, materials, owner history etc.) are
 *      fetched by id, serialized, and their refs queued in turn.
 *      `collectRefIds` skips the geometric backbone (Representation /
 *      ObjectPlacement / RepresentationContexts / Representations) at
 *      the entity top level, so the closure stops at the geometric
 *      boundary — same ~2.7M → ~50k entity cut as before on Snowdon.
 *
 * Memory discipline during the sweep:
 *   - `stepModel.elementMemoization` is turned off so conway doesn't
 *     pin an extracted entity object per descriptor (restored after).
 *   - conway's entity/descriptor cache is released once, when the
 *     sweep ends (`proxy.releaseEntityCache`, conway ≥1.373 —
 *     optional-chained no-op on older versions). Deliberately NOT
 *     released mid-sweep: see the bench NOTE just below
 *     `STREAM_FLUSH_CHARS` — periodic mid-sweep releases regressed
 *     both sweep time and peak heap through re-growth churn.
 *
 * Returns `null` (so the caller falls back to the slow path) when:
 *   - the adapter surface isn't accessible (test stubs without
 *     `ifcAPI.getPassthrough`, non-Conway IFC backends)
 *   - the proxy's internal `model` field isn't where we expect
 *   - the iteration yields zero entities (parser state empty)
 *   - assembling the container throws (gzip failure)
 *
 * Coupling notes: this reaches `ifcAPI.getPassthrough(modelID)` and
 * then `proxy.model[0]` (the IfcStepModel) — both are stable on
 * the current adapter (see `ifc_api.js:53` and `ifc_api_proxy_ifc.js:154`)
 * but neither is part of the formal public API. The fallback to
 * the slow path keeps tests + non-Conway sources working.
 *
 * @param {object} ifcManager IfcManager-like with `.ifcAPI`.
 * @param {number} modelID
 * @return {Promise<Uint8Array|null>} block-indexed container bytes
 *   (what `makeElementPropertiesPayload` reads) or `null` when the
 *   streaming path is unavailable.
 */
async function captureBldrsElementPropertiesStreaming(ifcManager, modelID) {
  const ifcAPI = ifcManager.ifcAPI
  if (!ifcAPI || typeof ifcAPI.getPassthrough !== 'function') {
    return null
  }
  const proxy = ifcAPI.getPassthrough(modelID)
  // `proxy.model` is a tuple [stepModel, scene, geometryMap, ...]
  // built in `IfcApiProxyIfc` ctor. We only need [0] (the
  // IfcStepModel); the rest is geometry state.
  const stepModel = proxy?.model?.[0]
  if (!stepModel || typeof stepModel[Symbol.iterator] !== 'function' ||
      typeof proxy.getLine !== 'function') {
    return null
  }

  // Roots-only enumeration (conway ≥1.383): `RootExpressIDs` yields the
  // express IDs of exactly the IfcRoot-derived records (everything with
  // a GlobalId — products, rels, psets, quantities) straight from the
  // type index, without materialising an entity descriptor per record.
  // On PSB-class models that skips ~96% of the ~9.7M records the full
  // scan below would otherwise touch just to discard. Older conway (or
  // non-IFC schemas) returns undefined → full scan.
  let rootExpressIDs = null
  if (typeof ifcAPI.RootExpressIDs === 'function') {
    // eslint-disable-next-line new-cap
    const iterated = ifcAPI.RootExpressIDs(modelID)
    if (iterated && typeof iterated[Symbol.iterator] === 'function') {
      rootExpressIDs = iterated
    }
  }

  const startMs = Date.now()
  // Records land in the container writer in BFS discovery order (not
  // ascending-integer) — block assignment is arbitrary anyway; the
  // reader looks entries up through the header's id→block index.
  const writer = new ElementPropertiesContainerWriter()
  const emitRecord = (id, props) => {
    writer.addRecord(id, props)
  }

  // `visited` = "serialized or queued for serialization" — every id
  // added is emitted exactly once (roots inline during the scan,
  // ref-closure entities during the drain; a root first discovered as
  // someone's ref drains from the queue instead and the scan skips it).
  const visited = new Set()
  const queue = []
  let queueHead = 0
  const propertySets = {}
  let sawEntity = false
  let psetRelCount = 0
  // Cooperative-yield counter — see ENTITIES_PER_YIELD comment.
  // Counted on every iteration (not just kept entities) so the yield
  // cadence is independent of the percentage filtered out.
  let iterCount = 0

  const hadMemoization = stepModel.elementMemoization
  stepModel.elementMemoization = false
  try {
    /**
     * Sweep-1 record body, shared by the roots-only and full-scan
     * enumerations below: decode one record via sync `getLine`, feed
     * the pset index, emit IfcRoot seeds, queue the ref frontier.
     *
     * @param {number} expressID
     */
    const scanRecord = (expressID) => {
      let props
      try {
        // Sync — no Promise allocation, no microtask hop. This is the
        // 10-min-to-10-sec win on Snowdon: ~576k entities × ~10µs each
        // instead of × ~1ms each through the async manager surface.
        props = proxy.getLine(expressID)
      } catch (e) {
        // Per-entity failures are non-fatal — skip and continue. The
        // wit-three slow path swallows the same way (one entity gap
        // means one missing Properties row; not a cache abort).
        return
      }
      if (!props || typeof props !== 'object') {
        return
      }
      sawEntity = true

      // Inline pset-index extraction. An IfcRelDefinesByProperties
      // entity has `RelatedObjects` (an array of {type:5, value:productId}
      // refs to products) + `RelatingPropertyDefinition` ({type:5, value:psetId}
      // ref to the pset). Detect by numeric `type` (the IFC type code
      // — stable across wit-three's FromTape variants). An earlier
      // version of this code used `constructor.name` which silently
      // failed on Snowdon — `FromTape` does not always produce a
      // class with a usable `name` property, so the check missed every
      // rel. Wit-three's stock `getPropertySets(modelID, productID)`
      // does the same walk one product at a time over an async API —
      // building the index here in the same pass costs us nothing.
      if (props.type === IFCRELDEFINESBYPROPERTIES) {
        psetRelCount++
        const psetRef = props.RelatingPropertyDefinition
        const psetId = psetRef && typeof psetRef === 'object' ? psetRef.value : null
        const relatedObjects = props.RelatedObjects
        if (typeof psetId === 'number' && Array.isArray(relatedObjects)) {
          for (const obj of relatedObjects) {
            if (!obj || typeof obj !== 'object') {
              continue
            }
            const productId = obj.value
            if (typeof productId !== 'number') {
              continue
            }
            let list = propertySets[productId]
            if (!list) {
              list = []
              propertySets[productId] = list
            }
            // De-dup defensively — IFCs occasionally double-register.
            if (!list.includes(psetId)) {
              list.push(psetId)
            }
          }
        }
      }

      // Seed test: entities with `GlobalId`. IfcRoot mandates it, so
      // this is the canonical "selectable entity" test — no whitelist
      // of types needed. Covers products, processes, controls,
      // resources, actors, groups, ALL `IfcRelXxx`,
      // `IfcPropertySetDefinition`-derived entities (which includes
      // `IfcPropertySet` / `IfcElementQuantity`), and any future IFC
      // schema additions automatically. Non-root entities are dropped
      // here; the ones reachable from a root get re-fetched by id in
      // the drain sweep. The roots-only enumeration pre-filters to
      // exactly this set, so there the test is just a formality (and
      // the `visited` guard dedupes multi-mapped entities, which the
      // type index may yield once per mapping).
      if (props.GlobalId === undefined || visited.has(expressID)) {
        return
      }
      visited.add(expressID)
      emitRecord(expressID, props)
      const refs = []
      collectRefIds(props, refs)
      for (const refId of refs) {
        if (!visited.has(refId)) {
          visited.add(refId)
          queue.push(refId)
        }
      }
    }

    // Sweep 1: emit IfcRoot seeds, build the pset index, queue the
    // ref frontier. Preferred enumeration is roots-only via the type
    // index; fallback is the legacy linear scan of every parsed
    // entity. Both feed the identical `scanRecord` body, so the wire
    // payload is the same either way (key order aside — the reader
    // looks entries up by id).
    if (rootExpressIDs) {
      for (const expressID of rootExpressIDs) {
        if (++iterCount % ENTITIES_PER_YIELD === 0) {
          // Yield to the browser between chunks — the scan is pure JS
          // (no I/O, no Promise per entity), so without explicit
          // yields it would block the main thread for the whole walk.
          await yieldToBrowser()
        }
        if (typeof expressID !== 'number') {
          continue
        }
        scanRecord(expressID)
      }
      if (!sawEntity) {
        // Degenerate: the iterator yielded nothing usable (nothing has
        // been emitted either), so rescan everything the legacy way —
        // it distinguishes "empty parser state" from "no roots".
        rootExpressIDs = null
      }
    }
    if (!rootExpressIDs) {
      for (const entity of stepModel) {
        if (++iterCount % ENTITIES_PER_YIELD === 0) {
          // Same cooperative yield as above; this walk touches every
          // parsed entity (millions on big models) and would otherwise
          // freeze hover-pick / camera controls until it finishes.
          await yieldToBrowser()
        }
        const expressID = entity?.expressID
        if (typeof expressID !== 'number') {
          continue
        }
        scanRecord(expressID)
      }
    }

    if (!sawEntity) {
      // Parser state must have been empty / not the expected shape.
      // Let the slow path try; it'll log the right cause.
      return null
    }

    // Sweep 2: drain the ref closure. `collectRefIds` (shared with
    // the slow path) skips geometric field names at the entity's top
    // level, so the frontier never expands into the geometric
    // backbone. Property-specific chains (HasProperties, Quantities,
    // NominalValue refs, Material*, Classification*, OwnerHistory)
    // ARE followed because those field names aren't in
    // `GEOMETRIC_FIELD_NAMES`.
    while (queueHead < queue.length) {
      if (++iterCount % ENTITIES_PER_YIELD === 0) {
        await yieldToBrowser()
      }
      const id = queue[queueHead++]
      let props
      try {
        props = proxy.getLine(id)
      } catch (e) {
        continue
      }
      if (!props || typeof props !== 'object') {
        // Dangling ref (id not in the file) — same skip the legacy
        // filter applied via its `itemProperties[refId] !== undefined`
        // existence check.
        continue
      }
      emitRecord(id, props)
      const refs = []
      collectRefIds(props, refs)
      for (const refId of refs) {
        if (!visited.has(refId)) {
          visited.add(refId)
          queue.push(refId)
        }
      }
    }

    let containerBytes
    try {
      containerBytes = writer.finish(propertySets)
    } catch (e) {
      glbInfo(
        `${BLDRS_ELEMENT_PROPERTIES_EXTENSION_NAME}: container finish failed ` +
        `(${e}); falling back to slow path`)
      return null
    }

    glbInfo(
      `${BLDRS_ELEMENT_PROPERTIES_EXTENSION_NAME}: streamed ${writer.recordCount} ` +
      `reachable-from-IfcRoot entities (of ${iterCount} scanned, ` +
      `${rootExpressIDs ? 'roots-only' : 'full'} scan; ` +
      `${psetRelCount} IfcRelDefinesByProperties → ` +
      `${Object.keys(propertySets).length} products with psets) into ` +
      `${containerBytes.byteLength}B container ` +
      `(${writer.gzippedBlocks.length} blocks) in ${Date.now() - startMs}ms`)

    return containerBytes
  } finally {
    stepModel.elementMemoization = hadMemoization
    // Drop the descriptors the sweep materialised; they rematerialise
    // transparently on the next property access.
    proxy.releaseEntityCache?.()
  }
}


/**
 * Slow per-entity async BFS path. Used as a fallback when the fast
 * path can't reach the adapter internals (test stubs, non-Conway
 * loaders, future API drift). Walks the spatial tree as a seed set,
 * `await`s `ifcManager.getItemProperties(modelID, id, false, false)`
 * per entity, scans the result for IFC references (`{type:5, value:id}`)
 * to extend the closure. Bounded by `MAX_CLOSURE_SIZE` for defense
 * against pathological inputs.
 *
 * Slow because each `getItemProperties` is async + the manager does
 * per-call schema lookup + Promise allocation. On Snowdon (576k
 * entities) this took ~10 minutes; the fast path replaces it.
 *
 * Identical output shape to the fast path so the cache artifact is
 * stable across the two backends.
 *
 * @param {object} ifcManager IfcManager-like with `getItemProperties`
 *   and `getPropertySets` async methods.
 * @param {number} modelID
 * @param {object|null|undefined} spatialTree BFS seed source.
 * @return {Promise<object|null>}
 */
async function captureBldrsElementPropertiesSlow(ifcManager, modelID, spatialTree) {
  if (typeof ifcManager.getItemProperties !== 'function' ||
      typeof ifcManager.getPropertySets !== 'function') {
    return null
  }
  if (!spatialTree) {
    return null
  }
  const seeds = collectSpatialTreeIds(spatialTree)
  if (seeds.length === 0) {
    return null
  }

  const itemProperties = {}
  const propertySets = {}
  const seen = new Set()
  const queue = []
  for (const id of seeds) {
    if (!seen.has(id)) {
      seen.add(id)
      queue.push(id)
    }
  }

  // Phase 2: collect pset IDs per product up front. The pset IDs feed
  // back into the BFS (psets are entities; their properties land in
  // itemProperties). Errors per-product surface as warnings rather
  // than aborting the whole capture — the Properties panel degrades
  // gracefully for missing entries.
  for (const productId of seeds) {
    try {
      const psets = await ifcManager.getPropertySets(modelID, productId, false)
      if (Array.isArray(psets) && psets.length > 0) {
        const psetIds = []
        for (const pset of psets) {
          if (pset && typeof pset.expressID === 'number') {
            psetIds.push(pset.expressID)
            if (!seen.has(pset.expressID)) {
              seen.add(pset.expressID)
              queue.push(pset.expressID)
            }
          }
        }
        if (psetIds.length > 0) {
          propertySets[productId] = psetIds
        }
      }
    } catch (e) {
      glbVerbose(
        `${BLDRS_ELEMENT_PROPERTIES_EXTENSION_NAME}: getPropertySets(${productId}) ` +
        `failed; skipping psets for this product:`, e)
    }
  }

  // Phase 3: BFS through the ref graph. Each pop fetches shallow item
  // properties, then scans for refs to enqueue.
  let warnedOnSizeCap = false
  while (queue.length > 0) {
    if (seen.size > MAX_CLOSURE_SIZE) {
      if (!warnedOnSizeCap) {
        warnedOnSizeCap = true
        glbInfo(
          `${BLDRS_ELEMENT_PROPERTIES_EXTENSION_NAME}: closure exceeded ` +
          `MAX_CLOSURE_SIZE=${MAX_CLOSURE_SIZE}; truncating. ` +
          'Properties panel may show missing references.')
      }
      break
    }
    const id = queue.shift()
    let props
    try {
      props = await ifcManager.getItemProperties(modelID, id, false, false)
    } catch (e) {
      glbVerbose(
        `${BLDRS_ELEMENT_PROPERTIES_EXTENSION_NAME}: getItemProperties(${id}) ` +
        `failed; skipping entity:`, e)
      continue
    }
    if (!props || typeof props !== 'object') {
      continue
    }
    itemProperties[id] = props
    // Find new refs to expand the closure.
    const refs = []
    collectRefIds(props, refs)
    for (const refId of refs) {
      if (!seen.has(refId)) {
        seen.add(refId)
        queue.push(refId)
      }
    }
  }

  glbVerbose(
    `${BLDRS_ELEMENT_PROPERTIES_EXTENSION_NAME}: captured ` +
    `${Object.keys(itemProperties).length} entities, ` +
    `${Object.keys(propertySets).length} products with psets ` +
    `(seeded from ${seeds.length} spatial-tree nodes)`)

  return {itemProperties, propertySets}
}


/**
 * GLTFLoader plugin that registers the BLDRS_element_properties
 * extension. Stores the container bytes + per-entity accessors
 * (`getRecord` / `getPsetIds`) on
 * `gltf.scene.userData.bldrsElementProperties`; the header index
 * decodes on the first access and record blocks decode on demand
 * (the Properties panel may never open).
 *
 * A payload in the pre-0.13.0 monolithic-gzip format is NOT decoded
 * — there is deliberately no legacy read path. It raises a
 * "clear your local cache" alert instead and attaches nothing, so
 * the panel degrades the same as a GLB without the extension.
 * Locally cached old artifacts never reach here (the schema-version
 * bump in `glbCacheKey.js` makes them read as a cache miss); this
 * covers old GLBs arriving as files.
 *
 * Register at GLTFLoader construction:
 *   loader.register((parser) => new BldrsElementPropertiesReader(parser))
 *
 * The userData payload shape is intentionally not the decoded tables
 * — `Loader.js#convertToShareModel` wires `model.getItemProperties`
 * through the lazy accessors.
 */
export class BldrsElementPropertiesReader {
  /**
   * @param {object} parser GLTFLoader parser passed at registration time
   */
  constructor(parser) {
    this.name = BLDRS_ELEMENT_PROPERTIES_EXTENSION_NAME
    this.parser = parser
  }

  /**
   * @param {object} gltf parsed GLTF object
   * @return {Promise<object>} the same gltf object (per GLTFLoader extension contract)
   */
  async afterRoot(gltf) {
    const json = this.parser.json
    const ext = json.extensions?.[this.name]
    if (!ext) {
      return gltf
    }
    if (!ext.compressed || ext.bufferView === undefined) {
      // Reserved for an uncompressed-inline variant; nothing to wire
      // up today. Land that branch when the spec calls for it.
      return gltf
    }
    if (!Array.isArray(json.bufferViews) ||
        !Number.isInteger(ext.bufferView) ||
        ext.bufferView < 0 ||
        ext.bufferView >= json.bufferViews.length) {
      glbInfo(
        `${this.name}: extension references out-of-range bufferView ` +
        `${ext.bufferView} (have ${json.bufferViews?.length ?? 0}); skipping`)
      return gltf
    }

    try {
      const bv = json.bufferViews[ext.bufferView]
      const bufferIndex = bv.buffer
      const byteOffset = bv.byteOffset || 0
      const byteLength = bv.byteLength
      const arrayBuffer = await this.parser.getDependency('buffer', bufferIndex)
      // Hold a Uint8Array view (not a copy) over the parsed BIN
      // chunk. Cheap: no allocation, no decompression. The first
      // accessor call below pays the decode cost.
      const compressed = new Uint8Array(arrayBuffer, byteOffset, byteLength)
      // Pre-0.13.0 payloads were one monolithic gzip (leading bytes
      // 0x1f 0x8b) — a format the reader deliberately no longer
      // decodes (see class comment). Alert instead of attaching so
      // the Properties panel's silence is explained and actionable.
      if (compressed.byteLength >= 2 &&
          compressed[0] === GZIP_MAGIC_0 && compressed[1] === GZIP_MAGIC_1) {
        glbInfo(
          `${this.name}: payload is the pre-0.13.0 monolithic gzip format; ` +
          'not decoding — alerting to clear cache')
        useStore.getState().setAlert(
          'This model was cached in an older format that this version of Share ' +
          'no longer reads, so element properties are unavailable. ' +
          'Clear the local cache (Profile menu → Clear Local Cache) and reload the model to rebuild it.')
        return gltf
      }
      const payload = makeElementPropertiesPayload(compressed, this.name)
      if (gltf.scene) {
        gltf.scene.userData.bldrsElementProperties = payload
      } else {
        glbInfo(`${this.name}: gltf has no default scene; cannot attach payload`)
      }
    } catch (e) {
      glbInfo(`${this.name}: failed to wire payload:`, e)
    }
    return gltf
  }
}


/**
 * Build a lazy per-entity payload over container bytes. Exposed so
 * `Loader.js#convertToShareModel` consumers and tests can construct
 * the same shape directly for non-GLTFLoader code paths.
 *
 * The header (id→block index + pset table) decodes on the first
 * accessor call; each record block inflates + parses only when one
 * of its entities is requested, then rides a small LRU. Nothing here
 * ever materialises the whole closure — the strings and object
 * graphs in play are bounded by BLOCK_TARGET_CHARS per block, which
 * is what makes arbitrarily large models decodable at all (V8 caps
 * a single string at ~512MiB; see the header comment).
 *
 * Any decode failure (bad magic, truncated bytes, corrupt block)
 * logs and degrades to "no record found" — consumers show "no props"
 * rather than crash.
 *
 * @param {Uint8Array} compressed container bytes
 * @param {string} [tag] log-prefix tag (e.g. extension name)
 * @return {object} `{compressed, getRecord(expressID), getPsetIds(expressID)}`
 */
export function makeElementPropertiesPayload(compressed, tag = BLDRS_ELEMENT_PROPERTIES_EXTENSION_NAME) {
  let header = null
  let blocksStart = 0
  let idToBlock = null
  let headerFailed = false
  // blockIndex → parsed record object. Insertion-ordered Map as LRU:
  // a hit re-inserts, eviction takes the oldest key.
  const blockCache = new Map()

  const ensureHeader = () => {
    if (header !== null || headerFailed) {
      return
    }
    try {
      const parsed = parseContainerHeader(compressed)
      header = parsed.header
      blocksStart = parsed.blocksStart
      idToBlock = new Map()
      header.blockIds.forEach((ids, blockIndex) => {
        for (const id of ids) {
          idToBlock.set(id, blockIndex)
        }
      })
      // One-shot per cache hit — visible by default so user-reported
      // "panel is empty" issues can be triaged from the console
      // without flipping a feature flag. The entity/pset counts are
      // the most useful diagnostic: a count of 0 means the writer
      // captured nothing (likely no spatial tree on the source IFC);
      // a non-zero count with empty panel points at consumer wiring.
      glbInfo(
        `${tag}: decoded payload index (${compressed.byteLength}B container, ` +
        `${header.blocks.length} blocks, ` +
        `${idToBlock.size} entities, ` +
        `${Object.keys(header.propertySets).length} products with psets)`)
    } catch (e) {
      glbInfo(`${tag}: decode failed:`, e)
      headerFailed = true
    }
  }

  const getBlock = (blockIndex) => {
    const cached = blockCache.get(blockIndex)
    if (cached !== undefined) {
      blockCache.delete(blockIndex)
      blockCache.set(blockIndex, cached)
      return cached
    }
    let records
    try {
      const [offset, byteLength] = header.blocks[blockIndex]
      const blockBytes = compressed.subarray(blocksStart + offset, blocksStart + offset + byteLength)
      records = JSON.parse(pako.ungzip(blockBytes, {to: 'string'}))
    } catch (e) {
      glbInfo(`${tag}: block ${blockIndex} decode failed:`, e)
      // Cache the failure as an empty block so a corrupt block logs
      // once instead of re-inflating on every access to its entities.
      records = {}
    }
    blockCache.set(blockIndex, records)
    if (blockCache.size > BLOCK_CACHE_MAX) {
      blockCache.delete(blockCache.keys().next().value)
    }
    return records
  }

  return {
    compressed,
    /**
     * @param {number} expressID
     * @return {object|undefined} the entity record, undefined if absent
     */
    getRecord(expressID) {
      ensureHeader()
      if (header === null) {
        return undefined
      }
      const blockIndex = idToBlock.get(Number(expressID))
      if (blockIndex === undefined) {
        return undefined
      }
      return getBlock(blockIndex)[expressID]
    },
    /**
     * @param {number} expressID product id
     * @return {Array<number>} pset expressIDs, [] if none
     */
    getPsetIds(expressID) {
      ensureHeader()
      const psetIds = header?.propertySets?.[expressID]
      return Array.isArray(psetIds) ? psetIds : []
    },
  }
}
