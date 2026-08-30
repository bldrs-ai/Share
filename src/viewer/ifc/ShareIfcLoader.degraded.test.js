// conway#638: the demand pump's FlatMesh stream is no longer retained once
// something else takes delivery, so `ShareIfcLoader#parse`'s DEGRADED
// end-of-load builds read `recapture()` — a whole-model accessor that
// re-extracts at the moment of failure — instead of the parse's `captured`
// array. These pin the wiring: on every degraded path the fallback build
// must still receive the whole stream, and on the healthy path it must not
// be asked for at all.
//
// The retention decision itself (which opens drop, which keep, and why a
// windowed source cannot) lives one layer down and is pinned in
// `conwayDirectIfcLoader.test.js`. Here `parseIfcWithConway` is mocked so
// the two halves of its return value can disagree, which is exactly the
// state a reader of the wrong one would get wrong.

import ShareIfcLoader from './ShareIfcLoader'
import {assembleBatchedModel, buildBatchedConwayModel} from './buildBatchedConwayModel'
import {buildConwayIfcModel} from './buildConwayIfcModel'
import {IncrementalBatchedBuilder} from './incrementalBatchedBuilder'
import {parseIfcWithConway} from './conwayDirectIfcLoader'
import {flatMeshToInstancedModel} from './flatMeshToInstancedModel'
import {isFeatureEnabled} from '../../FeatureFlags'


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
jest.mock('./conwayDirectLog', () => ({
  conwayDirectInfo: jest.fn(),
  conwayDirectError: jest.fn(),
}))
jest.mock('../../FeatureFlags', () => ({isFeatureEnabled: jest.fn()}))
jest.mock('../../utils/location', () => ({hasParams: jest.fn(() => false)}))

// The session owns preview lifecycle and camera follow, none of which this
// file exercises — but `previewGroup` being non-null is what makes
// `ShareIfcLoader#parse` build an `onMeshBatch` at all, and that callback's
// existence is the whole precondition for the stream being dropped.
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


/** The stream the pump delivered — what every degraded build must receive. */
const PUMPED = [
  {expressID: 101, geometries: {size: () => 1}},
  {expressID: 102, geometries: {size: () => 1}},
  {expressID: 103, geometries: {size: () => 1}},
]

const BUILD_STATS = {
  vertexCount: 9,
  triangleCount: 3,
  instanceCount: 3,
  parentCount: 1,
  materialCount: 1,
  skippedFlatMeshes: 0,
  skippedPlacedGeometries: 0,
}


/**
 * A model object shaped enough for the tail of `parse` (matrix stamp,
 * `addIfcModel`, the summary line) to run over it untouched.
 *
 * @param {string} tag which build produced it
 * @return {object}
 */
function makeModel(tag) {
  return {tag, matrix: null, geometry: null, capabilities: {}}
}


/**
 * A `viewer.IFC` stub with the scene `parse` needs to open a preview group.
 *
 * @return {object}
 */
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


/** @return {object} Conway IfcAPI stub for the post-build tail of `parse` */
function makeIfcAPI() {
  return {
    GetCoordinationMatrix: jest.fn().mockResolvedValue(
      [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
    OpenModel: jest.fn(),
    StreamAllMeshes: jest.fn(),
    properties: {},
  }
}


describe('viewer/ifc/ShareIfcLoader degraded end-of-load builds (conway#638)', () => {
  let recapture
  let ifcAPI
  let ifc
  let loader
  // `?feature=batchedMesh` forces the instancing analysis to info level, so
  // the two cases that flip it on would otherwise narrate an
  // `[instancedMeshes]` line each. Diverted, not silenced globally
  // (PLAYBOOK.md §"Keep the test console clean").
  let infoSpy

  beforeEach(() => {
    jest.clearAllMocks()
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {})
    // `demandGeometry` on is what gives the session a preview group, which
    // is what gives `parse` an `onMeshBatch`, which is what makes the parse
    // drop the stream. Everything else off: `batchedMesh` is flipped on
    // per-test where that fallback is the subject.
    isFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
    // The shape the streaming path returns: an EMPTY `captured` beside a
    // `recapture()` that still serves the whole model. A reader that took
    // the array would silently build nothing — which is the regression.
    //
    // The mock drives `onMeshBatch` before resolving, the way the real pump
    // does. Without that the loader's `builder` would stay null for every
    // case, and the three degraded paths this file separates would collapse
    // into one.
    // ASYNC on purpose, matching the real seam (conway#660): on a windowed
    // source the re-extraction pages the byte window through
    // `StreamAllMeshesAsync`, so `recapture()` returns a Promise on every
    // path. A sync stub here would let a call site that dropped its `await`
    // pass — the builders would receive an array either way — which is
    // exactly the regression this file exists to catch.
    // eslint-disable-next-line require-await
    recapture = jest.fn(async () => PUMPED)
    parseIfcWithConway.mockImplementation(
      // eslint-disable-next-line require-await
      async (buffer, api, settings, onProgress, onMeshBatch) => {
        if (onMeshBatch) {
          onMeshBatch(PUMPED, 4)
        }
        return {modelID: 4, captured: [], recapture}
      })
    buildConwayIfcModel.mockReturnValue({mesh: makeModel('merged'), stats: BUILD_STATS})
    buildBatchedConwayModel.mockReturnValue({model: makeModel('batched'), stats: BUILD_STATS})
    assembleBatchedModel.mockReturnValue(makeModel('incremental'))
    // Only read by the instancing diagnostic, which `?feature=batchedMesh`
    // forces on in two cases below. Given a real shape so the diagnostic
    // completes instead of throwing into its own catch and narrating the
    // suite (PLAYBOOK.md §"Keep the test console clean").
    flatMeshToInstancedModel.mockReturnValue({
      stats: {
        instanceCount: 3,
        uniqueGeometryCount: 1,
        sharedGeometryCount: 1,
        singletonGeometryCount: 0,
        mergedVertexCount: 9,
        instancedVertexCount: 3,
        vertexReductionRatio: 3,
        estimatedBytesSaved: 0,
        topInstancedGeometryID: 1,
        topInstancedCount: 3,
      },
    })
    ifcAPI = makeIfcAPI()
    ifc = makeIfcNamespace()
    loader = new ShareIfcLoader({ifcAPI, ifc})
  })

  afterEach(() => infoSpy.mockRestore())

  /**
   * Run the parse and hand back the meshes the merged fallback was built
   * from, so each degraded case asserts on the same observable.
   *
   * @return {Promise<object>} the model `parse` resolved with
   */
  async function parseOnce() {
    const model = await loader.parse(new ArrayBuffer(4), jest.fn(), jest.fn())
    return model
  }

  it('feeds the merged fallback the whole stream when the builder never constructs', async () => {
    // `builder === null` after a productive pump: the very first
    // `new IncrementalBatchedBuilder` threw, so nothing was assembled and
    // the end-of-load build is the only thing that can produce a model.
    IncrementalBatchedBuilder.mockImplementation(() => {
      throw new Error('builder construction failed')
    })
    const model = await parseOnce()
    expect(model.tag).toBe('merged')
    expect(buildConwayIfcModel).toHaveBeenCalledTimes(1)
    expect(buildConwayIfcModel.mock.calls[0][0]).toEqual(PUMPED)
  })

  it('feeds the merged fallback the whole stream when the builder holds no content', async () => {
    // Every `appendBatch` threw, so the builder exists but has nothing in
    // it. `hasContent()` false is the gate; the fallback still has to build
    // a complete model.
    IncrementalBatchedBuilder.mockImplementation(() => ({
      root: {parent: null},
      appendBatch: jest.fn(),
      hasContent: () => false,
      finalize: jest.fn(),
    }))
    const model = await parseOnce()
    expect(model.tag).toBe('merged')
    expect(buildConwayIfcModel.mock.calls[0][0]).toEqual(PUMPED)
  })

  it('feeds the merged fallback the whole stream when finalize throws', async () => {
    // The progressive-then-blank case named in conway#638's verification
    // section: batches rendered, then the end-of-load assembly failed. The
    // partial group is removed, so without a complete re-read the user is
    // left with an empty scene.
    IncrementalBatchedBuilder.mockImplementation(() => ({
      root: {parent: null},
      appendBatch: jest.fn(),
      hasContent: () => true,
      finalize: () => {
        throw new Error('finalize failed')
      },
    }))
    const model = await parseOnce()
    expect(model.tag).toBe('merged')
    expect(buildConwayIfcModel.mock.calls[0][0]).toEqual(PUMPED)
  })

  it('feeds the batchedMesh fallback the whole stream too', async () => {
    // The other degraded build, reached first when `?feature=batchedMesh`
    // is on. It reads the same accessor and must get the same meshes.
    isFeatureEnabled.mockImplementation(
      (name) => name === 'demandGeometry' || name === 'batchedMesh')
    IncrementalBatchedBuilder.mockImplementation(() => {
      throw new Error('builder construction failed')
    })
    const model = await parseOnce()
    expect(model.tag).toBe('batched')
    expect(buildBatchedConwayModel).toHaveBeenCalledTimes(1)
    expect(buildBatchedConwayModel.mock.calls[0][0]).toEqual(PUMPED)
    expect(buildConwayIfcModel).not.toHaveBeenCalled()
  })

  it('never asks for the stream when the incremental assembly succeeds', async () => {
    // The healthy streaming path, and the point of the change: re-extraction
    // is the price of a fallback, not of a load. If this fires on every load
    // the retention has just been traded for a whole-model re-walk.
    IncrementalBatchedBuilder.mockImplementation(() => ({
      root: {parent: null},
      appendBatch: jest.fn(),
      hasContent: () => true,
      finalize: () => ({batches: [], stats: BUILD_STATS}),
    }))
    const model = await parseOnce()
    expect(model.tag).toBe('incremental')
    expect(recapture).not.toHaveBeenCalled()
    expect(buildConwayIfcModel).not.toHaveBeenCalled()
    expect(buildBatchedConwayModel).not.toHaveBeenCalled()
  })

  it('fails the load loudly when the whole-model ask rejects', async () => {
    // conway#660/#672: on a windowed source `recapture()` drives
    // `StreamAllMeshesAsync`, which THROWS rather than serving an empty
    // model when a `GEOMETRY_BUDGET_MB` eviction freed everything the
    // re-walk needs. That rejection has to end the load, not be absorbed
    // into a blank scene reported as success — the failure mode that costs
    // a user their file.
    //
    // The chain is worth naming because only half of it propagates. The
    // FIRST degraded `await recapture()` sits inside the batchedMesh
    // branch's try/catch, so a rejection there is swallowed into
    // fall-through (correctly — that branch's contract is "never break a
    // load"); it is the SECOND, unguarded await feeding the merged build
    // that carries the failure out. This runs with `batchedMesh` off, which
    // is the shipped default, so it exercises that unguarded await
    // directly.
    //
    // "Loudly" is `ShareIfcLoader#parse`'s documented error contract, not a
    // rejection: it catches, stashes `ifcLastError`, calls `onError` and
    // returns null (re-throwing only on OOM, so `Loader.js#readModel` can
    // show the tailored message). What must never happen is a model
    // reaching the scene.
    IncrementalBatchedBuilder.mockImplementation(() => {
      throw new Error('builder construction failed')
    })
    const evicted = new Error(
      'StreamAllMeshesAsync: this model was opened with STREAMING_CONSUMER, ' +
      'and the re-walk resolved none of the model')
    recapture.mockRejectedValue(evicted)
    const onError = jest.fn()
    const model = await loader.parse(new ArrayBuffer(4), jest.fn(), onError)
    expect(model).toBeNull()
    expect(onError).toHaveBeenCalledWith(evicted)
    expect(loader.ifcLastError).toBe(evicted)
    // The load is over, and nothing was added to the scene — no partial or
    // empty model presented as a successful one.
    expect(ifc.addIfcModel).not.toHaveBeenCalled()
    expect(buildConwayIfcModel).not.toHaveBeenCalled()
  })

  it('serves both fallbacks off the accessor when they run in sequence', async () => {
    // `buildBatchedConwayModel` throwing falls through to
    // `buildConwayIfcModel`, so both degraded builds run in one load. Each
    // must go through the accessor — a call site left reading the retained
    // array would build from nothing while its sibling built correctly,
    // which is the shape that makes this regression silent.
    isFeatureEnabled.mockImplementation(
      (name) => name === 'demandGeometry' || name === 'batchedMesh')
    buildBatchedConwayModel.mockImplementation(() => {
      throw new Error('batched build failed')
    })
    IncrementalBatchedBuilder.mockImplementation(() => {
      throw new Error('builder construction failed')
    })
    const model = await parseOnce()
    expect(model.tag).toBe('merged')
    expect(buildBatchedConwayModel.mock.calls[0][0]).toEqual(PUMPED)
    expect(buildConwayIfcModel.mock.calls[0][0]).toEqual(PUMPED)
    // Every array handed out is the one object the accessor memoises, so
    // the two builds cannot be reading different re-extractions. Each
    // recorded result is the accessor's Promise, so resolve before
    // comparing — `toBe` on the Promises themselves would pass on the
    // memoised seam and equally on a broken one that re-drove the engine
    // and happened to return the same array.
    for (const result of recapture.mock.results) {
      expect(await result.value).toBe(PUMPED)
    }
  })
})
