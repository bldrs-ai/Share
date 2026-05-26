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
import {glbInfo, glbVerbose} from './glbLog'


export const BLDRS_ELEMENT_PROPERTIES_EXTENSION_NAME = 'BLDRS_element_properties'

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
 * IfcManager-like source. Tries the fast sync-bulk path first
 * (`captureBldrsElementPropertiesFast` — reaches into the Conway
 * adapter's parsed model and iterates synchronously), falling back
 * to the slow per-entity async BFS for environments that don't
 * expose the adapter internals (tests, non-Conway loaders).
 *
 * The two paths produce the same output shape so the cached
 * artifact is identical regardless of which path ran. The fast
 * path is ~100× faster on large IFCs because it skips Promise-per-
 * entity overhead: ~10 min → ~10 s on a 100MB Snowdon IFC.
 *
 * Returns the wire-format payload, or `null` when no manager is
 * available (non-IFC sources, cache-hit GLB with no live parser).
 *
 * @param {object|null|undefined} ifcManager IfcManager-like.
 * @param {number} modelID
 * @param {object|null|undefined} spatialTree the JSON tree
 *   `captureBldrsSpatialTree` returned. Acts as the BFS seed for the
 *   slow path; the fast path ignores it (iterates all entities).
 * @return {Promise<object|null>}
 */
export async function captureBldrsElementProperties(ifcManager, modelID, spatialTree) {
  if (!ifcManager) {
    return null
  }
  const fastResult = captureBldrsElementPropertiesFast(ifcManager, modelID)
  if (fastResult !== null) {
    return fastResult
  }
  return await captureBldrsElementPropertiesSlow(ifcManager, modelID, spatialTree)
}


/**
 * Fast sync-bulk capture path. Reaches into the Conway adapter's
 * internal `IfcApiProxyIfc` to get the upstream Conway `IfcStepModel`
 * and iterates it synchronously — `for (const entity of stepModel)`
 * walks every parsed entity without any async overhead. For each,
 * `proxy.getLine(expressID)` synchronously converts the raw STEP
 * tape into the wit-three-shape object (the exact shape consumers
 * expect; same as what `ifcManager.getItemProperties` returns,
 * minus the async wrapping). Property-set indexing happens in the
 * same loop by detecting `IfcRelDefinesByProperties` entities and
 * walking their `RelatingPropertyDefinition` / `RelatedObjects`
 * fields — no second pass needed.
 *
 * Returns `null` (so the caller falls back to the slow path) when:
 *   - the adapter surface isn't accessible (test stubs without
 *     `ifcAPI.getPassthrough`, non-Conway IFC backends)
 *   - the proxy's internal `model` field isn't where we expect
 *   - the iteration would yield zero entities (parser state empty)
 *
 * Coupling notes: this reaches `ifcAPI.getPassthrough(modelID)` and
 * then `proxy.model[0]` (the IfcStepModel) — both are stable on
 * the current adapter (see `ifc_api.js:53` and `ifc_api_proxy_ifc.js:154`)
 * but neither is part of the formal public API. We file a Conway PR
 * to expose them officially (parse-only `OpenModel` flag + bulk
 * iteration accessor); until then this is the seam. The fallback to
 * the slow path keeps tests + non-Conway sources working.
 *
 * @param {object} ifcManager IfcManager-like with `.ifcAPI`.
 * @param {number} modelID
 * @return {object|null} `{itemProperties, propertySets}` or `null`
 *   when the fast path is unavailable.
 */
function captureBldrsElementPropertiesFast(ifcManager, modelID) {
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

  const startMs = Date.now()
  const itemProperties = {}
  const propertySets = {}
  let captured = 0
  let psetRelCount = 0

  for (const entity of stepModel) {
    const expressID = entity?.expressID
    if (typeof expressID !== 'number') {
      continue
    }
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
      continue
    }
    if (!props || typeof props !== 'object') {
      continue
    }
    itemProperties[expressID] = props
    captured++

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
  }

  if (captured === 0) {
    // Parser state must have been empty / not the expected shape.
    // Let the slow path try; it'll log the right cause.
    return null
  }

  // Filter to entities reachable from IfcRoot via non-geometric refs.
  // The bulk iteration above captured every parsed entity (millions
  // for big IFCs, mostly geometric primitives). The Properties panel
  // only needs IfcRoot-derived entities (products, rels, psets — all
  // have `GlobalId`) plus their non-geometric ref closure
  // (HasProperties, Quantities, materials, classifications, owner
  // history etc.). `collectRefIds` skips the geometric backbone
  // (Representation / ObjectPlacement / RepresentationContexts /
  // Representations) at the entity's top-level, so the BFS naturally
  // stops at the geometric boundary. Reduces Snowdon's captured set
  // from ~2.7M entities to ~50k; cache payload from ~35MB compressed
  // to ~1MB compressed.
  const filterStartMs = Date.now()
  const {filtered, prunedCount} = filterReachableFromRoots(itemProperties)
  const filteredCount = Object.keys(filtered).length

  glbInfo(
    `${BLDRS_ELEMENT_PROPERTIES_EXTENSION_NAME}: fast-path captured ${captured} entities ` +
    `(${psetRelCount} IfcRelDefinesByProperties → ${Object.keys(propertySets).length} ` +
    `products with psets) in ${Date.now() - startMs}ms; ` +
    `filtered to ${filteredCount} reachable-from-IfcRoot ` +
    `(pruned ${prunedCount} geometric primitives) in ${Date.now() - filterStartMs}ms`)

  return {itemProperties: filtered, propertySets}
}


/**
 * BFS over the captured itemProperties map, keeping only entities
 * reachable from `IfcRoot`-derived entities (those with `GlobalId`)
 * via non-geometric refs. Unreachable entities — the geometric
 * primitives hanging off Representation / ObjectPlacement chains —
 * are dropped. The Properties panel never displays them; carrying
 * them in the cache costs ~30× the necessary payload size.
 *
 * `collectRefIds` (shared with the slow path) already skips
 * geometric field names at the entity's top level, so the BFS
 * frontier never expands into the geometric backbone. Property-
 * specific chains (HasProperties, Quantities, NominalValue refs,
 * Material*, Classification*, OwnerHistory) ARE followed because
 * those field names aren't in `GEOMETRIC_FIELD_NAMES`.
 *
 * @param {object} itemProperties the unfiltered map
 * @return {object} `{filtered: object, prunedCount: number}`
 */
function filterReachableFromRoots(itemProperties) {
  const reachable = new Set()
  const queue = []

  // Seed: entities with `GlobalId`. IfcRoot mandates it, so this is
  // the canonical "selectable entity" test — no whitelist of types
  // needed. Covers products, processes, controls, resources, actors,
  // groups, ALL `IfcRelXxx`, `IfcPropertySetDefinition`-derived
  // entities (which includes `IfcPropertySet` / `IfcElementQuantity`),
  // and any future IFC schema additions automatically.
  for (const idStr of Object.keys(itemProperties)) {
    const props = itemProperties[idStr]
    if (props && props.GlobalId !== undefined) {
      const id = Number(idStr)
      reachable.add(id)
      queue.push(id)
    }
  }

  // BFS via non-geometric refs.
  while (queue.length > 0) {
    const id = queue.shift()
    const props = itemProperties[id]
    if (!props) {
      continue
    }
    const refs = []
    collectRefIds(props, refs)
    for (const refId of refs) {
      if (!reachable.has(refId) && itemProperties[refId] !== undefined) {
        reachable.add(refId)
        queue.push(refId)
      }
    }
  }

  // Filter into a new map.
  const filtered = {}
  for (const id of reachable) {
    filtered[id] = itemProperties[id]
  }
  const prunedCount = Object.keys(itemProperties).length - reachable.size
  return {filtered, prunedCount}
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
