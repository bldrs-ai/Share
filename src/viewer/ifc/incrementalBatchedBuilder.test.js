/* eslint-disable no-magic-numbers */
import {BatchedMesh, Matrix4} from 'three'
import {clearConwayDirectLogs, getConwayDirectLogs}
  from '../../../tools/jest/conwayDirectLogCapture'
import {IncrementalBatchedBuilder, PRESIZE_FROM_GEOMETRIES} from './incrementalBatchedBuilder'
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
 * @param {object} [opts]
 * @param {Set<number>} [opts.deletedGeomIds] ids whose GetGeometry call
 *   throws the embind "deleted object" error, simulating a conway#535
 *   budget eviction that lands between delivery and our reading it. The
 *   set is read per call, so a test can delete from it to model conway
 *   re-extracting the shape for a later product.
 * @return {object} mock Conway IfcAPI. `GetGeometry` is a jest.fn so
 *   tests can assert which ids were fetched, and how often.
 */
function makeApi(byGeomExpressId, opts = {}) {
  const deletedGeomIds = opts.deletedGeomIds ?? new Set()
  return {
    GetGeometry: jest.fn((_modelID, geomExpressID) => {
      if (deletedGeomIds.has(geomExpressID)) {
        // Matches the real embind wording (Sentry SHARE-1NK) so a
        // message-sniffing fallback would also see the right shape.
        throw new Error('Cannot pass deleted object as a pointer of type IfcGeometry')
      }
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
    }),
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


/**
 * @param {object} api mock from makeApi
 * @param {number} geomExpressID
 * @return {number} how many times GetGeometry was called for that id
 */
function callsFor(api, geomExpressID) {
  return api.GetGeometry.mock.calls.filter(([, id]) => id === geomExpressID).length
}


/**
 * The recenter diagnostics captured on the `[conwayDirect]` channel so far.
 * Filtered rather than taking the whole buffer: the channel also carries the
 * pipeline's parse-boundary lines.
 *
 * @return {Array<string>} message texts, in emission order
 */
function recenterLogs() {
  return getConwayDirectLogs()
    .filter(({text}) => /georeferenced model/.test(text))
    .map(({text}) => text)
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

  it('logs the recenter once across batches, and never for a near-origin model (Share#1632)', () => {
    // The retrospective (Share#1632, root cause conway#680) found the
    // recenter used to fire completely silently -- this pins the fix.
    // The line goes out on the [conwayDirect] channel, whose capturing sink
    // setupTests.js installs and clears before every test — so this asserts a
    // buffer instead of mutating the global console.
    const far = (tx, ty, tz) => ({
      expressID: 1,
      geometries: [{geometryExpressID: 999, flatTransformation:
        [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, ty, tz, 1], color: OPAQUE}],
    })
    const builder = new IncrementalBatchedBuilder(makeApi(shapes), 0)
    builder.appendBatch([far(2000000, 5, -8000000)]) // decides + logs the offset
    builder.appendBatch([far(2000010, 5, -8000020)]) // later batch: no second log
    builder.finalize()

    expect(recenterLogs()).toEqual(
      ['georeferenced model: recentering by [2000000, 5, -8000000] m (see Share#1632)'])

    clearConwayDirectLogs()
    const nearBuilder = new IncrementalBatchedBuilder(makeApi(shapes), 0)
    nearBuilder.appendBatch([flatMesh(1, [{geomExpressID: 999, color: OPAQUE}])])
    nearBuilder.finalize()
    expect(recenterLogs()).toHaveLength(0)
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

  it('skips one budget-evicted geometry without dropping the rest of the batch (SHARE-1NK)', () => {
    // conway's GEOMETRY_BUDGET_MB eviction (conwayDirectIfcLoader.js,
    // conway#535) can free geometry 777's native asset between the demand
    // pump delivering it and this call reading it, so GetGeometry throws
    // embind's "Cannot pass deleted object..." for that one id while 999
    // and 888 are unaffected. Before the fix this propagated out of
    // resolveGeometry_, appendBatch caught it at the batch level (or, pre
    // Sentry SHARE-1NK, ShareIfcLoader.js dropped the whole up-to-64-product
    // batch into the preview fallback) -- either way the healthy placements
    // in the SAME batch were lost too. They must survive now.
    const api = makeApi(shapes, {deletedGeomIds: new Set([777])})
    const builder = new IncrementalBatchedBuilder(api, 0)

    expect(() => builder.appendBatch([
      flatMesh(1, [{geomExpressID: 999, color: OPAQUE}]),
      flatMesh(2, [{geomExpressID: 777, color: OPAQUE}]),
      flatMesh(3, [{geomExpressID: 888, color: OPAQUE}]),
    ])).not.toThrow()

    // Still evicted in the next batch, so it fails again and is skipped
    // again -- but it IS re-fetched (see the retry test below for why the
    // suppression stops at the batch boundary).
    expect(() => builder.appendBatch([
      flatMesh(4, [{geomExpressID: 777, color: OPAQUE}]),
    ])).not.toThrow()

    const {stats} = builder.finalize()
    expect(stats.instanceCount).toBe(2) // 999 and 888 only
    expect(stats.skippedPlacedGeometries).toBe(2) // 777, once per batch it appeared in
    expect(callsFor(api, 777)).toBe(2) // once per batch, not once per placement
  })

  it('retries a transiently evicted geometry in the next batch, but not within the batch', () => {
    // A budget eviction is TRANSIENT: conway re-extracts the shape when a
    // later product maps it, so the id must not be blacklisted permanently
    // (codex P1 on Share#1798) -- every later placement reusing that shape
    // would be dropped for the rest of the load. Within ONE pump batch the
    // eviction state can't change, so a second placement of the same id
    // must not pay for another guaranteed-fail boundary call.
    const evicted = new Set([777])
    const api = makeApi({...shapes, 777: shapes[999]}, {deletedGeomIds: evicted})
    const builder = new IncrementalBatchedBuilder(api, 0)

    builder.appendBatch([
      flatMesh(1, [{geomExpressID: 777, color: OPAQUE}]),
      flatMesh(2, [{geomExpressID: 777, color: OPAQUE}]), // same batch, same eviction
    ])
    expect(callsFor(api, 777)).toBe(1)

    // Conway re-extracted it for a later product: the retry now succeeds.
    evicted.delete(777)
    builder.appendBatch([flatMesh(3, [{geomExpressID: 777, color: OPAQUE}])])
    expect(callsFor(api, 777)).toBe(2)

    const {stats, batches} = builder.finalize()
    expect(stats.instanceCount).toBe(1) // the recovered placement
    expect(stats.skippedPlacedGeometries).toBe(2) // both batch-1 placements
    expect(Array.from(batches[0].instanceParents)).toEqual([3])
  })

  it('never re-fetches a degenerate geometry, in this batch or any later one', () => {
    // The contrast case to the retry above: a zero-size shape is a property
    // of the SHAPE, not of eviction timing, so no later batch can do better
    // and badGeometry keeps it permanently.
    const degenerate = {vertexData: unitTriangleVerts(), indexData: new Uint32Array([])}
    const api = makeApi({...shapes, 666: degenerate})
    const builder = new IncrementalBatchedBuilder(api, 0)

    builder.appendBatch([
      flatMesh(1, [{geomExpressID: 666, color: OPAQUE}]),
      flatMesh(2, [{geomExpressID: 666, color: OPAQUE}]),
    ])
    builder.appendBatch([flatMesh(3, [{geomExpressID: 666, color: OPAQUE}])])

    expect(callsFor(api, 666)).toBe(1)
    const {stats} = builder.finalize()
    expect(stats.instanceCount).toBe(0)
    expect(stats.skippedPlacedGeometries).toBe(3)
  })

  it('skips a placement whose boundary read throws mid-append, keeping the tables aligned', () => {
    // Every Conway-boundary read is staged before the first mutation (codex
    // P2 on Share#1798). If `occurrencePath` threw AFTER addInstance, the
    // mesh would carry an instance that `cursor` and the pick tables never
    // recorded, and every later instance id would map to the wrong row of
    // selection metadata -- silently, since appendBatch keeps going.
    const api = makeApi(shapes)
    const builder = new IncrementalBatchedBuilder(api, 0)
    const poisoned = {
      geometryExpressID: 999,
      flatTransformation: IDENTITY_MAT,
      color: OPAQUE,
      get occurrencePath() {
        throw new Error('Cannot pass deleted object as a pointer of type PlacedGeometry')
      },
    }
    const moved = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 7, 0, 0, 1]

    expect(() => builder.appendBatch([
      {expressID: 1, geometries: [poisoned]},
      {expressID: 2, geometries: [
        {geometryExpressID: 999, flatTransformation: moved, color: OPAQUE},
      ]},
      flatMesh(3, [{geomExpressID: 888, color: OPAQUE}]),
    ])).not.toThrow()

    const {stats, batches} = builder.finalize()
    expect(stats.skippedPlacedGeometries).toBe(1)
    expect(stats.instanceCount).toBe(2) // the two healthy placements after it
    expect(batches).toHaveLength(1)
    const batch = batches[0]
    // No untracked instance: the mesh, the cursor and every pick table agree.
    expect(batch.mesh.instanceCount).toBe(stats.instanceCount)
    expect(builder.opaque.cursor).toBe(stats.instanceCount)
    for (const table of [batch.instanceParents, batch.instanceOccurrenceIds,
      batch.instanceGeometryIds, batch.instanceGeometry, batch.instanceColors]) {
      expect(table).toHaveLength(stats.instanceCount)
    }
    // ...and row i really describes instance i: parent 2's translated
    // transform sits at batchId 0, where instanceParents says it is.
    expect(Array.from(batch.instanceParents)).toEqual([2, 3])
    const m = new Matrix4()
    batch.mesh.getMatrixAt(0, m)
    expect(m.elements[12]).toBeCloseTo(7)
  })

  // ---------------------------------------------------------------------
  // Batch capacity (Share#1809). three r0.184's `setGeometrySize` spreads
  // one argument per active geometry into `Math.max(...)`
  // (three/src/objects/BatchedMesh.js:1329 and :1339), so past V8's
  // argument limit -- ~125k entries -- every growth call throws and the
  // batch can never be resized again. These pin both halves of the fix:
  // the builder must stop needing growth before it gets there, and a
  // growth that does throw must not leave its bookkeeping ahead of three's.
  // ---------------------------------------------------------------------

  /**
   * @param {number} n how many shapes to make
   * @return {object} `n` distinct single-triangle shapes, ids 1000..
   */
  function triangleShapes(n) {
    const out = {}
    for (let i = 0; i < n; i++) {
      out[1000 + i] = {vertexData: unitTriangleVerts(), indexData: new Uint32Array([0, 1, 2])}
    }
    return out
  }

  /**
   * Make a batch's `setGeometrySize` throw exactly the way three's does
   * once the mesh holds more than `limit` geometries: `validRanges` is
   * `[...this._geometryInfo].filter(info => info.active)`, and every entry
   * this builder adds stays active, so its length is what gets spread.
   *
   * @param {object} state builder batch state
   * @param {number} limit geometries the stand-in `Math.max(...)` survives
   */
  function capGeometrySize(state, limit) {
    const {mesh} = state
    const real = mesh.setGeometrySize.bind(mesh)
    mesh.setGeometrySize = (vertices, indices) => {
      if (mesh._geometryInfo.length > limit) {
        throw new RangeError('Maximum call stack size exceeded')
      }
      return real(vertices, indices)
    }
  }

  it('presizes past the growth ceiling so a large batch never needs another resize', () => {
    // The sp-946MB.ifc failure in miniature: growth stops working once the
    // batch holds more than SPREAD_LIMIT geometries, so the only way to
    // finish the model is to have reserved for it while growth still
    // worked. Ten shapes arrive one product at a time with the pump
    // reporting its progress; the projection fires at the second geometry
    // and must cover all ten. Without it the doubling walks into the
    // ceiling and the tail of the model is silently dropped.
    const SPREAD_LIMIT = 3
    const shapeCount = 10
    const all = triangleShapes(shapeCount)
    const builder = new IncrementalBatchedBuilder(makeApi(all), 0, {
      initialVertices: 3,
      initialIndices: 3,
      presizeFromGeometries: 2,
    })

    for (let i = 0; i < shapeCount; i++) {
      builder.setPumpProgress(i + 1, shapeCount)
      builder.appendBatch([flatMesh(i + 1, [{geomExpressID: 1000 + i, color: OPAQUE}])])
      if (i === 0) {
        capGeometrySize(builder.opaque, SPREAD_LIMIT)
      }
    }

    // One reservation carried the whole model: nothing was skipped, and
    // the capacity that survived the ceiling is the projected one -- 47 =
    // ceil(9 vertices needed / (2/9 of the model seen since this batch
    // opened) * 1.15 headroom), covering all 30 -- not the 12 that
    // doubling would have reached before the ceiling shut it out.
    expect(builder.opaque.maxVertices).toBe(47)
    const {stats} = builder.finalize()
    expect(stats.instanceCount).toBe(shapeCount)
    expect(stats.skippedPlacedGeometries).toBe(0)
    expect(stats.vertexCount).toBe(shapeCount * 3)
  })

  it('widens the reservation once the batch has one resize left', () => {
    // codex P1 on Share#1809: the linear projection tends to overshoot but
    // does not bound a model whose late products carry denser or more
    // novel geometry than its early ones. While resizes still work that
    // self-corrects at the next growth; past LAST_CHANCE_GEOMETRIES there
    // is no next growth, so the reservation widens from PRESIZE_HEADROOM
    // (1.15) to LAST_CHANCE_HEADROOM (1.5) -- "the rest of the model may
    // be up to 50% denser per product than everything so far".
    const all = triangleShapes(4)
    const builder = new IncrementalBatchedBuilder(makeApi(all), 0, {
      initialVertices: 3,
      initialIndices: 3,
      presizeFromGeometries: 2,
      lastChanceGeometries: 3,
    })

    // Three products in, 2 geometries held: projected, not yet last-chance.
    // 47 = ceil(9 needed / (2/9 seen since this batch opened) * 1.15).
    for (let i = 0; i < 3; i++) {
      builder.setPumpProgress(i + 1, 10)
      builder.appendBatch([flatMesh(i + 1, [{geomExpressID: 1000 + i, color: OPAQUE}])])
    }
    expect(builder.opaque.geometryCount).toBe(3)
    expect(builder.opaque.maxVertices).toBe(47)

    // Force one more resize with the batch now at the threshold. Need is
    // 48 vertices, seen is 6/9, so the projection alone would ask for
    // ceil(48 * 1.15 / (6/9)) = 83; the last-chance headroom asks for
    // ceil(48 * 1.5 / (6/9)) = 108.
    builder.opaque.usedVertices = 45
    builder.opaque.usedIndices = 45
    builder.setPumpProgress(7, 10)
    builder.appendBatch([flatMesh(4, [{geomExpressID: 1003, color: OPAQUE}])])

    expect(builder.opaque.maxVertices).toBe(108)
    expect(builder.opaque.maxIndices).toBe(108)
  })

  it('retries a placement whose resize threw, instead of calling it a duplicate', () => {
    // codex P2 on Share#1809. `seenPlacements` is a combined test-and-set
    // with no remove, so marking a placement before securing its capacity
    // records an identity for something that never landed: a later
    // emission of the SAME placement is then dropped as a duplicate of
    // nothing and counted as a coincident skip rather than appended.
    //
    // No path re-emits one today -- conway's pump promises each placed
    // instance exactly once, and the degraded builds construct a fresh
    // builder -- so this pins the invariant rather than a live bug, by
    // re-appending the failed placement directly.
    const all = triangleShapes(2)
    const builder = new IncrementalBatchedBuilder(makeApi(all), 0, {
      initialVertices: 3,
      initialIndices: 3,
    })
    builder.appendBatch([flatMesh(1, [{geomExpressID: 1000, color: OPAQUE}])])

    const {mesh} = builder.opaque
    const realSetGeometrySize = mesh.setGeometrySize.bind(mesh)
    mesh.setGeometrySize = () => {
      throw new RangeError('Maximum call stack size exceeded')
    }
    const retried = flatMesh(2, [{geomExpressID: 1001, color: OPAQUE}])
    builder.appendBatch([retried])
    expect(builder.opaque.cursor).toBe(1)

    // Capacity is available again and the identical placement comes back.
    // It must be appended, not classified as coincident with the instance
    // that was never created.
    mesh.setGeometrySize = realSetGeometrySize
    builder.appendBatch([retried])

    const {stats, batches} = builder.finalize()
    expect(stats.instanceCount).toBe(2)
    expect(stats.skippedCoincidentPlacements).toBe(0)
    expect(stats.skippedPlacedGeometries).toBe(1)
    expect(Array.from(batches[0].instanceParents)).toEqual([1, 2])
  })

  it('leaves capacity bookkeeping equal to three\'s when a resize throws', () => {
    // The second half of Share#1809: `ensureCapacity_` used to raise
    // maxVertices/maxIndices BEFORE calling setGeometrySize and never roll
    // back, so after a throw Share believed in space three had never
    // allocated. Every later placement then took the "no growth needed"
    // branch straight into addGeometry's "Reserved space request exceeds
    // the maximum buffer size" -- for the rest of the load.
    const all = triangleShapes(3)
    const builder = new IncrementalBatchedBuilder(makeApi(all), 0, {
      initialVertices: 3,
      initialIndices: 3,
    })
    builder.appendBatch([flatMesh(1, [{geomExpressID: 1000, color: OPAQUE}])])

    const {mesh} = builder.opaque
    const realSetGeometrySize = mesh.setGeometrySize.bind(mesh)
    mesh.setGeometrySize = () => {
      throw new RangeError('Maximum call stack size exceeded')
    }
    builder.appendBatch([flatMesh(2, [{geomExpressID: 1001, color: OPAQUE}])])

    // three refused to grow, so Share must still be describing the buffer
    // three actually has: 3 vertices, 3 indices, one geometry in it.
    expect(builder.opaque.maxVertices).toBe(3)
    expect(builder.opaque.maxIndices).toBe(3)
    expect(builder.opaque.usedVertices).toBe(3)
    expect(builder.opaque.cursor).toBe(1)

    // ...and because the two agree, the next placement is still routed
    // through growth rather than into a buffer that cannot hold it. With
    // the bookkeeping left inflated this second shape needs 6 vertices,
    // reads 6 as available, skips the resize and dies inside addGeometry.
    mesh.setGeometrySize = realSetGeometrySize
    builder.appendBatch([flatMesh(3, [{geomExpressID: 1002, color: OPAQUE}])])

    const {stats} = builder.finalize()
    expect(stats.instanceCount).toBe(2)
    expect(stats.skippedPlacedGeometries).toBe(1)
  })

  it('returns reserved-but-unused batch space at finalize', () => {
    // Byte-lever 2 of the conway#679 attribution report: 92.5 MB of the
    // 231 MB model's settled heap was batch capacity nothing ever used.
    // Here the three shapes need 9 vertices and the doubling reserved 12.
    const all = triangleShapes(3)
    const builder = new IncrementalBatchedBuilder(makeApi(all), 0, {
      initialVertices: 3,
      initialIndices: 3,
    })
    builder.appendBatch([
      flatMesh(1, [{geomExpressID: 1000, color: OPAQUE}]),
      flatMesh(2, [{geomExpressID: 1001, color: OPAQUE}]),
      flatMesh(3, [{geomExpressID: 1002, color: OPAQUE}]),
    ])
    expect(builder.opaque.maxVertices).toBe(12)

    const {batches, stats} = builder.finalize()
    expect(builder.opaque.maxVertices).toBe(9)
    // The buffer really shrank -- not just the number describing it.
    expect(batches[0].mesh.geometry.attributes.position.count).toBe(9)
    // ...and the model survived the copy intact.
    expect(stats.instanceCount).toBe(3)
    expect(stats.vertexCount).toBe(9)
    expect(Array.from(batches[0].instanceParents)).toEqual([1, 2, 3])
  })

  it('keeps the model when the finalize trim is the call that throws', () => {
    // A batch past three's spread limit cannot be resized in either
    // direction, so the trim has to be best-effort: a model that assembled
    // correctly must not be lost to an optimisation on the way out.
    const all = triangleShapes(3)
    const builder = new IncrementalBatchedBuilder(makeApi(all), 0, {
      initialVertices: 3,
      initialIndices: 3,
    })
    builder.appendBatch([
      flatMesh(1, [{geomExpressID: 1000, color: OPAQUE}]),
      flatMesh(2, [{geomExpressID: 1001, color: OPAQUE}]),
      flatMesh(3, [{geomExpressID: 1002, color: OPAQUE}]),
    ])
    capGeometrySize(builder.opaque, 0)

    const {batches, stats} = builder.finalize()
    expect(stats.instanceCount).toBe(3)
    expect(batches[0].mesh.geometry.attributes.position.count).toBe(12)
    expect(builder.opaque.maxVertices).toBe(12)
  })

  it('keeps growth working at the geometry count the presize takes over from', () => {
    // PRESIZE_FROM_GEOMETRIES only buys anything if `setGeometrySize` still
    // WORKS when the batch reaches it -- the whole point is to make the
    // last surviving resize the one that covers the rest of the model. The
    // limit is V8's argument cap on the `Math.max(...)` spread inside
    // three's setGeometrySize, it is stack-depth dependent rather than a
    // documented constant (measured at 125,279 entries when Share#1809 was
    // root-caused), so this asserts the margin on the engine actually
    // running rather than pinning the number.
    expect(() => Math.max(...new Array(PRESIZE_FROM_GEOMETRIES).fill(0))).not.toThrow()
  })

  it('skips one unreadable FlatMesh without dropping the rest of the batch', () => {
    // The same conway eviction can free a FlatMesh's own wrapper, not just
    // the geometry it points to -- reading `.expressID` off a deleted
    // vector element throws the same way. appendBatch must count and skip
    // that ONE FlatMesh and still append the healthy ones around it.
    const poisoned = {
      get expressID() {
        throw new Error('Cannot pass deleted object as a pointer of type FlatMesh')
      },
      geometries: [],
    }
    const builder = new IncrementalBatchedBuilder(makeApi(shapes), 0)

    expect(() => builder.appendBatch([
      flatMesh(1, [{geomExpressID: 999, color: OPAQUE}]),
      poisoned,
      flatMesh(3, [{geomExpressID: 888, color: OPAQUE}]),
    ])).not.toThrow()

    const {stats} = builder.finalize()
    expect(stats.instanceCount).toBe(2) // 999 and 888
    expect(stats.skippedFlatMeshes).toBe(1)
  })
})
