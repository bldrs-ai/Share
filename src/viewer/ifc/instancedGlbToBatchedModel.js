import {
  BatchedMesh,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Matrix4,
  Vector4,
} from 'three'
import {makeSurfaceMaterial} from '../lookMaterial'
import {addGeometryRanges} from './batchedGeometryRanges'
import {allocateInstanceTables, writeRow} from './batchedInstanceTables'
import {attachBatchedSubsets} from './batchedSubset'
import {decorateBatchMeshes} from './buildBatchedConwayModel'
import {
  ROW_TAG_ATTRIBUTE,
  matchesLossyWitness,
  rangeCanaryOf,
  rowOfTag,
  rowWitnessStats,
} from '../../loader/bldrsInstanceTables'
import {glbInfo, glbVerbose} from '../../loader/glbLog'


/**
 * instancedGlbToBatchedModel — cache-hit hydration for the batched-native
 * GLB artifact (view-140 S9 / viewer-replacement §3b.v, the default-on
 * `glbBatched` flag), and for the portable rewrite of that same artifact
 * (#1849; see TWO ARTIFACT SHAPES below).
 *
 * The writer (`loader/glbBatchedExport`) serialized the live batched model
 * as EXT_mesh_gpu_instancing nodes + `BLDRS_instance_tables`. three's
 * GLTFLoader hydrates those nodes to `InstancedMesh`es (geometry +
 * per-instance matrices), and the tables plugin stashes the identity data
 * on `scene.userData.bldrsInstanceTables`. This module joins the two back
 * into the SAME decorated-BatchedMesh shape the cache-miss Conway build
 * produces — opaque/transparent split, pick tables, source-color snapshot,
 * palette re-derivation — by rebuilding batches and running them through
 * `decorateBatchMeshes`, the shared decoration core. Reload behavior
 * (highlight, isolate, residency, the display controls) is therefore the
 * cache-miss behavior by construction, not by a parallel implementation.
 *
 * NOT restored here: the Conway `ifcManager` shim and property/spatial
 * closures — a cache hit has no live parser, and NavTree / Properties
 * already hydrate from the `BLDRS_spatial_tree` / `BLDRS_element_properties`
 * extensions exactly as they do for merged artifacts.
 *
 * Join integrity: each writer node carries `extras.bldrsTableNode` (its
 * table index; GLTFLoader promotes extras to `userData`), so instances are
 * matched by identity, not traversal order. Any mismatch — missing index,
 * duplicate, count disagreement — returns null and the caller keeps the
 * GLTFLoader model as-is: it still RENDERS correctly (three draws the
 * instancing natively); what's lost is the batched decoration, so fail-soft
 * degrades rather than producing a wrong scene. `inferModelCapabilities`
 * grants the kept model neither `expressIdPicking` nor `batchedPicking` nor
 * `instancePicking`, so every downstream table consumer is gated off rather
 * than reading garbage; NavTree and Properties still hydrate from the
 * spatial-tree / element-properties extensions.
 *
 * "Table-less" understates one case, though: on a COLORLESS model the kept
 * model also misses `applyProductPalette`, so it renders grey where a cache
 * miss renders palette-colored. That is a visible hit/miss difference, not
 * just a loss of interaction — worth knowing when triaging "why is this
 * model grey after a reload". Reaching it requires a corrupt artifact (the
 * join is total for anything this writer produced), which is why it is
 * documented rather than defended against.
 *
 * TWO ARTIFACT SHAPES, ONE HYDRATION (#1849). The Export tab's "Portable"
 * option rewrites the same artifact into a plain scene graph
 * (`export/glbPortable.js`): the instancing extension is gone, and every
 * placement is its own named `Mesh` node nested under the spatial tree. The
 * tables are untouched — the rewrite only replaces `json.nodes` — so the
 * identity data is all still there; what changes is where the geometry and
 * the per-instance matrices are read FROM. `joinPortableNodesToTables` is
 * that second reader, and from `buildPartition` down the two shapes are
 * indistinguishable, so highlight / isolate / residency / display controls
 * are the same code for both by construction rather than by parity testing.
 *
 * The dispatch reads the ARTIFACT, not the caller (#1844's principle): a
 * portable file arrives through the same `load()` as any other `.glb`, and a
 * flag threaded from the caller would have to know something the file
 * already says. `detectArtifactShape` asks which kind of stamped node the
 * scene actually holds.
 */


/** The batched-native artifact: EXT_mesh_gpu_instancing → InstancedMesh. */
const SHAPE_INSTANCED = 'instanced'
/** The portable rewrite: one plain Mesh per placement, nested and named. */
const SHAPE_PORTABLE = 'portable'


/**
 * Whether a table's geometry is COLLAPSED: one merged primitive holding every
 * element in the table, addressed by index range rather than by its own glTF
 * mesh (glb-export-premium.md §1.1c).
 *
 * @param {object} table one parsed BLDRS_instance_tables node
 * @return {boolean}
 */
function isCollapsedTable(table) {
  return Array.isArray(table?.ranges)
}


/**
 * Collect the model's mesh-bearing nodes keyed by their writer-stamped table
 * index, validating the join is total and counts agree.
 *
 * Two node kinds, decided by the TABLE rather than by the node: an ordinary
 * table joins to an `InstancedMesh` (one `EXT_mesh_gpu_instancing` node), a
 * collapsed one to a plain `Mesh` carrying the whole group's merged
 * primitive. A node of the wrong kind for its table is skipped rather than
 * rejected outright — as this join has always skipped a plain node — and the
 * totality check below then refuses the file, since its row stays uncovered.
 *
 * @param {object} gltfModel GLTFLoader scene
 * @param {Array<object>} tables parsed BLDRS_instance_tables nodes
 * @return {Array<object>|null} `sources[i]` pairs with `tables[i]`, each
 *   exposing the `{geometry, getMatrixAt}` surface `buildPartition` reads
 *   (plus `ranges` on a collapsed one)
 */
function joinNodesToTables(gltfModel, tables) {
  // A collapsed group is placed by its NODE's transform, not by a per-instance
  // accessor, so world matrices have to be current before any is read — the
  // same force-refresh, for the same reason, as the portable join below. Run
  // unconditionally rather than only for collapsed tables: it is one walk of a
  // scene GLTFLoader has already updated, and gating it would make the
  // hand-built unit fixtures depend on which table shape they happen to use.
  gltfModel.updateMatrixWorld?.(true)
  const toModelSpace = new Matrix4()
  if (gltfModel.matrixWorld) {
    toModelSpace.copy(gltfModel.matrixWorld).invert()
  }

  const sources = new Array(tables.length).fill(null)
  let bad = false
  gltfModel.traverse?.((obj) => {
    if (!obj.isMesh) {
      return
    }
    const index = obj.userData?.bldrsTableNode
    if (index === undefined) {
      return
    }
    if (!Number.isInteger(index) || index < 0 || index >= tables.length) {
      bad = true
      return
    }
    const collapsed = isCollapsedTable(tables[index])
    if (collapsed ? (obj.isInstancedMesh || obj.isBatchedMesh) : !obj.isInstancedMesh) {
      return
    }
    if (sources[index] !== null) {
      bad = true
      return
    }
    sources[index] = collapsed ?
      makeCollapsedSource(obj, tables[index].ranges, toModelSpace) : obj
  })
  if (bad || sources.some((source) => source === null)) {
    return null
  }
  for (let i = 0; i < tables.length; i++) {
    const declared = isCollapsedTable(tables[i]) ?
      tables[i].ranges.length : sources[i].count
    if (declared !== tables[i].count) {
      return null
    }
    if (!isCollapsedTable(tables[i])) {
      continue
    }
    if (tables[i].lossyGeometry) {
      // Draco: the merged primitive's vertices were merged and quantized, so
      // rebuild each row from its own triangles and check the lossy witness
      // (`bldrsInstanceTables.js`, "THE LOSSY WITNESS"). Which triangles are
      // a row's depends on the file: a row-tagged one says so per vertex, an
      // untagged (SEQUENTIAL, #1872/#1898) one by position in the index.
      const geometry = sources[i].geometry
      const rebuilt = geometry.getAttribute?.(ROW_TAG_ATTRIBUTE) ?
        regroupByRowTag(tables[i], geometry) :
        rebuildFromTriangleRuns(tables[i], geometry)
      if (!rebuilt) {
        return null
      }
      sources[i] = {...sources[i], geometry: rebuilt.geometry, ranges: rebuilt.ranges}
    } else if (!isCollapsedGeometryWitnessed(sources[i].geometry, tables[i])) {
      return null
    }
  }
  return sources
}


/**
 * Rows of a row-tagged Draco primitive (`bldrsInstanceTables.js#
 * ROW_TAG_SEMANTIC`), which EDGEBREAKER encoded: triangles in whatever order
 * the codec chose, rows interleaved, zero-area triangles gone.
 *
 * Each triangle's row is its corners' tag, and all three must agree — the
 * export tags a triangle's corners from the one row whose vertices they are,
 * and Draco cannot merge vertices whose tags differ, so a disagreement means
 * the tags do not belong to this geometry, and the table is refused rather
 * than a triangle guessed into a row. Triangles are then grouped by row,
 * STABLY (a row's triangles keep their decoded order), and the result goes
 * through the same rebuild as an untagged file: each row a fresh contiguous
 * vertex block in first-use order, ranges re-derived, checked against the
 * witness. What comes out is the shape `addGeometryRanges` has always been
 * given, so nothing downstream knows the file was tagged.
 *
 * The tag is deleted from the decoded geometry once read: the rebuilt geometry
 * never had it, and the decoded one is what stays on screen should the table
 * be refused, where it would only be one more attribute to upload.
 *
 * @param {object} table parsed collapsed table (row count, `witness`)
 * @param {BufferGeometry} geometry the decoded merged primitive
 * @return {?{geometry: BufferGeometry, ranges: Array<object>}} or null
 */
function regroupByRowTag(table, geometry) {
  const tag = geometry.getAttribute(ROW_TAG_ATTRIBUTE)
  geometry.deleteAttribute(ROW_TAG_ATTRIBUTE)
  const rows = groupTrianglesByRowTag(tag, geometry.getIndex?.(), 0, table.ranges.length)
  if (!rows) {
    return null
  }
  glbVerbose(`reader: regrouped ${geometry.getIndex().count / 3} row-tagged triangle(s) into ` +
    `${table.ranges.length} row(s)`)
  return rebuildLossyCollapsed(table, (r) => ({
    geometry,
    count: rows.counts[r],
    pointAt: (i) => rows.grouped[rows.starts[r] + i],
  }))
}


/**
 * Group a row-tagged primitive's triangles by the row their corners name,
 * stably — the step `regroupByRowTag` and a grouped portable piece
 * (`portableLossyRows`) share.
 *
 * The primitive holds rows `firstRow` .. `firstRow + rowCount - 1` of its
 * table: all of them for the merged artifact's primitive, one element's for a
 * portable piece. A tag naming any other row, or a triangle whose corners
 * disagree, refuses the primitive — the tags do not belong to this geometry,
 * and no triangle is guessed into a row.
 *
 * @param {object} tag the decoded {@link ROW_TAG_ATTRIBUTE}
 * @param {?object} index the primitive's index attribute
 * @param {number} firstRow the first table row it holds
 * @param {number} rowCount how many
 * @return {?{counts: Uint32Array, starts: Uint32Array, grouped: Uint32Array}}
 *   per held row (k = row - firstRow): its corner count, where its corners
 *   start in `grouped`, and the vertex indices themselves; or null
 */
function groupTrianglesByRowTag(tag, index, firstRow, rowCount) {
  if (!index || index.count % 3 !== 0 || (tag.itemSize !== 1 && tag.itemSize !== 2)) {
    return null
  }
  const triangleRows = new Uint32Array(index.count / 3)
  const counts = new Uint32Array(rowCount)
  const heldRowOf = (vertex) => rowOfTag(tag, vertex) - firstRow
  for (let t = 0; t < triangleRows.length; t++) {
    const row = heldRowOf(index.getX(t * 3))
    if (row < 0 || row >= rowCount || heldRowOf(index.getX((t * 3) + 1)) !== row ||
        heldRowOf(index.getX((t * 3) + 2)) !== row) {
      glbInfo('reader: a row-tagged triangle spans rows or names no row; refusing')
      return null
    }
    triangleRows[t] = row
    counts[row] += 3
  }
  const starts = new Uint32Array(rowCount)
  for (let r = 1; r < rowCount; r++) {
    starts[r] = starts[r - 1] + counts[r - 1]
  }
  const grouped = new Uint32Array(index.count)
  const cursor = starts.slice()
  for (let t = 0; t < triangleRows.length; t++) {
    const row = triangleRows[t]
    for (let k = 0; k < 3; k++) {
      grouped[cursor[row]++] = index.getX((t * 3) + k)
    }
  }
  return {counts, starts, grouped}
}


/**
 * Rows of an untagged Draco primitive — what the first Draco exports of
 * collapsed artifacts wrote (#1872, #1898), SEQUENTIAL so triangle order and
 * count survive: row r is the r-th contiguous triangle run, with the table's
 * own index count. The runs must tile the index buffer exactly, since a codec
 * that dropped or added a triangle has shifted every run after it.
 *
 * @param {object} table parsed collapsed table
 * @param {BufferGeometry} geometry the decoded merged primitive
 * @return {?{geometry: BufferGeometry, ranges: Array<object>}} or null
 */
function rebuildFromTriangleRuns(table, geometry) {
  const {ranges} = table
  const last = ranges[ranges.length - 1]
  const index = geometry.getIndex?.()
  if (!index || !last || last.indexStart + last.indexCount !== index.count) {
    glbInfo('reader: lossy collapsed triangle runs do not tile their primitive; refusing')
    return null
  }
  return rebuildLossyCollapsed(table, (r) => ({
    geometry,
    count: ranges[r].indexCount,
    pointAt: (i) => index.getX(ranges[r].indexStart + i),
  }))
}


/**
 * Rebuild a lossy collapsed table's geometry row by row from its TRIANGLES,
 * then check it against the table's lossy witness.
 *
 * Draco merges coincident vertices (across rows, in an untagged file) and
 * quantizes them, so no row's vertex range survives it; only which triangles
 * are the row's does. So each row's corners are gathered from its own
 * triangles, given a fresh contiguous vertex block (first-use order), and the
 * ranges are re-derived for that block. The result tiles by construction,
 * which is what `addGeometryRanges` needs, and it is witnessed by the export's
 * identity hash and per-row corner stats rather than the exact canary Draco
 * made unreachable.
 *
 * @param {object} table parsed collapsed table: `ranges` (for the row
 *   count, and each row's index count where the file keeps it), `witness`
 * @param {function(number): object} rowAt row r's triangles, as `{geometry,
 *   count, pointAt}`: the decoded geometry they index, how many corners, and
 *   `(corner) => vertex` in that geometry
 * @return {?{geometry: BufferGeometry, ranges: Array<object>}} or null when
 *   the table has no witness, a row is out of bounds, or the witness refuses
 */
function rebuildLossyCollapsed(table, rowAt) {
  if (!table.witness) {
    glbInfo('reader: lossy collapsed table carries no witness; refusing')
    return null
  }
  const rowCount = table.ranges.length
  const rows = new Array(rowCount)
  let cornerTotal = 0
  for (let r = 0; r < rowCount; r++) {
    rows[r] = rowAt(r)
    const {geometry, count} = rows[r]
    const index = geometry?.getIndex?.()
    const position = geometry?.getAttribute?.('position')
    if (!index || !position || !Number.isInteger(count) || count > index.count) {
      return null
    }
    cornerTotal += count
  }
  // Worst case every corner is its own vertex; trimmed below.
  const positions = new Float32Array(cornerTotal * 3)
  const normals = new Float32Array(cornerTotal * 3)
  const indices = new Uint32Array(cornerTotal)
  const rebuiltRanges = []
  let hasNormals = true
  let vertexCursor = 0
  let indexCursor = 0
  for (let r = 0; r < rowCount; r++) {
    const {geometry, count, pointAt} = rows[r]
    const position = geometry.getAttribute('position')
    const normal = geometry.getAttribute('normal')
    hasNormals = hasNormals && Boolean(normal)
    const local = new Map()
    const vertexStart = vertexCursor
    for (let i = 0; i < count; i++) {
      const point = pointAt(i)
      let v = local.get(point)
      if (v === undefined) {
        v = vertexCursor - vertexStart
        local.set(point, v)
        const at = vertexCursor * 3
        positions[at] = position.getX(point)
        positions[at + 1] = position.getY(point)
        positions[at + 2] = position.getZ(point)
        if (normal) {
          normals[at] = normal.getX(point)
          normals[at + 1] = normal.getY(point)
          normals[at + 2] = normal.getZ(point)
        }
        vertexCursor++
      }
      indices[indexCursor + i] = vertexStart + v
    }
    rebuiltRanges.push({
      vertexStart, vertexCount: vertexCursor - vertexStart,
      indexStart: indexCursor, indexCount: count,
    })
    indexCursor += count
  }
  // The witness's stats are over each row's triangle corners, read here from
  // the DECODED geometry — so they see exactly what will be drawn. Mean, min
  // and max do not depend on the order corners come in, which is why the
  // same witness serves a SEQUENTIAL file's runs and a tagged file's groups.
  const stats = rowWitnessStats(rowCount, (r) => rows[r].count, (r, i, c) =>
    rows[r].geometry.getAttribute('position').getComponent(rows[r].pointAt(i), c))
  // Each row's tolerance follows the primitive it was decoded from, which is
  // the grid Draco quantized it on: shared for the merged artifact, one per
  // row for its portable rewrite.
  const extents = new Map()
  const extentOf = (r) => {
    const {geometry} = rows[r]
    if (!extents.has(geometry)) {
      extents.set(geometry, largestExtent(geometry.getAttribute('position')))
    }
    return extents.get(geometry)
  }
  // The identity hash takes the counts rebuilt here, not the table's: they
  // are the table's own for an untagged file (checked above, or by the
  // caller), and for a tagged one the export hashed what it encoded.
  if (!matchesLossyWitness(table, stats, extentOf, (r) => rows[r].count)) {
    glbInfo('reader: lossy collapsed table does not match its witness; refusing')
    return null
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions.slice(0, vertexCursor * 3), 3))
  if (hasNormals) {
    geometry.setAttribute('normal', new BufferAttribute(normals.slice(0, vertexCursor * 3), 3))
  }
  geometry.setIndex(new BufferAttribute(indices, 1))
  return {geometry, ranges: rebuiltRanges}
}


/**
 * @param {BufferAttribute} position
 * @return {number} the largest axis extent of its values
 */
function largestExtent(position) {
  let extent = 0
  for (let c = 0; c < 3; c++) {
    let min = Infinity
    let max = -Infinity
    for (let v = 0; v < position.count; v++) {
      const value = position.getComponent(v, c)
      min = Math.min(min, value)
      max = Math.max(max, value)
    }
    extent = Math.max(extent, max - min)
  }
  return extent
}


/**
 * Whether a collapsed table's ranges are witnessed by the geometry they
 * slice: they tile it exactly, and the writer's canary re-derives from it.
 *
 * The tiling check is structural and cheap, and catches a table from a
 * different file. The canary is the one that catches a table from the RIGHT
 * file whose rows point at the wrong elements — the failure every other check
 * here passes, because a range that is shifted by one element of the same
 * size is perfectly well formed (`bldrsInstanceTables.js`, module doc). It is
 * required, not optional: `parseInstanceTablesExtensionData` refuses a
 * collapsed node without one, so a missing canary here means a table that did
 * not come out of a file, and trusting it is exactly the silent wrong-element
 * pick this exists to prevent.
 *
 * @param {object} geometry the merged BufferGeometry
 * @param {object} table parsed collapsed table
 * @return {boolean}
 */
function isCollapsedGeometryWitnessed(geometry, table) {
  const position = geometry?.getAttribute?.('position')
  const index = geometry?.getIndex?.()
  if (!position || !index || !Number.isInteger(table.canary)) {
    return false
  }
  const last = table.ranges[table.ranges.length - 1]
  if (!last || last.vertexStart + last.vertexCount !== position.count ||
      last.indexStart + last.indexCount !== index.count) {
    glbInfo('reader: collapsed ranges do not tile their merged geometry; refusing')
    return false
  }
  if (rangeCanaryOf(geometry, table) !== table.canary) {
    glbInfo('reader: collapsed range canary mismatch; refusing the table')
    return false
  }
  return true
}


/**
 * Adapt a collapsed table's single merged node to the surface
 * `buildPartition` reads, with the range list it needs to split the merged
 * primitive back into per-element geometry ids.
 *
 * **Every row gets the SAME matrix** — the node's, in the model root's frame.
 * That is not a simplification: a collapsed group's per-element placement is
 * baked into the merged vertices by the writer, because a glTF primitive can
 * only be drawn at one transform and the file has to render correctly in a
 * viewer that knows nothing about `BLDRS_instance_tables`. What stays on the
 * node is the group's own offset, which the writer keeps there precisely so
 * baking does not cost precision: vertices are expressed relative to the
 * group rather than to the world, so a model placed 10^5 m from the origin
 * still resolves millimetre detail in float32.
 *
 * @param {object} node the merged plain Mesh
 * @param {Array<object>} ranges per-element `{vertexStart, vertexCount,
 *   indexStart, indexCount}` into that node's geometry
 * @param {Matrix4} toModelSpace inverse of the model root's world matrix
 * @return {object} placement source
 */
function makeCollapsedSource(node, ranges, toModelSpace) {
  return {
    geometry: node.geometry,
    ranges,
    getMatrixAt: (i, target) =>
      target.multiplyMatrices(toModelSpace, node.matrixWorld),
  }
}


/**
 * Which of the two artifact shapes this scene carries.
 *
 * Both writers stamp `extras.bldrsTableNode` on their mesh-bearing nodes and
 * GLTFLoader promotes it to `userData`, so the stamp alone does not say which
 * one wrote the file — what the node IS does. The batched-native writer emits
 * `EXT_mesh_gpu_instancing`, which GLTFLoader hydrates to `InstancedMesh`;
 * the portable rewrite emits one plain `Mesh` per placement and no
 * InstancedMesh at all.
 *
 * So one stamped InstancedMesh decides it, and everything else — including a
 * file with no stamp anywhere — takes the portable reader, whose totality
 * check then returns null on it. That is deliberately not a third "neither"
 * answer: both joins already refuse anything they cannot cover completely, so
 * a separate refusal here would be a branch no test could tell from the one
 * beside it.
 *
 * A stamped Mesh carrying a `bldrsInstance` row is portable whatever else
 * the file holds — see the note in the body.
 *
 * COLLAPSED TABLES ARE NOT A THIRD SHAPE. A collapsed group (§1.1c) is a
 * plain `Mesh` too, so a fully-collapsed artifact holds no InstancedMesh at
 * all and the node test alone would misroute it to the portable reader. The
 * TABLES say which it is — `ranges` is present or it is not — and a table
 * shape is the one discriminator that survives a file being partly collapsed,
 * which is what the writer actually emits: collapsing a genuinely instanced
 * node would de-instance and duplicate its geometry, so those nodes keep
 * `EXT_mesh_gpu_instancing` and only the single-placement ones merge.
 *
 * @param {object} gltfModel GLTFLoader scene
 * @param {Array<object>} tables parsed BLDRS_instance_tables nodes
 * @return {string} `'instanced'` or `'portable'`
 */
function detectArtifactShape(gltfModel, tables) {
  let instanced = false
  let portable = false
  gltfModel.traverse?.((obj) => {
    if (!Number.isInteger(obj.userData?.bldrsTableNode)) {
      return
    }
    if (obj.isInstancedMesh) {
      instanced = true
    } else if (obj.isMesh && Number.isInteger(obj.userData?.bldrsInstance)) {
      portable = true
    }
  })
  // The row stamp decides first: only the portable rewrite writes it, and a
  // portable export of a COLLAPSED artifact still carries tables with
  // `ranges` (the rewrite splits the geometry, not the tables), so the
  // table test below would otherwise send it to the instanced join — which
  // would then meet one stamped node per row and refuse the file.
  if (portable) {
    return SHAPE_PORTABLE
  }
  return instanced || tables.some(isCollapsedTable) ? SHAPE_INSTANCED : SHAPE_PORTABLE
}


/**
 * Collect a portable file's plain Meshes into one placement source per table,
 * validating the join the same way `joinNodesToTables` does — every row
 * covered exactly once, counts agreeing.
 *
 * A portable node carries `extras.bldrsInstance` beside the table index: the
 * row of `BLDRS_instance_tables` this placement came from. It is what keeps
 * `parents` / `occurrenceIds` / `occurrencePaths` aligned once the instancing
 * accessors — which carried the order implicitly — are gone. Traversal order
 * is NOT that order: the rewrite emits nodes in spatial-tree order, and an
 * element the tree does not name lands under `Unassigned` at the end.
 *
 * A node may also carry `extras.bldrsRowCount`: it then covers rows
 * `bldrsInstance` .. `bldrsInstance + bldrsRowCount - 1` of a COLLAPSED table,
 * the rows of one element the rewrite put in one mesh (#1900). Every row must
 * still be covered exactly once, by a single piece or a run, or the file is
 * refused; a count on an instanced table's node is refused outright, since
 * one node cannot carry several placements' matrices.
 *
 * The matrix is the node's WORLD matrix expressed in the model root's frame,
 * because portable nodes are nested (element under storey under project) and
 * a single-placement element carries its TRS on the element node itself
 * (`glbPortable.js#buildPortableNodes`). The instanced path's per-instance
 * matrices are mesh-local with the node's own transform ignored
 * (`glbBatchedExport.js`, "written in mesh-local space via getMatrixAt"), and
 * since that writer parents every node straight to the scene, root-relative
 * world is the same quantity on both paths. Reading the LOCAL matrix here
 * would happen to work against today's rewrite — it never puts a transform on
 * a node with children — and would silently misplace geometry the moment a
 * file passes through any tool that re-parents or hoists a transform.
 *
 * @param {object} gltfModel GLTFLoader scene
 * @param {Array<object>} tables parsed BLDRS_instance_tables nodes
 * @return {Array<object>|null} `sources[i]` pairs with `tables[i]`, each
 *   exposing the `geometry` + `getMatrixAt` surface `buildPartition` reads
 */
function joinPortableNodesToTables(gltfModel, tables) {
  // Once for the whole scene, before any matrixWorld is read. GLTFLoader has
  // already done this on a real load — three 0.184.0 calls
  // `scene.updateMatrixWorld()` for every parsed scene unconditionally, in the
  // `afterRoot` continuation just before `onLoad`
  // (examples/jsm/loaders/GLTFLoader.js:2689-2693) — so this is a cheap
  // force-refresh covering a caller that has moved a node since the parse. The
  // hand-built unit fixtures, which never went through GLTFLoader at all,
  // depend on it outright. Scene-wide rather than per table, because a
  // per-table refresh would re-walk the same graph once per table.
  gltfModel.updateMatrixWorld?.(true)
  const toModelSpace = new Matrix4()
  if (gltfModel.matrixWorld) {
    toModelSpace.copy(gltfModel.matrixWorld).invert()
  }

  // `slots[t][row]` is the PIECE covering that row: `{mesh, firstRow,
  // rowCount}`. One row per piece except where the rewrite grouped an
  // element's collapsed rows into one mesh (`bldrsRowCount`, #1900); then
  // every row of the run points at the same piece.
  const slots = tables.map((table) => new Array(table.count).fill(null))
  let bad = false
  gltfModel.traverse?.((obj) => {
    // `InstancedMesh` and `BatchedMesh` both set `isMesh`, and neither has a
    // node transform standing for one placement — only a stamped plain Mesh
    // does. A scene mixing the two is not something either writer emits;
    // ignoring the instanced half here leaves rows uncovered, so the totality
    // check below refuses the file rather than half-building it.
    if (!obj.isMesh || obj.isInstancedMesh || obj.isBatchedMesh) {
      return
    }
    const index = obj.userData?.bldrsTableNode
    if (index === undefined) {
      // Not one of ours. The rewrite stamps every mesh-bearing node it emits,
      // so this is a file something else has added geometry to — ignore it
      // rather than fail, exactly as the instanced join ignores a plain node.
      return
    }
    if (!Number.isInteger(index) || index < 0 || index >= tables.length) {
      bad = true
      return
    }
    const row = obj.userData?.bldrsInstance
    const rowCount = obj.userData?.bldrsRowCount ?? 1
    // A grouped piece only exists for a collapsed table: an instanced table's
    // rows share one geometry and differ by matrix, which one node cannot
    // carry for several rows.
    if (!Number.isInteger(row) || row < 0 || !Number.isInteger(rowCount) || rowCount < 1 ||
        (rowCount > 1 && !isCollapsedTable(tables[index])) ||
        row + rowCount > slots[index].length) {
      bad = true
      return
    }
    const piece = {mesh: obj, firstRow: row, rowCount}
    for (let r = row; r < row + rowCount; r++) {
      if (slots[index][r] !== null) {
        bad = true
        return
      }
      slots[index][r] = piece
    }
  })
  if (bad || slots.some((rows) => rows.some((piece) => piece === null))) {
    return null
  }

  // `buildPartition` puts each table's geometry into the batch ONCE and
  // replays it per instance, so one table means one geometry. That holds for
  // anything the rewrite produced — every placement of a table node points at
  // the same glTF mesh, and GLTFLoader shares the BufferGeometry across the
  // node copies it makes for it — but it is the assumption that would render
  // the wrong shape rather than fail, so it is checked.
  const sources = []
  for (const [t, pieces] of slots.entries()) {
    if (isCollapsedTable(tables[t])) {
      const source = remergeCollapsedRows(pieces, tables[t], toModelSpace)
      if (!source) {
        return null
      }
      sources.push(source)
      continue
    }
    const rows = pieces.map(({mesh}) => mesh)
    // `?.` because a `count: 0` table has no row 0: `BldrsInstanceTablesReader`
    // admits that count (it rejects only a negative or non-integer one) and the
    // null-slot check above passes vacuously on the empty slot list, so this is
    // the first place an empty table is seen. `Loader.js#load` calls the
    // hydration with no try/catch around it, so a throw here would fail the
    // whole model open where the contract (module doc) is to return null and
    // keep the GLTFLoader model.
    const geometry = rows[0]?.geometry
    if (!geometry || rows.some((mesh) => mesh.geometry !== geometry)) {
      return null
    }
    sources.push(makePlacementSource(geometry, rows, toModelSpace))
  }
  return sources
}


/**
 * Rebuild a collapsed table's merged primitive from a portable file, where
 * the rewrite split it into one mesh per ELEMENT (`glbPortable.js#
 * splitCollapsedNodes`): a piece holding one row, or — for an element of
 * several rows (#1900) — a run of them, back to back.
 *
 * Re-merged rather than added row by row, for the rule §1.1d states: a
 * collapsed element's placement is baked into its vertices, so two rows of
 * one solid share an `instanceGeometryIds` entry while holding different
 * triangles. Only the range path marks those geometry ids as ranges
 * (`batchedGeometryRanges.js#BATCHED_GEOMETRY_RANGE_IDS`), which is what
 * keeps `batchedInstanceGeometry`'s per-pass cache from handing one row's
 * triangles to the other. Adding each row as its own geometry would skip that
 * mark and reintroduce the bug #1870's review caught. The same holds inside a
 * grouped piece: its rows go back to their own ranges, never one geometry for
 * the element, so a pick still names the row it hit.
 *
 * Re-merging also lets the SAME canary witness the portable file: the split
 * keeps every row's vertex bytes and makes each piece's indices relative to
 * its first vertex, so placing each piece at its first row's starts restores
 * the merged primitive the writer hashed. Where one piece's rows divide is
 * not stored in the piece at all — the table's own ranges say it, and the
 * canary refuses a piece whose rows do not divide there.
 *
 * @param {Array<object>} slots per table row, the piece covering it:
 *   `{mesh, firstRow, rowCount}`
 * @param {object} table parsed collapsed table
 * @param {Matrix4} toModelSpace inverse of the model root's world matrix
 * @return {?object} placement source carrying `ranges`, or null
 */
function remergeCollapsedRows(slots, table, toModelSpace) {
  // Per ROW, not one matrix for the table as the instanced-file join uses:
  // each piece is its own node here, and a tool is free to have moved one.
  const matrixOfRow = (i, target) => target.multiplyMatrices(toModelSpace, slots[i].mesh.matrixWorld)
  const pieces = slots.filter((piece, row) => piece.firstRow === row)
  if (table.lossyGeometry) {
    const rowAt = portableLossyRows(pieces, table)
    const rebuilt = rowAt && rebuildLossyCollapsed(table, rowAt)
    return rebuilt && {...rebuilt, getMatrixAt: matrixOfRow}
  }
  const {ranges} = table
  const last = ranges[ranges.length - 1]
  if (!last) {
    return null
  }
  const vertexTotal = last.vertexStart + last.vertexCount
  const positions = new Float32Array(vertexTotal * 3)
  // In the pieces' OWN storage, not always float: a Meshopt export stores
  // normals as normalized Int8 (its FILTER mode), GLTFLoader hands them back
  // that way, and so does every instanced table's geometry beside this one.
  // `BatchedMesh` takes one format per attribute for the whole batch and
  // throws on the first geometry that differs — which, with a float re-merge,
  // was every hybrid model's portable Meshopt export, refused at load. Written
  // through `setXYZ`, which re-normalizes what `getX` de-normalized: exact for
  // the integer formats glTF allows.
  const firstNormal = pieces[0]?.mesh.geometry?.getAttribute?.('normal')
  const NormalArray = firstNormal ? firstNormal.array.constructor : Float32Array
  const isNormalized = Boolean(firstNormal?.normalized)
  const normals = new BufferAttribute(new NormalArray(vertexTotal * 3), 3, isNormalized)
  const indices = new Uint32Array(last.indexStart + last.indexCount)
  let hasNormals = true
  for (const {mesh, firstRow, rowCount} of pieces) {
    const geometry = mesh.geometry
    const position = geometry?.getAttribute?.('position')
    const normal = geometry?.getAttribute?.('normal')
    const index = geometry?.getIndex?.()
    const {vertexStart, vertexCount, indexStart, indexCount} = spanOfRows(ranges, firstRow, rowCount)
    if (!position || !index || position.count !== vertexCount || index.count !== indexCount ||
        (normal && (normal.array.constructor !== NormalArray || normal.normalized !== isNormalized))) {
      return null
    }
    hasNormals = hasNormals && Boolean(normal)
    for (let v = 0; v < vertexCount; v++) {
      const at = (vertexStart + v) * 3
      positions[at] = position.getX(v)
      positions[at + 1] = position.getY(v)
      positions[at + 2] = position.getZ(v)
      if (normal) {
        normals.setXYZ(vertexStart + v, normal.getX(v), normal.getY(v), normal.getZ(v))
      }
    }
    for (let i = 0; i < indexCount; i++) {
      const local = index.getX(i)
      if (local >= vertexCount) {
        return null
      }
      indices[indexStart + i] = vertexStart + local
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  if (hasNormals) {
    geometry.setAttribute('normal', normals)
  }
  geometry.setIndex(new BufferAttribute(indices, 1))
  if (!isCollapsedGeometryWitnessed(geometry, table)) {
    return null
  }
  return {geometry, ranges, getMatrixAt: matrixOfRow}
}


/**
 * Where a run of consecutive rows sits in the merged primitive: from the
 * first row's starts to the end of the last row. Contiguous by construction,
 * since the ranges are prefix sums of the stored counts.
 *
 * @param {Array<object>} ranges the table's
 * @param {number} firstRow
 * @param {number} rowCount
 * @return {{vertexStart: number, vertexCount: number, indexStart: number,
 *   indexCount: number}}
 */
function spanOfRows(ranges, firstRow, rowCount) {
  const first = ranges[firstRow]
  const last = ranges[firstRow + rowCount - 1]
  return {
    vertexStart: first.vertexStart,
    vertexCount: last.vertexStart + last.vertexCount - first.vertexStart,
    indexStart: first.indexStart,
    indexCount: last.indexStart + last.indexCount - first.indexStart,
  }
}


/**
 * Each row's triangles in a lossy (Draco) portable file, for
 * `rebuildLossyCollapsed`: found in its piece by the piece's own layout.
 *
 * - **One row** — every triangle of the piece is the row's, at the DECODED
 *   count, not the table's: the export strips each row's zero-area triangles
 *   before EDGEBREAKER would (`collapsedWitness.js#planCollapsedDraco`) and
 *   hashes what it kept, so the witness's identity hash is what holds a row
 *   to its count. Every triangle of the primitive is in it, so nothing rides
 *   along unhashed.
 * - **Several rows, row-tagged** — what the export writes for a grouped
 *   element (#1900): EDGEBREAKER reordered the triangles across its rows, and
 *   each vertex's `_BLDRS_ROW` says whose it is, exactly as in the merged
 *   artifact's primitive (`groupTrianglesByRowTag`). The tag names TABLE
 *   rows, so a tag outside this piece's run refuses it.
 * - **Several rows, untagged** — the SEQUENTIAL fallback, whose triangles are
 *   in row order and complete: row r is the next run of the table's own index
 *   count, and the runs must tile the piece exactly.
 *
 * The tag is dropped from the decoded geometry once read, as
 * `regroupByRowTag` does.
 *
 * @param {Array<object>} pieces `{mesh, firstRow, rowCount}`, in row order,
 *   covering the table
 * @param {object} table parsed collapsed table
 * @return {?function(number): object} row → `{geometry, count, pointAt}`,
 *   or null when a piece cannot be read that way
 */
function portableLossyRows(pieces, table) {
  const rows = new Array(table.ranges.length)
  let regrouped = 0
  for (const {mesh, firstRow, rowCount} of pieces) {
    const geometry = mesh.geometry
    const index = geometry?.getIndex?.()
    if (!index || !Number.isInteger(index.count) || index.count === 0 || index.count % 3 !== 0) {
      return null
    }
    const tag = geometry.getAttribute?.(ROW_TAG_ATTRIBUTE)
    if (tag) {
      geometry.deleteAttribute(ROW_TAG_ATTRIBUTE)
      const grouped = groupTrianglesByRowTag(tag, index, firstRow, rowCount)
      if (!grouped) {
        return null
      }
      regrouped++
      for (let k = 0; k < rowCount; k++) {
        rows[firstRow + k] = {
          geometry,
          count: grouped.counts[k],
          pointAt: (i) => grouped.grouped[grouped.starts[k] + i],
        }
      }
    } else if (rowCount === 1) {
      rows[firstRow] = {geometry, count: index.count, pointAt: (i) => index.getX(i)}
    } else {
      let start = 0
      for (let k = 0; k < rowCount; k++) {
        const at = start
        const count = table.ranges[firstRow + k].indexCount
        rows[firstRow + k] = {geometry, count, pointAt: (i) => index.getX(at + i)}
        start += count
      }
      if (start !== index.count) {
        glbInfo('reader: a grouped portable piece\'s triangle runs do not tile it; refusing')
        return null
      }
    }
  }
  if (regrouped > 0) {
    glbVerbose(`reader: regrouped ${regrouped} row-tagged portable piece(s)`)
  }
  return (r) => rows[r]
}


/**
 * Adapt a table's plain Mesh rows to the `{geometry, getMatrixAt}` surface
 * `buildPartition` reads off an InstancedMesh, so the batch assembly below is
 * one implementation rather than two.
 *
 * Composed into the caller's target on demand rather than materialised up
 * front: `buildPartition` reads each row exactly once, into a single scratch
 * matrix it immediately copies out of (`BatchedMesh.setMatrixAt` writes the
 * elements through to the matrices texture), so nothing is retained and an
 * eager array would be pure transient garbage — ~20MB of it on the 100k-
 * placement files portable produces. Reading lazily also moves the read from
 * join time to batch-assembly time, which is the same value: the scene-wide
 * `updateMatrixWorld` above is the last thing to touch these transforms.
 *
 * @param {object} geometry the BufferGeometry all the rows share
 * @param {Array<object>} rows placement meshes, indexed by table row
 * @param {Matrix4} toModelSpace inverse of the model root's world matrix
 * @return {object} placement source
 */
function makePlacementSource(geometry, rows, toModelSpace) {
  return {
    geometry,
    getMatrixAt: (i, target) =>
      target.multiplyMatrices(toModelSpace, rows[i].matrixWorld),
  }
}


/**
 * Build one transparency partition's BatchHandle from its (mesh, table)
 * pairs, mirroring `flatMeshToBatchedModel`'s construction exactly —
 * material, sort policy, table shapes.
 *
 * @param {Array<{node: object, table: object}>} pairs
 * @param {boolean} transparent
 * @return {object|null} BatchHandle
 */
function buildPartition(pairs, transparent) {
  const uniqueGeometries = new Set(pairs.map(({node}) => node.geometry))
  // A collapsed group's merged primitive is uploaded once and then sliced, so
  // it cannot also back another table: the second table would upload it again
  // and overrun the capacity computed from `uniqueGeometries` below. No writer
  // emits that, and sharing would have to be deliberate — but the symptom is a
  // throw from deep inside `addGeometry`, so name it here instead.
  const shares = (geometry) =>
    pairs.filter((pair) => pair.node.geometry === geometry).length > 1
  if (pairs.some(({node}) => node.ranges && shares(node.geometry))) {
    return null
  }
  let vertexCount = 0
  let indexCount = 0
  let instanceCount = 0
  for (const geometry of uniqueGeometries) {
    const pos = geometry?.getAttribute?.('position')
    if (!pos || !geometry.index) {
      return null
    }
    vertexCount += pos.count
    indexCount += geometry.index.count
  }
  for (const {table} of pairs) {
    instanceCount += table.count
  }
  if (instanceCount === 0) {
    return null
  }

  const material = makeSurfaceMaterial({side: DoubleSide})
  if (transparent) {
    material.transparent = true
    // Don't occlude geometry behind the glass; per-instance alpha blends.
    material.depthWrite = false
  }
  const mesh = new BatchedMesh(instanceCount, vertexCount, indexCount, material)
  // Same coplanar-surface rationale as flatMeshToBatchedModel: opaque keeps
  // insertion order, transparent sorts for blend correctness.
  mesh.sortObjects = transparent

  const tables = allocateInstanceTables(instanceCount)
  let hasOccurrencePaths = false
  let hasGeometryIds = false

  const geometryIdsByGeometry = new Map()
  const matrix = new Matrix4()
  const rgba = new Vector4()
  for (const {node, table} of pairs) {
    // A collapsed table uploads its merged primitive once and registers one
    // geometry id per element range over it; an ordinary table uploads one
    // geometry and replays it per instance. From `addInstance` down the two
    // are the same code, which is what keeps picking, color, visibility and
    // isolation identical across the shapes rather than parity-tested.
    let geometryIds = null
    let geometryId
    if (node.ranges) {
      geometryIds = addGeometryRanges(mesh, node.geometry, node.ranges)
      if (!geometryIds) {
        return null
      }
    } else {
      geometryId = geometryIdsByGeometry.get(node.geometry)
      if (geometryId === undefined) {
        geometryId = mesh.addGeometry(node.geometry)
        geometryIdsByGeometry.set(node.geometry, geometryId)
      }
    }
    const {color} = table
    for (let i = 0; i < table.count; i++) {
      const batchId = mesh.addInstance(geometryIds ? geometryIds[i] : geometryId)
      node.getMatrixAt(i, matrix)
      mesh.setMatrixAt(batchId, matrix)
      mesh.setColorAt(batchId, rgba.set(color.x, color.y, color.z, color.w))
      if (table.geometryIds) {
        hasGeometryIds = true
      }
      const path = table.occurrencePaths ? table.occurrencePaths[i] : null
      if (Array.isArray(path)) {
        hasOccurrencePaths = true
      }
      writeRow(tables, batchId, {
        parent: table.parents[i],
        occurrenceId: table.occurrenceIds[i],
        geometryId: table.geometryIds ? table.geometryIds[i] : 0,
        occurrencePath: Array.isArray(path) ? path : null,
        // Fresh objects per instance: these become the live `instanceColors`
        // AND (via decorateBatchMeshes' snapshot) the source table — sharing
        // one object per node would let a later per-instance write alias.
        color: {x: color.x, y: color.y, z: color.z, w: color.w},
      })
    }
  }

  return {
    mesh, material, transparent,
    ...tables,
    // Null (not zero-filled) when the artifact carried none, so the palette
    // keys fall back to parents exactly as on a table-less live build.
    instanceGeometryIds: hasGeometryIds ? tables.instanceGeometryIds : null,
    instanceOccurrencePaths: hasOccurrencePaths ? tables.instanceOccurrencePaths : null,
  }
}


/**
 * Rebuild a decorated batched model from a GLTFLoader-parsed batched-native
 * artifact. Null on any integrity failure (caller keeps the GLTFLoader
 * model — see module doc).
 *
 * @param {object} gltfModel GLTFLoader scene carrying
 *   `userData.bldrsInstanceTables` + InstancedMesh nodes
 * @param {object} [opts]
 * @param {object} [opts.scene] subset fallbackParent, as in
 *   `assembleBatchedModel`
 * @return {object|null} BatchedMesh or Group, decorated
 */
export function hydrateBatchedModelFromInstancedGlb(gltfModel, opts = {}) {
  const tables = gltfModel?.userData?.bldrsInstanceTables
  if (!Array.isArray(tables) || tables.length === 0) {
    return null
  }
  const shape = detectArtifactShape(gltfModel, tables)
  const sources = shape === SHAPE_INSTANCED ?
    joinNodesToTables(gltfModel, tables) :
    joinPortableNodesToTables(gltfModel, tables)
  if (!sources) {
    glbInfo(`reader: ${shape} tables/nodes join failed; keeping GLTF model as-is`)
    return null
  }

  const pairs = tables.map((table, i) => ({node: sources[i], table}))
  const opaquePairs = pairs.filter(({table}) => table.color.w >= 1)
  const transparentPairs = pairs.filter(({table}) => table.color.w < 1)
  const batches = []
  for (const [partition, transparent] of [[opaquePairs, false], [transparentPairs, true]]) {
    if (partition.length === 0) {
      continue
    }
    const handle = buildPartition(partition, transparent)
    if (!handle) {
      glbInfo(`reader: ${shape} partition rebuild failed; keeping GLTF model as-is`)
      return null
    }
    batches.push(handle)
  }
  if (batches.length === 0) {
    return null
  }

  // The shared decoration core — snapshot, palette re-derivation, pick
  // tables, BVH. This is the parity-by-construction step (module doc).
  decorateBatchMeshes(batches)

  const model = batches.length === 1 ? batches[0].mesh : new Group()
  if (model.isGroup) {
    for (const batch of batches) {
      model.add(batch.mesh)
    }
  }
  model.modelID = gltfModel.modelID ?? 0
  // Carry the GLTF scene's userData across the swap — the title
  // (bldrsTitle), spatial tree, and element-properties hooks the other
  // BLDRS_* plugins stashed there are what NavTree/Properties hydrate from.
  model.userData = {...gltfModel.userData, ...model.userData}

  // Provisional capabilities for the window before Loader.js decorates the
  // model — same contract (and same caveat) as assembleBatchedModel:
  // inferModelCapabilities is the authority and re-establishes this set.
  model.capabilities = model.capabilities ?? {}
  model.capabilities.expressIdPicking = true
  model.capabilities.batchedPicking = true
  model.capabilities.ifcSubsets = false

  attachBatchedSubsets(model, opts.scene ?? null, {})

  const total = tables.reduce((n, t) => n + t.count, 0)
  // The collapsed count is the one reader-side signal that the range path
  // ran (#1871) — `batchedGlbCache.spec.ts` waits on it.
  const collapsed = tables.filter(isCollapsedTable).length
  glbVerbose(
    `reader: hydrated ${shape} artifact — ${batches.length} batch(es), ` +
    `${total} instance(s), ${collapsed} collapsed table(s)`)
  return model
}
