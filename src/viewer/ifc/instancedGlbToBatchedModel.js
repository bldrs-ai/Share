import {BatchedMesh, DoubleSide, Group, Matrix4, Vector4} from 'three'
import {makeSurfaceMaterial} from '../lookMaterial'
import {attachBatchedSubsets} from './batchedSubset'
import {decorateBatchMeshes} from './buildBatchedConwayModel'
import {glbInfo, glbVerbose} from '../../loader/glbLog'


/**
 * instancedGlbToBatchedModel — cache-hit hydration for the batched-native
 * GLB artifact (view-140 S9 / viewer-replacement §3b.v,
 * the default-on `glbBatched` flag).
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
 */


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
  const instanceGeometry = new Array(instanceCount)
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
      instanceGeometry[batchId] = node.geometry
      // Fresh objects per instance: these become the live `instanceColors`
      // AND (via decorateBatchMeshes' snapshot) the source table — sharing
      // one object per node would let a later per-instance write alias.
      instanceColors[batchId] = {x: color.x, y: color.y, z: color.z, w: color.w}
    }
  }

  return {
    mesh, material, transparent,
    instanceParents, instanceOccurrenceIds, instanceGeometry, instanceColors,
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
  const instanced = joinNodesToTables(gltfModel, tables)
  if (!instanced) {
    glbInfo('reader: batched-native tables/nodes join failed; keeping GLTF model as-is')
    return null
  }

  const pairs = tables.map((table, i) => ({node: instanced[i], table}))
  const opaquePairs = pairs.filter(({table}) => table.color.w >= 1)
  const transparentPairs = pairs.filter(({table}) => table.color.w < 1)
  const batches = []
  for (const [partition, transparent] of [[opaquePairs, false], [transparentPairs, true]]) {
    if (partition.length === 0) {
      continue
    }
    const handle = buildPartition(partition, transparent)
    if (!handle) {
      glbInfo('reader: batched-native partition rebuild failed; keeping GLTF model as-is')
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
    `reader: hydrated batched-native artifact — ${batches.length} batch(es), ` +
    `${total} instance(s)`)
  return model
}
