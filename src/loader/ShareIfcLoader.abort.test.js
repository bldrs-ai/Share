/* eslint-disable require-await */
// ShareIfcLoader#parse given up by its owner (open-205 #2011 step A): an
// in-app switch (`spaModelNav`, on by default) aborts the load's signal. The
// load's engine is closed (a worker terminated; the page's engine stops its
// pump at the next batch), and either way the parse rejects as aborted with
// nothing registered and no failure recorded. IFC and STEP, and both
// engines, take the same parse; the engine load is mocked (its own abort is
// engine/engineModelLoad.abort.test.js's, and each engine's the contract
// test's and ConwayEngine.test.js's).
import ShareIfcLoader from './ShareIfcLoader'
import {assembleBatchedModel} from '../model/buildBatchedConwayModel'
import {IncrementalBatchedBuilder} from '../model/incrementalBatchedBuilder'
import {createEngineModelLoad} from '../engine/engineModelLoad'
import {makeFakeEngine, makeFakeEngineLoad} from './engineLoad.fixture'
import {isFeatureEnabled} from '../FeatureFlags'
import {LoadAbortedError} from '../utils/loadAbort'


jest.mock('../engine/engineModelLoad', () => ({
  createEngineModelLoad: jest.fn(),
  engineFormatOf: jest.requireActual('../engine/engineModelLoad').engineFormatOf,
}))
jest.mock('../model/engineModelReads', () => ({
  decorateConwayDirectIfcModel: jest.fn(),
  makeIndexedModelHandle: jest.requireActual('../model/engineModelReads').makeIndexedModelHandle,
}))
jest.mock('../model/buildBatchedConwayModel', () => ({
  buildBatchedConwayModel: jest.fn(),
  assembleBatchedModel: jest.fn(),
}))
jest.mock('../model/buildConwayIfcModel', () => ({buildConwayIfcModel: jest.fn()}))
jest.mock('../model/incrementalBatchedBuilder', () => ({IncrementalBatchedBuilder: jest.fn()}))
jest.mock('../model/flatMeshToBufferGeometry', () => ({flatMeshToBufferGeometry: jest.fn()}))
jest.mock('../model/flatMeshToInstancedModel', () => ({flatMeshToInstancedModel: jest.fn()}))
jest.mock('../model/parsePreviewMesh', () => ({payloadToPreviewMesh: jest.fn(() => null)}))
jest.mock('../model/ifcItemsMapParity', () => ({runIfcItemsMapParityCheck: jest.fn()}))
jest.mock('../FeatureFlags', () => ({
  isFeatureEnabled: jest.fn(),
  flags: [{name: 'disableEngineWorker', isActive: false}],
}))
jest.mock('../utils/location', () => ({hasParams: jest.fn(() => false)}))
jest.mock('./ProgressiveLoadSession', () => jest.fn().mockImplementation(() => ({
  previewGroup: {add: jest.fn(), remove: jest.fn(), children: []},
  report: jest.fn(),
  beginAssembly: jest.fn(),
  notifyBounds: jest.fn(),
  addPreviewMesh: jest.fn(),
  setSummary: jest.fn(),
  finish: jest.fn(),
  abort: jest.fn(),
})))


const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


/**
 * A `viewer.IFC` stub with the scene `parse` needs and the in-flight
 * registry ShareIfc keeps (ShareIfc#trackEngineLoad).
 *
 * @return {object}
 */
function makeIfcNamespace() {
  const tracked = new Set()
  return {
    tracked,
    ifcLastError: null,
    addIfcModel: jest.fn(),
    trackEngineLoad: jest.fn((engineLoad) => {
      tracked.add(engineLoad)
      return () => tracked.delete(engineLoad)
    }),
    context: {
      items: {ifcModels: []},
      getScene: () => ({add: jest.fn(), remove: jest.fn()}),
      ifcCamera: {cameraControls: null, perspectiveCamera: null},
    },
  }
}


/** @return {object} the load's alias stub, for the tail of `parse` */
function makeIfcAPI() {
  return {GetCoordinationMatrix: jest.fn().mockResolvedValue(IDENTITY)}
}


describe.each(['ifc', 'step'])('loader/ShareIfcLoader abort, %s', (type) => {
  let infoSpy
  let errorSpy

  beforeEach(() => {
    jest.clearAllMocks()
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {})
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    IncrementalBatchedBuilder.mockImplementation(() => ({
      root: {parent: null},
      appendBatch: jest.fn(),
      setPumpProgress: jest.fn(),
      hasContent: () => true,
      finalize: () => ({batches: [], stats: {vertexCount: 3, triangleCount: 1}}),
    }))
    assembleBatchedModel.mockImplementation(() => ({matrix: null, geometry: null, capabilities: {}, userData: {}}))
  })

  afterEach(() => {
    infoSpy.mockRestore()
    errorSpy.mockRestore()
  })

  describe('in the engine worker', () => {
    let engineLoad
    let rejectParse

    beforeEach(() => {
      isFeatureEnabled.mockImplementation((name) => name === 'demandGeometry' || name === 'engineWorker')
      engineLoad = {
        ifcAPI: makeIfcAPI(),
        engine: makeFakeEngine({kind: 'worker'}),
        parse: jest.fn(() => new Promise((resolve, reject) => {
          rejectParse = reject
        })),
        // As engineModelLoad's: the parse rejects once the engine is gone.
        abort: jest.fn(() => rejectParse(new Error('engine session closed'))),
        get aborted() {
          return this.abort.mock.calls.length > 0
        },
      }
      createEngineModelLoad.mockImplementation(() => engineLoad)
    })

    it('terminates the engine and rejects as aborted, registering nothing', async () => {
      const ifc = makeIfcNamespace()
      const loader = new ShareIfcLoader({engine: makeFakeEngine(), ifc})
      loader.type = type
      const onError = jest.fn()
      const controller = new AbortController()
      const parsing = loader.parse(new ArrayBuffer(4), jest.fn(), onError, {signal: controller.signal})
      await Promise.resolve()
      expect(ifc.tracked.has(engineLoad)).toBe(true)

      controller.abort()

      await expect(parsing).rejects.toBeInstanceOf(LoadAbortedError)
      expect(engineLoad.abort).toHaveBeenCalledTimes(1)
      expect(ifc.addIfcModel).not.toHaveBeenCalled()
      // Not a failure: nothing for readModel or CadView to report.
      expect(ifc.ifcLastError).toBeNull()
      expect(loader.ifcLastError).toBeNull()
      expect(onError).not.toHaveBeenCalled()
      // Untracked once settled: a later dispose has nothing left to abort.
      expect(ifc.tracked.size).toBe(0)
    })

    it('rejects as aborted when the viewer\'s dispose gave the engine up, with no signal', async () => {
      const ifc = makeIfcNamespace()
      const loader = new ShareIfcLoader({engine: makeFakeEngine(), ifc})
      loader.type = type
      const parsing = loader.parse(new ArrayBuffer(4), jest.fn(), jest.fn())
      await Promise.resolve()

      // ShareIfc#dispose under spaModelNav: every tracked load is aborted.
      for (const tracked of ifc.tracked) {
        tracked.abort()
      }

      await expect(parsing).rejects.toBeInstanceOf(LoadAbortedError)
      expect(ifc.addIfcModel).not.toHaveBeenCalled()
      expect(ifc.ifcLastError).toBeNull()
    })

    it('a load whose signal is never aborted completes and stops listening', async () => {
      engineLoad.parse.mockImplementation(async (buffer, {onMeshBatch}) => {
        onMeshBatch?.([{expressID: 101, geometries: {size: () => 1}}], 0, {done: 1, total: 1})
        return {modelID: 0, recapture: async () => [], summary: {}}
      })
      const ifc = makeIfcNamespace()
      const loader = new ShareIfcLoader({engine: makeFakeEngine(), ifc})
      loader.type = type
      const controller = new AbortController()
      const model = await loader.parse(new ArrayBuffer(4), jest.fn(), jest.fn(), {signal: controller.signal})
      expect(model).toBeTruthy()
      expect(ifc.addIfcModel).toHaveBeenCalledWith(model)
      controller.abort()
      expect(engineLoad.abort).not.toHaveBeenCalled()
      expect(ifc.tracked.size).toBe(0)
    })

    it('never starts for a signal aborted before the parse', async () => {
      const ifc = makeIfcNamespace()
      const loader = new ShareIfcLoader({engine: makeFakeEngine(), ifc})
      loader.type = type
      const controller = new AbortController()
      controller.abort()
      await expect(loader.parse(new ArrayBuffer(4), jest.fn(), jest.fn(), {signal: controller.signal}))
        .rejects.toBeInstanceOf(LoadAbortedError)
      expect(createEngineModelLoad).not.toHaveBeenCalled()
    })
  })

  describe('on the main-thread engine (?feature=disableEngineWorker)', () => {
    beforeEach(() => {
      isFeatureEnabled.mockImplementation((name) => name === 'demandGeometry' || name === 'disableEngineWorker')
    })

    it('runs on an engine of the viewer\'s make, closes it on the abort, and drops a parse that returns after it', async () => {
      const controller = new AbortController()
      const finalize = jest.fn(() => ({batches: [], stats: {vertexCount: 3, triangleCount: 1}}))
      IncrementalBatchedBuilder.mockImplementation(() => ({
        root: {parent: null},
        appendBatch: jest.fn(),
        setPumpProgress: jest.fn(),
        hasContent: () => true,
        finalize,
      }))
      const viewerEngine = makeFakeEngine()
      const loadEngine = makeFakeEngine()
      viewerEngine.forLoad.mockReturnValue(loadEngine)
      let load
      createEngineModelLoad.mockImplementation(() => {
        load = makeFakeEngineLoad({
          ifcAPI: makeIfcAPI(),
          engine: loadEngine,
          play: ({onMeshBatch}) => {
            onMeshBatch([{expressID: 101, geometries: {size: () => 1}}], 0, {done: 1, total: 1})
            // The open cannot be interrupted; it returns after the user left.
            controller.abort()
            return {modelID: 0}
          },
        })
        return load
      })
      const ifc = makeIfcNamespace()
      const loader = new ShareIfcLoader({engine: viewerEngine, ifc})
      loader.type = type

      await expect(loader.parse(new ArrayBuffer(4), jest.fn(), jest.fn(), {signal: controller.signal}))
        .rejects.toBeInstanceOf(LoadAbortedError)

      // The route gave the load a page engine of the viewer's make, not a
      // worker, and the abort closed that one, never the viewer's own.
      await expect(createEngineModelLoad.mock.calls[0][0].spawn()).resolves.toBe(loadEngine)
      expect(load.abort).toHaveBeenCalledTimes(1)
      expect(loadEngine.close).toHaveBeenCalled()
      expect(viewerEngine.close).not.toHaveBeenCalled()
      // Dropped straight after the parse, before the streamed batches are
      // even assembled into a model.
      expect(finalize).not.toHaveBeenCalled()
      expect(ifc.addIfcModel).not.toHaveBeenCalled()
      expect(ifc.ifcLastError).toBeNull()
    })
  })
})
