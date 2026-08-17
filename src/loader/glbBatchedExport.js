import {Color, Matrix4, Quaternion, Vector3} from 'three'
import {eachBatch} from '../viewer/ifc/batchedModel'
import {glbVerbose} from './glbLog'


/**
 * glbBatchedExport — serialize a decorated batched model to a
 * batched-NATIVE GLB via `EXT_mesh_gpu_instancing` (view-140 S9 /
 * viewer-replacement §3b.v, behind `?feature=glbBatched`).
 *
 * The merged bake (`batchedToMergedMesh`) de-instances every placement into
 * one giant vertex slab — that's where the instancing win dies and the
 * display-palette gets baked over the source colors. This writer keeps the
 * batch structure: each unique geometry is written ONCE, instances become
 * per-node TRS accessors, and per-instance identity + verbatim source
 * colors ride in `BLDRS_instance_tables` (see that module for why colors
 * must not round-trip through glTF materials).
 *
 * Node grouping is per (unique geometry × source color): a generic viewer
 * without our tables still shows an authored-color model colored (material
 * per bin), while instances of one part stay one draw batch. Instance
 * matrices are written in mesh-local space via `getMatrixAt`, matching the
 * merged bake's convention (the mesh's own transform is ignored on both
 * paths).
 *
 * Fail-soft contract: returns null whenever the model can't round-trip
 * faithfully — a matrix that TRS decomposition can't represent (shear), a
 * geometry missing position/normal/index, an interleaved attribute — and
 * the caller falls back to the merged writer. A wrong artifact is worse
 * than a bigger one.
 */


/** Absolute tolerance for the decompose→recompose fidelity check. */
const TRS_EPSILON = 1e-4

const FLOATS_PER_VEC3 = 3
const FLOATS_PER_QUAT = 4


/**
 * Decompose one instance matrix to TRS, verifying the decomposition
 * actually reproduces the matrix (Matrix4.decompose silently drops shear).
 *
 * @param {Matrix4} matrix
 * @return {{position: Vector3, quaternion: Quaternion, scale: Vector3}|null}
 */
function decomposeStrict(matrix) {
  const position = new Vector3()
  const quaternion = new Quaternion()
  const scale = new Vector3()
  matrix.decompose(position, quaternion, scale)
  const recomposed = new Matrix4().compose(position, quaternion, scale)
  const a = matrix.elements
  const b = recomposed.elements
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > TRS_EPSILON) {
      return null
    }
  }
  return {position, quaternion, scale}
}


/**
 * Group every instance of the model by (geometry reference × exact source
 * color), preserving batch iteration order within each group.
 *
 * @param {object} model BatchedMesh or Group of decorated batches
 * @return {Array<object>|null} groups
 *   `{geometry, color, entries: [{matrix, parent, occurrenceId, geometryId,
 *   occurrencePath}]}`, or null when any instance can't be represented
 */
function collectInstanceGroups(model) {
  const groups = new Map()
  let failed = false
  eachBatch(model, (mesh) => {
    if (failed || !mesh.instanceParents || !mesh.instanceGeometry ||
        typeof mesh.getMatrixAt !== 'function') {
      return
    }
    // Source colors are the bake target (§1.2b): the pre-palette snapshot
    // when present, the live table otherwise (a model that never had a
    // palette applied — colors identical by construction).
    const colors = mesh.instanceSourceColors ?? mesh.instanceColors
    if (!colors) {
      failed = true
      return
    }
    const scratch = new Matrix4()
    for (let batchId = 0; batchId < mesh.instanceParents.length; batchId++) {
      const geometry = mesh.instanceGeometry[batchId]
      const color = colors[batchId]
      if (!geometry || !color) {
        failed = true
        return
      }
      mesh.getMatrixAt(batchId, scratch)
      const trs = decomposeStrict(scratch)
      if (!trs) {
        glbVerbose('batched writer: non-TRS instance matrix; falling back to merged')
        failed = true
        return
      }
      const key = `${geometry.uuid}|${color.x},${color.y},${color.z},${color.w}`
      let group = groups.get(key)
      if (!group) {
        group = {geometry, color, entries: []}
        groups.set(key, group)
      }
      group.entries.push({
        trs,
        parent: mesh.instanceParents[batchId],
        occurrenceId: mesh.instanceOccurrenceIds ? mesh.instanceOccurrenceIds[batchId] : batchId,
        geometryId: mesh.instanceGeometryIds ? mesh.instanceGeometryIds[batchId] : null,
        occurrencePath: mesh.instanceOccurrencePaths ? mesh.instanceOccurrencePaths[batchId] : null,
      })
    }
  })
  if (failed || groups.size === 0) {
    return null
  }
  return [...groups.values()]
}


/**
 * A geometry is writable when it has non-interleaved float positions +
 * normals and an index — the shape Conway's assembler emits.
 *
 * @param {object} geometry BufferGeometry
 * @return {boolean}
 */
function isWritableGeometry(geometry) {
  const pos = geometry.getAttribute?.('position')
  const norm = geometry.getAttribute?.('normal')
  const index = geometry.index
  return Boolean(
    pos && norm && index &&
    !pos.isInterleavedBufferAttribute && !norm.isInterleavedBufferAttribute &&
    pos.array instanceof Float32Array && norm.array instanceof Float32Array)
}


/**
 * Serialize the batched model to instanced-GLB bytes plus the per-node
 * instance tables (in the same node order as the document's scene).
 *
 * gltf-transform is imported dynamically, matching `glbCompress` — the
 * library is only paid for on the writer path.
 *
 * @param {object} model BatchedMesh or Group of decorated batches
 * @return {Promise<{bytes: Uint8Array, tableNodes: Array<object>}|null>}
 *   null when the model can't round-trip faithfully (caller falls back to
 *   the merged writer)
 */
export async function exportBatchedModelAsInstancedGlb(model) {
  const groups = collectInstanceGroups(model)
  if (!groups) {
    return null
  }
  for (const group of groups) {
    if (!isWritableGeometry(group.geometry)) {
      glbVerbose('batched writer: unwritable geometry (interleaved/missing attrs); falling back')
      return null
    }
  }

  const {Document} = await import('@gltf-transform/core')
  const {EXTMeshGPUInstancing} = await import('@gltf-transform/extensions')

  const doc = new Document()
  const buffer = doc.createBuffer()
  const scene = doc.createScene()
  doc.getRoot().setDefaultScene(scene)
  // Required, not optional: without the extension a viewer would render one
  // instance at the node origin — a wrong picture, worse than refusing.
  const instancingExt = doc.createExtension(EXTMeshGPUInstancing).setRequired(true)

  // Accessors per UNIQUE geometry, shared across color-bin nodes — the
  // dedup that makes this artifact smaller than the merged bake.
  const geometryAccessors = new Map()
  const accessorsFor = (geometry) => {
    let acc = geometryAccessors.get(geometry)
    if (!acc) {
      acc = {
        position: doc.createAccessor().setType('VEC3')
          .setArray(geometry.getAttribute('position').array).setBuffer(buffer),
        normal: doc.createAccessor().setType('VEC3')
          .setArray(geometry.getAttribute('normal').array).setBuffer(buffer),
        indices: doc.createAccessor().setType('SCALAR')
          .setArray(geometry.index.array).setBuffer(buffer),
      }
      geometryAccessors.set(geometry, acc)
    }
    return acc
  }

  const tableNodes = []
  const scratchColor = new Color()
  for (const group of groups) {
    const {geometry, color, entries} = group
    const acc = accessorsFor(geometry)

    // Material for generic viewers only — OUR reader takes colors from the
    // tables. baseColorFactor is linear-space per spec, so convert like
    // three's exporter would; the verbatim value goes in the table.
    scratchColor.setRGB(color.x, color.y, color.z).convertSRGBToLinear()
    const material = doc.createMaterial()
      .setBaseColorFactor([scratchColor.r, scratchColor.g, scratchColor.b, color.w])
      .setMetallicFactor(0)
      .setRoughnessFactor(1)
      .setDoubleSided(true)
    if (color.w < 1) {
      material.setAlphaMode('BLEND')
    }

    const prim = doc.createPrimitive()
      .setAttribute('POSITION', acc.position)
      .setAttribute('NORMAL', acc.normal)
      .setIndices(acc.indices)
      .setMaterial(material)
    const mesh = doc.createMesh().addPrimitive(prim)

    const n = entries.length
    const translation = new Float32Array(n * FLOATS_PER_VEC3)
    const rotation = new Float32Array(n * FLOATS_PER_QUAT)
    const scale = new Float32Array(n * FLOATS_PER_VEC3)
    entries.forEach(({trs}, i) => {
      trs.position.toArray(translation, i * FLOATS_PER_VEC3)
      trs.quaternion.toArray(rotation, i * FLOATS_PER_QUAT)
      trs.scale.toArray(scale, i * FLOATS_PER_VEC3)
    })
    const batch = instancingExt.createInstancedMesh()
      .setAttribute('TRANSLATION',
        doc.createAccessor().setType('VEC3').setArray(translation).setBuffer(buffer))
      .setAttribute('ROTATION',
        doc.createAccessor().setType('VEC4').setArray(rotation).setBuffer(buffer))
      .setAttribute('SCALE',
        doc.createAccessor().setType('VEC3').setArray(scale).setBuffer(buffer))

    const node = doc.createNode().setMesh(mesh)
    node.setExtension('EXT_mesh_gpu_instancing', batch)
    // Table-join identity: GLTFLoader promotes node extras to
    // `object.userData`, so the reader matches each InstancedMesh to its
    // table slice by this index instead of trusting traversal order — the
    // same lesson face_ids' `firstExpressId` canary encodes.
    node.setExtras({bldrsTableNode: tableNodes.length})
    scene.addChild(node)

    const anyGeometryId = entries.some((e) => e.geometryId !== null && e.geometryId !== undefined)
    const anyPath = entries.some((e) => Array.isArray(e.occurrencePath))
    tableNodes.push({
      count: n,
      color: {x: color.x, y: color.y, z: color.z, w: color.w},
      parents: entries.map((e) => e.parent),
      occurrenceIds: entries.map((e) => e.occurrenceId),
      geometryIds: anyGeometryId ? entries.map((e) => e.geometryId ?? 0) : null,
      occurrencePaths: anyPath ? entries.map((e) => e.occurrencePath ?? null) : null,
    })
  }

  const {WebIO} = await import('@gltf-transform/core')
  const io = new WebIO().registerExtensions([EXTMeshGPUInstancing])
  const bytes = await io.writeBinary(doc)
  const instanceCount = tableNodes.reduce((total, node) => total + node.count, 0)
  glbVerbose(
    `batched writer: ${groups.length} node(s), ${geometryAccessors.size} unique ` +
    `geometry(ies), ${instanceCount} instance(s), ${bytes.byteLength}B`)
  return {bytes, tableNodes}
}
