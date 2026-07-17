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
// Wire shape (compressed JSON in a glTF bufferView):
//
//   {
//     itemProperties: { [expressID]: { ...shallow IFC entity data } },
//     propertySets:   { [productExpressID]: [psetExpressID, ...] },
//   }
//
// `itemProperties` is the full closure of entities reachable via
// references from spatial-tree elements (products, their properties,
// referenced types, owner histories, etc.). `propertySets` is the
// product→psetIds index — the consumer side rebuilds the full pset
// array per product by indexing back into `itemProperties`.
//
// Why split into two tables instead of inlining psets per product:
// psets are shared across many products in typical IFCs (one
// `Pset_WallCommon` referenced by every wall). Deduplicating
// via shared IDs keeps the artifact 3-5× smaller than inlining.
//
// Reader is **lazy** — the `afterRoot` hook stores the compressed
// bytes and a decode closure on `userData.bldrsElementProperties`.
// First call to `model.getItemProperties` / `model.getPropertySets`
// triggers a one-shot decompress + JSON.parse, cached for subsequent
// calls. Avoids paying the parse cost on a load that never opens
// the Properties panel.
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
import {yieldToBrowser} from '../utils/scheduling'
import {glbInfo, glbVerbose} from './glbLog'


export const BLDRS_ELEMENT_PROPERTIES_EXTENSION_NAME = 'BLDRS_element_properties'

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
 * Both paths produce the same decoded wire JSON (same entity set,
 * same pset index) so the cached artifact is equivalent regardless
 * of which path ran. The streaming path is ~100× faster on large
 * IFCs (no Promise per entity) AND fixed-memory: peak retained heap
 * is O(reachable ids + one record) instead of O(all parsed records).
 *
 * Return shape is a discriminated union:
 *   - `{compressedBytes: Uint8Array}` — streaming path; already the
 *     gzipped wire JSON, ready to embed as a bufferView payload
 *     (pass to `injectGlbExtensions` as `precompressed`).
 *   - `{itemProperties, propertySets}` — slow path; the decoded wire
 *     object, compressed later by the inject step (`compress: true`).
 *   - `null` — no manager available (non-IFC sources, cache-hit GLB
 *     with no live parser).
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
  return await captureBldrsElementPropertiesSlow(ifcManager, modelID, spatialTree)
}


// Text-buffer flush threshold for the streaming deflate. Records are
// concatenated into a small string buffer and pushed into pako's
// streaming Deflate in ~64KB slabs — per-record push calls would pay
// deflate-call overhead millions of times; one giant join would
// recreate the whole-payload-resident problem the streaming path
// exists to avoid.
const STREAM_FLUSH_CHARS = 65536

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
 * and walks it synchronously, gzipping the wire JSON incrementally —
 * the full property closure is NEVER resident as one JS object graph.
 * Peak retained memory is O(reachable ids + pset index + one record +
 * compressed output) instead of the old fast path's O(every parsed
 * record) (~GBs on 100MB-class IFCs before the reachability filter
 * could prune).
 *
 * Two sweeps, identical decoded output to the old capture-then-filter
 * fast path:
 *   1. Root-seed scan via sync `proxy.getLine`. Preferred enumeration
 *      is conway's `RootExpressIDs` (≥1.380) — the type index yields
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
 *   - the streaming deflate reports an error
 *
 * Coupling notes: this reaches `ifcAPI.getPassthrough(modelID)` and
 * then `proxy.model[0]` (the IfcStepModel) — both are stable on
 * the current adapter (see `ifc_api.js:53` and `ifc_api_proxy_ifc.js:154`)
 * but neither is part of the formal public API. The fallback to
 * the slow path keeps tests + non-Conway sources working.
 *
 * @param {object} ifcManager IfcManager-like with `.ifcAPI`.
 * @param {number} modelID
 * @return {Promise<Uint8Array|null>} gzipped wire JSON (the exact
 *   bytes a reader `pako.ungzip` + `JSON.parse` expects) or `null`
 *   when the streaming path is unavailable.
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

  // Roots-only enumeration (conway ≥1.380): `RootExpressIDs` yields the
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
  const deflator = new pako.Deflate({gzip: true})
  let textBuf = []
  let textLen = 0
  const flushText = () => {
    if (textLen > 0) {
      deflator.push(textBuf.join(''), false)
      textBuf = []
      textLen = 0
    }
  }
  const pushText = (chunk) => {
    textBuf.push(chunk)
    textLen += chunk.length
    if (textLen >= STREAM_FLUSH_CHARS) {
      flushText()
    }
  }
  let emittedCount = 0
  const emitRecord = (id, props) => {
    // Same wire JSON as `JSON.stringify({itemProperties: {...}})`
    // would produce for this entry — numeric-string key, record value.
    // Key ORDER differs from the legacy one-shot stringify (BFS
    // discovery order vs ascending-integer), which is byte-different
    // but decode-identical: the reader JSON.parses into a plain object
    // and every consumer looks entries up by id.
    pushText(`${emittedCount === 0 ? '' : ','}"${id}":${JSON.stringify(props)}`)
    emittedCount++
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
    pushText('{"itemProperties":{')

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

    pushText(`},"propertySets":${JSON.stringify(propertySets)}}`)
    flushText()
    deflator.push('', true)
    if (deflator.err) {
      glbInfo(
        `${BLDRS_ELEMENT_PROPERTIES_EXTENSION_NAME}: streaming deflate error ` +
        `${deflator.err} (${deflator.msg}); falling back to slow path`)
      return null
    }

    glbInfo(
      `${BLDRS_ELEMENT_PROPERTIES_EXTENSION_NAME}: streamed ${emittedCount} ` +
      `reachable-from-IfcRoot entities (of ${iterCount} scanned, ` +
      `${rootExpressIDs ? 'roots-only' : 'full'} scan; ` +
      `${psetRelCount} IfcRelDefinesByProperties → ` +
      `${Object.keys(propertySets).length} products with psets) into ` +
      `${deflator.result.byteLength}B gzip in ${Date.now() - startMs}ms`)

    return deflator.result
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
 * extension. Stores the compressed bytes + a `decode()` closure on
 * `gltf.scene.userData.bldrsElementProperties`; the actual
 * `pako.ungzip` + `JSON.parse` runs only on the first
 * `model.getItemProperties` / `model.getPropertySets` call (the
 * Properties panel may never open).
 *
 * Register at GLTFLoader construction:
 *   loader.register((parser) => new BldrsElementPropertiesReader(parser))
 *
 * The userData payload shape is intentionally not the decoded tree
 * — `Loader.js#convertToShareModel` reads `.decode()` lazily when it
 * hydrates `model.getItemProperties`.
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
      // `decode()` call below pays the full cost.
      const compressed = new Uint8Array(arrayBuffer, byteOffset, byteLength)
      const payload = makeLazyPayload(compressed, this.name)
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
 * Build a lazy-decode payload object that holds the compressed bytes
 * and decodes on first `decode()` call. Cached after first decode.
 * Exposed so `Loader.js#convertToShareModel` can construct the same
 * shape directly for testing or for non-GLTFLoader code paths.
 *
 * Validation on decode is shape-only: must JSON-parse to an object
 * with `itemProperties` (record) and optional `propertySets` (record).
 * A failed validation logs and yields an empty-but-well-shaped payload
 * — consumers degrade to "no props" rather than crash.
 *
 * @param {Uint8Array} compressed gzipped JSON bytes
 * @param {string} [tag] log-prefix tag (e.g. extension name)
 * @return {object} `{compressed, decode(): {itemProperties, propertySets}}`
 */
export function makeLazyPayload(compressed, tag = BLDRS_ELEMENT_PROPERTIES_EXTENSION_NAME) {
  let cached = null
  return {
    compressed,
    decode() {
      if (cached !== null) {
        return cached
      }
      try {
        const text = pako.ungzip(compressed, {to: 'string'})
        const parsed = JSON.parse(text)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          glbInfo(`${tag}: decoded payload is not an object; using empty`)
          cached = {itemProperties: {}, propertySets: {}}
          return cached
        }
        cached = {
          itemProperties: (parsed.itemProperties && typeof parsed.itemProperties === 'object' && !Array.isArray(parsed.itemProperties)) ?
            parsed.itemProperties : {},
          propertySets: (parsed.propertySets && typeof parsed.propertySets === 'object' && !Array.isArray(parsed.propertySets)) ?
            parsed.propertySets : {},
        }
        // One-shot per cache hit — visible by default so user-reported
        // "panel is empty" issues can be triaged from the console
        // without flipping a feature flag. The entity/pset counts are
        // the most useful diagnostic: a count of 0 means the writer
        // captured nothing (likely no spatial tree on the source IFC);
        // a non-zero count with empty panel points at consumer wiring.
        glbInfo(
          `${tag}: decoded payload (${compressed.byteLength}B compressed → ` +
          `${text.length}B JSON, ` +
          `${Object.keys(cached.itemProperties).length} entities, ` +
          `${Object.keys(cached.propertySets).length} products with psets)`)
        return cached
      } catch (e) {
        glbInfo(`${tag}: decode failed:`, e)
        cached = {itemProperties: {}, propertySets: {}}
        return cached
      }
    },
  }
}
