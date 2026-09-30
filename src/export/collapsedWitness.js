// Writing the lossy witness into a Draco export of a collapsed artifact, and
// planning the row tag that lets that export use EDGEBREAKER (share-140 #1871
// follow-ups). The witness itself, the tag, and why each exists are
// documented in `loader/bldrsInstanceTables.js` ("THE LOSSY WITNESS",
// `ROW_TAG_SEMANTIC`); this module is the export-time half that computes both
// from the file's own bytes. `glbCompression.js#transformGlb` applies the
// planned tags to the document it encodes.
//
// It runs on the SOURCE — the uncompressed GLB about to go into the Draco
// encoder — and it only vouches for what it has checked: each collapsed
// table's EXACT canary is re-derived from the source first, and a table whose
// source does not verify gets neither a tag nor a witness. The reader then
// refuses that table on the Draco file, exactly as it would have refused it on
// the source, rather than the export laundering a misaligned table into one
// that passes a tolerant check.
//
// Two source shapes carry collapsed tables, and both are handled because the
// Export tab's Portable toggle runs BEFORE the codec (`glbPortable.js`,
// "Ordering: portable → codec → strip"):
// - the collapsed artifact: one merged primitive per table, rows addressed by
//   the table's ranges. This is the shape that gets the row tag;
// - its portable rewrite: one primitive per row, on nodes stamped with
//   `bldrsInstance`. Each row is already its own primitive, so it needs no
//   tag and is witnessed as it always was.
import {
  BLDRS_INSTANCE_TABLES_EXTENSION_NAME,
  ROW_TAG_SCALAR_ROWS,
  buildLossyWitness,
  makeRangeCanary,
  parseInstanceTablesExtensionData,
  rowWitnessStats,
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
 * Plan a Draco export's collapsed tables: which merged primitives get a row
 * tag, which Draco method the file takes, and the tables payload with a lossy
 * witness added to every verifiable collapsed table.
 *
 * The method is EDGEBREAKER, with every verified merged primitive row-tagged
 * and stripped of its zero-area triangles — EDGEBREAKER drops those itself
 * (measured: 202 triangles in, 200 out, the two degenerate ones gone whether
 * their corners share an index or only a position), so the export removes
 * them first and witnesses exactly what the encoder will keep. It is
 * SEQUENTIAL, with no tags and the witness taken over every triangle, in the
 * one case a tag cannot serve: some verified row has NO triangle of non-zero
 * area, so EDGEBREAKER would erase the element. That is the layout the first
 * Draco exports of collapsed artifacts used (#1872), which the reader still
 * opens by triangle runs, so falling back to it costs ratio, not selection.
 *
 * @param {object} json the source GLB's JSON
 * @param {Uint8Array} bin its BIN chunk
 * @param {object} rawPayload the decoded `BLDRS_instance_tables` JSON
 * @param {number} positionBits the Draco POSITION quantization bits the
 *   export will use
 * @return {?{sequential: boolean, rowTags: Map<number, object>, payload: ?object}}
 *   null when the payload has no collapsed table. `rowTags` maps a source
 *   mesh index to its tag ({@link planRowTag}); `payload` is a copy of
 *   `rawPayload` with witnesses added, or null when no table verified
 */
export function planCollapsedDraco(json, bin, rawPayload, positionBits) {
  const tables = parseInstanceTablesExtensionData(rawPayload)
  if (!tables || !bin || !tables.some((table) => Array.isArray(table.ranges))) {
    return null
  }
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength)
  const rowsByTable = collectRows(json, tables)
  const verified = []
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
    const tag = rows.merged ? planRowTag(table, view) : null
    if (rows.merged && !tag) {
      glbInfo(`export: collapsed table ${t} indexes outside its rows; no lossy witness`)
      return
    }
    verified.push({t, table, view, mesh: rows.mesh, tag})
  })
  const sequential = verified.some(({tag}) => tag?.hasEmptyRow)
  const rowTags = new Map()
  const out = {...rawPayload, nodes: rawPayload.nodes.map((node) => ({...node}))}
  for (const {t, table, view, mesh, tag} of verified) {
    if (tag && !sequential) {
      rowTags.set(mesh, tag)
      const stats = rowWitnessStats(
        table.count, (r) => tag.indexCounts[r],
        (r, i, c) => tag.cornerAt(r, i, c))
      out.nodes[t].witness = buildLossyWitness(table, stats, positionBits, (r) => tag.indexCounts[r])
    } else {
      const stats = rowWitnessStats(
        table.count, (r) => view.indexCountOf(r),
        (r, i, c) => view.cornerAt(r, i, c))
      out.nodes[t].witness = buildLossyWitness(table, stats, positionBits)
    }
  }
  if (sequential) {
    glbInfo('export: a collapsed row has no triangle of non-zero area; Draco stays SEQUENTIAL, untagged')
  }
  return {sequential, rowTags, payload: verified.length > 0 ? out : null}
}


/**
 * The row tag for one verified merged table: which of the merged primitive's
 * triangles survive (every one with non-zero area, in source order), the
 * vertices they use (ascending, so each row's stay contiguous), and each
 * kept vertex's row.
 *
 * Zero area means two corners at the SAME position, compared as Draco's
 * attribute deduplication compares it — bit for bit, so -0 and +0 differ
 * (measured: a triangle with one corner at x = -0 beside one at +0 survives
 * EDGEBREAKER). Collinear and sub-quantum triangles are kept by the encoder,
 * measured too, so they are kept here. Real collapsed rows do carry
 * zero-area triangles (hundreds of rows on a large IFC model), which is why
 * this is not an edge case.
 *
 * Vertices only zero-area triangles used are dropped with them. Draco's
 * EDGEBREAKER does not encode a vertex no face uses, so leaving them in would
 * let one widen the quantization grid the encoder sets while the decoded
 * primitive — the extent the reader takes each row's tolerance from — no
 * longer contains it.
 *
 * @param {object} table verified collapsed table
 * @param {object} view from `rowReader`, over its merged primitive
 * @return {?object} `{sourceVertexCount, vertices, indices, rows, itemSize,
 *   indexCounts, cornerAt, hasEmptyRow}`, or null when a row indexes outside its own
 *   vertex range
 */
function planRowTag(table, view) {
  const {ranges} = table
  const last = ranges[ranges.length - 1]
  const vertexTotal = last.vertexStart + last.vertexCount
  const used = new Uint8Array(vertexTotal)
  const keptTriangles = []
  const indexCounts = new Uint32Array(ranges.length)
  const same = (r, a, b) => a === b || (
    Object.is(view.positionAt(r, a, 0), view.positionAt(r, b, 0)) &&
    Object.is(view.positionAt(r, a, 1), view.positionAt(r, b, 1)) &&
    Object.is(view.positionAt(r, a, 2), view.positionAt(r, b, 2)))
  for (let r = 0; r < ranges.length; r++) {
    const {vertexStart, vertexCount, indexCount} = ranges[r]
    for (let i = 0; i + 2 < indexCount; i += 3) {
      const a = view.localIndexAt(r, i)
      const b = view.localIndexAt(r, i + 1)
      const c = view.localIndexAt(r, i + 2)
      if (a >= vertexCount || b >= vertexCount || c >= vertexCount) {
        return null
      }
      if (same(r, a, b) || same(r, b, c) || same(r, a, c)) {
        continue
      }
      keptTriangles.push(r, vertexStart + a, vertexStart + b, vertexStart + c)
      used[vertexStart + a] = used[vertexStart + b] = used[vertexStart + c] = 1
      indexCounts[r] += 3
    }
  }
  const renumber = new Int32Array(vertexTotal).fill(-1)
  const vertices = []
  for (let v = 0; v < vertexTotal; v++) {
    if (used[v]) {
      renumber[v] = vertices.length
      vertices.push(v)
    }
  }
  const itemSize = ranges.length <= ROW_TAG_SCALAR_ROWS ? 1 : 2
  const rows = new Uint16Array(vertices.length * itemSize)
  let r = 0
  vertices.forEach((v, k) => {
    while (v >= ranges[r].vertexStart + ranges[r].vertexCount) {
      r++
    }
    rows[k * itemSize] = r % ROW_TAG_SCALAR_ROWS
    if (itemSize === 2) {
      rows[(k * itemSize) + 1] = Math.floor(r / ROW_TAG_SCALAR_ROWS)
    }
  })
  const indices = new Uint32Array((keptTriangles.length / 4) * 3)
  // Each row's kept corners as ABSOLUTE source vertices, for the witness.
  const cornerStarts = new Uint32Array(ranges.length + 1)
  for (let row = 0; row < ranges.length; row++) {
    cornerStarts[row + 1] = cornerStarts[row] + indexCounts[row]
  }
  const corners = new Uint32Array(indices.length)
  for (let k = 0, i = 0; k < keptTriangles.length; k += 4, i += 3) {
    for (let j = 0; j < 3; j++) {
      corners[i + j] = keptTriangles[k + 1 + j]
      indices[i + j] = renumber[keptTriangles[k + 1 + j]]
    }
  }
  return {
    sourceVertexCount: vertexTotal,
    vertices: Uint32Array.from(vertices),
    indices,
    rows,
    itemSize,
    indexCounts,
    // `positionAt` takes a row-local vertex; the corners are absolute.
    cornerAt: (row, i, c) => {
      const v = corners[cornerStarts[row] + i]
      return view.positionAt(row, v - ranges[row].vertexStart, c)
    },
    hasEmptyRow: indexCounts.some((count) => count === 0),
  }
}


/**
 * Where each collapsed table's rows live in this file: its one merged node,
 * or one portable node per row.
 *
 * @param {object} json
 * @param {Array<object>} tables parsed
 * @return {Map<number, object>} table index -> `{merged: primitive, mesh:
 *   index}` or `{perRow: Array<primitive>}`
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
      found.set(t, {merged: primitive, mesh: node.mesh})
    }
  }
  return found
}


/**
 * A uniform view over a table's rows, whichever shape holds them: per row, a
 * vertex count, an index count, local index values and positions. (No
 * extent: the reader takes each row's Draco step from the primitive it
 * decodes that row from — see "THE LOSSY WITNESS".)
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
 * @return {?{count: number, at: Function}} a float VEC3 reader
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
  return {count: accessor.count, at}
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
