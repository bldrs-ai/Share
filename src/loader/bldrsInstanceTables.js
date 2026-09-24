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
 * triangles. Each row's IDENTITY — parent, occurrence id, geometry id,
 * occurrence path — is hashed with it, so the witness also refuses the
 * mirror-image failure: geometry untouched, identity arrays reordered
 * against it. A pick reads identity by row, so either half moving alone is
 * the same wrong-element result. It is exact on purpose: positions are hashed as float32 BITS,
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
const TRIANGLE_CORNERS = 3


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
 * Each row contributes its identity (see {@link tableRowIdentity}), its
 * vertex count, its index count, its LOCAL index values (relative to the
 * row's first vertex) and its positions as float32 bit patterns, in that
 * order. The counts are what make it order- and boundary-sensitive even when
 * two rows carry identical geometry: moving a boundary changes which words
 * land in which row.
 *
 * @return {{row: Function, digest: Function}}
 */
export function makeRangeCanary() {
  const float = new Float32Array(1)
  const bits = new Uint32Array(float.buffer)
  const hasher = makeWordHash()
  const {word} = hasher
  return {
    /**
     * @param {object} identity `{parent, occurrenceId, geometryId,
     *   occurrencePath}` — the row's table entries
     * @param {number} vertexCount
     * @param {function(number, number): number} positionAt `(vertex,
     *   component) => value`
     * @param {number} indexCount
     * @param {function(number): number} localIndexAt
     */
    row(identity, vertexCount, positionAt, indexCount, localIndexAt) {
      identityWords(identity, word)
      word(vertexCount)
      word(indexCount)
      // Triangle by triangle, each in a CANONICAL rotation: the one whose
      // corner sequence is lexicographically smallest. Meshopt's index codec
      // is lossless but may rotate a triangle's corners to compress better —
      // the Export tab's Meshopt download of index.ifc came back refused
      // until this, while the tiny jest fixtures happened not to trigger it.
      // A rotation keeps winding and the triangle, so it is not a change the
      // canary exists to see; a REFLECTION (winding flip) still is.
      const whole = indexCount - (indexCount % TRIANGLE_CORNERS)
      for (let t = 0; t < whole; t += TRIANGLE_CORNERS) {
        const a = localIndexAt(t)
        const b = localIndexAt(t + 1)
        const c = localIndexAt(t + 2)
        const [x, y, z] = smallestRotation(a, b, c)
        word(x)
        word(y)
        word(z)
      }
      for (let i = whole; i < indexCount; i++) {
        word(localIndexAt(i))
      }
      for (let v = 0; v < vertexCount; v++) {
        for (let c = 0; c < COMPONENTS_PER_POSITION; c++) {
          float[0] = positionAt(v, c)
          word(bits[0])
        }
      }
    },
    digest: hasher.digest,
  }
}


/**
 * The rotation of a triangle's corners that is lexicographically smallest.
 *
 * @param {number} a
 * @param {number} b
 * @param {number} c
 * @return {Array<number>}
 */
function smallestRotation(a, b, c) {
  const rotations = [[a, b, c], [b, c, a], [c, a, b]]
  let best = rotations[0]
  for (const r of rotations) {
    if (r[0] < best[0] || (r[0] === best[0] && (r[1] < best[1] ||
        (r[1] === best[1] && r[2] < best[2])))) {
      best = r
    }
  }
  return best
}


/**
 * The murmur3-style word stream both canaries hash with.
 *
 * @return {{word: Function, digest: Function}}
 */
function makeWordHash() {
  let hash = CANARY_SEED
  let words = 0
  return {
    word(value) {
      let k = Math.imul(value | 0, CANARY_C1)
      k = rotl(k, ROTL_K)
      k = Math.imul(k, CANARY_C2)
      hash ^= k
      hash = rotl(hash, ROTL_H)
      hash = (Math.imul(hash, CANARY_ROUND_MUL) + CANARY_ROUND_ADD) | 0
      words++
    },
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
 * Feed one row's identity to a hash — the same words for the writer's entry
 * and the reader's parsed row.
 *
 * @param {object} identity `{parent, occurrenceId, geometryId, occurrencePath}`
 * @param {Function} word `(value) => void`
 */
function identityWords(identity, word) {
  word(identity.parent)
  word(identity.occurrenceId)
  // Absent is 0 on both sides: the writer stores a missing geometry id as
  // 0 (`buildInstanceTablesExtensionData`) and a table with none at all
  // parses back as null.
  word(identity.geometryId ?? 0)
  // Length + 1 so a null path and an empty one hash apart.
  const path = identity.occurrencePath
  word(Array.isArray(path) ? path.length + 1 : 0)
  for (const step of Array.isArray(path) ? path : []) {
    word(step)
  }
}


/**
 * One table row's identity, in the shape {@link makeRangeCanary}'s `row`
 * takes — the same fields the writer hashes from its entry.
 *
 * @param {object} table parsed (or writer-shaped) table node
 * @param {number} row
 * @return {object} `{parent, occurrenceId, geometryId, occurrencePath}`
 */
export function tableRowIdentity(table, row) {
  return {
    parent: table.parents?.[row] ?? 0,
    occurrenceId: table.occurrenceIds?.[row] ?? 0,
    geometryId: table.geometryIds?.[row] ?? 0,
    occurrencePath: table.occurrencePaths?.[row] ?? null,
  }
}


/**
 * The canary a collapsed table produces over a merged geometry — the READER
 * half, compared against the `canary` the writer stored.
 *
 * Reads through `getX/getY/getZ` rather than `.array`: GLTFLoader hands back
 * an interleaved attribute for a POSITION that shares a strided bufferView
 * with NORMAL, which is what the writer's layout produces.
 *
 * @param {object} geometry merged BufferGeometry
 * @param {object} table collapsed table: `ranges` (`{vertexStart,
 *   vertexCount, indexStart, indexCount}` per row) plus the identity arrays
 * @return {?number} the digest, or null when a range falls outside the
 *   geometry (not a hash to compare — a table to refuse)
 */
export function rangeCanaryOf(geometry, table) {
  const {ranges} = table
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
  for (let r = 0; r < ranges.length; r++) {
    const {vertexStart, vertexCount, indexStart, indexCount} = ranges[r]
    if (vertexStart + vertexCount > position.count || indexStart + indexCount > index.count) {
      return null
    }
    canary.row(
      tableRowIdentity(table, r),
      vertexCount, (v, c) => read[c](vertexStart + v),
      indexCount, (i) => index.getX(indexStart + i) - vertexStart)
  }
  return canary.digest()
}


/**
 * THE LOSSY WITNESS — what stands in for the exact canary on a file a lossy
 * codec has been through (Draco, share-140 #1871 follow-up).
 *
 * The exact canary cannot survive Draco by construction: positions are
 * quantized, and Draco also MERGES coincident vertices across elements —
 * measured on a DSA-shaped strip, 600 vertices come back as 202 — so neither
 * the float bits nor the per-row vertex ranges exist any more. What does
 * survive, provided the export encodes SEQUENTIALLY
 * (`export/glbCompression.js#needsTriangleOrder`), is triangle ORDER and
 * therefore each row's index COUNT: row r's triangles are still the r-th
 * contiguous run. So the reader rebuilds each row's vertex block from its
 * triangles (`instancedGlbToBatchedModel.js#rebuildLossyCollapsed`), and
 * this witness checks the result:
 *
 * - `identity` — an EXACT hash of every row's identity and index count,
 *   neither of which a codec touches. Binds rows to identities the way the
 *   exact canary does.
 * - `stats` — per row, nine numbers over its triangle CORNERS: the mean, the
 *   min and the max of each axis. Over corners rather than vertices because
 *   that is invariant under the vertex merging and re-indexing above. The
 *   bounds are there because a centroid alone cannot tell apart two rows
 *   centred on the same point (concentric parts, a nut and its bolt), whose
 *   swap would otherwise pass (codex round 3 on #1872). Stored uint16 over
 *   the witness's own frame (`min`/`max`, per axis over all nine).
 * - `positionBits` — the encode's Draco POSITION bits. The reader derives
 *   each row's tolerance from it and the extent of the primitive THAT ROW was
 *   decoded from, because that is the grid Draco quantized it on: one merged
 *   primitive for the collapsed artifact, but one primitive per row for its
 *   portable rewrite, where a table-wide tolerance taken from its largest
 *   row (a slab) would be loose enough to let two small neighbouring rows
 *   swap (codex round 3 again). A dequantized corner is within half a step,
 *   so every mean/min/max is too; the tolerance is one full step plus the
 *   witness's own uint16 step — 2× margin.
 *
 * It is written by the EXPORT, only into Draco files, from a source whose
 * exact canary it verifies first (`export/collapsedWitness.js`) — so the
 * OPFS artifact and every lossless file keep the exact check and pay nothing.
 * What it cannot see: two rows that agree on all nine numbers within their
 * tolerance swapping identities — e.g. two triangles with the same bounds and
 * the same corner mean. The floor on that tolerance is the uint16 grid over
 * the table's span (1.5 mm on a 100 m table), which for a portable file's
 * small per-row primitives is the binding term, not Draco's.
 */

/** The codec extension whose presence on a primitive means lossy positions. */
export const LOSSY_POSITION_CODEC = 'KHR_draco_mesh_compression'

/** uint16 grid the witness stats are stored on. */
const WITNESS_GRID = 65535

/** Per row: corner mean, corner min, corner max — three VEC3s. */
export const WITNESS_STATS_PER_ROW = 3 * COMPONENTS_PER_POSITION


/**
 * Exact hash of each row's identity and index count.
 *
 * @param {object} table collapsed table (parsed shape) with `ranges`
 * @return {number} uint32
 */
export function rowIdentityCanary(table) {
  const hasher = makeWordHash()
  table.ranges.forEach(({indexCount}, row) => {
    identityWords(tableRowIdentity(table, row), hasher.word)
    hasher.word(indexCount)
  })
  return hasher.digest()
}


/**
 * Each row's corner mean, min and max, per axis.
 *
 * @param {number} rowCount
 * @param {function(number): number} cornerCountOf row -> index count
 * @param {function(number, number, number): number} cornerAt `(row, corner,
 *   component) => value`
 * @return {Float64Array} `rowCount * WITNESS_STATS_PER_ROW`, each row laid
 *   out `[mean xyz, min xyz, max xyz]`
 */
export function rowWitnessStats(rowCount, cornerCountOf, cornerAt) {
  const out = new Float64Array(rowCount * WITNESS_STATS_PER_ROW)
  for (let r = 0; r < rowCount; r++) {
    const corners = cornerCountOf(r)
    const at = r * WITNESS_STATS_PER_ROW
    for (let c = 0; c < COMPONENTS_PER_POSITION; c++) {
      let sum = 0
      let min = Infinity
      let max = -Infinity
      for (let i = 0; i < corners; i++) {
        const value = cornerAt(r, i, c)
        sum += value
        min = Math.min(min, value)
        max = Math.max(max, value)
      }
      out[at + c] = corners > 0 ? sum / corners : 0
      out[at + COMPONENTS_PER_POSITION + c] = corners > 0 ? min : 0
      out[at + (2 * COMPONENTS_PER_POSITION) + c] = corners > 0 ? max : 0
    }
  }
  return out
}


/**
 * Build a table's lossy witness from its exact per-row stats.
 *
 * @param {object} table collapsed table with `ranges` + identity arrays
 * @param {Float64Array} stats from {@link rowWitnessStats}
 * @param {number} positionBits the Draco POSITION quantization bits
 * @return {object} JSON-serializable witness
 */
export function buildLossyWitness(table, stats, positionBits) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < stats.length; i++) {
    const c = i % COMPONENTS_PER_POSITION
    min[c] = Math.min(min[c], stats[i])
    max[c] = Math.max(max[c], stats[i])
  }
  const q = new Uint16Array(stats.length)
  for (let i = 0; i < stats.length; i++) {
    const c = i % COMPONENTS_PER_POSITION
    const span = max[c] - min[c]
    q[i] = span > 0 ? Math.round(((stats[i] - min[c]) / span) * WITNESS_GRID) : 0
  }
  return {
    identity: rowIdentityCanary(table),
    positionBits,
    min,
    max,
    stats: uint32ArrayToBase64(padToUint32(q)),
  }
}


/**
 * One Draco quantization step for a primitive of this extent.
 *
 * @param {number} extent the primitive's largest axis extent
 * @param {number} positionBits
 * @return {number}
 */
export function dracoStep(extent, positionBits) {
  return extent / ((2 ** positionBits) - 1)
}


/**
 * Whether a rebuilt collapsed table matches its lossy witness.
 *
 * @param {object} table parsed collapsed table carrying `witness`, with
 *   `ranges` describing the REBUILT geometry
 * @param {Float64Array} stats the rebuilt rows' {@link rowWitnessStats}
 * @param {function(number): number} extentOf row -> the largest axis extent
 *   of the primitive that row was decoded from
 * @return {boolean}
 */
export function matchesLossyWitness(table, stats, extentOf) {
  const {witness} = table
  if (!witness || rowIdentityCanary(table) !== witness.identity) {
    return false
  }
  const stored = witness.statsQ
  if (!stored || stored.length < stats.length) {
    return false
  }
  const gridStep = Math.max(...witness.max.map((m, c) => m - witness.min[c])) / WITNESS_GRID
  for (let r = 0; r * WITNESS_STATS_PER_ROW < stats.length; r++) {
    const tolerance = dracoStep(extentOf(r), witness.positionBits) + gridStep
    for (let k = 0; k < WITNESS_STATS_PER_ROW; k++) {
      const i = (r * WITNESS_STATS_PER_ROW) + k
      const c = i % COMPONENTS_PER_POSITION
      const span = witness.max[c] - witness.min[c]
      const expected = witness.min[c] + ((stored[i] / WITNESS_GRID) * span)
      if (!(Math.abs(stats[i] - expected) <= tolerance)) {
        return false
      }
    }
  }
  return true
}


/**
 * @param {Uint16Array} values
 * @return {Uint32Array} the same bytes, zero-padded to a 4-byte multiple so
 *   the shared base64 helper takes them
 */
function padToUint32(values) {
  const bytes = new Uint8Array(Math.ceil(values.byteLength / 4) * 4)
  bytes.set(new Uint8Array(values.buffer, values.byteOffset, values.byteLength))
  return new Uint32Array(bytes.buffer)
}


/** Draco's POSITION quantization accepts 1..30 bits. */
const MAX_DRACO_POSITION_BITS = 30


/**
 * Decode and validate a collapsed node's optional lossy witness.
 *
 * @param {object} raw payload `witness`
 * @param {number} count rows in the table
 * @return {?object} the witness with `statsQ` decoded, or null
 */
function parseLossyWitness(raw, count) {
  const finite3 = (v) => Array.isArray(v) && v.length === COMPONENTS_PER_POSITION &&
    v.every(Number.isFinite)
  if (!raw || !Number.isInteger(raw.identity) || !finite3(raw.min) || !finite3(raw.max) ||
      !Number.isInteger(raw.positionBits) || raw.positionBits < 1 ||
      raw.positionBits > MAX_DRACO_POSITION_BITS || typeof raw.stats !== 'string') {
    return null
  }
  let words
  try {
    words = base64ToUint32Array(raw.stats)
  } catch {
    return null
  }
  const statsQ = new Uint16Array(words.buffer, words.byteOffset, words.byteLength / 2)
  if (statsQ.length < count * WITNESS_STATS_PER_ROW) {
    return null
  }
  return {...raw, statsQ: statsQ.subarray(0, count * WITNESS_STATS_PER_ROW)}
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
      if (meta.witness !== undefined) {
        // A malformed witness only costs the lossy path — the exact canary
        // is still there — so it is dropped, not a reason to refuse the file.
        const witness = parseLossyWitness(meta.witness, count)
        if (witness) {
          node.witness = witness
        }
      }
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
    markLossyTables(json, nodes)
    if (gltf.scene) {
      gltf.scene.userData.bldrsInstanceTables = nodes
      const total = nodes.reduce((n, node) => n + node.count, 0)
      glbInfo(`${this.name}: resolved ${nodes.length} node(s), ${total} instance(s)`)
    }
    return gltf
  }
}


/**
 * Flag every table whose geometry a lossy codec has been through, so the
 * reader knows to rebuild and check it against the lossy witness instead of
 * the exact canary. Read off the FILE, from the table's own node primitives,
 * because three's GLTFLoader decodes Draco transparently and keeps no trace
 * of it on the geometry.
 *
 * @param {object} json the file's glTF JSON
 * @param {Array<object>} tables parsed tables, mutated
 */
export function markLossyTables(json, tables) {
  for (const node of json?.nodes || []) {
    const table = tables[node?.extras?.bldrsTableNode]
    const primitives = json.meshes?.[node.mesh]?.primitives || []
    if (table && primitives.some((p) => p?.extensions?.[LOSSY_POSITION_CODEC])) {
      table.lossyGeometry = true
    }
  }
}
