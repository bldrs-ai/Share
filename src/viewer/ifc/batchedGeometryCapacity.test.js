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
import {
  addBatchedGeometry,
  addBatchedInstance,
  batchEditRevision,
  mintGeometryId,
  mintOccurrenceId,
} from './batchedEdit'
import {ensureGeometryCapacity} from './batchedGeometryCapacity'
import {addGeometryRanges} from './batchedGeometryRanges'
import {instanceGeometryAt} from './batchedInstanceGeometry'
import {
  SHAPE_ID,
  SPACING,
  decoratedStepBatch,
  unitTriangleApi,
  withBvhPrototypes,
} from './batchedModel.fixture'
import {raycastActiveInstances} from './batchedRaycast'
import {decorateBatchMeshes} from './buildBatchedConwayModel'
import {IncrementalBatchedBuilder} from './incrementalBatchedBuilder'


const PURPLE = {x: 0.5, y: 0, z: 0.5, w: 1}


/**
 * The row of a created shape: fresh occurrence and source-geometry ids from
 * the model's mint, as the edit layer will take them.
 *
 * @param {object} mesh the batch (here also the model root)
 * @param {number} parent product id
 * @return {object}
 */
function createdRow(mesh, parent) {
  return {
    parent, occurrenceId: mintOccurrenceId(mesh), geometryId: mintGeometryId(mesh), color: PURPLE,
  }
}


/**
 * A right triangle in the z=0 plane at x, facing +z.
 *
 * @param {number} x
 * @param {number} [size]
 * @return {BufferGeometry}
 */
function triangleAt(x, size = 1) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([
    x, 0, 0, x + size, 0, 0, x, size, 0,
  ]), 3))
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array([
    0, 0, 1, 0, 0, 1, 0, 0, 1,
  ]), 3))
  geometry.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2]), 1))
  return geometry
}


/**
 * @param {object} mesh BatchedMesh
 * @param {number} batchId
 * @return {Array<number>} the instance's local positions, read back out of
 *   the batch buffers
 */
function positionsOf(mesh, batchId) {
  return Array.from(instanceGeometryAt(mesh, batchId).getAttribute('position').array)
}


/**
 * @param {object} mesh BatchedMesh
 * @param {number} x where to cast, straight down
 * @return {?number} nearest batch id hit
 */
function pickAt(mesh, x) {
  mesh.updateMatrixWorld(true)
  const raycaster = new Raycaster(new Vector3(x + 0.2, 0.2, 5), new Vector3(0, 0, -1))
  const hits = []
  mesh.raycast(raycaster, hits)
  hits.sort((a, b) => a.distance - b.distance)
  return hits.length === 0 ? null : hits[0].batchId
}


/**
 * Stand in for an engine whose `Math.max(...)` argument spread gives out at
 * `limit` arguments — JavaScriptCore's ~65k, scaled down so the test can
 * build a batch past it.
 *
 * @param {number} limit
 * @return {object} the jest spy (restore it)
 */
function tightSpreadEngine(limit) {
  const max = Math.max
  return jest.spyOn(Math, 'max').mockImplementation((...args) => {
    if (args.length > limit) {
      throw new RangeError('Maximum call stack size exceeded')
    }
    return max(...args)
  })
}


/**
 * A streamed (incremental-builder) batch exactly as `finalize` leaves it:
 * capacity trimmed to what was used (`trimCapacity_`), then decorated.
 *
 * @return {object} the decorated BatchedMesh
 */
function streamedBatch() {
  const builder = new IncrementalBatchedBuilder(unitTriangleApi(), 0)
  builder.appendBatch([0, 1, 2].map((i) => ({
    expressID: 100 + i,
    geometries: [{
      geometryExpressID: SHAPE_ID,
      flatTransformation: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, i * SPACING, 0, 0, 1],
      color: {x: 0.8, y: 0.8, z: 0.8, w: 1},
    }],
  })))
  const {batches} = builder.finalize()
  decorateBatchMeshes(batches)
  return batches[0].mesh
}


describe('viewer/ifc/batchedGeometryCapacity', () => {
  describe('addGeometry after load', () => {
    it('succeeds on a one-shot fresh-parse batch, which has no room left', () => {
      const mesh = decoratedStepBatch()
      // The premise: the builder sized the buffers exactly...
      expect(mesh.unusedVertexCount).toBe(0)
      // ...so three's own call is out of room.
      expect(() => mesh.addGeometry(triangleAt(0, 2))).toThrow(/exceeds the maximum buffer size/)
      const before = positionsOf(mesh, 3)

      const geometryId = addBatchedGeometry(mesh, triangleAt(0, 2))
      const batchId = addBatchedInstance(mesh, geometryId, createdRow(mesh, 400),
        new Matrix4().makeTranslation(40, 0, 0))

      expect(positionsOf(mesh, batchId)).toEqual([0, 0, 0, 2, 0, 0, 0, 2, 0])
      // The copy into the grown buffers kept every existing shape intact.
      expect(positionsOf(mesh, 3)).toEqual(before)
    })

    it('succeeds on a streamed batch that finalize trimmed to size', () => {
      const mesh = streamedBatch()
      expect(mesh.unusedVertexCount).toBe(0)
      expect(mesh.unusedIndexCount).toBe(0)

      const geometryId = addBatchedGeometry(mesh, triangleAt(0, 3))
      const batchId = addBatchedInstance(mesh, geometryId, createdRow(mesh, 400),
        new Matrix4())

      expect(positionsOf(mesh, batchId)).toEqual([0, 0, 0, 3, 0, 0, 0, 3, 0])
      expect(positionsOf(mesh, 0)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0])
    })

    it('grows with headroom, so the next small shape needs no reallocation', () => {
      const mesh = decoratedStepBatch()
      addBatchedGeometry(mesh, triangleAt(0, 2))
      const grown = mesh.geometry

      expect(ensureGeometryCapacity(mesh, 3, 3)).toBe(false)
      addBatchedGeometry(mesh, triangleAt(0, 3))

      expect(mesh.geometry).toBe(grown)
    })

    it('never spreads one argument per geometry into Math.max', () => {
      // 300 shapes against an engine that gives out at 100 arguments: three's
      // setGeometrySize spreads all 300 (BatchedMesh.js:1329) and throws.
      const count = 300
      const mesh = new BatchedMesh(count + 1, count * 3, count * 3, new MeshBasicMaterial())
      for (let k = 0; k < count; k++) {
        mesh.addInstance(mesh.addGeometry(triangleAt(k)))
      }
      const spread = tightSpreadEngine(100)
      try {
        expect(() => mesh.setGeometrySize(count * 4, count * 4)).toThrow(RangeError)

        const geometryId = addBatchedGeometry(mesh, triangleAt(count))

        expect(mesh.getGeometryRangeAt(geometryId).vertexStart).toBe(count * 3)
      } finally {
        spread.mockRestore()
      }
      // The private list three's check reads was put back.
      expect(mesh._geometryInfo).toHaveLength(count + 1)
    })

    it('leaves the batch exactly as it was when growth fails to allocate', () => {
      // three's setGeometrySize disposes the old geometry and advances the max
      // counts BEFORE `_initializeGeometry` allocates the new arrays
      // (BatchedMesh.js:1346-1360); that allocation is what runs out on a big
      // model.
      withBvhPrototypes(raycastActiveInstances, () => {
        const mesh = decoratedStepBatch()
        mesh.computeBoundsTree()
        const before = mesh.geometry
        const shapes = [0, 1, 2, 3].map((b) => positionsOf(mesh, b))
        const counts = [mesh._maxVertexCount, mesh._maxIndexCount, mesh.unusedVertexCount]
        const revision = batchEditRevision(mesh)
        mesh._initializeGeometry = () => {
          throw new RangeError('Array buffer allocation failed')
        }

        expect(() => addBatchedGeometry(mesh, triangleAt(0, 2))).toThrow(/allocation failed/)

        expect(mesh.geometry).toBe(before)
        expect(Object.keys(mesh.geometry.attributes).sort()).toEqual(['normal', 'position'])
        expect([mesh._maxVertexCount, mesh._maxIndexCount, mesh.unusedVertexCount]).toEqual(counts)
        expect(mesh._geometryInitialized).toBe(true)
        expect(mesh._geometryInfo.length).toBeGreaterThan(0)
        for (const tree of mesh.boundsTrees) {
          expect(tree.geometry).toBe(before)
        }
        // Nothing was added, so nothing was reported.
        expect(batchEditRevision(mesh)).toBe(revision)

        // And the batch is still usable: with memory back, the same add works
        // and every existing shape and pick survives it.
        delete mesh._initializeGeometry
        const geometryId = addBatchedGeometry(mesh, triangleAt(0, 2))
        const batchId = addBatchedInstance(mesh, geometryId, createdRow(mesh, 400),
          new Matrix4().makeTranslation(40, 0, 0))
        expect(positionsOf(mesh, batchId)).toEqual([0, 0, 0, 2, 0, 0, 0, 2, 0])
        expect([0, 1, 2, 3].map((b) => positionsOf(mesh, b))).toEqual(shapes)
        expect(pickAt(mesh, 3 * SPACING)).toBe(3)
      })
    })
  })

  describe('a collapsed cache-hit batch (synthesised geometry ranges)', () => {
    const ELEMENTS = 3

    /**
     * A batch built the way the collapsed reader builds it
     * (`instancedGlbToBatchedModel` → `addGeometryRanges`): one merged
     * upload, sized exactly, one geometry id per element range over it.
     *
     * @return {{mesh: object, ids: Array<number>, batchIds: Array<number>}}
     */
    function collapsedBatch() {
      const positions = []
      const normals = []
      const indices = []
      const ranges = []
      for (let k = 0; k < ELEMENTS; k++) {
        const x = k * SPACING
        positions.push(x, 0, 0, x + 1, 0, 0, x, 1, 0)
        normals.push(0, 0, 1, 0, 0, 1, 0, 0, 1)
        indices.push(k * 3, (k * 3) + 1, (k * 3) + 2)
        ranges.push({vertexStart: k * 3, vertexCount: 3, indexStart: k * 3, indexCount: 3})
      }
      const merged = new BufferGeometry()
      merged.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
      merged.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3))
      merged.setIndex(new BufferAttribute(new Uint32Array(indices), 1))
      const mesh = new BatchedMesh(ELEMENTS, ELEMENTS * 3, ELEMENTS * 3, new MeshBasicMaterial())
      const ids = addGeometryRanges(mesh, merged, ranges)
      const batchIds = ids.map((id) => {
        const batchId = mesh.addInstance(id)
        mesh.setMatrixAt(batchId, new Matrix4())
        return batchId
      })
      mesh.instanceParents = new Uint32Array([1, 2, 3])
      mesh.instanceOccurrenceIds = new Uint32Array([0, 1, 2])
      mesh.instanceColors = batchIds.map(() => ({x: 1, y: 1, z: 1, w: 1}))
      return {mesh, ids, batchIds}
    }

    it('adds a shape without moving any range, and every element still picks', () => {
      withBvhPrototypes(raycastActiveInstances, () => {
        const {mesh, ids, batchIds} = collapsedBatch()
        mesh.computeBoundsTree()
        const rangesBefore = ids.map((id) => ({...mesh.getGeometryRangeAt(id)}))
        const shapesBefore = batchIds.map((b) => positionsOf(mesh, b))
        const treesBefore = [...mesh.boundsTrees]

        const geometryId = addBatchedGeometry(mesh, triangleAt(ELEMENTS * SPACING))
        const added = addBatchedInstance(mesh, geometryId, createdRow(mesh, 4),
          new Matrix4())

        // Growth reallocated the buffers (the batch was sized exactly)...
        expect(mesh.unusedVertexCount).toBeGreaterThan(0)
        // ...and no range moved or changed shape.
        expect(ids.map((id) => ({...mesh.getGeometryRangeAt(id)}))).toEqual(rangesBefore)
        expect(batchIds.map((b) => positionsOf(mesh, b))).toEqual(shapesBefore)
        // The new shape was appended past the shared block, not into it.
        expect(mesh.getGeometryRangeAt(geometryId).vertexStart).toBe(ELEMENTS * 3)
        // The existing trees are the same objects — growth did not rebuild
        // them — now reading the grown buffer (the old one is free to go), and
        // the new id has a tree of its own.
        treesBefore.forEach((tree, k) => {
          expect(mesh.boundsTrees[k]).toBe(tree)
          expect(tree.geometry).toBe(mesh.geometry)
        })
        expect(mesh.boundsTrees[geometryId]).toBeTruthy()
        for (let k = 0; k < ELEMENTS; k++) {
          expect(pickAt(mesh, k * SPACING)).toBe(batchIds[k])
        }
        expect(pickAt(mesh, ELEMENTS * SPACING)).toBe(added)
      })
    })
  })
})
