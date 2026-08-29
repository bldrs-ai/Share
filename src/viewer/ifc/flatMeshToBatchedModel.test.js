/* eslint-disable no-magic-numbers */
import {BatchedMesh, Matrix4} from 'three'
import {CoincidenceSet, DEFAULT_COLOR, flatMeshToBatchedModel} from './flatMeshToBatchedModel'


/** Identity 4x4 in three.js column-major flat form. */
const IDENTITY_MAT = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]

const OPAQUE = {x: 0.8, y: 0.8, z: 0.8, w: 1}
const GLASS = {x: 0.6, y: 0.8, z: 1, w: 0.4}


/** @return {Float32Array} single-triangle interleaved vert buffer (p+n). */
function unitTriangleVerts() {
  return new Float32Array([
    0, 0, 0, 0, 0, 1,
    1, 0, 0, 0, 0, 1,
    0, 1, 0, 0, 0, 1,
  ])
}


/**
 * @param {object} byGeomExpressId map of geomExpressID → {vertexData, indexData}
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


/** @return {object} api with one unit-triangle shape at id 999. */
function unitTriApi() {
  return makeApi({999: {vertexData: unitTriangleVerts(), indexData: new Uint32Array([0, 1, 2])}})
}


describe('viewer/ifc/flatMeshToBatchedModel', () => {
  it('builds one opaque batch: one geometry per shape, one instance per placement', () => {
    const flatMeshes = [{
      expressID: 100,
      geometries: {
        size: () => 3,
        // Three real instances of the shared shape at DISTINCT transforms
        // (translated along x). Distinct so the coincident-duplicate guard
        // doesn't (correctly) fold them into one — see the dedup test below.
        get: (where) => ({
          geometryExpressID: 999,
          flatTransformation: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, where, 0, 0, 1],
          color: OPAQUE,
        }),
      },
    }]
    const {batches, stats} = flatMeshToBatchedModel(flatMeshes, unitTriApi(), 0)
    expect(batches.length).toBe(1)
    expect(batches[0].transparent).toBe(false)
    expect(batches[0].mesh).toBeInstanceOf(BatchedMesh)
    expect(stats.uniqueGeometryCount).toBe(1) // one shared shape
    expect(stats.instanceCount).toBe(3) // three placements
    expect(stats.vertexCount).toBe(3) // stored once (not 9)
    expect(stats.transparentInstanceCount).toBe(0)
    expect(Array.from(batches[0].instanceParents)).toEqual([100, 100, 100])
    expect(Array.from(batches[0].instanceOccurrenceIds)).toEqual([0, 1, 2])
  })

  it('splits opaque and transparent placements into separate batches', () => {
    // Same shape, one opaque + one glass placement → two batches.
    const flatMeshes = [{
      expressID: 100,
      geometries: [
        {geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: OPAQUE},
        {geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: GLASS},
      ],
    }]
    const {batches, stats} = flatMeshToBatchedModel(flatMeshes, unitTriApi(), 0)
    expect(batches.length).toBe(2)
    const opaque = batches.find((b) => !b.transparent)
    const transparent = batches.find((b) => b.transparent)
    expect(opaque.material.transparent).toBe(false)
    expect(transparent.material.transparent).toBe(true)
    expect(transparent.material.depthWrite).toBe(false)
    // Coplanar-tie stability: opaque draws in insertion order (no
    // per-frame camera sort); transparent must keep sorting for blending.
    expect(opaque.mesh.sortObjects).toBe(false)
    expect(transparent.mesh.sortObjects).toBe(true)
    expect(stats.transparentInstanceCount).toBe(1)
    expect(stats.materialCount).toBe(2)
    // The occurrence id space is global across both batches (emission order).
    expect(Array.from(opaque.instanceOccurrenceIds)).toEqual([0])
    expect(Array.from(transparent.instanceOccurrenceIds)).toEqual([1])
  })

  it('emits only an opaque batch when nothing is transparent', () => {
    const flatMeshes = [
      {expressID: 100, geometries: [{geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: OPAQUE}]},
      {expressID: 200, geometries: [{geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: OPAQUE}]},
    ]
    const {batches, stats} = flatMeshToBatchedModel(flatMeshes, unitTriApi(), 0)
    expect(batches.length).toBe(1)
    expect(stats.uniqueGeometryCount).toBe(1) // shared across two products
    expect(stats.instanceCount).toBe(2)
    expect(Array.from(batches[0].instanceParents)).toEqual([100, 200])
  })

  it('skips a bad geometry once (no redundant re-fetch) and counts each skipped placement', () => {
    let getGeometryCalls = 0
    const api = makeApi({999: {vertexData: unitTriangleVerts(), indexData: new Uint32Array([0, 1, 2])}})
    const wrapped = {...api, GetGeometry(m, id) {
      getGeometryCalls++
      // eslint-disable-next-line new-cap
      return api.GetGeometry(m, id)
    }}
    const flatMeshes = [{
      expressID: 100,
      geometries: [
        {geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: OPAQUE},
        {geometryExpressID: 777, flatTransformation: IDENTITY_MAT, color: OPAQUE}, // bad, ref'd twice
        {geometryExpressID: 777, flatTransformation: IDENTITY_MAT, color: OPAQUE},
      ],
    }]
    const {stats} = flatMeshToBatchedModel(flatMeshes, wrapped, 0)
    expect(stats.skippedPlacedGeometries).toBe(2) // each bad placement counted
    // GetGeometry called once for 999 + once for 777 (not twice) = 2.
    expect(getGeometryCalls).toBe(2)
  })

  it('drops exact coincident duplicate placements (same part+geometry+transform+colour)', () => {
    // Conway's rel-aggregates re-extraction appends a second placement of a
    // cut part instead of replacing it → the same solid drawn twice at the
    // same spot → z-fighting. The builder must keep only one.
    const flatMeshes = [{
      expressID: 100,
      geometries: [
        {geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: OPAQUE},
        {geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: OPAQUE}, // exact dup
      ],
    }]
    const {batches, stats} = flatMeshToBatchedModel(flatMeshes, unitTriApi(), 0)
    expect(stats.instanceCount).toBe(1)
    expect(stats.skippedCoincidentPlacements).toBe(1)
    expect(Array.from(batches[0].instanceParents)).toEqual([100])
  })

  it('keeps coincident placements that differ in transform or colour', () => {
    const moved = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 0, 0, 1] // same shape, +5 on x
    const flatMeshes = [{
      expressID: 100,
      geometries: [
        {geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: OPAQUE},
        {geometryExpressID: 999, flatTransformation: moved, color: OPAQUE}, // different transform
        {geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: GLASS}, // different colour
      ],
    }]
    const {stats} = flatMeshToBatchedModel(flatMeshes, unitTriApi(), 0)
    expect(stats.instanceCount).toBe(3)
    expect(stats.skippedCoincidentPlacements).toBe(0)
  })

  it('recenters a georeferenced model to the origin and reports the offset', () => {
    // Conway's browser demand open hands back raw source-world (e.g. Swiss
    // LV95) placements at ~1e6-1e7 m, where float32 loses ~1m — the model
    // must be recentered or it swims on rotate. Column-major translation in
    // elements 12/13/14.
    const far = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2000000.4, 5, -8000000.6, 1]
    const flatMeshes = [{
      expressID: 100,
      geometries: [{geometryExpressID: 999, flatTransformation: far, color: OPAQUE}],
    }]
    const {batches, coordinationOffset} = flatMeshToBatchedModel(flatMeshes, unitTriApi(), 0)
    // Offset is the rounded translation of the first placement.
    expect(coordinationOffset).toEqual([2000000, 5, -8000001])
    // The instance renders back near the origin (raw − offset).
    const m = new Matrix4()
    batches[0].mesh.getMatrixAt(0, m)
    expect(m.elements[12]).toBeCloseTo(0.4)
    expect(m.elements[13]).toBeCloseTo(0)
    expect(m.elements[14]).toBeCloseTo(0.4)
  })

  it('leaves a near-origin model untouched (no recenter)', () => {
    const near = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 12, 3, -45, 1]
    const flatMeshes = [{
      expressID: 100,
      geometries: [{geometryExpressID: 999, flatTransformation: near, color: OPAQUE}],
    }]
    const {batches, coordinationOffset} = flatMeshToBatchedModel(flatMeshes, unitTriApi(), 0)
    expect(coordinationOffset).toBeNull()
    const m = new Matrix4()
    batches[0].mesh.getMatrixAt(0, m)
    expect(m.elements[12]).toBeCloseTo(12)
    expect(m.elements[14]).toBeCloseTo(-45)
  })

  it('skips FlatMeshes without an expressID', () => {
    const flatMeshes = [
      {expressID: undefined, geometries: [{geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: OPAQUE}]},
      {expressID: 100, geometries: [{geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: OPAQUE}]},
    ]
    const {batches, stats} = flatMeshToBatchedModel(flatMeshes, unitTriApi(), 0)
    expect(stats.skippedFlatMeshes).toBe(1)
    expect(stats.instanceCount).toBe(1)
    expect(batches.length).toBe(1)
  })
})


describe('CoincidenceSet', () => {
  // The duplicate guard silently DROPS geometry when two distinct placements
  // are treated as one, so these pin its discriminating power field by field:
  // the 85-bit fingerprint (conway#636) must separate everything the old
  // string key separated, and merge everything it merged.

  const RED = {x: 1, y: 0, z: 0, w: 1}

  /** @return {Array<number>} a fresh identity matrix (mutable per test) */
  const mat = () => IDENTITY_MAT.slice()

  it('reports the first placement new and an exact repeat duplicate', () => {
    const seen = new CoincidenceSet()
    expect(seen.add(100, 999, mat(), RED)).toBe(true)
    expect(seen.add(100, 999, mat(), RED)).toBe(false)
    expect(seen.size).toBe(1)
  })

  it('discriminates parent and geometry express ids', () => {
    const seen = new CoincidenceSet()
    expect(seen.add(100, 999, mat(), RED)).toBe(true)
    expect(seen.add(101, 999, mat(), RED)).toBe(true)
    expect(seen.add(100, 998, mat(), RED)).toBe(true)
    expect(seen.size).toBe(3)
  })

  it('discriminates every one of the 16 matrix slots independently', () => {
    // A slot-blind key (e.g. one that summed or xor-ed the components) would
    // pass a spot check on the translation row and still lose rotations.
    const seen = new CoincidenceSet()
    expect(seen.add(100, 999, mat(), RED)).toBe(true)
    for (let i = 0; i < 16; i++) {
      const perturbed = mat()
      perturbed[i] += 1
      expect(seen.add(100, 999, perturbed, RED)).toBe(true)
    }
    expect(seen.size).toBe(17)
  })

  it('discriminates every colour channel, alpha included', () => {
    const seen = new CoincidenceSet()
    expect(seen.add(100, 999, mat(), {x: 0.5, y: 0.5, z: 0.5, w: 1})).toBe(true)
    expect(seen.add(100, 999, mat(), {x: 0.6, y: 0.5, z: 0.5, w: 1})).toBe(true)
    expect(seen.add(100, 999, mat(), {x: 0.5, y: 0.6, z: 0.5, w: 1})).toBe(true)
    expect(seen.add(100, 999, mat(), {x: 0.5, y: 0.5, z: 0.6, w: 1})).toBe(true)
    expect(seen.add(100, 999, mat(), {x: 0.5, y: 0.5, z: 0.5, w: 0.4})).toBe(true)
    expect(seen.size).toBe(5)
  })

  it('treats -0 and +0 as the same component in every matrix slot', () => {
    // Conway emits signed zeros in rotation terms; a key that distinguished
    // them would let a true duplicate through and z-fight. The `| 0` collapse
    // is what prevents that.
    const seen = new CoincidenceSet()
    expect(seen.add(100, 999, mat(), RED)).toBe(true)
    for (let i = 0; i < 16; i++) {
      const negZero = mat()
      if (negZero[i] !== 0) {
        continue
      }
      negZero[i] = -0
      expect(seen.add(100, 999, negZero, RED)).toBe(false)
    }
    expect(seen.size).toBe(1)
  })

  it('quantizes at COINCIDENCE_QUANT: sub-tick noise merges, a tick apart splits', () => {
    const seen = new CoincidenceSet()
    expect(seen.add(100, 999, mat(), RED)).toBe(true)
    const noisy = mat()
    noisy[12] = 1e-5 // below the 1e-4 tick: float noise, still the same spot
    expect(seen.add(100, 999, noisy, RED)).toBe(false)
    const moved = mat()
    moved[12] = 1e-4 // exactly one tick: a distinct placement
    expect(seen.add(100, 999, moved, RED)).toBe(true)
    const noisyColor = {x: 1, y: 1e-5, z: 0, w: 1}
    expect(seen.add(100, 999, mat(), noisyColor)).toBe(false)
    expect(seen.size).toBe(2)
  })

  it('treats a missing colour as DEFAULT_COLOR', () => {
    const seen = new CoincidenceSet()
    const grey = {x: DEFAULT_COLOR.x, y: DEFAULT_COLOR.y, z: DEFAULT_COLOR.z, w: DEFAULT_COLOR.w}
    expect(seen.add(100, 999, mat(), null)).toBe(true)
    expect(seen.add(100, 999, mat(), undefined)).toBe(false)
    expect(seen.add(100, 999, mat(), grey)).toBe(false)
    expect(seen.size).toBe(1)
  })

  it('keeps thousands of distinct placements distinct', () => {
    // A scale check: 5,000 placements that differ only in transform stay
    // distinct, and every one is still recognised on a second pass. That
    // catches an identity that degrades in bulk — a key that aliases once
    // the table grows, or a lookup that stops finding what it stored.
    //
    // Two things this does NOT guard, both covered elsewhere:
    //
    // 1. The primary-collision chain. At n = 5,000 against a 32-bit primary
    //    the expected collision count is ~0.003, i.e. this walks the
    //    empty-slot path essentially every time and never enters the
    //    `number` → `Array` branch. `separates two placements that collide
    //    on the primary hash` below exercises that deliberately.
    // 2. Fingerprint *width*. A birthday collision needs 2^bits ≲ n²/2, so
    //    at n = 5,000 this only detects a fingerprint weakened below ~24
    //    bits total; truncating each of the three streams to 16 bits still
    //    leaves ~37 effective bits and passes here. Width is argued
    //    analytically in `CoincidenceSet`'s doc comment (85 bits → 4e-15
    //    per load), not pinned by this test.
    //
    // So don't read a pass here as evidence of either property.
    const seen = new CoincidenceSet()
    const count = 5000
    for (let i = 0; i < count; i++) {
      const m = mat()
      m[12] = i * 0.001
      m[13] = (i % 7) * 0.25
      expect(seen.add(1000 + (i % 13), 900 + (i % 17), m, RED)).toBe(true)
    }
    expect(seen.size).toBe(count)
    // And every one of them is still recognised as already present.
    for (let i = 0; i < count; i++) {
      const m = mat()
      m[12] = i * 0.001
      m[13] = (i % 7) * 0.25
      expect(seen.add(1000 + (i % 13), 900 + (i % 17), m, RED)).toBe(false)
    }
    expect(seen.size).toBe(count)
  })

  it('separates two placements that collide on the primary hash', () => {
    // The chaining branch is what stops a 32-bit primary collision from
    // silently deleting geometry, and on a 562k-placement load ~37 pairs
    // collide, so it runs in production every time. Random data will not
    // reach it (see the note in the 5,000-placement test), so this pair is
    // CONSTRUCTED to collide.
    //
    // How: every step of the primary stream is a bijection on 32 bits
    // (`imul` by an odd constant, xor, rotate, and `fmix32`). So with the
    // matrix and colour held fixed, two placements share a primary exactly
    // when their accumulators agree after word 1, i.e. when
    //   after0(parentA) ^ geomA === after0(parentB) ^ geomB
    // where after0(p) = rotl13(imul(FP_SEED_A ^ p, FP_MUL_A)). Solving for
    // geomB with parentA=1001, geomA=777, parentB=1002 gives 1066869609.
    //
    // A consequence worth knowing: because those steps are bijections,
    // varying a SINGLE word can never collide — a collision needs at least
    // two words to differ, which is why this pair varies both ids.
    const seen = new CoincidenceSet()
    expect(seen.add(1001, 777, mat(), RED)).toBe(true)
    expect(seen.add(1002, 1066869609, mat(), RED)).toBe(true)
    // Guard: if the hash constants ever change this pair stops colliding and
    // the test would keep passing while testing nothing. Assert the collision
    // really happened — one bucket holding an array — so that silent rot
    // fails loudly instead. Recompute the pair with the formula above.
    expect(seen.byPrimary_.size).toBe(1)
    expect(Array.isArray([...seen.byPrimary_.values()][0])).toBe(true)
    // Both distinct placements survive...
    expect(seen.size).toBe(2)
    // ...and each is still recognised through the chain rather than the
    // empty-slot path.
    expect(seen.add(1001, 777, mat(), RED)).toBe(false)
    expect(seen.add(1002, 1066869609, mat(), RED)).toBe(false)
    expect(seen.size).toBe(2)
  })

  it('forgets everything on clear (what finalize() releases)', () => {
    const seen = new CoincidenceSet()
    seen.add(100, 999, mat(), RED)
    seen.clear()
    expect(seen.size).toBe(0)
    expect(seen.add(100, 999, mat(), RED)).toBe(true)
  })
})
