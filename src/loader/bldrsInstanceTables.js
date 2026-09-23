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
 *
 * **v2: collapsed nodes (share-140 #1871, glb-export-premium.md §1.1d).** A
 * v2 node MAY carry `ranges` + `canary`, meaning its glTF node is not an
 * `EXT_mesh_gpu_instancing` node but one plain mesh holding every row's
 * geometry merged, placement baked in, each row addressed by its slice.
 * Ranges are stored as two per-row COUNT arrays (vertices, indices), not as
 * explicit starts: the writer lays the rows out back to back in row order,
 * so the starts are prefix sums, and a stored form that cannot express a gap
 * or an overlap is one class of misalignment that cannot be written down at
 * all. A v2 node without them is an ordinary instanced node, so a v2 file is
 * a HYBRID. v1 stays what the un-collapsed writer emits, so a build that
 * predates v2 still reads every artifact written with the collapse off.
 *
 * **The canary is the one on-file witness that a row's range really is that
 * row's geometry.** Nothing else in the file can say so: the batched writer
 * emits no `_EXPRESSID`, and every structural check the reader makes passes
 * on a table that is shifted by one element of the same size — which on a
 * DSA-shaped model, 28,674 elements of exactly three vertices, is every
 * shift. So the writer hashes each row's geometry AS IT BAKES IT, from the
 * element's own arrays and before they are copied into the merged buffers,
 * and the reader re-hashes the file's merged buffers through the ranges. The
 * two agree only if the copy, the range bookkeeping, and anything that
 * rewrote the mesh since (a codec, another tool) all left row i on row i's
 * triangles. It is exact on purpose: positions are hashed as float32 BITS,
 * so a lossy codec (Draco quantizes POSITION) fails it and the file falls
 * back to the plain GLTFLoader model — renders right, no picking — rather
 * than being trusted on a tolerance that a neighbouring element could fall
 * inside. Normals are left out, since Meshopt's FILTER rewrites them while
 * leaving positions bit-exact.
 */


/** Extension name in the GLB JSON's top-level `extensions`. */
export const BLDRS_INSTANCE_TABLES_EXTENSION_NAME = 'BLDRS_instance_tables'

/**
 * Payload schema version, independent of the artifact path version. The
 * newest this reader understands, and what the collapsing writer emits.
 */
export const INSTANCE_TABLES_VERSION = 2

/** What the un-collapsed writer still emits: no node carries `ranges`. */
export const INSTANCE_TABLES_VERSION_UNCOLLAPSED = 1

// murmur3's 32-bit mixing constants. Chosen for diffusion, not security —
// the canary guards against an accident, and an accident that happens to
// collide in 32 bits is a 1-in-4-billion event per table.
const CANARY_SEED = 0x9747b28c
const CANARY_C1 = 0xcc9e2d51
const CANARY_C2 = 0x1b873593
const CANARY_ROUND_ADD = 0xe6546b64
const CANARY_ROUND_MUL = 5
const ROTL_K = 15
const ROTL_H = 13
const FMIX_1 = 0x85ebca6b
const FMIX_2 = 0xc2b2ae35
const FMIX_SHIFT_A = 16
const FMIX_SHIFT_B = 13
const WORD_BITS = 32
const COMPONENTS_PER_POSITION = 3


/**
 * @param {number} value
 * @param {number} bits
 * @return {number}
 */
function rotl(value, bits) {
  return (value << bits) | (value >>> (WORD_BITS - bits))
}


/**
 * A streaming hash over collapsed rows — see the module doc for what it
 * witnesses and why it is exact.
 *
 * Each row contributes its vertex count, its index count, its LOCAL index
 * values (relative to the row's first vertex) and its positions as float32
 * bit patterns, in that order. The counts are what make it order- and
 * boundary-sensitive even when two rows carry identical geometry: moving a
 * boundary changes which words land in which row.
 *
 * @return {{row: Function, digest: Function}}
 */
export function makeRangeCanary() {
  const float = new Float32Array(1)
  const bits = new Uint32Array(float.buffer)
  let hash = CANARY_SEED
  let words = 0
  const word = (value) => {
    let k = Math.imul(value | 0, CANARY_C1)
    k = rotl(k, ROTL_K)
    k = Math.imul(k, CANARY_C2)
    hash ^= k
    hash = rotl(hash, ROTL_H)
    hash = (Math.imul(hash, CANARY_ROUND_MUL) + CANARY_ROUND_ADD) | 0
    words++
  }
  return {
    /**
     * @param {number} vertexCount
     * @param {function(number, number): number} positionAt `(vertex,
     *   component) => value`
     * @param {number} indexCount
     * @param {function(number): number} localIndexAt
     */
    row(vertexCount, positionAt, indexCount, localIndexAt) {
      word(vertexCount)
      word(indexCount)
      for (let i = 0; i < indexCount; i++) {
        word(localIndexAt(i))
      }
      for (let v = 0; v < vertexCount; v++) {
        for (let c = 0; c < COMPONENTS_PER_POSITION; c++) {
          float[0] = positionAt(v, c)
          word(bits[0])
        }
      }
    },
    /** @return {number} the uint32 digest */
    digest() {
      let h = hash ^ words
      h ^= h >>> FMIX_SHIFT_A
      h = Math.imul(h, FMIX_1)
      h ^= h >>> FMIX_SHIFT_B
      h = Math.imul(h, FMIX_2)
      h ^= h >>> FMIX_SHIFT_A
      return h >>> 0
    },
  }
}


/**
 * The canary a collapsed table's ranges produce over a merged geometry — the
 * READER half, compared against the `canary` the writer stored.
 *
 * Reads through `getX/getY/getZ` rather than `.array`: GLTFLoader hands back
 * an interleaved attribute for a POSITION that shares a strided bufferView
 * with NORMAL, which is what the writer's layout produces.
 *
 * @param {object} geometry merged BufferGeometry
 * @param {Array<object>} ranges `{vertexStart, vertexCount, indexStart,
 *   indexCount}` per row
 * @return {?number} the digest, or null when a range falls outside the
 *   geometry (not a hash to compare — a table to refuse)
 */
export function rangeCanaryOf(geometry, ranges) {
  const position = geometry?.getAttribute?.('position')
  const index = geometry?.getIndex?.()
  if (!position || !index) {
    return null
  }
  const canary = makeRangeCanary()
  const read = [
    (v) => position.getX(v),
    (v) => position.getY(v),
    (v) => position.getZ(v),
  ]
  for (const {vertexStart, vertexCount, indexStart, indexCount} of ranges) {
    if (vertexStart + vertexCount > position.count || indexStart + indexCount > index.count) {
      return null
    }
    canary.row(
      vertexCount, (v, c) => read[c](vertexStart + v),
      indexCount, (i) => index.getX(indexStart + i) - vertexStart)
  }
  return canary.digest()
}


/**
 * Build the extension payload from the writer's collected per-node data.
 *
 * @param {Array<object>} nodes writer collection order; each
 *   `{count, color: {x,y,z,w}, parents: number[], occurrenceIds: number[],
 *   geometryIds: (number[]|null), occurrencePaths: (Array[]|null)}`, plus
 *   `ranges: [{vertexCount, indexCount}]` (one per row, in row order) and
 *   `canary` on a collapsed node
 * @param {object} [opts]
 * @param {boolean} [opts.collapsed] the writer ran in collapse mode: emit v2.
 *   Keyed off the MODE rather than off whether any node actually collapsed,
 *   because the version picks the OPFS slot (`glbExport.js`) and a
 *   collapse-mode artifact that happened to collapse nothing still belongs
 *   in the slot a collapse-mode reader looks in
 * @return {object} JSON-serializable extension payload
 */
export function buildInstanceTablesExtensionData(nodes, {collapsed = false} = {}) {
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
    const meta = {count: node.count, color: [color.x, color.y, color.z, color.w]}
    if (node.ranges) {
      if (!collapsed) {
        // A programming error, not a data one: a v1 payload with ranges would
        // be refused by every reader, this one included.
        throw new Error('buildInstanceTablesExtensionData: ranges need collapsed (v2) tables')
      }
      meta.ranges = {
        vertexCounts: uint32ArrayToBase64(Uint32Array.from(node.ranges, (r) => r.vertexCount)),
        indexCounts: uint32ArrayToBase64(Uint32Array.from(node.ranges, (r) => r.indexCount)),
      }
      meta.canary = node.canary
    }
    return meta
  })

  const data = {
    version: collapsed ? INSTANCE_TABLES_VERSION : INSTANCE_TABLES_VERSION_UNCOLLAPSED,
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
 * Decode a v2 node's stored range counts into the explicit
 * `{vertexStart, vertexCount, indexStart, indexCount}` rows the reader
 * (`batchedGeometryRanges.js#addGeometryRanges`) takes.
 *
 * @param {object} meta one payload node
 * @return {?Array<object>} ranges, or null when malformed
 */
function parseRanges(meta) {
  let vertexCounts
  let indexCounts
  try {
    vertexCounts = base64ToUint32Array(meta.ranges.vertexCounts)
    indexCounts = base64ToUint32Array(meta.ranges.indexCounts)
  } catch {
    return null
  }
  if (vertexCounts.length !== meta.count || indexCounts.length !== meta.count ||
      !Number.isInteger(meta.canary) || meta.canary < 0) {
    return null
  }
  const ranges = new Array(meta.count)
  let vertexStart = 0
  let indexStart = 0
  for (let i = 0; i < meta.count; i++) {
    // Zero is refused here as well as by `addGeometryRanges`: an empty row is
    // an element that draws nothing and cannot be picked.
    if (vertexCounts[i] === 0 || indexCounts[i] === 0) {
      return null
    }
    ranges[i] = {
      vertexStart, vertexCount: vertexCounts[i],
      indexStart, indexCount: indexCounts[i],
    }
    vertexStart += vertexCounts[i]
    indexStart += indexCounts[i]
  }
  return ranges
}


/**
 * Parse a payload back into the writer-collection shape (the reader slices
 * these into per-batch tables). Returns null on any structural mismatch —
 * unknown version, table lengths disagreeing with node counts, ranges on a
 * v1 node or ranges that do not decode — so the caller treats the artifact
 * as unreadable and falls back to a cache miss, never a half-hydrated model.
 *
 * @param {object} raw parsed JSON payload
 * @return {Array<object>|null} per-node data as in
 *   {@link buildInstanceTablesExtensionData}, with a collapsed node's
 *   `ranges` expanded to explicit starts and its `canary` alongside; or null
 */
export function parseInstanceTablesExtensionData(raw) {
  const version = raw?.version
  if (!raw || (version !== INSTANCE_TABLES_VERSION && version !== INSTANCE_TABLES_VERSION_UNCOLLAPSED) ||
      !Array.isArray(raw.nodes)) {
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
    let ranges = null
    if (meta.ranges !== undefined) {
      ranges = version === INSTANCE_TABLES_VERSION ? parseRanges(meta) : null
      if (ranges === null) {
        return null
      }
    }
    const end = offset + count
    const node = {
      count,
      color: {x: color[0], y: color[1], z: color[2], w: color[3]},
      parents: Array.from(parents.subarray(offset, end)),
      occurrenceIds: Array.from(occurrenceIds.subarray(offset, end)),
      geometryIds: geometryIds ? Array.from(geometryIds.subarray(offset, end)) : null,
      occurrencePaths: occurrencePaths ? occurrencePaths.slice(offset, end) : null,
    }
    if (ranges) {
      node.ranges = ranges
      node.canary = meta.canary
    }
    nodes.push(node)
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
