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
//   tag — but it is EDGEBREAKER too, so it loses its zero-area triangles the
//   same way and is stripped and witnessed the same way.
import {
  BLDRS_INSTANCE_TABLES_EXTENSION_NAME,
  buildLossyWitness,
  makeRangeCanary,
  packRowTag,
  parseInstanceTablesExtensionData,
  rowTagItemSize,
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
 * Plan a Draco export's collapsed tables: which primitives lose their
 * zero-area triangles (and which of those also get a row tag), which Draco
 * method the file takes, and the tables payload with a lossy witness added to
 * every verifiable collapsed table.
 *
 * The method is EDGEBREAKER, and every collapsed primitive of a verified
 * table is stripped of its zero-area triangles first — EDGEBREAKER drops
 * those itself (measured: 202 triangles in, 200 out, the two degenerate ones
 * gone whether their corners share an index or only a position), so the
 * export removes them and witnesses exactly what the encoder will keep. Both
 * shapes a collapsed table comes in get that: the merged primitive, which
 * also gets the row tag because its rows share it, and a portable file's
 * per-row primitives, which need no tag (each IS one row) but are
 * EDGEBREAKER all the same and lost the same triangles until this applied to
 * them too.
 *
 * It is SEQUENTIAL, with nothing stripped, no new tags and the witness taken
 * over every triangle, in the cases stripping cannot serve: some verified
 * row has NO triangle of non-zero area, so EDGEBREAKER would erase the
 * element; some collapsed table does not verify at all (below); or the
 * caller says the file is SEQUENTIAL anyway (`forceSequential`). That is
 * the layout the first Draco exports of collapsed artifacts used (#1872),
 * which the reader still opens, so falling back to it costs ratio, not
 * selection. One file, one method, whichever shape the row is in.
 *
 * @param {object} json the source GLB's JSON
 * @param {Uint8Array} bin its BIN chunk
 * @param {object} rawPayload the decoded `BLDRS_instance_tables` JSON
 * @param {number} positionBits the Draco POSITION quantization bits the
 *   export will use
 * @param {boolean} [forceSequential] the file is SEQUENTIAL whatever its
 *   collapsed tables hold — another mesh's triangle order is load-bearing
 *   (`glbCompression.js#isTriangleOrderedLayout`) — so plan the SEQUENTIAL
 *   branch: nothing stripped or tagged, every verified table still witnessed
 * @return {?{sequential: boolean, meshPlans: Map<number, object>, payload: ?object}}
 *   null when the payload has no collapsed table. `meshPlans` maps a source
 *   mesh index to what `glbCompression.js#applyMeshPlan` does to its one
 *   primitive ({@link planMerged}, {@link planPerRow}); `payload` is a copy
 *   of `rawPayload` with witnesses added (and any it already carried widened
 *   for this encode's quantization), or null when it changed nothing
 */
export function planCollapsedDraco(json, bin, rawPayload, positionBits, forceSequential = false) {
  const tables = parseInstanceTablesExtensionData(rawPayload)
  if (!tables || !bin || !tables.some((table) => Array.isArray(table.ranges))) {
    return null
  }
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength)
  const rowsByTable = collectRows(json, tables)
  const verified = []
  let unverified = 0
  tables.forEach((table, t) => {
    if (!Array.isArray(table.ranges)) {
      return
    }
    const rows = rowsByTable.get(t)
    const view = rows && rowReader(json, dv, table, rows)
    if (!view || exactCanary(table, view) !== table.canary) {
      glbInfo(`export: collapsed table ${t} does not verify on the source; no new lossy witness`)
      unverified++
      return
    }
    const kept = keptTriangles(table, view)
    if (!kept) {
      glbInfo(`export: collapsed table ${t} indexes outside its rows; no new lossy witness`)
      unverified++
      return
    }
    verified.push({t, table, view, rows, kept})
  })
  // A table the plan cannot verify is one it can neither strip nor tag — and
  // the commonest such source is not a broken file but a collapsed Draco
  // export handed back to the export (codex P1 on #1903): Draco quantized
  // its geometry, so the exact canary cannot pass by construction. Its rows
  // live in what it already carries — triangle runs if it predates the tag,
  // its own tag (which rides through the re-encode as a plain attribute) if
  // not — and in its own witness, which is kept as it is. SEQUENTIAL keeps
  // both true: runs stay in order, and no triangle the first quantization
  // made zero-area is dropped from under a witness that counted it.
  // Verifying such a source would mean running the reader's lossy rebuild
  // here. Nothing in the app hands the export one: both export paths
  // (`artifactSizes.js#runRewrite`, `pro/glbExport.js`) read the OPFS
  // artifact, and `glbExport.js` writes every batched artifact — the only
  // kind with collapsed tables — with mode null. So it falls back.
  const sequential = forceSequential || unverified > 0 || verified.some(({kept}) => kept.hasEmptyRow)
  const meshPlans = new Map()
  const out = {...rawPayload, nodes: rawPayload.nodes.map((node) => ({...node}))}
  // A retained witness was taken at ITS encode's POSITION bits, and this
  // encode quantizes the decoded positions again, at `positionBits`. The
  // reader allows each row one step at the witness's bits (`bldrsInstance
  // Tables.js#matchesLossyWitness`), so carry it at one bit under the
  // coarser of the two: that step is at least twice the coarser step, which
  // covers the error the witness already allowed plus this encode's half
  // step (Draco rounds to the nearest grid point). That is a bound, so it
  // holds however many times a file goes round; on the jest cases the
  // coarser rung's own bits already pass, and the extra bit is the margin
  // for grids that do not line up. Codex on #1903: kept at 14 bits through
  // a `smallest` (12-bit) re-encode, the witness refused every row.
  let carried = 0
  tables.forEach((table, t) => {
    const witness = out.nodes[t]?.witness
    if (Array.isArray(table.ranges) && !verified.some((v) => v.t === t) &&
        Number.isInteger(witness?.positionBits)) {
      out.nodes[t].witness = {
        ...witness,
        positionBits: Math.max(1, Math.min(witness.positionBits, positionBits) - 1),
      }
      carried++
    }
  })
  for (const {t, table, view, rows, kept} of verified) {
    if (sequential) {
      const stats = rowWitnessStats(
        table.count, (r) => view.indexCountOf(r),
        (r, i, c) => view.cornerAt(r, i, c))
      out.nodes[t].witness = buildLossyWitness(table, stats, positionBits)
      continue
    }
    if (rows.merged) {
      meshPlans.set(rows.mesh, planMerged(table, kept))
    } else {
      planPerRow(view, kept).forEach((plan, r) => meshPlans.set(rows.meshes[r], plan))
    }
    const stats = rowWitnessStats(
      table.count, (r) => kept.corners[r].length,
      (r, i, c) => view.positionAt(r, kept.corners[r][i], c))
    out.nodes[t].witness = buildLossyWitness(table, stats, positionBits, (r) => kept.corners[r].length)
  }
  if (sequential) {
    glbInfo(forceSequential ?
      'export: another mesh orders its triangles; Draco stays SEQUENTIAL, collapsed tables witnessed unstripped' :
      'export: a collapsed table cannot be stripped (unverified, or a row with no ' +
      'triangle of non-zero area); Draco stays SEQUENTIAL, nothing new tagged')
  }
  return {sequential, meshPlans, payload: verified.length > 0 || carried > 0 ? out : null}
}


/**
 * Each row's triangles that survive EDGEBREAKER: every one with non-zero
 * area, in source order, as row-local corner vertices.
 *
 * Zero area means two corners at the SAME position, compared as Draco's
 * attribute deduplication compares it — bit for bit, so -0 and +0 differ
 * (measured: a triangle with one corner at x = -0 beside one at +0 survives
 * EDGEBREAKER). Collinear and sub-quantum triangles are kept by the encoder,
 * measured too, so they are kept here. Real collapsed rows do carry
 * zero-area triangles (hundreds of rows on a large IFC model), which is why
 * this is not an edge case.
 *
 * @param {object} table verified collapsed table
 * @param {object} view from `rowReader`, either shape
 * @return {?{corners: Array<Uint32Array>, hasEmptyRow: boolean}} or null
 *   when a row indexes outside its own vertices
 */
function keptTriangles(table, view) {
  const corners = new Array(table.count)
  for (let r = 0; r < table.count; r++) {
    const vertexCount = view.vertexCountOf(r)
    const indexCount = view.indexCountOf(r)
    const same = (a, b) => a === b || (
      Object.is(view.positionAt(r, a, 0), view.positionAt(r, b, 0)) &&
      Object.is(view.positionAt(r, a, 1), view.positionAt(r, b, 1)) &&
      Object.is(view.positionAt(r, a, 2), view.positionAt(r, b, 2)))
    const row = []
    for (let i = 0; i + 2 < indexCount; i += 3) {
      const a = view.localIndexAt(r, i)
      const b = view.localIndexAt(r, i + 1)
      const c = view.localIndexAt(r, i + 2)
      if (a >= vertexCount || b >= vertexCount || c >= vertexCount) {
        return null
      }
      if (!same(a, b) && !same(b, c) && !same(a, c)) {
        row.push(a, b, c)
      }
    }
    corners[r] = Uint32Array.from(row)
  }
  return {corners, hasEmptyRow: corners.some((row) => row.length === 0)}
}


/**
 * The plan for a merged primitive: its kept triangles, the vertices they use
 * (ascending, so each row's stay contiguous) — dropping the ones only
 * zero-area triangles used — and each kept vertex's row tag.
 *
 * Vertices only zero-area triangles used are dropped with them, here and in
 * {@link planPerRow}. Draco's EDGEBREAKER does not encode a vertex no face
 * uses, so leaving them in would let one widen the quantization grid the
 * encoder sets while the decoded primitive — the extent the reader takes each
 * row's tolerance from — no longer contains it.
 *
 * @param {object} table verified merged table
 * @param {object} kept from {@link keptTriangles}
 * @return {object} `{sourceVertexCount, vertices, indices, rows, itemSize}`
 */
function planMerged(table, kept) {
  const {ranges} = table
  const last = ranges[ranges.length - 1]
  const plan = compact(last.vertexStart + last.vertexCount,
    kept.corners.map((row, r) => row.map((v) => ranges[r].vertexStart + v)))
  const itemSize = rowTagItemSize(ranges.length)
  const rows = new Uint16Array(plan.vertices.length * itemSize)
  let r = 0
  plan.vertices.forEach((v, k) => {
    while (v >= ranges[r].vertexStart + ranges[r].vertexCount) {
      r++
    }
    packRowTag(rows, k, r, itemSize)
  })
  return {...plan, rows, itemSize}
}


/**
 * The plans for a portable file's per-row primitives: each row's own kept
 * triangles and the vertices they use. No tag — the row IS the primitive.
 *
 * @param {object} view from `rowReader`, per-row shape
 * @param {object} kept from {@link keptTriangles}
 * @return {Array<object>} per row, `{sourceVertexCount, vertices, indices}`
 */
function planPerRow(view, kept) {
  return kept.corners.map((row, r) => compact(view.vertexCountOf(r), [row]))
}


/**
 * Renumber the vertices some triangles use, ascending, dropping the rest.
 *
 * @param {number} vertexCount the primitive's vertex count
 * @param {Array<Uint32Array>} triangleRuns corner vertices, three per triangle
 * @return {{sourceVertexCount: number, vertices: Uint32Array, indices: Uint32Array}}
 */
function compact(vertexCount, triangleRuns) {
  const used = new Uint8Array(vertexCount)
  for (const run of triangleRuns) {
    for (const v of run) {
      used[v] = 1
    }
  }
  const renumber = new Int32Array(vertexCount).fill(-1)
  const vertices = []
  for (let v = 0; v < vertexCount; v++) {
    if (used[v]) {
      renumber[v] = vertices.length
      vertices.push(v)
    }
  }
  const indices = new Uint32Array(triangleRuns.reduce((n, run) => n + run.length, 0))
  let at = 0
  for (const run of triangleRuns) {
    for (const v of run) {
      indices[at++] = renumber[v]
    }
  }
  return {sourceVertexCount: vertexCount, vertices: Uint32Array.from(vertices), indices}
}


/**
 * Where each collapsed table's rows live in this file: its one merged node,
 * or one portable node per row.
 *
 * @param {object} json
 * @param {Array<object>} tables parsed
 * @return {Map<number, object>} table index -> `{merged: primitive, mesh:
 *   index}` or `{perRow: Array<primitive>, meshes: Array<index>}`
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
      const entry = found.get(t) ?? {
        perRow: new Array(tables[t].count).fill(null),
        meshes: new Array(tables[t].count).fill(null),
      }
      if (entry.perRow) {
        entry.perRow[row] = primitive
        entry.meshes[row] = node.mesh
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
