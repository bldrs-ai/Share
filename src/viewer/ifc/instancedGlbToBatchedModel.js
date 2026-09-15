import {BatchedMesh, DoubleSide, Group, Matrix4, Vector4} from 'three'
import {makeSurfaceMaterial} from '../lookMaterial'
import {attachBatchedSubsets} from './batchedSubset'
import {decorateBatchMeshes} from './buildBatchedConwayModel'
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
 * Collect the model's InstancedMeshes keyed by their writer-stamped table
 * index, validating the join is total and counts agree.
 *
 * @param {object} gltfModel GLTFLoader scene
 * @param {Array<object>} tables parsed BLDRS_instance_tables nodes
 * @return {Array<object>|null} `instanced[i]` pairs with `tables[i]`
 */
function joinNodesToTables(gltfModel, tables) {
  const instanced = new Array(tables.length).fill(null)
  let bad = false
  gltfModel.traverse?.((obj) => {
    if (!obj.isInstancedMesh) {
      return
    }
    const index = obj.userData?.bldrsTableNode
    if (!Number.isInteger(index) || index < 0 || index >= tables.length ||
        instanced[index] !== null) {
      bad = true
      return
    }
    instanced[index] = obj
  })
  if (bad || instanced.some((mesh) => mesh === null)) {
    return null
  }
  for (let i = 0; i < tables.length; i++) {
    if (instanced[i].count !== tables[i].count) {
      return null
    }
  }
  return instanced
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
 * @param {object} gltfModel GLTFLoader scene
 * @return {string} `'instanced'` or `'portable'`
 */
function detectArtifactShape(gltfModel) {
  let instanced = false
  gltfModel.traverse?.((obj) => {
    if (obj.isInstancedMesh && Number.isInteger(obj.userData?.bldrsTableNode)) {
      instanced = true
    }
  })
  return instanced ? SHAPE_INSTANCED : SHAPE_PORTABLE
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
  // Once for the whole scene, before any matrixWorld is read: GLTFLoader
  // leaves the graph un-updated, and a per-table refresh would re-walk it.
  gltfModel.updateMatrixWorld?.(true)
  const toModelSpace = new Matrix4()
  if (gltfModel.matrixWorld) {
    toModelSpace.copy(gltfModel.matrixWorld).invert()
  }

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
    if (!Number.isInteger(row) || row < 0 || row >= slots[index].length ||
        slots[index][row] !== null) {
      bad = true
      return
    }
    slots[index][row] = obj
  })
  if (bad || slots.some((rows) => rows.some((mesh) => mesh === null))) {
    return null
  }

  // `buildPartition` puts each table's geometry into the batch ONCE and
  // replays it per instance, so one table means one geometry. That holds for
  // anything the rewrite produced — every placement of a table node points at
  // the same glTF mesh, and GLTFLoader shares the BufferGeometry across the
  // node copies it makes for it — but it is the assumption that would render
  // the wrong shape rather than fail, so it is checked.
  const sources = []
  for (const rows of slots) {
    const geometry = rows[0].geometry
    if (!geometry || rows.some((mesh) => mesh.geometry !== geometry)) {
      return null
    }
    sources.push(makePlacementSource(geometry, rows, toModelSpace))
  }
  return sources
}


/**
 * Adapt a table's plain Mesh rows to the `{geometry, getMatrixAt}` surface
 * `buildPartition` reads off an InstancedMesh, so the batch assembly below is
 * one implementation rather than two.
 *
 * @param {object} geometry the BufferGeometry all the rows share
 * @param {Array<object>} rows placement meshes, indexed by table row
 * @param {Matrix4} toModelSpace inverse of the model root's world matrix
 * @return {object} placement source
 */
function makePlacementSource(geometry, rows, toModelSpace) {
  const matrices = rows.map(
    (mesh) => new Matrix4().multiplyMatrices(toModelSpace, mesh.matrixWorld))
  return {
    geometry,
    getMatrixAt: (i, target) => target.copy(matrices[i]),
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

  const instanceParents = new Uint32Array(instanceCount)
  const instanceOccurrenceIds = new Uint32Array(instanceCount)
  const instanceGeometryIds = new Uint32Array(instanceCount)
  const instanceOccurrencePaths = new Array(instanceCount)
  const instanceColors = new Array(instanceCount)
  let hasOccurrencePaths = false
  let hasGeometryIds = false

  const geometryIdsByGeometry = new Map()
  const matrix = new Matrix4()
  const rgba = new Vector4()
  for (const {node, table} of pairs) {
    let geometryId = geometryIdsByGeometry.get(node.geometry)
    if (geometryId === undefined) {
      geometryId = mesh.addGeometry(node.geometry)
      geometryIdsByGeometry.set(node.geometry, geometryId)
    }
    const {color} = table
    for (let i = 0; i < table.count; i++) {
      const batchId = mesh.addInstance(geometryId)
      node.getMatrixAt(i, matrix)
      mesh.setMatrixAt(batchId, matrix)
      mesh.setColorAt(batchId, rgba.set(color.x, color.y, color.z, color.w))
      instanceParents[batchId] = table.parents[i]
      instanceOccurrenceIds[batchId] = table.occurrenceIds[i]
      if (table.geometryIds) {
        hasGeometryIds = true
        instanceGeometryIds[batchId] = table.geometryIds[i]
      }
      const path = table.occurrencePaths ? table.occurrencePaths[i] : null
      instanceOccurrencePaths[batchId] = Array.isArray(path) ? path : null
      if (Array.isArray(path)) {
        hasOccurrencePaths = true
      }
      // Fresh objects per instance: these become the live `instanceColors`
      // AND (via decorateBatchMeshes' snapshot) the source table — sharing
      // one object per node would let a later per-instance write alias.
      instanceColors[batchId] = {x: color.x, y: color.y, z: color.z, w: color.w}
    }
  }

  return {
    mesh, material, transparent,
    instanceParents, instanceOccurrenceIds, instanceColors,
    // Null (not zero-filled) when the artifact carried none, so the palette
    // keys fall back to parents exactly as on a table-less live build.
    instanceGeometryIds: hasGeometryIds ? instanceGeometryIds : null,
    instanceOccurrencePaths: hasOccurrencePaths ? instanceOccurrencePaths : null,
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
  const shape = detectArtifactShape(gltfModel)
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
  glbVerbose(
    `reader: hydrated ${shape} artifact — ${batches.length} batch(es), ` +
    `${total} instance(s)`)
  return model
}
