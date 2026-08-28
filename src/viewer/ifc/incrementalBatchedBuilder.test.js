/* eslint-disable no-magic-numbers */
import {BatchedMesh, Matrix4} from 'three'
import {IncrementalBatchedBuilder} from './incrementalBatchedBuilder'
import {flatMeshToBatchedModel} from './flatMeshToBatchedModel'
import {payloadToPreviewMesh} from './parsePreviewMesh'


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
      // Coplanar-tie stability: opaque batches draw in insertion order
      // (no per-frame camera sort); transparent keeps sorting to blend.
      expect(a.mesh.sortObjects).toBe(a.transparent)
      expect(b.mesh.sortObjects).toBe(b.transparent)
    }
  })

  it('keeps culling off while streaming, and restores it at finalize', () => {
    // three caches BatchedMesh.boundingSphere the first time it culls and
    // never invalidates it when instances append. Computed on frame one,
    // when a few instances sit in a mesh reserved for thousands, it
    // freezes near zero radius and culls every later batch -- the model
    // stays invisible for the whole stream and only appears at the end,
    // when assembleBatchedModel finally computes real bounds. The camera
    // follow derives its own bounds, so it tracks a model never drawn.
    const builder = new IncrementalBatchedBuilder(makeApi(shapes), 0)
    builder.appendBatch([flatMesh(1, [{geomExpressID: 999, color: OPAQUE}])])

    const streaming = [builder.opaque, builder.transparent].filter(Boolean)
    expect(streaming.length).toBeGreaterThan(0)
    for (const state of streaming) {
      expect(state.mesh.frustumCulled).toBe(false)
    }

    const {batches} = builder.finalize()
    for (const batch of batches) {
      expect(batch.mesh.frustumCulled).toBe(true)
      // Bounds are only meaningful once the mesh has stopped growing.
      expect(batch.mesh.boundingSphere).not.toBeNull()
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

  it('drops an exact coincident duplicate that arrives in a later delta batch', () => {
    // The demand pump can re-emit the same placement in a later batch
    // (conway's rel-aggregates re-extraction). Across batches, the coincident
    // duplicate must be dropped, not drawn twice (z-fighting).
    const builder = new IncrementalBatchedBuilder(makeApi(shapes), 0)
    builder.appendBatch([flatMesh(1, [{geomExpressID: 999, color: OPAQUE}])])
    builder.appendBatch([flatMesh(1, [{geomExpressID: 999, color: OPAQUE}])]) // exact dup
    const {stats, batches} = builder.finalize()
    expect(stats.instanceCount).toBe(1)
    expect(stats.skippedCoincidentPlacements).toBe(1)
    expect(batches[0].instanceParents).toHaveLength(1)
  })

  it('releases the duplicate guard at finalize', () => {
    // The guard is load-time only and peaks exactly when the load ends, so
    // holding it past finalize is pure retention (conway#636 measured
    // 396.65 MB of it on D3D).
    const builder = new IncrementalBatchedBuilder(makeApi(shapes), 0)
    builder.appendBatch([flatMesh(1, [{geomExpressID: 999, color: OPAQUE}])])
    expect(builder.seenPlacements.size).toBe(1)
    builder.finalize()
    expect(builder.seenPlacements.size).toBe(0)
  })

  it('keeps same-shape placements that differ in transform', () => {
    const moved = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 0, 0, 1]
    const builder = new IncrementalBatchedBuilder(makeApi(shapes), 0)
    builder.appendBatch([{
      expressID: 1,
      geometries: [
        {geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: OPAQUE},
        {geometryExpressID: 999, flatTransformation: moved, color: OPAQUE},
      ],
    }])
    const {stats} = builder.finalize()
    expect(stats.instanceCount).toBe(2)
    expect(stats.skippedCoincidentPlacements).toBe(0)
  })

  it('recenters a georeferenced model across batches with one shared offset', () => {
    // The browser demand open hands back raw LV95-scale placements. The
    // offset is decided on the first placement and every later batch subtracts
    // the SAME value, so the model stays coherent as it streams in.
    const far = (tx, ty, tz) => ({
      expressID: 1,
      geometries: [{geometryExpressID: 999, flatTransformation:
        [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, ty, tz, 1], color: OPAQUE}],
    })
    const builder = new IncrementalBatchedBuilder(makeApi(shapes), 0)
    builder.appendBatch([far(2000000, 5, -8000000)]) // first: sets the offset
    builder.appendBatch([far(2000010, 5, -8000020)]) // 10m / 20m away
    const {batches} = builder.finalize()
    expect(builder.root.userData.coordinationOffset).toEqual([2000000, 5, -8000000])
    const m = new Matrix4()
    batches[0].mesh.getMatrixAt(0, m)
    expect(m.elements[12]).toBeCloseTo(0)
    expect(m.elements[14]).toBeCloseTo(0)
    batches[0].mesh.getMatrixAt(1, m) // second instance recentered by the same offset
    expect(m.elements[12]).toBeCloseTo(10)
    expect(m.elements[14]).toBeCloseTo(-20)
  })

  it('leaves a near-origin model untouched (no offset stamped)', () => {
    const builder = new IncrementalBatchedBuilder(makeApi(shapes), 0)
    builder.appendBatch([flatMesh(1, [{geomExpressID: 999, color: OPAQUE}])])
    builder.finalize()
    expect(builder.coordination.offset).toBeNull()
    expect(builder.root.userData.coordinationOffset).toBeUndefined()
  })

  it('shares one recentre frame with the preview path, builder deciding', () => {
    // The two stream onto the screen together, so a frame they disagree
    // on strands the preview where the durable model never goes — and
    // only the durable builder may DECIDE the frame: the preview channel
    // can emit payloads whose placement never resolved (conway#465), so
    // a preview-latched frame could shift the whole durable model by a
    // bogus payload's error.
    const placedAt = (tx, ty, tz) => ({
      expressID: 1,
      geometries: [{geometryExpressID: 999, flatTransformation:
        [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, ty, tz, 1], color: OPAQUE}],
    })
    const coordination = {offset: undefined}
    const builder = new IncrementalBatchedBuilder(makeApi(shapes), 0, {coordination})
    builder.appendBatch([placedAt(2000000, 5, -8000000)])
    builder.finalize()

    expect(coordination.offset).toEqual([2000000, 5, -8000000])

    // A preview payload placed at the same site coordinates now lands in
    // the same frame -- near the origin, not a megametre away.
    const mesh = payloadToPreviewMesh(
      {
        geometryExpressID: 999,
        color: {x: 1, y: 1, z: 1, w: 1},
        vertexData: unitTriangleVerts(),
        indexData: new Uint32Array([0, 1, 2]),
        flatTransformation: [
          1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2000000, 5, -8000000, 1,
        ],
      },
      new Map(), new Map(), coordination)

    expect(mesh.matrix.elements[12]).toBeCloseTo(0)
    expect(mesh.matrix.elements[14]).toBeCloseTo(0)
  })

  it('a preview before the builder decides renders raw and never latches', () => {
    // Before the first durable batch there is no trustworthy frame.
    // The preview must not decide one — a mis-placed payload would
    // shift every later durable instance, and a near-origin payload on
    // a large-coordinate model would latch null and disable recentring.
    const coordination = {offset: undefined}
    const mesh = payloadToPreviewMesh(
      {
        geometryExpressID: 999,
        color: {x: 1, y: 1, z: 1, w: 1},
        vertexData: unitTriangleVerts(),
        indexData: new Uint32Array([0, 1, 2]),
        flatTransformation: [
          1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2000000, 5, -8000000, 1,
        ],
      },
      new Map(), new Map(), coordination)

    expect(coordination.offset).toBeUndefined()
    expect(mesh.matrix.elements[12]).toBeCloseTo(2000000)
    expect(mesh.matrix.elements[14]).toBeCloseTo(-8000000)
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
