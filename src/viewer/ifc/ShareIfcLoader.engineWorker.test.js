// ShareIfcLoader#parse under `?feature=engineWorker` (engine-worker.md §7
// step 3): an IFC load drives the worker-engine load instead of the
// main-thread parse, and everything after the parse assembles against the
// facade it returns. The facade and the session are mocked here; their own
// behaviour is engine/engineIfcLoad.test.js's.
import ShareIfcLoader, {isEngineWorkerLoad} from './ShareIfcLoader'
import {assembleBatchedModel} from './buildBatchedConwayModel'
import {IncrementalBatchedBuilder} from './incrementalBatchedBuilder'
import {buildConwayIfcModel} from './buildConwayIfcModel'
import {parseIfcWithConway} from './conwayDirectIfcLoader'
import {isFeatureEnabled} from '../../FeatureFlags'
import {createEngineIfcLoad} from '../../engine/engineIfcLoad'


jest.mock('./conwayDirectIfcLoader', () => ({
  parseIfcWithConway: jest.fn(),
  decorateConwayDirectIfcModel: jest.fn(),
  makeIndexedModelHandle: jest.requireActual('./conwayDirectIfcLoader').makeIndexedModelHandle,
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
jest.mock('../../FeatureFlags', () => ({isFeatureEnabled: jest.fn()}))
jest.mock('../../engine/engineIfcLoad', () => ({createEngineIfcLoad: jest.fn()}))
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
// The handle the engine gives the deferred open; deliberately not 0, so a
// handle built for the wrong model would read the wrong one.
const OPENED_MODEL_ID = 7


/** @return {object} IfcAPI stub for `parse` and the handle's reads */
function makeIfcAPI() {
  return {
    GetCoordinationMatrix: jest.fn().mockResolvedValue(IDENTITY),
    OpenModel: jest.fn(),
    StreamAllMeshes: jest.fn(),
    properties: {
      getSpatialStructure: jest.fn().mockResolvedValue({expressID: 1, children: []}),
      getItemProperties: jest.fn().mockResolvedValue({expressID: 42}),
      getPropertySets: jest.fn().mockResolvedValue([]),
    },
  }
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


describe('viewer/ifc/ShareIfcLoader with ?feature=engineWorker', () => {
  let infoSpy
  let facade
  let engineParse

  beforeEach(() => {
    jest.clearAllMocks()
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {})
    isFeatureEnabled.mockImplementation((name) => name === 'demandGeometry' || name === 'engineWorker')
    facade = {
      engineSession: {close: jest.fn()},
      GetCoordinationMatrix: jest.fn().mockResolvedValue(IDENTITY),
      properties: makeIfcAPI().properties,
    }
    engineParse = jest.fn(async (buffer, {onMeshBatch, onIndexed}) => {
      await onIndexed?.(OPENED_MODEL_ID)
      onMeshBatch?.([{expressID: 101, geometries: {size: () => 1}}], OPENED_MODEL_ID, {done: 1, total: 1})
      // eslint-disable-next-line require-await
      return {modelID: OPENED_MODEL_ID, recapture: async () => [], summary: {}}
    })
    createEngineIfcLoad.mockImplementation(() => ({ifcAPI: facade, parse: engineParse}))
    IncrementalBatchedBuilder.mockImplementation(() => ({
      root: {parent: null},
      appendBatch: jest.fn(),
      setPumpProgress: jest.fn(),
      hasContent: () => true,
      finalize: () => ({batches: [], stats: {vertexCount: 3, triangleCount: 1}}),
    }))
    assembleBatchedModel.mockImplementation(() => ({matrix: null, geometry: null, capabilities: {}, userData: {}}))
  })

  afterEach(() => infoSpy.mockRestore())

  it('an IFC load goes through the worker engine, and assembles against its facade', async () => {
    const ifcAPI = makeIfcAPI()
    const loader = new ShareIfcLoader({ifcAPI, ifc: makeIfcNamespace()})
    loader.type = 'ifc'
    const model = await loader.parse(new ArrayBuffer(4), jest.fn(), jest.fn())
    expect(model).toBeTruthy()
    expect(engineParse).toHaveBeenCalledTimes(1)
    expect(parseIfcWithConway).not.toHaveBeenCalled()
    // The builder and the assembler were handed the facade, not the
    // viewer's main-thread IfcAPI.
    expect(IncrementalBatchedBuilder.mock.calls[0][0]).toBe(facade)
    expect(assembleBatchedModel.mock.calls[0][1]).toBe(facade)
  })

  it('the at-index handle reads through the facade\'s properties', async () => {
    const loader = new ShareIfcLoader({ifcAPI: makeIfcAPI(), ifc: makeIfcNamespace()})
    loader.type = 'ifc'
    let handle
    await loader.parse(new ArrayBuffer(4), jest.fn(), jest.fn(), {onIndexed: (h) => {
      handle = h
    }})
    await handle.getSpatialStructure(0, 'names')
    expect(facade.properties.getSpatialStructure).toHaveBeenCalledWith(OPENED_MODEL_ID, 'names', {includeSolids: true})
  })

  it('STEP keeps the main-thread engine until step 6', async () => {
    // eslint-disable-next-line require-await
    parseIfcWithConway.mockImplementation(async (b, api, s, p, onMeshBatch) => {
      onMeshBatch?.([{expressID: 101, geometries: {size: () => 1}}], 0, {done: 1, total: 1})
      // eslint-disable-next-line require-await
      return {modelID: 0, captured: [], recapture: async () => []}
    })
    const loader = new ShareIfcLoader({ifcAPI: makeIfcAPI(), ifc: makeIfcNamespace()})
    loader.type = 'step'
    await loader.parse(new ArrayBuffer(4), jest.fn(), jest.fn())
    expect(createEngineIfcLoad).not.toHaveBeenCalled()
    expect(parseIfcWithConway).toHaveBeenCalledTimes(1)
  })

  it('a failed worker load closes its engine', async () => {
    engineParse.mockRejectedValue(new Error('engine: open failed (-1)'))
    const loader = new ShareIfcLoader({ifcAPI: makeIfcAPI(), ifc: makeIfcNamespace()})
    loader.type = 'ifc'
    const onError = jest.fn()
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await expect(loader.parse(new ArrayBuffer(4), jest.fn(), onError)).resolves.toBeNull()
    } finally {
      errorSpy.mockRestore()
      warnSpy.mockRestore()
    }
    expect(facade.engineSession.close).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalled()
  })

  it('a failed incremental assembly fails the load with ITS error, chained as cause', async () => {
    IncrementalBatchedBuilder.mockImplementation(() => ({
      root: {parent: null},
      appendBatch: jest.fn(),
      setPumpProgress: jest.fn(),
      hasContent: () => true,
      finalize: () => {
        throw new Error('BatchedMesh capacity exceeded')
      },
    }))
    const loader = new ShareIfcLoader({ifcAPI: makeIfcAPI(), ifc: makeIfcNamespace()})
    loader.type = 'ifc'
    const onError = jest.fn()
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await expect(loader.parse(new ArrayBuffer(4), jest.fn(), onError)).resolves.toBeNull()
    } finally {
      errorSpy.mockRestore()
      warnSpy.mockRestore()
    }
    const err = onError.mock.calls[0][0]
    expect(err.message).toMatch(/incremental assembly failed: BatchedMesh capacity exceeded/)
    expect(err.cause.message).toBe('BatchedMesh capacity exceeded')
    expect(buildConwayIfcModel).not.toHaveBeenCalled()
  })

  it('a model with nothing to draw opens empty, as it does without the flag', async () => {
    IncrementalBatchedBuilder.mockImplementation(() => ({
      root: {parent: null},
      appendBatch: jest.fn(),
      setPumpProgress: jest.fn(),
      hasContent: () => false,
      finalize: jest.fn(),
    }))
    buildConwayIfcModel.mockImplementation(() => ({
      mesh: {matrix: null, geometry: null, userData: {}},
      stats: {vertexCount: 0, triangleCount: 0},
    }))
    const loader = new ShareIfcLoader({ifcAPI: makeIfcAPI(), ifc: makeIfcNamespace()})
    loader.type = 'ifc'
    const model = await loader.parse(new ArrayBuffer(4), jest.fn(), jest.fn())
    expect(model).toBeTruthy()
    expect(buildConwayIfcModel).toHaveBeenCalledWith([], facade, OPENED_MODEL_ID, expect.anything())
  })

  it('isEngineWorkerLoad: IFC and .ifczip, with the flag, demand geometry and a scene', () => {
    expect(isEngineWorkerLoad('ifc', {})).toBe(true)
    expect(isEngineWorkerLoad('ifczip', {})).toBe(true)
    expect(isEngineWorkerLoad('step', {})).toBe(false)
    expect(isEngineWorkerLoad('ifc', null)).toBe(false)
    isFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
    expect(isEngineWorkerLoad('ifc', {})).toBe(false)
    isFeatureEnabled.mockImplementation((name) => name === 'engineWorker')
    expect(isEngineWorkerLoad('ifc', {})).toBe(false)
  })
})
