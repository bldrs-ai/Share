
import {BatchedMesh} from 'three'
import {IncrementalBatchedBuilder} from './incrementalBatchedBuilder'
import {flatMeshToBatchedModel} from './flatMeshToBatchedModel'


// First rebased instance must land exactly at the origin (fp-exact
// subtraction of its own translation).
const ORIGIN_EPSILON = 1e-6

const IDENTITY_MAT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
const OPAQUE = {x: 0.8, y: 0.8, z: 0.8, w: 1}
const GLASS = {x: 0.6, y: 0.8, z: 1, w: 0.4}


/** @return {Float32Array} single-triangle interleaved verts (p+n). */
function unitTriangleVerts() {
  return new Float32Array([
    0, 0, 0, 0, 0, 1,
    1, 0, 0, 0, 0, 1,
    0, 1, 0, 0, 0, 1,
  ])
}


/**
 * @param {object} byGeomExpressId geomExpressID → {vertexData, indexData}
 * @return {object} mock Conway IfcAPI
 */
function makeApi(byGeomExpressId) {
  return {
    GetGeometry(_modelID, geomExpressID) {
      const g = byGeomExpressId[geomExpressID]
      if (!g) {
        return null
      }
      return {
        GetVertexData: () => geomExpressID,
        GetIndexData: () => geomExpressID,
        GetVertexDataSize: () => g.vertexData.length,
        GetIndexDataSize: () => g.indexData.length,
      }
    },
    GetVertexArray(ptr) {
      return byGeomExpressId[ptr].vertexData
    },
    GetIndexArray(ptr) {
      return byGeomExpressId[ptr].indexData
    },
  }
}


/**
 * @param {number} expressID parent product id
 * @param {Array} placements [{geomExpressID, color}]
 * @return {object} FlatMesh-shaped object
 */
function flatMesh(expressID, placements) {
  return {
    expressID,
    geometries: placements.map(({geomExpressID, color}) => ({
      geometryExpressID: geomExpressID,
      flatTransformation: IDENTITY_MAT,
      color,
    })),
  }
}


describe('IncrementalBatchedBuilder', () => {
  const shapes = {
    999: {vertexData: unitTriangleVerts(), indexData: new Uint32Array([0, 1, 2])},
    888: {vertexData: unitTriangleVerts(), indexData: new Uint32Array([0, 1, 2])},
  }

  it('matches the one-shot builder across split appends', () => {
    const stream = [
      flatMesh(1, [{geomExpressID: 999, color: OPAQUE}]),
      flatMesh(2, [{geomExpressID: 999, color: OPAQUE}, {geomExpressID: 888, color: GLASS}]),
      flatMesh(3, [{geomExpressID: 888, color: OPAQUE}]),
    ]
    const oneShot = flatMeshToBatchedModel(stream, makeApi(shapes), 0)

    const builder = new IncrementalBatchedBuilder(makeApi(shapes), 0)
    builder.appendBatch([stream[0]])
    builder.appendBatch([stream[1], stream[2]])
    const incremental = builder.finalize()

    expect(incremental.stats).toEqual(oneShot.stats)
    expect(incremental.batches).toHaveLength(oneShot.batches.length)
    for (let where = 0; where < incremental.batches.length; where++) {
      const a = incremental.batches[where]
      const b = oneShot.batches[where]
      expect(a.transparent).toBe(b.transparent)
      expect(Array.from(a.instanceParents)).toEqual(Array.from(b.instanceParents))
      expect(Array.from(a.instanceOccurrenceIds)).toEqual(Array.from(b.instanceOccurrenceIds))
      expect(a.mesh).toBeInstanceOf(BatchedMesh)
    }
  })

  it('grows capacity in place across small initial limits', () => {
    const builder = new IncrementalBatchedBuilder(makeApi(shapes), 0, {
      initialInstances: 1, initialVertices: 3, initialIndices: 3,
    })
    for (let product = 1; product <= 5; product++) {
      builder.appendBatch([flatMesh(product, [
        {geomExpressID: 999, color: OPAQUE},
        {geomExpressID: 888, color: OPAQUE},
      ])])
    }
    const {batches, stats} = builder.finalize()
    expect(stats.instanceCount).toBe(10)
    expect(stats.uniqueGeometryCount).toBe(2)
    expect(batches).toHaveLength(1)
    expect(batches[0].instanceParents).toHaveLength(10)
  })

  it('rebases instances against a floating origin at georeferenced scale', () => {
    // A Swiss-LV95-magnitude placement: the stored instance matrix must
    // be SMALL (float32-texture safe) with the big translation carried
    // on the root group's matrix; bounds still report in world frame.
    const EAST = 2_600_000.25
    const NORTH = 1_200_000.5
    const bigMat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, EAST, NORTH, 0, 1]
    const boxes = []
    const builder = new IncrementalBatchedBuilder(makeApi(shapes), 0, {
      onBounds: (box) => boxes.push(box.clone()),
    })
    builder.appendBatch([{
      expressID: 1,
      geometries: [
        {geometryExpressID: 999, flatTransformation: bigMat, color: OPAQUE},
        {geometryExpressID: 888,
          flatTransformation: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, EAST + 5, NORTH, 0, 1],
          color: OPAQUE},
      ],
    }])
    // Root carries the origin; userData advertises it for the loader's
    // coordination-stamp composition.
    expect(builder.root.userData.floatingOrigin).toEqual([EAST, NORTH, 0])
    expect(builder.root.matrix.elements[12]).toBe(EAST)
    // Stored instance translations are near zero (first) and small (second).
    const {batches} = builder.finalize()
    const m = new (require('three').Matrix4)()
    batches[0].mesh.getMatrixAt(0, m)
    expect(Math.abs(m.elements[12])).toBeLessThan(ORIGIN_EPSILON)
    batches[0].mesh.getMatrixAt(1, m)
    expect(m.elements[12]).toBeCloseTo(5, 5)
    // Bounds stayed world-frame (camera follow / final fit read these).
    expect(boxes[0].max.x).toBeGreaterThan(EAST - 1)
  })

  it('reports bounds per appended instance and skips bad geometry', () => {
    const boxes = []
    const builder = new IncrementalBatchedBuilder(makeApi(shapes), 0, {
      onBounds: (box) => boxes.push(box.clone()),
    })
    builder.appendBatch([
      flatMesh(1, [{geomExpressID: 999, color: OPAQUE}]),
      flatMesh(2, [{geomExpressID: 12345, color: OPAQUE}]),
    ])
    expect(boxes).toHaveLength(1)
    expect(boxes[0].max.x).toBeCloseTo(1)
    const {stats} = builder.finalize()
    expect(stats.skippedPlacedGeometries).toBe(1)
    expect(builder.hasContent()).toBe(true)
  })
})
