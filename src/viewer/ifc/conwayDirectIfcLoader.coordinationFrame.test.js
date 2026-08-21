/* eslint-disable no-magic-numbers */
// The recentre frame the geometry worker pool hands its workers.
//
// This is the assertion no count can make. conway APPLIES a supplied frame
// instead of deriving one, so a pool that supplies identity suppresses the
// recentre and the Z-up -> Y-up normalize with it — and vertices, triangles,
// instances and placements are every one of them rotation-invariant, so the
// model lies on its side while the load report reads clean. Share#1761.
//
// The engine is faked rather than run because what matters here is WHEN the
// frame anchors relative to the products pumped, and a real model anchors on
// whichever product happens to carry the first representation. The fake makes
// that depth an input.
import {deriveCoordinationFrame} from './conwayDirectIfcLoader'


/* The frame a Share open actually applies: COORDINATE_TO_ORIGIN's Z-up ->
 * Y-up normalize. Every IFC fixture measured against conway 1.543 reports
 * this one. */
const ANCHORED = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1]
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


/**
 * A deferred model that anchors its frame only once it has extracted a
 * product that actually emits geometry.
 *
 * `geometryAt` is the 1-based product index carrying the first
 * representation — everything before it extracts (conway counts it in
 * `extracted`) and emits no FlatMesh, which is exactly what an
 * assembly-first export looks like: on the AISC/SDS-2 steel fixture the
 * first 49 products are IfcElementAssembly containers and the frame does not
 * anchor until the 50th.
 *
 * @param {number} products how many products the model has
 * @param {number} geometryAt 1-based index of the first with geometry, or 0
 *   for a model that never anchors
 * @return {object} the fake engine, plus a `pumped` counter
 */
function fakeEngine(products, geometryAt) {
  let pumped = 0
  return {
    get pumped() {
      return pumped
    },
    GetAppliedCoordinationMatrix() {
      return geometryAt > 0 && pumped >= geometryAt ? [...ANCHORED] : [...IDENTITY]
    },
    // Promise-returning rather than `async`: the real engine's is async, and
    // the caller awaits it either way.
    ExtractGeometryBatchAsync(modelID, batchSize, onMesh) {
      let extracted = 0
      while (extracted < batchSize && pumped < products) {
        ++pumped
        ++extracted
        if (pumped === geometryAt && onMesh) {
          onMesh({expressID: 1000 + pumped, geometries: []})
        }
      }
      return Promise.resolve({extracted, remaining: products - pumped})
    },
  }
}


describe('deriveCoordinationFrame', () => {
  it('returns the frame when the first product already anchors it', async () => {
    const engine = fakeEngine(200, 1)
    const seedBatch = []
    expect(await deriveCoordinationFrame(engine, 0, seedBatch)).toEqual(ANCHORED)
    // One product pumped on the main thread, and no more: everything past
    // the anchor is work the pool exists to move off this thread.
    expect(engine.pumped).toBe(1)
    expect(seedBatch).toHaveLength(1)
  })

  it('keeps pumping past products that emit no geometry', async () => {
    // The regression. Seeding a single product read identity here and
    // supplied it, because `extracted` counts PRODUCTS and the first 49
    // anchor nothing.
    const engine = fakeEngine(296, 50)
    const seedBatch = []
    expect(await deriveCoordinationFrame(engine, 0, seedBatch)).toEqual(ANCHORED)
    expect(engine.pumped).toBe(50)
    // Only the anchoring product emitted a mesh, so only it needs
    // re-delivering if the caller ends up falling back.
    expect(seedBatch).toHaveLength(1)
  })

  it('never returns identity, so the pool can decline instead', async () => {
    // A model that anchors nothing must produce null, NOT identity: identity
    // is a frame conway would apply, and applying it is the bug.
    const engine = fakeEngine(12, 0)
    expect(await deriveCoordinationFrame(engine, 0, [])).toBeNull()
    // It stopped at exhaustion rather than spinning.
    expect(engine.pumped).toBe(12)
  })

  it('gives up on an engine that reports work it never extracts', async () => {
    // `remaining` stays positive while `extracted` is 0 — without an
    // iteration bound this loop would hang the main thread forever.
    const engine = {
      GetAppliedCoordinationMatrix: () => [...IDENTITY],
      ExtractGeometryBatchAsync: () => Promise.resolve({extracted: 0, remaining: 7}),
    }
    expect(await deriveCoordinationFrame(engine, 0, [])).toBeNull()
  })

  it('declines an engine without the deferred-pump surface', async () => {
    expect(await deriveCoordinationFrame({}, 0, [])).toBeNull()
    expect(await deriveCoordinationFrame(undefined, 0, [])).toBeNull()
  })
})
