/* eslint-disable no-magic-numbers */
import {BatchedMesh, BufferAttribute, BufferGeometry, Matrix4} from 'three'
import {exportBatchedModelAsInstancedGlb} from './glbBatchedExport'
import {parseGlb} from './injectGlbExtensions'


/**
 * A real indexed BufferGeometry (one triangle) for the writer to serialize.
 *
 * `size` is the discriminator these tests need in two directions at once:
 * two calls with DIFFERENT sizes are genuinely different shapes, and two
 * calls with the SAME size are byte-identical content in two distinct
 * objects — which is precisely what the writer must now treat as one shape
 * (Share#1859).
 *
 * @param {number} [size] leg length of the triangle
 * @return {BufferGeometry}
 */
function triangleGeometry(size = 1) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(
    new Float32Array([0, 0, 0, size, 0, 0, 0, size, 0]), 3))
  geometry.setAttribute('normal', new BufferAttribute(
    new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3))
  geometry.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2]), 1))
  return geometry
}


/** Vertices and indices one `triangleGeometry` contributes to a batch. */
const TRIANGLE_VERTICES = 3
const TRIANGLE_INDICES = 3


/**
 * A decorated batch built from an explicit per-instance plan, so a test can
 * say exactly which shape object each instance uses and in which order.
 *
 * Distinct geometry OBJECTS get distinct `instanceGeometryIds`, because the
 * writer's geometry reader memoises on that id
 * (`batchedInstanceGeometry.js#sourceKey`) and would otherwise hand back one
 * object for both — collapsing the very duplication these tests exist to
 * exercise, before the content interner ever sees it.
 *
 * @param {Array<object>} plan per instance: `{geometry, x, parent,
 *   occurrenceId, path, color}`
 * @return {BatchedMesh}
 */
function batchFromPlan(plan) {
  const shapes = [...new Set(plan.map((entry) => entry.geometry))]
  const mesh = new BatchedMesh(
    plan.length,
    shapes.length * TRIANGLE_VERTICES,
    shapes.length * TRIANGLE_INDICES)
  const batchGeometryIds = new Map()
  const sourceGeometryIds = new Map()
  for (const [i, shape] of shapes.entries()) {
    batchGeometryIds.set(shape, mesh.addGeometry(shape))
    sourceGeometryIds.set(shape, 500 + i)
  }
  for (const entry of plan) {
    const batchId = mesh.addInstance(batchGeometryIds.get(entry.geometry))
    mesh.setMatrixAt(batchId, new Matrix4().makeTranslation(entry.x, 0, 0))
  }
  mesh.instanceParents = plan.map((entry) => entry.parent)
  mesh.instanceOccurrenceIds = plan.map((entry) => entry.occurrenceId)
  mesh.instanceGeometryIds = plan.map((entry) => sourceGeometryIds.get(entry.geometry))
  mesh.instanceOccurrencePaths = plan.map((entry) => entry.path)
  mesh.instanceSourceColors = plan.map((entry) => entry.color ?? GREY)
  return mesh
}


/** Conway's fallback grey, the color most fixture instances carry. */
const GREY = {x: 0.8, y: 0.8, z: 0.8, w: 1}


/**
 * Read a VEC3 float accessor back out of the written BIN chunk, so a test
 * can assert what the file SAYS rather than what the writer returned
 * alongside it.
 *
 * @param {object} json parsed glTF JSON
 * @param {Uint8Array} bin the BIN chunk
 * @param {number} index accessor index
 * @return {Array<Array<number>>} one `[x, y, z]` per element
 */
function readVec3Accessor(json, bin, index) {
  const accessor = json.accessors[index]
  const view = json.bufferViews[accessor.bufferView]
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength)
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  const stride = view.byteStride || 12
  const out = []
  for (let i = 0; i < accessor.count; i++) {
    out.push([0, 1, 2].map((c) => dv.getFloat32(base + (i * stride) + (c * 4), true)))
  }
  return out
}


/**
 * A decorated batch as `assembleBatchedModel` leaves it: a REAL
 * `THREE.BatchedMesh` holding the geometry (the writer reads its shapes back
 * out of the batch buffers since Share#1810, so a plain object double would
 * exercise nothing) plus the per-instance side tables.
 *
 * Two instances of one part and one of a genuinely DIFFERENT part — the
 * dedup case the EXT_mesh_gpu_instancing layout exists for. The second
 * shape has to differ in content, not merely in object identity, or the
 * content interner folds the whole fixture into one node.
 *
 * @param {object} [overrides] own properties to stamp over the mesh
 * @return {BatchedMesh}
 */
function batchedDouble(overrides = {}) {
  const shared = triangleGeometry()
  const other = triangleGeometry(2)
  const mesh = batchFromPlan([
    {geometry: shared, x: 1, parent: 11, occurrenceId: 0, path: [3, 7]},
    {geometry: shared, x: 2, parent: 12, occurrenceId: 1, path: [3, 8]},
    {geometry: other, x: 3, parent: 20, occurrenceId: 2, path: [4]},
  ])
  return Object.assign(mesh, overrides)
}


describe('loader/glbBatchedExport', () => {
  it('writes an EXT_mesh_gpu_instancing GLB with shared geometry accessors', async () => {
    const result = await exportBatchedModelAsInstancedGlb(batchedDouble())
    expect(result).not.toBeNull()

    const {json} = parseGlb(result.bytes)
    expect(json.extensionsUsed).toContain('EXT_mesh_gpu_instancing')
    expect(json.extensionsRequired).toContain('EXT_mesh_gpu_instancing')

    // One color, two unique geometries -> two nodes; the shared part's node
    // carries both its instances.
    expect(json.nodes).toHaveLength(2)
    const counts = result.tableNodes.map((n) => n.count).sort()
    expect(counts).toEqual([1, 2])

    // Geometry dedup: 2 unique geometries x (position+normal+index) = 6
    // geometry accessors, + 2 nodes x TRS = 6 instancing accessors.
    expect(json.accessors).toHaveLength(12)

    // Every node declares the instancing extension with full TRS.
    for (const node of json.nodes) {
      const attrs = node.extensions['EXT_mesh_gpu_instancing'].attributes
      expect(Object.keys(attrs).sort()).toEqual(['ROTATION', 'SCALE', 'TRANSLATION'])
    }
  })

  it('keeps table colors verbatim while material colors are linearized', async () => {
    const result = await exportBatchedModelAsInstancedGlb(batchedDouble())
    const {json} = parseGlb(result.bytes)

    // Tables: the exact 0.8 fallback grey — the value isDefaultColor and
    // the palette re-derivation depend on.
    expect(result.tableNodes[0].color).toEqual({x: 0.8, y: 0.8, z: 0.8, w: 1})

    // Material: sRGB->linear for spec-correct generic-viewer rendering, so
    // NOT 0.8 — anyone "simplifying" the writer to share one value breaks
    // one side or the other.
    const factor = json.materials[0].pbrMetallicRoughness.baseColorFactor
    expect(factor[0]).toBeGreaterThan(0.5)
    expect(factor[0]).toBeLessThan(0.7)
    expect(factor[3]).toBe(1)
  })

  it('splits nodes by source color so authored colors survive generic viewers', async () => {
    const double = batchedDouble()
    double.instanceSourceColors = [
      {x: 0.8, y: 0.8, z: 0.8, w: 1},
      {x: 1, y: 0.5, z: 0, w: 1}, // one orange instance of the shared part
      {x: 0.8, y: 0.8, z: 0.8, w: 1},
    ]
    const result = await exportBatchedModelAsInstancedGlb(double)
    const {json} = parseGlb(result.bytes)
    // (shared x grey), (shared x orange), (other x grey) -> 3 nodes, but
    // still only 2 unique geometries' worth of geometry accessors (6), + 3
    // TRANSLATION, + 1 ROTATION and 1 SCALE shared by all three (every
    // placement here is unit-scaled and unrotated).
    expect(json.nodes).toHaveLength(3)
    expect(json.accessors).toHaveLength(11)
  })

  it('bakes SOURCE colors, not the live display palette', async () => {
    const double = batchedDouble()
    // Live table repainted by the palette; snapshot still grey.
    double.instanceColors = [
      {x: 0.3, y: 0.4, z: 0.6, w: 1},
      {x: 0.9, y: 0.5, z: 0.1, w: 1},
      {x: 0.8, y: 0.3, z: 0.3, w: 1},
    ]
    const result = await exportBatchedModelAsInstancedGlb(double)
    for (const node of result.tableNodes) {
      expect(node.color).toEqual({x: 0.8, y: 0.8, z: 0.8, w: 1})
    }
  })

  it('declines a sheared instance matrix (TRS cannot represent it)', async () => {
    const double = batchedDouble()
    const sheared = new Matrix4().set(
      1, 0.5, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1)
    double.getMatrixAt = (i, m) => m.copy(sheared)
    expect(await exportBatchedModelAsInstancedGlb(double)).toBeNull()
  })

  it('declines a batch whose geometry has no normals or index', async () => {
    // An un-indexed, normal-less batch: `hasBatchedGeometry` refuses to read
    // shapes out of it at all, so the writer declines rather than emitting a
    // primitive with no NORMAL/indices.
    const bare = new BufferGeometry()
    bare.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0]), 3))
    const mesh = new BatchedMesh(1, 3, 0)
    mesh.setMatrixAt(mesh.addInstance(mesh.addGeometry(bare)), new Matrix4())
    mesh.instanceParents = [11]
    mesh.instanceOccurrenceIds = [0]
    mesh.instanceSourceColors = [{x: 0.8, y: 0.8, z: 0.8, w: 1}]
    expect(await exportBatchedModelAsInstancedGlb(mesh)).toBeNull()
  })

  it('declines an undecorated model', async () => {
    expect(await exportBatchedModelAsInstancedGlb({isBatchedMesh: true})).toBeNull()
    expect(await exportBatchedModelAsInstancedGlb(null)).toBeNull()
  })

  it('merges byte-identical geometries that arrive as separate objects', async () => {
    // The Share#1859 defect in miniature: two `BufferGeometry` objects with
    // the same bytes, reached through different conway geometry ids. Keyed
    // on `uuid` these were two nodes, two meshes and two accessor sets.
    const first = triangleGeometry()
    const second = triangleGeometry()
    expect(first.uuid).not.toBe(second.uuid)
    const result = await exportBatchedModelAsInstancedGlb(batchFromPlan([
      {geometry: first, x: 1, parent: 11, occurrenceId: 0, path: [1]},
      {geometry: second, x: 2, parent: 12, occurrenceId: 1, path: [2]},
      {geometry: first, x: 3, parent: 13, occurrenceId: 2, path: [3]},
    ]))
    const {json} = parseGlb(result.bytes)

    expect(json.nodes).toHaveLength(1)
    expect(json.meshes).toHaveLength(1)
    // 1 shape x (POSITION + NORMAL + indices) + 1 node x TRS.
    expect(json.accessors).toHaveLength(6)
    expect(result.tableNodes).toHaveLength(1)
    expect(result.tableNodes[0].count).toBe(3)
  })

  it('concatenates a merged group in batch order, transforms WITH table rows', async () => {
    // The identity hazard: `BLDRS_instance_tables` joins to a node by
    // `extras.bldrsTableNode` and then by ROW, so row i of `parents` must
    // describe the same placement as element i of TRANSLATION. Two shapes
    // whose instances interleave make a merge that concatenates per-shape
    // (A,A,B,B) distinguishable from one that concatenates in batch order
    // (A,B,A,B) — and the x/parent correspondence below catches a merge
    // that reorders one side without the other either way.
    const first = triangleGeometry()
    const second = triangleGeometry()
    const result = await exportBatchedModelAsInstancedGlb(batchFromPlan([
      {geometry: first, x: 1, parent: 101, occurrenceId: 91, path: [1]},
      {geometry: second, x: 2, parent: 102, occurrenceId: 92, path: [2]},
      {geometry: first, x: 3, parent: 103, occurrenceId: 93, path: [3]},
      {geometry: second, x: 4, parent: 104, occurrenceId: 94, path: [4]},
    ]))
    const {json, bin} = parseGlb(result.bytes)

    expect(json.nodes).toHaveLength(1)
    const table = result.tableNodes[json.nodes[0].extras.bldrsTableNode]
    expect(table.count).toBe(4)

    const translations = readVec3Accessor(
      json, bin, json.nodes[0].extensions['EXT_mesh_gpu_instancing'].attributes.TRANSLATION)
    expect(translations.map(([x]) => x)).toEqual([1, 2, 3, 4])
    // The join itself: every row's identity must still describe the
    // placement sitting at the same offset in the transform accessor.
    for (const [i, [x]] of translations.entries()) {
      expect(table.parents[i]).toBe(100 + x)
      expect(table.occurrenceIds[i]).toBe(90 + x)
      expect(table.occurrencePaths[i]).toEqual([x])
    }
  })

  it('shares accessors between two colors of one shape instead of merging them', async () => {
    // The case that proves the logic is not "group by content hash": same
    // bytes, different source colors stay two nodes with two materials, over
    // ONE set of POSITION/NORMAL/indices accessors.
    const first = triangleGeometry()
    const second = triangleGeometry()
    const result = await exportBatchedModelAsInstancedGlb(batchFromPlan([
      {geometry: first, x: 1, parent: 11, occurrenceId: 0, path: [1], color: GREY},
      {geometry: second, x: 2, parent: 12, occurrenceId: 1, path: [2],
        color: {x: 1, y: 0.5, z: 0, w: 1}},
    ]))
    const {json} = parseGlb(result.bytes)

    expect(json.nodes).toHaveLength(2)
    expect(json.materials).toHaveLength(2)
    // 1 shape x 3 geometry accessors + 2 TRANSLATION + a shared ROTATION and
    // SCALE.
    expect(json.accessors).toHaveLength(7)
    const [a, b] = json.meshes.map((mesh) => mesh.primitives[0])
    expect(a.attributes.POSITION).toBe(b.attributes.POSITION)
    expect(a.attributes.NORMAL).toBe(b.attributes.NORMAL)
    expect(a.indices).toBe(b.indices)
    expect(a.material).not.toBe(b.material)
  })

  it('declares one material per distinct color, not per geometry bin', async () => {
    // Snowdon declared 12,251 materials for 90 distinct colors — 1,758,073 B
    // of JSON for 12,970 B of content (Share#1854). Three DIFFERENT shapes,
    // two colors.
    const result = await exportBatchedModelAsInstancedGlb(batchFromPlan([
      {geometry: triangleGeometry(1), x: 1, parent: 11, occurrenceId: 0, path: [1], color: GREY},
      {geometry: triangleGeometry(2), x: 2, parent: 12, occurrenceId: 1, path: [2], color: GREY},
      {geometry: triangleGeometry(3), x: 3, parent: 13, occurrenceId: 2, path: [3],
        color: {x: 1, y: 0.5, z: 0, w: 1}},
    ]))
    const {json} = parseGlb(result.bytes)

    expect(json.nodes).toHaveLength(3)
    expect(json.materials).toHaveLength(2)
    const materialOf = json.meshes.map((mesh) => mesh.primitives[0].material)
    expect(materialOf[0]).toBe(materialOf[1])
    expect(materialOf[2]).not.toBe(materialOf[0])
  })

  it('shares one instancing accessor across nodes whose transforms coincide', async () => {
    // Almost every IFC placement is unit-scaled and repeats a small set of
    // orientations, so SCALE and ROTATION payloads collide constantly across
    // nodes while TRANSLATION rarely does. Sharing the accessor is legal for
    // the same reason the geometry accessors are shared — an accessor is an
    // index, and glTF puts no limit on how many properties resolve to one.
    const result = await exportBatchedModelAsInstancedGlb(batchFromPlan([
      {geometry: triangleGeometry(1), x: 1, parent: 11, occurrenceId: 0, path: [1]},
      {geometry: triangleGeometry(2), x: 2, parent: 12, occurrenceId: 1, path: [2]},
      {geometry: triangleGeometry(3), x: 3, parent: 13, occurrenceId: 2, path: [3]},
    ]))
    const {json} = parseGlb(result.bytes)

    const attributes = json.nodes.map(
      (node) => node.extensions['EXT_mesh_gpu_instancing'].attributes)
    expect(attributes).toHaveLength(3)
    expect(new Set(attributes.map((a) => a.SCALE)).size).toBe(1)
    expect(new Set(attributes.map((a) => a.ROTATION)).size).toBe(1)
    // The placements themselves differ, so TRANSLATION must NOT collapse —
    // a dedup that folded these would put all three parts at one point.
    expect(new Set(attributes.map((a) => a.TRANSLATION)).size).toBe(3)
    // 3 shapes x 3 geometry accessors + 3 TRANSLATION + 1 ROTATION + 1 SCALE.
    expect(json.accessors).toHaveLength(14)
  })

  it('keeps shapes apart when only their normals differ', async () => {
    // ~730 Snowdon shapes share positions and topology but differ in
    // normals. Merging them would change the shading of one of the two.
    const flipped = triangleGeometry()
    flipped.getAttribute('normal').array.set([0, 0, -1, 0, 0, -1, 0, 0, -1])
    const result = await exportBatchedModelAsInstancedGlb(batchFromPlan([
      {geometry: triangleGeometry(), x: 1, parent: 11, occurrenceId: 0, path: [1]},
      {geometry: flipped, x: 2, parent: 12, occurrenceId: 1, path: [2]},
    ]))
    const {json} = parseGlb(result.bytes)

    expect(json.nodes).toHaveLength(2)
    // 2 shapes x 3 geometry accessors + 2 TRANSLATION + a shared ROTATION
    // and SCALE.
    expect(json.accessors).toHaveLength(10)
  })
})
