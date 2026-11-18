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
    const index = await indexElementPieces(root, {ids: new Set([7, 8]), instanceIds: new Set()})
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
    const index = await indexElementPieces(root, {ids: new Set([5]), instanceIds: new Set()})
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
    const pieces = (await indexElementPieces(root, {ids: new Set([5]), instanceIds: new Set()})).forTarget({ids: [5]})
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
    const drawn = (await indexElementPieces(root, {ids: new Set([5]), instanceIds: new Set()})).forTarget({ids: [5]})
    expect(drawn).toHaveLength(2)
  })

  it('is empty when nothing wanted has geometry', async () => {
    const index = await indexElementPieces(new Group(), {ids: new Set([1]), instanceIds: new Set()})
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


// Indexing walks every placement and allocates a piece and a matrix each, so
// a large instance set must yield inside it (it runs before any measuring).
describe('viewer/tools elementPieces indexing yields', () => {
  /**
   * @param {number} count placements
   * @return {{root: Group, mesh: InstancedMesh}} a node holding an InstancedMesh
   */
  function instancedNode(count) {
    const mesh = new InstancedMesh(trianglesGeometry(CUBE_TRIANGLES), undefined, count)
    for (let i = 0; i < count; i++) {
      mesh.setMatrixAt(i, new Matrix4().makeTranslation(i, 0, 0))
    }
    const node = new Group()
    node.expressID = 5
    node.add(mesh)
    const root = new Group()
    root.add(node)
    return {root, mesh}
  }
  const want = () => ({ids: new Set([5]), instanceIds: new Set()})

  it('awaits pause during an InstancedMesh expansion larger than the chunk', async () => {
    const {root} = instancedNode(100)
    const pause = jest.fn(() => Promise.resolve())
    const index = await indexElementPieces(root, want(), {chunk: 10, pause})
    expect(pause.mock.calls.length).toBeGreaterThanOrEqual(9)
    expect(index.forTarget({ids: [5]})).toHaveLength(100)
  })

  it('stops indexing when the pause rejects (an abort), after at most one chunk more', async () => {
    const {root, mesh} = instancedNode(100)
    const read = jest.spyOn(mesh, 'getMatrixAt')
    const pause = jest.fn(() => Promise.reject(new Error('aborted')))
    await expect(indexElementPieces(root, want(), {chunk: 10, pause})).rejects.toThrow('aborted')
    expect(read.mock.calls.length).toBeLessThanOrEqual(10)
  })

  it('does not await per placement: microtask turns stay flat as the count grows', async () => {
    const {root} = instancedNode(5000)
    let turns = 0
    let done = false
    const spin = () => {
      if (!done) {
        turns++
        queueMicrotask(spin)
      }
    }
    spin()
    await indexElementPieces(root, want(), {chunk: 1e9, pause: () => Promise.resolve()})
    done = true
    expect(turns).toBeLessThan(20)
  })
})


// An element with tens of millions of triangles must not be accumulated into a
// JS array and copied, only to be refused afterwards: indexing stops at the cap
// and leaves a marker that model.measure reports as tooLarge.
describe('viewer/tools elementPieces refuses oversize elements while indexing', () => {
  const want = (ids) => ({ids: new Set(ids), instanceIds: new Set()})

  it('stops accumulating a merged-mesh element at the cap and returns a marker', async () => {
    // Element 7: 50 triangles. Element 8: 2.
    const tris = Array.from({length: 52}, (_, i) => [i, 0, 0, i, 1, 0, i, 0, 1])
    const owners = tris.flatMap((_, i) => (i < 50 ? [7, 7, 7] : [8, 8, 8]))
    const root = new Group()
    root.add(new Mesh(trianglesGeometry(tris, owners)))
    const push = jest.spyOn(Array.prototype, 'push')
    let index
    let accumulations = 0
    try {
      index = await indexElementPieces(root, want([7, 8]), {maxTriangles: 10})
    } finally {
      // Corner accumulation pushes three numbers a triangle: 50 triangles
      // would be 50 such pushes without the early stop; with it, 11 for
      // element 7 plus 2 for element 8.
      accumulations = push.mock.calls.filter((args) => args.length === 3 && args.every(Number.isFinite)).length
      push.mockRestore()
    }
    expect(accumulations).toBeLessThanOrEqual(13)
    const [big] = index.forTarget({ids: [7]})
    expect(big.tooLarge).toBe(true)
    expect(big.indexCount / 3).toBeGreaterThan(10)
    expect(big.index).toBeNull()
    const [small] = index.forTarget({ids: [8]})
    expect(small.tooLarge).toBeUndefined()
    expect(small.indexCount).toBe(6)
  })

  it('refuses an InstancedMesh whose geometry alone is over the cap, without expanding it', async () => {
    const mesh = new InstancedMesh(trianglesGeometry(CUBE_TRIANGLES), undefined, 1000)
    const node = new Group()
    node.expressID = 5
    node.add(mesh)
    const root = new Group()
    root.add(node)
    const getMatrix = jest.spyOn(mesh, 'getMatrixAt')
    const pieces = (await indexElementPieces(root, want([5]), {maxTriangles: 11})).forTarget({ids: [5]})
    expect(pieces).toHaveLength(1)
    expect(pieces[0].tooLarge).toBe(true)
    expect(getMatrix).not.toHaveBeenCalled()
  })

  it('bounds how many placements it builds, leaving one marker for the rest', async () => {
    const mesh = new InstancedMesh(trianglesGeometry(CUBE_TRIANGLES), undefined, 100)
    const node = new Group()
    node.expressID = 5
    node.add(mesh)
    const root = new Group()
    root.add(node)
    const getMatrix = jest.spyOn(mesh, 'getMatrixAt')
    const pieces = (await indexElementPieces(root, want([5]), {maxPlacements: 10})).forTarget({ids: [5]})
    expect(pieces.filter((piece) => !piece.tooLarge)).toHaveLength(10)
    expect(pieces.filter((piece) => piece.tooLarge)).toHaveLength(1)
    expect(getMatrix).toHaveBeenCalledTimes(10)
  })
})
