/* eslint-disable no-magic-numbers */
import {BufferAttribute, BufferGeometry, Group, InstancedMesh, Matrix4, Mesh} from 'three'
import {indexElementPieces} from './elementPieces'
import {linearDeterminant, localSolid, measureWorld} from './meshMeasure'


/**
 * @param {Array<Array<number>>} triangles each three corners, flattened [x,y,z,…]
 * @param {Array<number>} [owners] an element id per vertex (the merged-mesh layout)
 * @return {BufferGeometry} a non-indexed geometry
 */
function trianglesGeometry(triangles, owners = null) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(triangles.flat()), 3))
  if (owners) {
    geometry.setAttribute('expressID', new BufferAttribute(new Float32Array(owners), 1))
  }
  return geometry
}


// A unit cube, outward wound, as 12 triangles of 9 numbers.
const CUBE_TRIANGLES = [
  [[0, 0, 1], [1, 0, 1], [1, 1, 1]], [[0, 0, 1], [1, 1, 1], [0, 1, 1]],
  [[0, 0, 0], [0, 1, 0], [1, 1, 0]], [[0, 0, 0], [1, 1, 0], [1, 0, 0]],
  [[1, 0, 0], [1, 1, 0], [1, 1, 1]], [[1, 0, 0], [1, 1, 1], [1, 0, 1]],
  [[0, 0, 0], [0, 0, 1], [0, 1, 1]], [[0, 0, 0], [0, 1, 1], [0, 1, 0]],
  [[0, 1, 0], [0, 1, 1], [1, 1, 1]], [[0, 1, 0], [1, 1, 1], [1, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1]], [[0, 0, 0], [1, 0, 1], [0, 0, 1]],
].map((tri) => tri.flat())

// Two right triangles with legs 3 and 4 (area 6) and 1 and 1 (area 0.5).
const BIG = [0, 0, 0, 3, 0, 0, 0, 4, 0]
const SMALL = [0, 0, 5, 1, 0, 5, 0, 1, 5]


describe('viewer/tools elementPieces (the render backends model.measure reads)', () => {
  it('splits a merged mesh by the element each triangle belongs to, in world space', async () => {
    const mesh = new Mesh(trianglesGeometry([BIG, SMALL], [7, 7, 7, 8, 8, 8]))
    mesh.scale.set(2, 2, 2)
    const root = new Group()
    root.add(mesh)
    const index = indexElementPieces(root, {ids: new Set([7, 8]), instanceIds: new Set()})
    const [big] = index.forTarget({ids: [7]})
    const [small] = index.forTarget({ids: [8]})
    // Scaled by 2: areas ×4.
    expect((await measureWorld(big)).area).toBeCloseTo(24, 5)
    expect((await measureWorld(small)).area).toBeCloseTo(2, 5)
    expect((await measureWorld(small, {wantBox: true})).max).toEqual([2, 2, 10])
  })

  it('measures a scene-graph node by its whole subtree', async () => {
    const root = new Group()
    const node = new Group()
    node.expressID = 5
    const a = new Mesh(trianglesGeometry([BIG]))
    const b = new Mesh(trianglesGeometry([SMALL]))
    node.add(a)
    node.add(b)
    root.add(node)
    const index = indexElementPieces(root, {ids: new Set([5]), instanceIds: new Set()})
    const pieces = index.forTarget({ids: [5]})
    expect(pieces).toHaveLength(2)
    const areas = await Promise.all(pieces.map(async (piece) => (await measureWorld(piece)).area))
    expect(areas.reduce((sum, area) => sum + area, 0)).toBeCloseTo(6.5, 5)
  })

  // A glTF using EXT_mesh_gpu_instancing, with no Share instance tables, loads
  // as an InstancedMesh: every placement is drawn, so every one is measured.
  it('measures every placement of a scene-graph InstancedMesh, not just the first', async () => {
    const geometry = trianglesGeometry(CUBE_TRIANGLES)
    const mesh = new InstancedMesh(geometry, undefined, 3)
    mesh.setMatrixAt(0, new Matrix4().makeTranslation(10, 0, 0))
    mesh.setMatrixAt(1, new Matrix4().makeTranslation(20, 0, 0))
    mesh.setMatrixAt(2, new Matrix4().makeScale(2, 2, 2).setPosition(40, 0, 0))
    const node = new Group()
    node.expressID = 5
    node.add(mesh)
    const root = new Group()
    root.add(node)
    const pieces = indexElementPieces(root, {ids: new Set([5]), instanceIds: new Set()}).forTarget({ids: [5]})
    expect(pieces).toHaveLength(3)
    // Unit cubes: area 6 each, the scaled one 24.
    const worlds = await Promise.all(pieces.map((piece) => measureWorld(piece, {wantBox: true})))
    expect(worlds.reduce((sum, w) => sum + w.area, 0)).toBeCloseTo(6 + 6 + 24, 4)
    expect(Math.min(...worlds.map((w) => w.min[0]))).toBeCloseTo(10, 4)
    expect(Math.max(...worlds.map((w) => w.max[0]))).toBeCloseTo(42, 4)
    // One geometry: one closure check serves all three.
    expect(new Set(pieces.map((piece) => piece.shape)).size).toBe(1)
    expect((await localSolid(pieces[0])).volume).toBeCloseTo(1, 5)
    // `count` limits what is drawn.
    mesh.count = 2
    const drawn = indexElementPieces(root, {ids: new Set([5]), instanceIds: new Set()}).forTarget({ids: [5]})
    expect(drawn).toHaveLength(2)
  })

  it('is empty when nothing wanted has geometry', () => {
    const index = indexElementPieces(new Group(), {ids: new Set([1]), instanceIds: new Set()})
    expect(index.empty).toBe(true)
    expect(index.forTarget({ids: [1]})).toEqual([])
  })
})


describe('viewer/tools meshMeasure', () => {
  it('finds a tetrahedron closed with volume 1/6, and one flipped face open', async () => {
    // Corners 0, e1, e2, e3; faces wound outward.
    const o = [0, 0, 0]
    const x = [1, 0, 0]
    const y = [0, 1, 0]
    const z = [0, 0, 1]
    const faces = [[o, y, x], [o, x, z], [o, z, y], [x, y, z]]
    const piece = (tris) => {
      const geometry = trianglesGeometry(tris.map((tri) => tri.flat()))
      return {
        position: geometry.attributes.position, index: null, indexStart: 0, indexCount: tris.length * 3,
        matrix: new Mesh().matrixWorld, shape: null,
      }
    }
    const closed = await localSolid(piece(faces))
    expect(closed.closed).toBe(true)
    expect(closed.volume).toBeCloseTo(1 / 6, 6)
    // Winding one face the other way breaks the edge pairing.
    const flipped = await localSolid(piece([faces[0], faces[1], faces[2], [x, z, y]]))
    expect(flipped.closed).toBe(false)
    expect((await localSolid(piece(faces.slice(0, 3)))).closed).toBe(false)
  })

  it('scales volume by the determinant of the placement', () => {
    const mesh = new Mesh()
    mesh.scale.set(2, -3, 4)
    mesh.updateMatrixWorld()
    expect(linearDeterminant(mesh.matrixWorld)).toBeCloseTo(-24, 6)
  })
})
