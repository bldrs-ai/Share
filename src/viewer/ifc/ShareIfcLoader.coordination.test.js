/* eslint-disable no-magic-numbers */
// The engine coordination stamp (Share#1633 item 1 / Share#1634, engine side
// conway#702). `ShareIfcLoader#parse` reads `GetAppliedCoordinationMatrix` at
// load completion and stamps it as `userData.appliedCoordination`, so Share
// has a world-frame handle on the georeferenced models the ENGINE recentres
// — which after conway#680 is every one of them, and none of which populate
// Share's own `userData.coordinationOffset` backstop.
//
// Why these are unit tests over a mocked IfcAPI rather than a fixture load:
// no jest test in this repo instantiates the conway wasm engine (the whole
// `viewer/ifc` suite mocks the boundary), so a georeferenced fixture load is
// not available here. What CAN be pinned without wasm is the part Share owns
// — that the engine's frame reaches the model root unmangled, in the engine's
// element order — and the round-trip below does exactly that: it inverts the
// array read back OFF THE MODEL and requires it to carry a rendered point
// home to authored LV95 coordinates. A transposed, truncated, elided or
// identity stamp all fail it.

import {Matrix4, Vector3} from 'three'
import ShareIfcLoader from './ShareIfcLoader'
import {assembleBatchedModel, buildBatchedConwayModel} from './buildBatchedConwayModel'
import {buildConwayIfcModel} from './buildConwayIfcModel'
import {IncrementalBatchedBuilder} from './incrementalBatchedBuilder'
import {parseIfcWithConway} from './conwayDirectIfcLoader'
import {isFeatureEnabled} from '../../FeatureFlags'
import {getConwayDirectLogs} from '../../../tools/jest/conwayDirectLogCapture'


jest.mock('./conwayDirectIfcLoader', () => ({
  parseIfcWithConway: jest.fn(),
  decorateConwayDirectIfcModel: jest.fn(),
}))
jest.mock('./buildBatchedConwayModel', () => ({
  buildBatchedConwayModel: jest.fn(),
  assembleBatchedModel: jest.fn(),
}))
jest.mock('./buildConwayIfcModel', () => ({buildConwayIfcModel: jest.fn()}))
jest.mock('./incrementalBatchedBuilder', () => ({IncrementalBatchedBuilder: jest.fn()}))
jest.mock('./flatMeshToBufferGeometry', () => ({flatMeshToBufferGeometry: jest.fn()}))
jest.mock('./flatMeshToInstancedModel', () => ({flatMeshToInstancedModel: jest.fn()}))
jest.mock('./parsePreviewMesh', () => ({payloadToPreviewMesh: jest.fn(() => null)}))
jest.mock('./ifcItemsMapParity', () => ({runIfcItemsMapParityCheck: jest.fn()}))
// `conwayDirectLog` is deliberately NOT mocked: the malformed-frame case
// below asserts the diagnostic, and `setupTests.js` already redirects the
// whole `[conwayDirect]` channel into a buffer, so the real module is both
// assertable and console-clean here.
jest.mock('../../FeatureFlags', () => ({isFeatureEnabled: jest.fn()}))
jest.mock('../../utils/location', () => ({hasParams: jest.fn(() => false)}))
jest.mock('../ProgressiveLoadSession', () => jest.fn().mockImplementation(() => ({
  previewGroup: {add: jest.fn(), remove: jest.fn(), children: []},
  report: jest.fn(),
  beginAssembly: jest.fn(),
  notifyBounds: jest.fn(),
  addPreviewMesh: jest.fn(),
  setSummary: jest.fn(),
  finish: jest.fn(),
  abort: jest.fn(),
})))


const PUMPED = [{expressID: 101, geometries: {size: () => 1}}]

const BUILD_STATS = {
  vertexCount: 3,
  triangleCount: 1,
  instanceCount: 1,
  parentCount: 1,
  materialCount: 1,
  skippedFlatMeshes: 0,
  skippedPlacedGeometries: 0,
}

/** Column-major identity, the shape the classic `GetCoordinationMatrix` returns. */
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

/**
 * Millimetres per metre — conway's `linearScalingFactor` for a model authored
 * in mm, and the `scale` factor of `A`. Picked over 1 so the round-trip below
 * actually exercises the unit half of the frame.
 */
const MM = 0.001

/**
 * A Swiss LV95 anchor in SOURCE units (mm, Z-up): easting 2 600 000 m,
 * northing 1 200 000 m, 450 m up. This is the magnitude that made the models
 * in Share#1633 jitter, and it is far enough from the origin that an identity
 * or transposed stamp cannot accidentally pass the round-trip.
 */
const LV95_ANCHOR_MM = [2600000000, 1200000000, 450000]

/**
 * How close a recovered authored coordinate must be, in source units — one
 * micron out of a 2.6e9 mm easting. Absolute rather than jest's
 * `toBeCloseTo` digit count, which cannot express a tolerance this tight
 * relative to a magnitude this large.
 */
const ROUND_TRIP_TOLERANCE_MM = 1e-3


/**
 * Assert a recovered point is the authored one, component-wise.
 *
 * @param {Vector3} recovered `inverse(A) * rendered`
 * @param {Vector3} authored the point the file declares
 */
function expectRecovered(recovered, authored) {
  expect(Math.abs(recovered.x - authored.x)).toBeLessThan(ROUND_TRIP_TOLERANCE_MM)
  expect(Math.abs(recovered.y - authored.y)).toBeLessThan(ROUND_TRIP_TOLERANCE_MM)
  expect(Math.abs(recovered.z - authored.z)).toBeLessThan(ROUND_TRIP_TOLERANCE_MM)
}


/**
 * The Z-up -> Y-up change of basis conway composes into `A` as `NormalizeMat`:
 * `(x, y, z) -> (x, z, -y)`. Written row-major because that is `Matrix4#set`'s
 * argument order.
 *
 * @return {Matrix4}
 */
function normalizeMat() {
  return new Matrix4().set(
    1, 0, 0, 0,
    0, 0, 1, 0,
    0, -1, 0, 0,
    0, 0, 0, 1)
}


/**
 * `A = scale(linearScalingFactor) * NormalizeMat * translate(-anchor)`, built
 * from the three factors conway's doc comment names, in that order. Standing
 * in for what the engine derives so the test can state the frame it expects
 * rather than assert whatever came back.
 *
 * @param {Array<number>} anchorInSourceUnits `[x, y, z]`, pre-rotation
 * @param {number} [scale] metres per source unit
 * @return {Matrix4}
 */
function appliedFrame(anchorInSourceUnits, scale = MM) {
  const s = new Matrix4().makeScale(scale, scale, scale)
  const t = new Matrix4().makeTranslation(
    -anchorInSourceUnits[0], -anchorInSourceUnits[1], -anchorInSourceUnits[2])
  return s.multiply(normalizeMat()).multiply(t)
}


/**
 * A model object shaped enough for the tail of `parse` to run over it, with
 * the `userData` a real three.js `Object3D` always has.
 *
 * @param {string} tag which build produced it
 * @param {object} [userData] pre-existing userData (e.g. the incremental
 *   root's `coordinationOffset`)
 * @return {object}
 */
function makeModel(tag, userData = {}) {
  return {tag, matrix: null, geometry: null, capabilities: {}, userData}
}


/**
 * @param {?Array<number>} appliedMatrix what `GetAppliedCoordinationMatrix`
 *   answers, or null to stand in for an engine pin predating conway#702
 * @return {object} Conway IfcAPI stub for the post-build tail of `parse`
 */
function makeIfcAPI(appliedMatrix) {
  const api = {
    GetCoordinationMatrix: jest.fn().mockResolvedValue(IDENTITY),
    OpenModel: jest.fn(),
    StreamAllMeshes: jest.fn(),
    properties: {},
  }
  if (appliedMatrix !== null) {
    api.GetAppliedCoordinationMatrix = jest.fn(() => appliedMatrix)
  }
  return api
}


/** @return {object} a `viewer.IFC` stub with the scene `parse` needs */
function makeIfcNamespace() {
  return {
    ifcLastError: null,
    addIfcModel: jest.fn(),
    context: {
      items: {ifcModels: []},
      getScene: () => ({add: jest.fn(), remove: jest.fn()}),
      ifcCamera: {cameraControls: null, perspectiveCamera: null},
    },
  }
}


describe('viewer/ifc/ShareIfcLoader engine coordination stamp (Share#1634)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // `demandGeometry` on is what gives the session a preview group, which is
    // what gives `parse` an `onMeshBatch`, which is what puts the load on the
    // incremental path — the production path for every real model.
    isFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
    parseIfcWithConway.mockImplementation(
      // eslint-disable-next-line require-await
      async (buffer, api, settings, onProgress, onMeshBatch) => {
        if (onMeshBatch) {
          onMeshBatch(PUMPED, 7, {done: 1, total: 1})
        }
        // eslint-disable-next-line require-await
        return {modelID: 7, captured: [], recapture: async () => PUMPED}
      })
    IncrementalBatchedBuilder.mockImplementation(() => ({
      root: {parent: null},
      appendBatch: jest.fn(),
      setPumpProgress: jest.fn(),
      hasContent: () => true,
      finalize: () => ({batches: [], stats: BUILD_STATS}),
    }))
    assembleBatchedModel.mockReturnValue(makeModel('incremental'))
    buildConwayIfcModel.mockReturnValue({mesh: makeModel('merged'), stats: BUILD_STATS})
    buildBatchedConwayModel.mockReturnValue({model: makeModel('batched'), stats: BUILD_STATS})
  })

  /**
   * @param {object} ifcAPI
   * @return {Promise<object>} the model `parse` resolved with
   */
  async function parseWith(ifcAPI) {
    const loader = new ShareIfcLoader({ifcAPI, ifc: makeIfcNamespace()})
    return await loader.parse(new ArrayBuffer(4), jest.fn(), jest.fn())
  }

  it('stamps the frame the engine reports, as its own copy', async () => {
    const frame = appliedFrame(LV95_ANCHOR_MM)
    const reported = Array.from(frame.elements)
    const ifcAPI = makeIfcAPI(reported)

    const model = await parseWith(ifcAPI)

    expect(ifcAPI.GetAppliedCoordinationMatrix).toHaveBeenCalledWith(7)
    expect(model.userData.appliedCoordination).toEqual(reported)
    // A COPY, not the engine's array: conway documents the return as "a fresh
    // array the caller owns", but a future passthrough handing back a live
    // view must not be able to rewrite the model's frame after the fact.
    expect(model.userData.appliedCoordination).not.toBe(reported)
  })

  it('inverts the stamp back to authored LV95 coordinates', async () => {
    // The contract Share#1634 asked the engine for, exercised end to end:
    //   rendered = A * world      world = inverse(A) * rendered
    // `world` is the point the FILE declares — source units (mm here), Z-up.
    const frame = appliedFrame(LV95_ANCHOR_MM)
    const authored = new Vector3(
      LV95_ANCHOR_MM[0] + 12000, // 12 m east of the anchor
      LV95_ANCHOR_MM[1] - 3000, // 3 m south
      LV95_ANCHOR_MM[2] + 5000) // 5 m up
    const rendered = authored.clone().applyMatrix4(frame)

    // The frame really is the recentring one: a point ~2,900 km from the
    // origin in the file renders within metres of it. Without this the round
    // trip below would also pass for an identity frame.
    expect(rendered.length()).toBeLessThan(100)
    expect(authored.length()).toBeGreaterThan(1e9)

    const model = await parseWith(makeIfcAPI(Array.from(frame.elements)))

    // Read the frame back OFF THE MODEL — the stamp is what is under test,
    // not `Matrix4#invert`.
    const inverse = new Matrix4()
      .fromArray(model.userData.appliedCoordination)
      .invert()
    expectRecovered(rendered.clone().applyMatrix4(inverse), authored)
  })

  it('stamps a near-origin frame whose translation is zero but rotation is live', async () => {
    // conway's explicit do-not-shortcut clause: under COORDINATE_TO_ORIGIN a
    // model that needed no recentre still gets NormalizeMat and the unit
    // scale, so "no offset applied" is NOT "no transform applied". Eliding
    // the stamp on a zero translation would strand such a model Z-up and in
    // the wrong units.
    const frame = appliedFrame([0, 0, 0])
    const model = await parseWith(makeIfcAPI(Array.from(frame.elements)))

    const stamped = model.userData.appliedCoordination
    expect([stamped[12], stamped[13], stamped[14]]).toEqual([0, 0, 0])
    expect(stamped).not.toEqual(IDENTITY)

    const authored = new Vector3(4000, 7000, 2000) // mm, Z-up
    const rendered = authored.clone().applyMatrix4(frame)
    // m, Y-up: the mm scale and the Z-up -> Y-up basis swap, no translation.
    expect(rendered.x).toBeCloseTo(4, 9)
    expect(rendered.y).toBeCloseTo(2, 9)
    expect(rendered.z).toBeCloseTo(-7, 9)

    expectRecovered(
      rendered.clone().applyMatrix4(new Matrix4().fromArray(stamped).invert()), authored)
  })

  it('stamps on the merged fallback path too', async () => {
    // One read point for every conway load path: incremental, batchedMesh and
    // merged all converge on the same `ifcModel` before it is installed, so
    // the degraded builds are stamped exactly like the healthy one.
    IncrementalBatchedBuilder.mockImplementation(() => {
      throw new Error('builder construction failed')
    })
    const frame = appliedFrame(LV95_ANCHOR_MM)
    const model = await parseWith(makeIfcAPI(Array.from(frame.elements)))

    expect(model.tag).toBe('merged')
    expect(model.userData.appliedCoordination).toEqual(Array.from(frame.elements))
  })

  it('leaves the Share-side backstop offset untouched', async () => {
    // `coordinationOffset` keeps its meaning: SHARE's recentre, stamped by
    // `IncrementalBatchedBuilder` on the root it hands up, and present only
    // when the engine declined to recentre. The two surfaces compose
    // (`rendered = (A * world) - coordinationOffset`); neither overwrites the
    // other.
    const backstop = [2600000, 450, -1200000]
    assembleBatchedModel.mockReturnValue(
      makeModel('incremental', {coordinationOffset: backstop}))
    const frame = appliedFrame(LV95_ANCHOR_MM)

    const model = await parseWith(makeIfcAPI(Array.from(frame.elements)))

    expect(model.userData.coordinationOffset).toEqual(backstop)
    expect(model.userData.appliedCoordination).toEqual(Array.from(frame.elements))
  })

  it('loads unstamped against an engine that predates the frame contract', async () => {
    // Feature-detect, as conway's doc comment instructs: stock web-ifc (the
    // USE_WEBIFC_SHIM=false engine) and any pin before conway#702 have no
    // such method, and a missing diagnostic must never cost a load.
    const model = await parseWith(makeIfcAPI(null))

    expect(model.tag).toBe('incremental')
    expect(model.userData.appliedCoordination).toBeUndefined()
    // And SILENTLY: an absent method is the expected state of an older pin,
    // not a fault, so it must not put a line in every such load's report.
    // This is what distinguishes the feature-detect from letting the call
    // throw into the catch below it, which would look identical on the model.
    expect(getConwayDirectLogs().filter(({text}) => /appliedCoordination/.test(text)))
      .toEqual([])
  })

  it('refuses a right-length frame of non-finite numbers', async () => {
    // Length alone would pass this: `Matrix4#fromArray` reads all 16 slots
    // whatever they hold, so a NaN-bearing reply becomes a matrix whose
    // inverse is NaN everywhere — an answer that looks real. Shared shape
    // rules live in `./appliedCoordination`; this pins that the ENGINE
    // boundary actually applies them.
    const bad = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, NaN, 0, 1]
    const model = await parseWith(makeIfcAPI(bad))

    expect(model.tag).toBe('incremental')
    expect(model.userData.appliedCoordination).toBeUndefined()
    expect(getConwayDirectLogs().filter(({text}) => /appliedCoordination/.test(text)))
      .toHaveLength(1)
  })

  it('refuses a malformed frame rather than stamping it', async () => {
    // A short array would silently become a garbage `Matrix4` in every
    // consumer (`fromArray` reads 16 slots regardless), so the reply is
    // shape-checked and the model is left with no frame at all — which
    // consumers can detect — instead of a wrong one, which they cannot.
    const model = await parseWith(makeIfcAPI([1, 0, 0, 0, 1, 0, 0, 0, 1]))

    expect(model.tag).toBe('incremental')
    expect(model.userData.appliedCoordination).toBeUndefined()
    // And it says so on the pipeline's own channel, which the load report
    // tees. Silent coordination behaviour is what Share#1632 cost days to.
    expect(getConwayDirectLogs().filter(({text}) => /appliedCoordination/.test(text)))
      .toEqual([{
        level: 'warn',
        text: 'appliedCoordination: engine returned a non-mat4 frame ' +
          '(length=9); model left unstamped',
      }])
  })
})
