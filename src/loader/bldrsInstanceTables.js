import {base64ToUint32Array, uint32ArrayToBase64} from './bldrsFaceIds'
import {glbInfo} from './glbLog'


/**
 * BLDRS_instance_tables — per-INSTANCE identity for the batched-native GLB
 * cache artifact (view-140 S9 / viewer-replacement §3b.v, behind
 * the default-on `glbBatched` flag).
 *
 * The merged artifact keys picking data per TRIANGLE (`BLDRS_face_ids`)
 * because a merged mesh has nothing smaller than a vertex to hang identity
 * on. A batched-native artifact keeps instances first-class (one
 * `EXT_mesh_gpu_instancing` node per unique-geometry × source-color bin), so
 * identity is per instance — strictly smaller, and exactly the table shape
 * `assembleBatchedModel` re-decorates from on cache hit.
 *
 * **Instance order is the contract.** Tables are concatenated in scene node
 * order (`nodeInstanceCounts[i]` instances for node i, in each node's
 * `TRANSLATION` accessor order). The reader walks nodes in the same order to
 * slice its per-batch tables back out.
 *
 * **Source colors live HERE, verbatim — never read them from the material.**
 * glTF `baseColorFactor` is linear-space; three's exporter/loader apply
 * sRGB↔linear conversion around it, which would shift Conway's 0.8 fallback
 * grey outside `isDefaultColor`'s epsilon and break both the colorless-model
 * detection and re-derived-palette determinism on reload. The per-node
 * `color` field carries the exact `{x,y,z,w}` values the writer saw
 * (`instanceSourceColors` — the pre-palette snapshot, per
 * model-display-controls.md §1.2b).
 *
 * Encoding: per-instance id tables as base64 Uint32 (the `BLDRS_face_ids`
 * convention, shared helpers); occurrence paths as plain JSON int arrays
 * (variable-length NAUO chains, STEP only); per-node data inline JSON.
 */


/** Extension name in the GLB JSON's top-level `extensions`. */
export const BLDRS_INSTANCE_TABLES_EXTENSION_NAME = 'BLDRS_instance_tables'

/** Payload schema version, independent of the artifact path version. */
export const INSTANCE_TABLES_VERSION = 1


/**
 * Build the extension payload from the writer's collected per-node data.
 *
 * @param {Array<object>} nodes writer collection order; each
 *   `{count, color: {x,y,z,w}, parents: number[], occurrenceIds: number[],
 *   geometryIds: (number[]|null), occurrencePaths: (Array[]|null)}`
 * @return {object} JSON-serializable extension payload
 */
export function buildInstanceTablesExtensionData(nodes) {
  const parents = []
  const occurrenceIds = []
  const geometryIds = []
  const occurrencePaths = []
  let anyGeometryIds = false
  let anyOccurrencePaths = false
  const nodeMeta = nodes.map((node) => {
    parents.push(...node.parents)
    occurrenceIds.push(...node.occurrenceIds)
    if (node.geometryIds) {
      anyGeometryIds = true
      geometryIds.push(...node.geometryIds)
    } else {
      geometryIds.push(...new Array(node.count).fill(0))
    }
    if (node.occurrencePaths) {
      anyOccurrencePaths = true
      occurrencePaths.push(...node.occurrencePaths)
    } else {
      occurrencePaths.push(...new Array(node.count).fill(null))
    }
    const {color} = node
    return {count: node.count, color: [color.x, color.y, color.z, color.w]}
  })

  const data = {
    version: INSTANCE_TABLES_VERSION,
    nodes: nodeMeta,
    parents: uint32ArrayToBase64(Uint32Array.from(parents)),
    occurrenceIds: uint32ArrayToBase64(Uint32Array.from(occurrenceIds)),
  }
  if (anyGeometryIds) {
    data.geometryIds = uint32ArrayToBase64(Uint32Array.from(geometryIds))
  }
  if (anyOccurrencePaths) {
    data.occurrencePaths = occurrencePaths
  }
  return data
}


/**
 * Parse a payload back into the writer-collection shape (the reader slices
 * these into per-batch tables). Returns null on any structural mismatch —
 * wrong version, table lengths disagreeing with node counts — so the caller
 * treats the artifact as unreadable and falls back to a cache miss, never a
 * half-hydrated model.
 *
 * @param {object} raw parsed JSON payload
 * @return {Array<object>|null} per-node data as in
 *   {@link buildInstanceTablesExtensionData}, or null
 */
export function parseInstanceTablesExtensionData(raw) {
  if (!raw || raw.version !== INSTANCE_TABLES_VERSION || !Array.isArray(raw.nodes)) {
    return null
  }
  let parents
  let occurrenceIds
  try {
    parents = base64ToUint32Array(raw.parents)
    occurrenceIds = base64ToUint32Array(raw.occurrenceIds)
  } catch {
    return null
  }
  const geometryIds = raw.geometryIds ? base64ToUint32Array(raw.geometryIds) : null
  const occurrencePaths = Array.isArray(raw.occurrencePaths) ? raw.occurrencePaths : null

  const total = raw.nodes.reduce((n, node) => n + (node?.count ?? 0), 0)
  if (parents.length !== total || occurrenceIds.length !== total ||
      (geometryIds && geometryIds.length !== total) ||
      (occurrencePaths && occurrencePaths.length !== total)) {
    return null
  }

  const nodes = []
  let offset = 0
  for (const meta of raw.nodes) {
    const count = meta?.count
    const color = meta?.color
    if (!Number.isInteger(count) || count < 0 ||
        !Array.isArray(color) || color.length !== 4) {
      return null
    }
    const end = offset + count
    nodes.push({
      count,
      color: {x: color[0], y: color[1], z: color[2], w: color[3]},
      parents: Array.from(parents.subarray(offset, end)),
      occurrenceIds: Array.from(occurrenceIds.subarray(offset, end)),
      geometryIds: geometryIds ? Array.from(geometryIds.subarray(offset, end)) : null,
      occurrencePaths: occurrencePaths ? occurrencePaths.slice(offset, end) : null,
    })
    offset = end
  }
  return nodes
}


/**
 * GLTFLoader plugin surfacing `BLDRS_instance_tables` onto
 * `gltf.scene.userData.bldrsInstanceTables` (parsed per-node shape, or
 * absent). Mirrors `BldrsFaceIdsReader`'s envelope handling — the inject
 * step stores every BLDRS_* payload as `{compressed, bufferView}` with a
 * gzipped-JSON buffer view. Registered in `Loader.js#newGltfLoader`.
 */
export class BldrsInstanceTablesReader {
  /**
   * @param {object} parser GLTFLoader parser passed at registration time.
   */
  constructor(parser) {
    this.name = BLDRS_INSTANCE_TABLES_EXTENSION_NAME
    this.parser = parser
  }

  /**
   * @param {object} gltf parsed GLTF object
   * @return {Promise<object>} the same gltf (GLTFLoader plugin contract)
   */
  async afterRoot(gltf) {
    const json = this.parser.json
    const ext = json.extensions?.[this.name]
    if (!ext) {
      return gltf
    }
    if (!ext.compressed || !Number.isInteger(ext.bufferView) ||
        !Array.isArray(json.bufferViews) ||
        ext.bufferView < 0 || ext.bufferView >= json.bufferViews.length) {
      glbInfo(`${this.name}: malformed extension envelope; skipping`)
      return gltf
    }
    let parsed
    try {
      const bv = json.bufferViews[ext.bufferView]
      const arrayBuffer = await this.parser.getDependency('buffer', bv.buffer)
      const compressed = new Uint8Array(arrayBuffer, bv.byteOffset || 0, bv.byteLength)
      const pako = await import('pako')
      parsed = JSON.parse(pako.ungzip(compressed, {to: 'string'}))
    } catch (e) {
      glbInfo(`${this.name}: failed to decompress/parse payload:`, e)
      return gltf
    }
    const nodes = parseInstanceTablesExtensionData(parsed)
    if (!nodes) {
      glbInfo(`${this.name}: payload failed validation; skipping`)
      return gltf
    }
    if (gltf.scene) {
      gltf.scene.userData.bldrsInstanceTables = nodes
      const total = nodes.reduce((n, node) => n + node.count, 0)
      glbInfo(`${this.name}: resolved ${nodes.length} node(s), ${total} instance(s)`)
    }
    return gltf
  }
}
