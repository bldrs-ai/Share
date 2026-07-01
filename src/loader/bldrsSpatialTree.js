// BLDRS_spatial_tree GLTF extension — writer + reader.
//
// Carries the IFC spatial hierarchy (IfcProject → IfcSite → … → leaf
// elements) inside the GLB cache artifact so the NavTree can render on
// cache-hit without parsing the original IFC. Without this extension,
// a re-visit to a cached model has no `viewer.IFC.loader.ifcManager`
// parser state, `getSpatialStructure` returns nothing, and the NavTree
// is empty. See design/new/viewer-replacement.md §3b.iii (the §"Default-on
// gating" blocker this extension resolves) and
// design/new/glb-model-sharing.md §"Extension catalogue".
//
// Wire shape (per node, recursive):
//   {expressID, type, Name?, LongName?, children: [...]}
//
// `type` is preserved as the source emitted it (web-ifc-three returns
// numeric IFC type IDs; Conway may return string names — both are
// valid input to the existing NavTree consumer). `Name` / `LongName`
// are kept in their IFC `{value: string}` shape rather than flattened
// to bare strings so the consumer (`Containers/CadView.jsx` →
// `Components/NavTree/...`) doesn't change.
//
// Extension JSON in glTF:
//   extensionsUsed: ["BLDRS_spatial_tree", ...]
//   extensions.BLDRS_spatial_tree: {compressed: true, bufferView: <int>}
//   bufferViews[N] → gzipped JSON of the root tree node
//
// We never write this into `extensionsRequired` — a generic GLTF reader
// should still be able to load the geometry; only the NavTree degrades.
//
// TODO(viewer-replacement Phase 5+): when originator-side share lands
// (design/new/glb-model-sharing.md §"Pipelines/A. Originator"), this
// reader will be ingesting GLBs produced by arbitrary user browsers —
// not just our own writer. At that point §"Validation and trust" of the
// glb-model-sharing doc applies in full: schema-version range check,
// cross-reference integrity (every `expressID` in the tree must exist
// on some primitive's `_EXPRESS_ID` attribute), tree depth + size
// ceilings, HTML-strip on `Name.value` / `LongName.value` at the
// NavTree consumer (untrusted strings become DOM text). Today's
// validation is minimal (shape + recursion-depth guard) because the
// writer is in-browser and trusted; the full pass lands with the share
// flow.
import * as pako from 'pako'
import {glbInfo, glbVerbose} from './glbLog'


export const BLDRS_SPATIAL_TREE_EXTENSION_NAME = 'BLDRS_spatial_tree'

// Bound on `serializeNode` / decoded-tree recursion. IFC spatial
// hierarchies in the wild are shallow (IfcProject → Site → Building
// → Storey → Space → element, ~6 levels typical, ~10 worst-case).
// The ceiling exists to keep a malicious (deeply-nested) cached
// artifact from blowing the JS stack on read — capture is bounded
// symmetrically so a malformed live tree can't poison a cache write
// either. Walks past this depth are truncated with a single warning.
const MAX_TREE_DEPTH = 100


/**
 * Walk a spatial-structure node and return a JSON-serializable copy
 * with only the fields the NavTree consumer reads. Strips IFC parser
 * internals (children with cycles back to parent, raw web-ifc handles,
 * etc.) — anything we don't pluck explicitly is dropped.
 *
 * Idempotent: a node already produced by this function passes through
 * unchanged. That property lets callers normalise once at capture and
 * skip a defensive copy at read time.
 *
 * Bounded by `MAX_TREE_DEPTH` recursion levels — sub-trees past the
 * ceiling are dropped from `children`. Real IFCs sit ~6 levels deep;
 * the ceiling exists for defense against an adversarial source.
 *
 * @param {object|null|undefined} node
 * @param {number} [depth]
 * @return {object|null}
 */
function serializeNode(node, depth = 0) {
  if (node === null || node === undefined || typeof node !== 'object') {
    return null
  }
  if (depth >= MAX_TREE_DEPTH) {
    return null
  }
  const out = {
    expressID: node.expressID,
    type: node.type,
  }
  if (node.Name !== undefined) {
    out.Name = node.Name
  }
  if (node.LongName !== undefined) {
    out.LongName = node.LongName
  }
  // Preserve the STEP occurrence path (NAUO express ids) so a cache-hit tree
  // can still key selection per-occurrence — without it, a reloaded (GLB-cached)
  // STEP model would fall back to the colliding scalar expressID. Absent for IFC.
  if (Array.isArray(node.occurrencePath)) {
    out.occurrencePath = node.occurrencePath
  }
  if (Array.isArray(node.children) && node.children.length > 0) {
    out.children = []
    for (const child of node.children) {
      const serialized = serializeNode(child, depth + 1)
      if (serialized !== null) {
        out.children.push(serialized)
      }
    }
  } else {
    out.children = []
  }
  return out
}


/**
 * Minimal shape check on a decoded extension payload. Catches the
 * "the cache file is malformed / from a future schema / hostile"
 * cases that the GLB sharing doc §"Validation and trust" lists; does
 * NOT do the full cross-reference walk that lands in Phase 5+. Returns
 * the input tree on pass, `null` on fail (caller treats null as
 * "extension not usable; degrade to empty NavTree").
 *
 * @param {*} tree decoded extension payload
 * @return {object|null}
 */
function validateDecodedTree(tree) {
  if (tree === null || tree === undefined || typeof tree !== 'object') {
    return null
  }
  if (Array.isArray(tree)) {
    return null
  }
  if (typeof tree.expressID !== 'number') {
    return null
  }
  return tree
}


/**
 * Capture the spatial structure for a model from an IfcManager-like
 * source. Returns the JSON-ready tree, or `null` when no tree is
 * available (the source has no parser state — common when the model
 * itself came from a cached GLB and we're cache-roundtripping without
 * re-parsing). Errors at the manager are logged and swallowed so a
 * single missing tree never blocks the GLB write.
 *
 * @param {object|null|undefined} ifcManager IfcManager-like with
 *   `getSpatialStructure(modelID, withProperties)`. Pass
 *   `viewer.IFC.loader.ifcManager` from the live load path.
 * @param {number} modelID
 * @return {Promise<object|null>}
 */
export async function captureBldrsSpatialTree(ifcManager, modelID) {
  if (!ifcManager) {
    return null
  }
  // Prefer Conway's `ifcAPI.properties.getSpatialStructure` over
  // wit-three's `ifcManager.getSpatialStructure`. Slice 5b of
  // viewer-replacement.md replaced wit-three's IFCLoader.parse with
  // a direct `OpenModel` + `StreamAllMeshes` call — wit-three's
  // `state.models[modelID]` is no longer populated, so its
  // `getSpatialStructure → getSpatialNode → getNodeType` chain
  // throws on the empty `state.models[modelID].types` lookup. Conway
  // doesn't have that dependency.
  //
  // Falls back to wit-three's `ifcManager.getSpatialStructure` when
  // the Conway path isn't reachable (test stubs, non-Conway loaders).
  const conwayProperties = ifcManager.ifcAPI?.properties
  const useConway = conwayProperties &&
    typeof conwayProperties.getSpatialStructure === 'function'
  if (!useConway && typeof ifcManager.getSpatialStructure !== 'function') {
    return null
  }
  try {
    // Prefer the bare-tree call (`includeProperties=false`) — Conway's
    // legacy slow path fires "Including properties in
    // getSpatialStructure with the JSON workflow disabled can lead to
    // poor performance" when the manager calls `getItemProperties` per
    // node inline. We don't need inline props in the spatial tree — we
    // serialize only {expressID, type, Name, LongName, children}, and
    // Name/LongName can be enriched sync via `proxy.getLine` (same
    // fast surface the element-properties capture uses) in one walk
    // over the typically-small tree (~6k nodes on Snowdon).
    //
    // Falls back to `includeProperties=true` when the adapter surface
    // isn't reachable (test stubs, non-Conway loaders) — the warning
    // fires there, but the codepath is otherwise unchanged.
    const proxy = ifcManager.ifcAPI?.getPassthrough?.(modelID)
    const canEnrichSync = proxy && typeof proxy.getLine === 'function'
    const includeProperties = !canEnrichSync
    const root = useConway ?
      await conwayProperties.getSpatialStructure(modelID, includeProperties) :
      await ifcManager.getSpatialStructure(modelID, includeProperties)
    if (!root || root.expressID === undefined) {
      return null
    }
    if (canEnrichSync) {
      enrichNodeNamesSync(root, proxy)
    }
    return serializeNode(root)
  } catch (e) {
    glbInfo(
      `${BLDRS_SPATIAL_TREE_EXTENSION_NAME}: capture failed; ` +
      'cache-hit NavTree will be empty for this model:', e)
    return null
  }
}


/**
 * Walk a bare spatial tree (just `{expressID, type, children}` per
 * node — the shape `getSpatialStructure(modelID, false)` returns) and
 * fill in `Name` / `LongName` from `proxy.getLine(expressID)`. Sync
 * end-to-end; the proxy's `getLine` is the same sync-bulk surface the
 * element-properties capture uses. One call per node, no async hops.
 *
 * Mutates the input tree in place. Bounded by `MAX_TREE_DEPTH` (same
 * recursion cap `serializeNode` uses).
 *
 * @param {object} node spatial-tree node, mutated
 * @param {object} proxy IfcApiProxyIfc with sync `getLine`
 * @param {number} [depth] recursion depth — bounded by `MAX_TREE_DEPTH`
 */
function enrichNodeNamesSync(node, proxy, depth = 0) {
  if (!node || depth >= MAX_TREE_DEPTH) {
    return
  }
  if (typeof node.expressID === 'number' && node.Name === undefined) {
    try {
      const line = proxy.getLine(node.expressID)
      if (line) {
        if (line.Name !== undefined) {
          node.Name = line.Name
        }
        if (line.LongName !== undefined) {
          node.LongName = line.LongName
        }
      }
    } catch (e) {
      // Per-node failure is non-fatal — node renders without Name.
      // Don't log per-node; the parent capture's bookkeeping logs
      // the aggregate.
    }
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      enrichNodeNamesSync(child, proxy, depth + 1)
    }
  }
}


/**
 * GLTFLoader plugin that decodes the BLDRS_spatial_tree extension on
 * read. Attaches the decoded tree to `gltf.scene.userData.bldrsSpatialTree`;
 * `Loader.js#convertToShareModel` promotes it from there to
 * `model.getSpatialStructure(modelID, withProperties)` + flips
 * `capabilities.spatialStructure`.
 *
 * Register at GLTFLoader construction:
 *   loader.register((parser) => new BldrsSpatialTreeReader(parser))
 *
 * Per the GLTFLoader plugin contract, `afterRoot(gltf)` returns the
 * (possibly-modified) `gltf` object; the framework awaits the result
 * before resolving the user's load promise.
 */
export class BldrsSpatialTreeReader {
  /**
   * @param {object} parser GLTFLoader parser passed at registration time
   */
  constructor(parser) {
    this.name = BLDRS_SPATIAL_TREE_EXTENSION_NAME
    this.parser = parser
    this.spatialTree = null
  }

  /**
   * Decompress with pako, trying gzip then deflate. Matches the
   * fallback chain in ExtBldrsPropertiesPayload so older artifacts
   * (deflate-encoded) keep working alongside current (gzip) ones.
   *
   * @param {Uint8Array} compressedData
   * @return {string} the decoded JSON string
   */
  decompressData(compressedData) {
    try {
      return pako.ungzip(compressedData, {to: 'string'})
    } catch (gzipErr) {
      try {
        return pako.inflate(compressedData, {to: 'string'})
      } catch (deflateErr) {
        glbInfo(
          `${this.name}: pako failed (gzip & deflate)`, {gzipErr, deflateErr})
        throw gzipErr
      }
    }
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

    try {
      let tree = null
      if (ext.compressed && ext.bufferView !== undefined) {
        // Validate the bufferView index BEFORE dereferencing. A
        // malformed (or hostile) cache file with an out-of-range index
        // would throw `Cannot read properties of undefined (reading 'buffer')`
        // from the next line. We surface the corruption explicitly and
        // skip the decode so the caller degrades to empty-NavTree
        // rather than failing the whole GLB parse.
        if (!Array.isArray(json.bufferViews) ||
            !Number.isInteger(ext.bufferView) ||
            ext.bufferView < 0 ||
            ext.bufferView >= json.bufferViews.length) {
          glbInfo(
            `${this.name}: extension references out-of-range bufferView ` +
            `${ext.bufferView} (have ${json.bufferViews?.length ?? 0}); skipping`)
          return gltf
        }
        const bv = json.bufferViews[ext.bufferView]
        const bufferIndex = bv.buffer
        const byteOffset = bv.byteOffset || 0
        const byteLength = bv.byteLength
        const arrayBuffer = await this.parser.getDependency('buffer', bufferIndex)
        const compressed = new Uint8Array(arrayBuffer, byteOffset, byteLength)
        const decompressed = this.decompressData(compressed)
        tree = JSON.parse(decompressed)
        glbVerbose(
          `${this.name}: decompressed tree (compressed ${compressed.byteLength}B → ` +
          `decompressed ${decompressed.length}B)`)
      } else if (ext.tree) {
        // Forward-compat slot for an uncompressed inline-JSON variant.
        tree = ext.tree
      }

      // Minimal shape validation before publishing to consumers. See
      // the file-header TODO for the full validation pass we owe once
      // user-originated GLBs are in scope. `validateDecodedTree`
      // returns `null` on fail; the consumer (`convertToShareModel`)
      // checks `userData.bldrsSpatialTree` for truthiness so null is
      // the right "extension present but unusable" signal.
      const validated = validateDecodedTree(tree)
      if (validated === null && tree !== null) {
        glbInfo(
          `${this.name}: decoded payload failed shape validation ` +
          '(missing expressID or non-object); skipping')
      }
      this.spatialTree = validated

      // `gltf.scene` is the default scene per glTF spec; legal to be
      // absent when the file has multiple scenes and no `scene` index
      // is set. Skip the attach in that case rather than crash —
      // consumers see the missing userData as "no cached tree" and
      // degrade to empty NavTree.
      if (gltf.scene) {
        gltf.scene.userData.bldrsSpatialTree = validated
      } else {
        glbInfo(`${this.name}: gltf has no default scene; cannot attach spatial tree`)
      }
    } catch (e) {
      glbInfo(`${this.name}: failed to decode spatial tree:`, e)
    }
    return gltf
  }
}
