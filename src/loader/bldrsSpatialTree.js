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
import * as pako from 'pako'
import debug from '../utils/debug'


export const BLDRS_SPATIAL_TREE_EXTENSION_NAME = 'BLDRS_spatial_tree'


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
 * @param {object|null|undefined} node
 * @return {object|null}
 */
function serializeNode(node) {
  if (node === null || node === undefined || typeof node !== 'object') {
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
  if (Array.isArray(node.children) && node.children.length > 0) {
    out.children = []
    for (const child of node.children) {
      const serialized = serializeNode(child)
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
  if (!ifcManager || typeof ifcManager.getSpatialStructure !== 'function') {
    return null
  }
  try {
    const root = await ifcManager.getSpatialStructure(modelID, true)
    if (!root || root.expressID === undefined) {
      return null
    }
    return serializeNode(root)
  } catch (e) {
    debug().warn(
      `[${BLDRS_SPATIAL_TREE_EXTENSION_NAME}] capture failed; ` +
      `cache-hit NavTree will be empty for this model:`, e)
    return null
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
        console.error(`[${this.name}] pako failed (gzip & deflate)`, {gzipErr, deflateErr})
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
        const bv = json.bufferViews[ext.bufferView]
        const bufferIndex = bv.buffer
        const byteOffset = bv.byteOffset || 0
        const byteLength = bv.byteLength
        const arrayBuffer = await this.parser.getDependency('buffer', bufferIndex)
        const compressed = new Uint8Array(arrayBuffer, byteOffset, byteLength)
        const decompressed = this.decompressData(compressed)
        tree = JSON.parse(decompressed)
        debug().log(
          `[${this.name}] decompressed tree (compressed ${compressed.byteLength}B → ` +
          `decompressed ${decompressed.length}B)`)
      } else if (ext.tree) {
        // Forward-compat slot for an uncompressed inline-JSON variant.
        tree = ext.tree
      }
      this.spatialTree = tree
      gltf.scene.userData.bldrsSpatialTree = tree
    } catch (e) {
      console.error(`[${this.name}] failed to decode spatial tree:`, e)
    }
    return gltf
  }
}
