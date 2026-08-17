/* eslint-disable no-magic-numbers */
import {BufferAttribute, BufferGeometry, Group, InstancedMesh, Matrix4} from 'three'
import {hydrateBatchedModelFromInstancedGlb} from './instancedGlbToBatchedModel'
import {isDefaultColor} from './productPalette'
import {occurrencePathKey} from '../../utils/occurrencePaths'


const GREY = {x: 0.8, y: 0.8, z: 0.8, w: 1}


/**
 * One-triangle indexed geometry, the shape GLTFLoader hands back.
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
 * An InstancedMesh as GLTFLoader would produce for one writer node —
 * geometry + per-instance matrices + the writer's table-index extras
 * (promoted to userData).
 *
 * @param {BufferGeometry} geometry
 * @param {Array<Matrix4>} matrices
 * @param {number} tableIndex
 * @return {InstancedMesh}
 */
function instancedNode(geometry, matrices, tableIndex) {
  const mesh = new InstancedMesh(geometry, undefined, matrices.length)
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m))
  mesh.userData.bldrsTableNode = tableIndex
  return mesh
}


/**
 * A GLTFLoader-scene-shaped model: Group of instanced nodes + the parsed
 * tables (as the BldrsInstanceTablesReader plugin stashes them).
 *
 * @param {Array<InstancedMesh>} nodes
 * @param {Array<object>} tables
 * @return {Group}
 */
function gltfScene(nodes, tables) {
  const scene = new Group()
  nodes.forEach((n) => scene.add(n))
  scene.userData.bldrsInstanceTables = tables
  scene.userData.bldrsTitle = 'as1'
  return scene
}


/**
 * The standard two-node fixture: a shared part instanced twice + a second
 * part once, all colorless — the palette-eligible case.
 *
 * @return {{scene: Group, tables: Array<object>}}
 */
function colorlessFixture() {
  const shared = triangleGeometry()
  const other = triangleGeometry()
  const nodes = [
    instancedNode(shared,
      [new Matrix4().makeTranslation(1, 0, 0), new Matrix4().makeTranslation(2, 0, 0)], 0),
    instancedNode(other, [new Matrix4().makeTranslation(0, 3, 0)], 1),
  ]
  const tables = [
    {count: 2, color: {...GREY}, parents: [11, 12], occurrenceIds: [0, 1],
      geometryIds: [500, 500], occurrencePaths: [[3, 7], [3, 8]]},
    {count: 1, color: {...GREY}, parents: [20], occurrenceIds: [2],
      geometryIds: [600], occurrencePaths: [[4]]},
  ]
  return {scene: gltfScene(nodes, tables), tables}
}


describe('viewer/ifc/instancedGlbToBatchedModel', () => {
  it('rebuilds a decorated BatchedMesh with the cache-miss table shape', () => {
    const {scene} = colorlessFixture()
    const model = hydrateBatchedModelFromInstancedGlb(scene)

    expect(model).not.toBeNull()
    expect(model.isBatchedMesh).toBe(true) // one opaque partition
    expect(Array.from(model.instanceParents)).toEqual([11, 12, 20])
    expect(Array.from(model.instanceOccurrenceIds)).toEqual([0, 1, 2])
    expect(Array.from(model.instanceGeometryIds)).toEqual([500, 500, 600])
    expect(model.instanceOccurrencePaths).toEqual([[3, 7], [3, 8], [4]])
    // The NavTree→scene join index the decorate step builds.
    expect(model.occurrencePathToBatchIds.get(occurrencePathKey([3, 7]))).toEqual([0])
    // Batched subset surface attached (IfcIsolator contract).
    expect(typeof model.createSubset).toBe('function')
    // Provisional capabilities match the cache-miss build.
    expect(model.capabilities.batchedPicking).toBe(true)
  })

  it('re-derives the palette from source colors — S1/S2 light up on reload', () => {
    const {scene} = colorlessFixture()
    const model = hydrateBatchedModelFromInstancedGlb(scene)

    // Source snapshot = the artifact's verbatim grey...
    for (const source of model.instanceSourceColors) {
      expect(isDefaultColor(source)).toBe(true)
    }
    // ...and the live table carries the re-derived palette (autoColorParts
    // default-on), keyed per part: shared geometry's two instances match,
    // the other part differs.
    expect(isDefaultColor(model.instanceColors[0])).toBe(false)
    expect(model.instanceColors[0]).toEqual(model.instanceColors[1])
    expect(model.instanceColors[2]).not.toEqual(model.instanceColors[0])
  })

  it('round-trips instance matrices', () => {
    const {scene} = colorlessFixture()
    const model = hydrateBatchedModelFromInstancedGlb(scene)
    const m = new Matrix4()
    model.getMatrixAt(0, m)
    expect(m.elements[12]).toBeCloseTo(1)
    model.getMatrixAt(2, m)
    expect(m.elements[13]).toBeCloseTo(3)
  })

  it('splits transparent instances into their own sorted batch', () => {
    const {scene, tables} = colorlessFixture()
    tables[1].color = {x: 0.8, y: 0.8, z: 0.8, w: 0.5}
    const model = hydrateBatchedModelFromInstancedGlb(scene)

    expect(model.isGroup).toBe(true)
    const [opaque, transparent] = model.children
    expect(opaque.material.transparent).toBeFalsy()
    expect(opaque.sortObjects).toBe(false)
    expect(transparent.material.transparent).toBe(true)
    expect(transparent.material.depthWrite).toBe(false)
    expect(transparent.sortObjects).toBe(true)
    expect(Array.from(transparent.instanceParents)).toEqual([20])
  })

  it('carries the GLTF scene userData across the swap (title, tree hooks)', () => {
    const {scene} = colorlessFixture()
    const model = hydrateBatchedModelFromInstancedGlb(scene)
    expect(model.userData.bldrsTitle).toBe('as1')
  })

  it('returns null on a broken node↔table join, never a partial model', () => {
    // Count mismatch.
    const {scene, tables} = colorlessFixture()
    tables[0].count = 5
    expect(hydrateBatchedModelFromInstancedGlb(scene)).toBeNull()

    // Missing table index on a node.
    const fixture2 = colorlessFixture()
    fixture2.scene.children[0].userData.bldrsTableNode = undefined
    expect(hydrateBatchedModelFromInstancedGlb(fixture2.scene)).toBeNull()

    // Duplicate index.
    const fixture3 = colorlessFixture()
    fixture3.scene.children[1].userData.bldrsTableNode = 0
    expect(hydrateBatchedModelFromInstancedGlb(fixture3.scene)).toBeNull()

    // No tables at all.
    const bare = new Group()
    expect(hydrateBatchedModelFromInstancedGlb(bare)).toBeNull()
  })
})
