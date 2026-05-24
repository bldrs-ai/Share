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


/**
 * Walk an entity's value subtree and collect any IFC reference IDs
 * (`{type: 5, value: <expressID>}` shape). Returns a new array of
 * unique IDs found. Used by the BFS to extend the closure work queue.
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
  // Plain object — recurse into each value.
  for (const key of Object.keys(value)) {
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
 * IfcManager-like source. The walk:
 *
 *   1. Seed the work queue with every expressID in the spatial tree.
 *   2. For each seed product, fetch `getPropertySets(...)` and index
 *      the result by product → pset IDs. Also enqueue the pset IDs
 *      (so their properties land in `itemProperties` too).
 *   3. BFS: pop an ID, call `getItemProperties(modelID, id, false, false)`
 *      (shallow — `recursive=false` so refs stay as `{type:5, value:id}`
 *      objects we can index), scan the result for IFC references,
 *      enqueue any new ones.
 *   4. Stop when the queue drains or the closure exceeds
 *      `MAX_CLOSURE_SIZE` (defense against a pathological model).
 *
 * Returns the wire-format payload, or `null` when no manager is
 * available (non-IFC sources, cache-hit GLB with no live parser).
 * Errors at the manager are logged and swallowed so a single missing
 * entity never blocks the GLB write.
 *
 * @param {object|null|undefined} ifcManager IfcManager-like with
 *   `getItemProperties(modelID, expressID, indirect, recursive)`
 *   and `getPropertySets(modelID, expressID, recursive)`.
 * @param {number} modelID
 * @param {object|null|undefined} spatialTree the JSON tree
 *   `captureBldrsSpatialTree` returned. Acts as the BFS seed.
 * @return {Promise<object|null>}
 */
export async function captureBldrsElementProperties(ifcManager, modelID, spatialTree) {
  if (!ifcManager ||
      typeof ifcManager.getItemProperties !== 'function' ||
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
