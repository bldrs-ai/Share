// Writing the lossy witness into a Draco export of a collapsed artifact
// (share-140 #1871 follow-up). The witness itself, and why it exists, is
// documented in `loader/bldrsInstanceTables.js` ("THE LOSSY WITNESS"); this
// module is the export-time half that computes it from the file's own bytes.
//
// It runs on the SOURCE — the uncompressed GLB about to go into the Draco
// encoder — and it only vouches for what it has checked: each collapsed
// table's EXACT canary is re-derived from the source first, and a table whose
// source does not verify gets no witness. The reader then refuses that table
// on the Draco file, exactly as it would have refused it on the source,
// rather than the export laundering a misaligned table into one that passes a
// tolerant check.
//
// Two source shapes carry collapsed tables, and both are handled because the
// Export tab's Portable toggle runs BEFORE the codec (`glbPortable.js`,
// "Ordering: portable → codec → strip"):
// - the collapsed artifact: one merged primitive per table, rows addressed by
//   the table's ranges;
// - its portable rewrite: one primitive per row, on nodes stamped with
//   `bldrsInstance`.
import {
  BLDRS_INSTANCE_TABLES_EXTENSION_NAME,
  buildLossyWitness,
  makeRangeCanary,
  parseInstanceTablesExtensionData,
  rowCentroids,
  tableRowIdentity,
} from '../loader/bldrsInstanceTables'
import {glbInfo} from '../loader/glbLog'


const GLTF_FLOAT = 5126
const BYTES_PER_FLOAT = 4
const COMPONENTS = 3
const INDEX_BYTES = {5121: 1, 5123: 2, 5125: 4}
const UINT16_BYTES = 2
const UINT32_BYTES = 4


/**
 * Add a lossy witness to every verifiable collapsed table in a tables
 * payload.
 *
 * @param {object} json the source GLB's JSON
 * @param {Uint8Array} bin its BIN chunk
 * @param {object} rawPayload the decoded `BLDRS_instance_tables` JSON
 * @param {number} positionBits the Draco POSITION quantization bits the
 *   export will use
 * @return {?object} a copy of `rawPayload` with witnesses added, or null when
 *   there is nothing collapsed to witness
 */
export function addLossyWitnesses(json, bin, rawPayload, positionBits) {
  const tables = parseInstanceTablesExtensionData(rawPayload)
  if (!tables || !bin || !tables.some((table) => Array.isArray(table.ranges))) {
    return null
  }
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength)
  const rowsByTable = collectRows(json, tables)
  const out = {...rawPayload, nodes: rawPayload.nodes.map((node) => ({...node}))}
  let witnessed = 0
  tables.forEach((table, t) => {
    if (!Array.isArray(table.ranges)) {
      return
    }
    const rows = rowsByTable.get(t)
    const view = rows && rowReader(json, dv, table, rows)
    if (!view || exactCanary(table, view) !== table.canary) {
      glbInfo(`export: collapsed table ${t} does not verify on the source; no lossy witness`)
      return
    }
    const centroids = rowCentroids(
      table.count, (r) => view.indexCountOf(r),
      (r, i, c) => view.cornerAt(r, i, c))
    out.nodes[t].witness = buildLossyWitness(table, centroids, positionBits, view.extent)
    witnessed++
  })
  return witnessed > 0 ? out : null
}


/**
 * Where each collapsed table's rows live in this file: its one merged node,
 * or one portable node per row.
 *
 * @param {object} json
 * @param {Array<object>} tables parsed
 * @return {Map<number, object>} table index -> `{merged: primitive}` or
 *   `{perRow: Array<primitive>}`
 */
function collectRows(json, tables) {
  const found = new Map()
  for (const node of json.nodes || []) {
    const t = node?.extras?.bldrsTableNode
    const primitive = json.meshes?.[node.mesh]?.primitives?.[0]
    if (!Number.isInteger(t) || !Array.isArray(tables[t]?.ranges) || !primitive) {
      continue
    }
    const row = node.extras.bldrsInstance
    if (Number.isInteger(row)) {
      const entry = found.get(t) ?? {perRow: new Array(tables[t].count).fill(null)}
      if (entry.perRow) {
        entry.perRow[row] = primitive
        found.set(t, entry)
      }
    } else {
      found.set(t, {merged: primitive})
    }
  }
  return found
}


/**
 * A uniform view over a table's rows, whichever shape holds them: per row, a
 * vertex count, an index count, local index values, positions, and the
 * extent Draco will quantize over (per primitive, so the largest one).
 *
 * @param {object} json
 * @param {DataView} dv over BIN
 * @param {object} table parsed collapsed table
 * @param {object} rows from `collectRows`
 * @return {?object} the view, or null when a row is missing or unreadable
 */
function rowReader(json, dv, table, rows) {
  const read = (primitive) => {
    const position = floatAccessor(json, dv, primitive?.attributes?.POSITION)
    const index = indexAccessor(json, dv, primitive?.indices)
    return position && index ? {position, index} : null
  }
  if (rows.merged) {
    const merged = read(rows.merged)
    if (!merged) {
      return null
    }
    const {ranges} = table
    return {
      extent: merged.position.extent,
      vertexCountOf: (r) => ranges[r].vertexCount,
      indexCountOf: (r) => ranges[r].indexCount,
      positionAt: (r, v, c) => merged.position.at(ranges[r].vertexStart + v, c),
      localIndexAt: (r, i) => merged.index.at(ranges[r].indexStart + i) - ranges[r].vertexStart,
      cornerAt: (r, i, c) => merged.position.at(merged.index.at(ranges[r].indexStart + i), c),
    }
  }
  const perRow = rows.perRow.map((primitive) => (primitive ? read(primitive) : null))
  if (perRow.some((row) => row === null)) {
    return null
  }
  return {
    extent: Math.max(...perRow.map((row) => row.position.extent)),
    vertexCountOf: (r) => perRow[r].position.count,
    indexCountOf: (r) => perRow[r].index.count,
    positionAt: (r, v, c) => perRow[r].position.at(v, c),
    localIndexAt: (r, i) => perRow[r].index.at(i),
    cornerAt: (r, i, c) => perRow[r].position.at(perRow[r].index.at(i), c),
  }
}


/**
 * The table's exact canary, re-derived from the source through `view`.
 *
 * @param {object} table
 * @param {object} view from `rowReader`
 * @return {number}
 */
function exactCanary(table, view) {
  const canary = makeRangeCanary()
  for (let r = 0; r < table.count; r++) {
    canary.row(
      tableRowIdentity(table, r),
      view.vertexCountOf(r), (v, c) => view.positionAt(r, v, c),
      view.indexCountOf(r), (i) => view.localIndexAt(r, i))
  }
  return canary.digest()
}


/**
 * @param {object} json
 * @param {DataView} dv
 * @param {number} index accessor index
 * @return {?{count: number, extent: number, at: Function}} a float VEC3 reader
 */
function floatAccessor(json, dv, index) {
  const accessor = json.accessors?.[index]
  const view = json.bufferViews?.[accessor?.bufferView]
  if (!accessor || !view || accessor.componentType !== GLTF_FLOAT || accessor.type !== 'VEC3' ||
      accessor.sparse || (view.buffer ?? 0) !== 0) {
    return null
  }
  const stride = view.byteStride || (COMPONENTS * BYTES_PER_FLOAT)
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  const at = (v, c) => dv.getFloat32(base + (v * stride) + (c * BYTES_PER_FLOAT), true)
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let v = 0; v < accessor.count; v++) {
    for (let c = 0; c < COMPONENTS; c++) {
      const value = at(v, c)
      min[c] = Math.min(min[c], value)
      max[c] = Math.max(max[c], value)
    }
  }
  return {count: accessor.count, extent: Math.max(...max.map((m, c) => m - min[c])), at}
}


/**
 * @param {object} json
 * @param {DataView} dv
 * @param {number} index accessor index
 * @return {?{count: number, at: Function}} an index reader
 */
function indexAccessor(json, dv, index) {
  const accessor = json.accessors?.[index]
  const view = json.bufferViews?.[accessor?.bufferView]
  const bytes = INDEX_BYTES[accessor?.componentType]
  if (!accessor || !view || !bytes || accessor.sparse || (view.buffer ?? 0) !== 0) {
    return null
  }
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  const at = (i) => {
    const offset = base + (i * bytes)
    if (bytes === UINT32_BYTES) {
      return dv.getUint32(offset, true)
    }
    return bytes === UINT16_BYTES ? dv.getUint16(offset, true) : dv.getUint8(offset)
  }
  return {count: accessor.count, at}
}


/** The payload name this module rewrites. */
export const WITNESSED_PAYLOAD = BLDRS_INSTANCE_TABLES_EXTENSION_NAME
