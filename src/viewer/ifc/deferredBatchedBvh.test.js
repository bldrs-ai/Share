/* eslint-disable no-magic-numbers */
import {
  BatchedMesh,
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
} from 'three'
import {computeBatchedBoundsTree} from 'three-mesh-bvh'
import {reportBvhDepthCap} from '../../loader/loadProgress'
import {withBvhPrototypes} from './batchedModel.fixture'
import {raycastActiveInstances} from './batchedRaycast'
import {depthCapExtremes} from './bvhBuild'
import {
  disposeDeferredBatchedBoundsTree,
  finishBatchedBoundsTrees,
  isBatchedBoundsTreeBuildDone,
  scheduleBatchedBoundsTrees,
} from './deferredBatchedBvh'


jest.mock('../../loader/loadProgress', () => ({
  loadReportToken: jest.fn(() => 'load-token'),
  reportBvhDepthCap: jest.fn(),
}))
jest.mock('./bvhBuild', () => {
  const actual = jest.requireActual('./bvhBuild')
  return {...actual, depthCapExtremes: jest.fn(actual.depthCapExtremes)}
})


const GEOMETRIES = 4
const TRIANGLES_PER_GEOMETRY = 64
const SPACING = 100


/**
 * A geometry of many small, scattered triangles: enough per geometry that a
 * BVH really splits and a direct build really reorders the index.
 *
 * @param {number} seed
 * @return {object} BufferGeometry
 */
function scatteredTriangles(seed) {
  const positions = new Float32Array(TRIANGLES_PER_GEOMETRY * 9)
  const index = new Uint32Array(TRIANGLES_PER_GEOMETRY * 3)
  let state = seed
  const next = () => {
    state = ((state * 1103515245) + 12345) % 2147483648
    return state / 2147483648
  }
  for (let t = 0; t < TRIANGLES_PER_GEOMETRY; t++) {
    // Each triangle faces +z on its own spot of a 10×10 tile.
    const x = next() * 10
    const y = next() * 10
    positions.set([x, y, 0, x + 0.2, y, 0, x, y + 0.2, 0], t * 9)
    index.set([t * 3, (t * 3) + 1, (t * 3) + 2], t * 3)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(positions.length), 3))
  geometry.setIndex(new BufferAttribute(index, 1))
  return geometry
}


/** @return {{mesh: object, triangles: Array<Array<number>>}} a batch, one instance per geometry */
function scatteredBatch() {
  const geometries = Array.from({length: GEOMETRIES}, (_, g) => scatteredTriangles(g + 1))
  const vertexCount = geometries.reduce((n, g) => n + g.attributes.position.count, 0)
  const indexCount = geometries.reduce((n, g) => n + g.index.count, 0)
  const mesh = new BatchedMesh(GEOMETRIES, vertexCount, indexCount, new MeshBasicMaterial())
  const triangles = []
  geometries.forEach((geometry, g) => {
    const id = mesh.addGeometry(geometry)
    const batchId = mesh.addInstance(id)
    mesh.setMatrixAt(batchId, new Matrix4().makeTranslation(g * SPACING, 0, 0))
    // A point inside each of this geometry's triangles, in world space.
    const pos = geometry.attributes.position.array
    for (let t = 0; t < TRIANGLES_PER_GEOMETRY; t++) {
      triangles.push({batchId, x: pos[t * 9] + 0.05 + (g * SPACING), y: pos[(t * 9) + 1] + 0.05})
    }
  })
  mesh.computeBoundingBox()
  mesh.computeBoundingSphere()
  mesh.updateMatrixWorld(true)
  return {mesh, triangles}
}


/**
 * @param {object} mesh
 * @param {number} x
 * @param {number} y
 * @return {number|null} the batchId a ray down -z at (x, y) hits first
 */
function pickAt(mesh, x, y) {
  const raycaster = new Raycaster(new Vector3(x, y, 5), new Vector3(0, 0, -1))
  const hits = []
  mesh.raycast(raycaster, hits)
  hits.sort((a, b) => a.distance - b.distance)
  return hits.length > 0 ? hits[0].batchId : null
}


/** @return {{schedule: Function, runOne: Function, pending: Function}} a manual idle queue */
function manualSchedule() {
  const queue = []
  return {
    schedule: (run) => queue.push(run),
    // One slice with no idle time left: the job builds one tree and yields.
    runOne: () => queue.shift()({timeRemaining: () => 0}),
    pending: () => queue.length,
  }
}


describe('viewer/ifc/deferredBatchedBvh', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('arms one null slot per geometry at once and builds the trees in later slices', () => {
    withBvhPrototypes(raycastActiveInstances, () => {
      const {mesh} = scatteredBatch()
      const idle = manualSchedule()
      scheduleBatchedBoundsTrees([mesh], {schedule: idle.schedule})

      expect(mesh.boundsTrees).toEqual(new Array(GEOMETRIES).fill(null))
      expect(isBatchedBoundsTreeBuildDone(mesh)).toBe(false)
      let slices = 0
      while (idle.pending() > 0) {
        idle.runOne()
        slices++
      }
      // One tree per slice, since each slice had no idle time to spare.
      expect(slices).toBe(GEOMETRIES)
      expect(mesh.boundsTrees.every(Boolean)).toBe(true)
      expect(isBatchedBoundsTreeBuildDone(mesh)).toBe(true)
    })
  })

  it('never reorders the batch index, which a direct build would', () => {
    withBvhPrototypes(raycastActiveInstances, () => {
      const {mesh} = scatteredBatch()
      const before = mesh.geometry.index.array.slice()
      scheduleBatchedBoundsTrees([mesh], {schedule: () => undefined})
      finishBatchedBoundsTrees(mesh)
      expect(mesh.boundsTrees.every(Boolean)).toBe(true)
      expect(Array.from(mesh.geometry.index.array)).toEqual(Array.from(before))

      // Non-vacuity: the fixture does make a direct build sort the index.
      const {mesh: direct} = scatteredBatch()
      const directBefore = direct.geometry.index.array.slice()
      computeBatchedBoundsTree.call(direct, -1)
      expect(Array.from(direct.geometry.index.array)).not.toEqual(Array.from(directBefore))
    })
  })

  it('picks every triangle the same before, during and after the build', () => {
    withBvhPrototypes(raycastActiveInstances, () => {
      const {mesh, triangles} = scatteredBatch()
      const idle = manualSchedule()
      // The fallback writes into the batch geometry's box; nothing has set
      // one yet, which is what the arm and the raycast guard cover.
      expect(mesh.geometry.boundingBox).toBeNull()
      scheduleBatchedBoundsTrees([mesh], {schedule: idle.schedule})
      const picks = () => triangles.map(({x, y}) => pickAt(mesh, x, y))
      const expected = triangles.map(({batchId}) => batchId)

      expect(picks()).toEqual(expected)
      idle.runOne()
      idle.runOne()
      expect(mesh.boundsTrees.filter(Boolean)).toHaveLength(2)
      expect(picks()).toEqual(expected)
      finishBatchedBoundsTrees(mesh)
      expect(picks()).toEqual(expected)
    })
  })

  it('picks through a geometry swapped in with no box (a capacity grow)', () => {
    withBvhPrototypes(raycastActiveInstances, () => {
      const {mesh, triangles} = scatteredBatch()
      scheduleBatchedBoundsTrees([mesh], {schedule: () => undefined})
      mesh.geometry.boundingBox = null
      const {x, y, batchId} = triangles[0]
      expect(pickAt(mesh, x, y)).toBe(batchId)
    })
  })

  it('stops building when the trees are disposed mid-build', () => {
    withBvhPrototypes(raycastActiveInstances, () => {
      const {mesh} = scatteredBatch()
      const idle = manualSchedule()
      scheduleBatchedBoundsTrees([mesh], {schedule: idle.schedule})
      idle.runOne()
      disposeDeferredBatchedBoundsTree.call(mesh)
      while (idle.pending() > 0) {
        idle.runOne()
      }
      expect(mesh.boundsTrees.every((tree) => tree === null)).toBe(true)
      expect(isBatchedBoundsTreeBuildDone(mesh)).toBe(true)
      expect(reportBvhDepthCap).not.toHaveBeenCalled()
    })
  })

  it('skips meshes without the three-mesh-bvh patch', () => {
    const {mesh} = scatteredBatch()
    expect(typeof mesh.computeBoundsTree).not.toBe('function')
    expect(scheduleBatchedBoundsTrees([mesh])).toBeNull()
    expect(mesh.boundsTrees).toBeUndefined()
  })

  it('reports the model\'s depth caps once, summed, against the load that scheduled it', () => {
    withBvhPrototypes(raycastActiveInstances, () => {
      const {mesh} = scatteredBatch()
      const {mesh: second} = scatteredBatch()
      depthCapExtremes.mockImplementation(() => ({trees: 1, maxLeafTriangles: 12}))
      try {
        scheduleBatchedBoundsTrees([mesh, second], {schedule: () => undefined})
        finishBatchedBoundsTrees(mesh)
      } finally {
        depthCapExtremes.mockImplementation(jest.requireActual('./bvhBuild').depthCapExtremes)
      }
      expect(reportBvhDepthCap).toHaveBeenCalledTimes(1)
      expect(reportBvhDepthCap).toHaveBeenCalledWith(
        {trees: GEOMETRIES * 2, maxLeafTriangles: 12, maxDepth: 40}, 'load-token')
      expect(second.boundsTrees.every(Boolean)).toBe(true)
    })
  })

  it('reports nothing when no tree reached the cap', () => {
    withBvhPrototypes(raycastActiveInstances, () => {
      const {mesh} = scatteredBatch()
      scheduleBatchedBoundsTrees([mesh], {schedule: () => undefined})
      finishBatchedBoundsTrees(mesh)
      expect(depthCapExtremes).toHaveBeenCalled()
      expect(reportBvhDepthCap).not.toHaveBeenCalled()
    })
  })
})
