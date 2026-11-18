/* eslint-disable require-await */
// ShareIfcLoader#parse given up by its owner (open-205 #2011 step A): an
// in-app switch under `?feature=spaModelNav` aborts the load's signal. A
// worker load's engine is terminated, a main-thread one is handed the signal
// for its pump, and either way the parse rejects as aborted with nothing
// registered and no failure recorded. IFC and STEP take the same parse; the
// engine load and the main-thread parse are mocked (their own abort is
// engine/engineModelLoad.abort.test.js's and the pump's).
import ShareIfcLoader from './ShareIfcLoader'
import {assembleBatchedModel} from './buildBatchedConwayModel'
import {IncrementalBatchedBuilder} from './incrementalBatchedBuilder'
import {parseIfcWithConway} from './conwayDirectIfcLoader'
import {isFeatureEnabled} from '../../FeatureFlags'
import {createEngineModelLoad} from '../../engine/engineModelLoad'
import {LoadAbortedError} from '../../utils/loadAbort'


jest.mock('./conwayDirectIfcLoader', () => ({
  parseIfcWithConway: jest.fn(),
  decorateConwayDirectIfcModel: jest.fn(),
  makeIndexedModelHandle: jest.fn(),
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
jest.mock('../../FeatureFlags', () => ({
  isFeatureEnabled: jest.fn(),
  flags: [{name: 'disableEngineWorker', isActive: false}],
}))
jest.mock('../../engine/engineModelLoad', () => ({
  createEngineModelLoad: jest.fn(),
  engineFormatOf: jest.requireActual('../../engine/engineModelLoad').engineFormatOf,
}))
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


/** @return {object} a main-thread IfcAPI stub */
function makeIfcAPI() {
  return {GetCoordinationMatrix: jest.fn().mockResolvedValue(IDENTITY), OpenModel: jest.fn(), StreamAllMeshes: jest.fn()}
}


describe.each(['ifc', 'step'])('viewer/ifc/ShareIfcLoader abort, %s', (type) => {
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
        ifcAPI: {engineSession: {close: jest.fn()}, GetCoordinationMatrix: jest.fn().mockResolvedValue(IDENTITY)},
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
      const loader = new ShareIfcLoader({ifcAPI: makeIfcAPI(), ifc})
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
      const loader = new ShareIfcLoader({ifcAPI: makeIfcAPI(), ifc})
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
      const loader = new ShareIfcLoader({ifcAPI: makeIfcAPI(), ifc})
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
      const loader = new ShareIfcLoader({ifcAPI: makeIfcAPI(), ifc})
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

    it('hands the pump the signal, and drops a parse that returns after the abort', async () => {
      const controller = new AbortController()
      const finalize = jest.fn(() => ({batches: [], stats: {vertexCount: 3, triangleCount: 1}}))
      IncrementalBatchedBuilder.mockImplementation(() => ({
        root: {parent: null},
        appendBatch: jest.fn(),
        setPumpProgress: jest.fn(),
        hasContent: () => true,
        finalize,
      }))
      parseIfcWithConway.mockImplementation(async (buffer, ifcAPI, settings, onProgress, onMeshBatch) => {
        onMeshBatch([{expressID: 101, geometries: {size: () => 1}}], 0, {done: 1, total: 1})
        // The open cannot be interrupted; it returns after the user left.
        controller.abort()
        return {modelID: 0, recapture: async () => []}
      })
      const ifc = makeIfcNamespace()
      const loader = new ShareIfcLoader({ifcAPI: makeIfcAPI(), ifc})
      loader.type = type

      await expect(loader.parse(new ArrayBuffer(4), jest.fn(), jest.fn(), {signal: controller.signal}))
        .rejects.toBeInstanceOf(LoadAbortedError)

      expect(createEngineModelLoad).not.toHaveBeenCalled()
      expect(parseIfcWithConway.mock.calls[0][7]).toEqual({signal: controller.signal})
      // Dropped straight after the parse, before the streamed batches are
      // even assembled into a model.
      expect(finalize).not.toHaveBeenCalled()
      expect(ifc.addIfcModel).not.toHaveBeenCalled()
      expect(ifc.ifcLastError).toBeNull()
    })
  })
})
