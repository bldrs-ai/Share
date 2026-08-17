/* eslint-disable no-magic-numbers */
import {BufferAttribute, BufferGeometry, Matrix4} from 'three'
import {exportBatchedModelAsInstancedGlb} from './glbBatchedExport'
import {parseGlb} from './injectGlbExtensions'


/**
 * A real indexed BufferGeometry (one triangle) for the writer to serialize.
 *
 * @return {BufferGeometry}
 */
function triangleGeometry() {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(
    new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3))
  geometry.setAttribute('normal', new BufferAttribute(
    new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3))
  geometry.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2]), 1))
  return geometry
}


/**
 * Decorated-BatchedMesh double in the `assembleBatchedModel` table shape,
 * with real geometries and matrices so the export exercises the actual
 * serialization path.
 *
 * @param {object} [overrides]
 * @return {object} mesh double
 */
function batchedDouble(overrides = {}) {
  const shared = triangleGeometry()
  const other = triangleGeometry()
  const matrices = [
    new Matrix4().makeTranslation(1, 0, 0),
    new Matrix4().makeTranslation(2, 0, 0),
    new Matrix4().makeTranslation(0, 3, 0),
  ]
  return {
    isBatchedMesh: true,
    // Two instances of one part (shared geometry), one of another — the
    // dedup case the layout exists for.
    instanceGeometry: [shared, shared, other],
    instanceParents: [11, 12, 20],
    instanceOccurrenceIds: [0, 1, 2],
    instanceGeometryIds: [500, 500, 600],
    instanceOccurrencePaths: [[3, 7], [3, 8], [4]],
    instanceSourceColors: [
      {x: 0.8, y: 0.8, z: 0.8, w: 1},
      {x: 0.8, y: 0.8, z: 0.8, w: 1},
      {x: 0.8, y: 0.8, z: 0.8, w: 1},
    ],
    getMatrixAt(i, m) {
      m.copy(matrices[i])
    },
    ...overrides,
  }
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
    // still only 2 unique geometries' worth of geometry accessors (6) + 3
    // nodes x TRS (9).
    expect(json.nodes).toHaveLength(3)
    expect(json.accessors).toHaveLength(15)
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

  it('declines a geometry missing normals or index', async () => {
    const bare = new BufferGeometry()
    bare.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0]), 3))
    const double = batchedDouble()
    double.instanceGeometry = [bare, bare, bare]
    expect(await exportBatchedModelAsInstancedGlb(double)).toBeNull()
  })

  it('declines an undecorated model', async () => {
    expect(await exportBatchedModelAsInstancedGlb({isBatchedMesh: true})).toBeNull()
    expect(await exportBatchedModelAsInstancedGlb(null)).toBeNull()
  })
})
