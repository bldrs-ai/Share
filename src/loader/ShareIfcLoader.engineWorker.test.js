// ShareIfcLoader#parse's engine route (engine-worker.md §7 steps 3, 6 and 9;
// layering.md §7 "1a"): an IFC or STEP load gets a WorkerEngine of its own,
// and a load the route keeps on the main thread gets the viewer's
// ConwayEngine, through the SAME model load, and everything after the parse
// assembles against the alias it returns. The load is mocked here; its own
// behaviour is engine/engineModelLoad.test.js's, and the two engines'
// engine/engineContract.test.js's.
import ShareIfcLoader, {isEngineWorkerLoad} from './ShareIfcLoader'
import {assembleBatchedModel} from '../model/buildBatchedConwayModel'
import {IncrementalBatchedBuilder} from '../model/incrementalBatchedBuilder'
import {buildConwayIfcModel} from '../model/buildConwayIfcModel'
import {createEngineModelLoad} from '../engine/engineModelLoad'
import {makeFakeEngine} from './engineLoad.fixture'
import {flags, isFeatureEnabled} from '../FeatureFlags'
import {getConwayDirectLogs} from '../../tools/jest/conwayDirectLogCapture'


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


describe('loader/ShareIfcLoader with ?feature=engineWorker', () => {
  let infoSpy
  let facade
  let engineParse
  let workerEngine
  let viewerEngine
  // What the loader is given to spawn a worker with; the route picks it.
  let spawnWorker

  /** @return {object} a loader over this suite's engines */
  function makeLoader() {
    return new ShareIfcLoader({engine: viewerEngine, ifc: makeIfcNamespace(), spawnWorker})
  }

  /** @return {Function} the spawn the parse handed its load */
  function spawnOfLoad() {
    return createEngineModelLoad.mock.calls[0][0].spawn
  }

  beforeEach(() => {
    jest.clearAllMocks()
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {})
    isFeatureEnabled.mockImplementation((name) => name === 'demandGeometry' || name === 'engineWorker')
    workerEngine = makeFakeEngine({kind: 'worker', modelID: OPENED_MODEL_ID})
    viewerEngine = makeFakeEngine({modelID: OPENED_MODEL_ID})
    spawnWorker = jest.fn(() => Promise.resolve(workerEngine))
    facade = {
      engine: workerEngine,
      GetCoordinationMatrix: jest.fn().mockResolvedValue(IDENTITY),
      properties: makeIfcAPI().properties,
    }
    engineParse = jest.fn(async (buffer, {onMeshBatch, onIndexed}) => {
      await onIndexed?.(OPENED_MODEL_ID)
      onMeshBatch?.([{expressID: 101, geometries: {size: () => 1}}], OPENED_MODEL_ID, {done: 1, total: 1})
      // eslint-disable-next-line require-await
      return {modelID: OPENED_MODEL_ID, recapture: async () => [], summary: {}}
    })
    // The load's engine is whichever its spawn makes: the route's choice.
    createEngineModelLoad.mockImplementation(({spawn}) => {
      const load = {ifcAPI: facade, parse: jest.fn(async (...args) => {
        load.engine = await spawn()
        facade.engine = load.engine
        return engineParse(...args)
      }), engine: null, abort: jest.fn(), aborted: false}
      return load
    })
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

  it('an IFC load goes through the worker engine, and assembles against its alias', async () => {
    const loader = makeLoader()
    loader.type = 'ifc'
    const model = await loader.parse(new ArrayBuffer(4), jest.fn(), jest.fn())
    expect(model).toBeTruthy()
    expect(engineParse).toHaveBeenCalledTimes(1)
    expect(spawnOfLoad()).toBe(spawnWorker)
    // The builder and the assembler were handed the load's alias, and the
    // model its engine.
    expect(IncrementalBatchedBuilder.mock.calls[0][0]).toBe(facade)
    expect(assembleBatchedModel.mock.calls[0][1]).toBe(facade)
    expect(assembleBatchedModel.mock.calls[0][3].engine).toBe(workerEngine)
  })

  it('the at-index handle reads through the load\'s engine', async () => {
    const loader = makeLoader()
    loader.type = 'ifc'
    let handle
    await loader.parse(new ArrayBuffer(4), jest.fn(), jest.fn(), {onIndexed: (h) => {
      handle = h
    }})
    await handle.getSpatialStructure(0, 'names')
    expect(workerEngine.tree).toHaveBeenCalledWith({mode: 'names', includeSolids: true})
  })

  // engine-worker.md §7 step 6: STEP goes through the SAME worker load as
  // IFC (one createEngineModelLoad, told the format as a label), and the
  // at-index handle asks the worker's tree for STEP's sub-solids.
  it.each(['step', 'stp'])('a .%s load goes through the worker engine as format \'step\'', async (type) => {
    const loader = makeLoader()
    loader.type = type
    let handle
    const model = await loader.parse(new ArrayBuffer(4), jest.fn(), jest.fn(), {onIndexed: (h) => {
      handle = h
    }})
    expect(model).toBeTruthy()
    expect(createEngineModelLoad).toHaveBeenCalledWith({format: 'step', spawn: spawnWorker})
    expect(engineParse).toHaveBeenCalledTimes(1)
    expect(IncrementalBatchedBuilder.mock.calls[0][0]).toBe(facade)
    await handle.getSpatialStructure(0, 'names')
    expect(workerEngine.tree).toHaveBeenCalledWith({mode: 'names', includeSolids: true})
  })

  it('an IFC load is told format \'ifc\'', async () => {
    const loader = makeLoader()
    loader.type = 'ifc'
    await loader.parse(new ArrayBuffer(4), jest.fn(), jest.fn())
    expect(createEngineModelLoad).toHaveBeenCalledWith({format: 'ifc', spawn: spawnWorker})
  })

  it('a format no engine worker parses runs on the viewer\'s engine', async () => {
    const loader = makeLoader()
    loader.type = 'glb'
    await loader.parse(new ArrayBuffer(4), jest.fn(), jest.fn())
    expect(createEngineModelLoad).toHaveBeenCalledTimes(1)
    await expect(spawnOfLoad()()).resolves.toBe(viewerEngine)
    expect(spawnWorker).not.toHaveBeenCalled()
  })

  it('a failed worker load closes its engine', async () => {
    engineParse.mockRejectedValue(new Error('engine: open failed (-1)'))
    const loader = makeLoader()
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
    expect(workerEngine.close).toHaveBeenCalledTimes(1)
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
    const loader = makeLoader()
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

  it('a builder that never got a batch in fails the load with ITS error', async () => {
    IncrementalBatchedBuilder.mockImplementation(() => ({
      root: {parent: null},
      appendBatch: () => {
        throw new Error('appendBatch: bad placement table')
      },
      setPumpProgress: jest.fn(),
      hasContent: () => false,
      finalize: jest.fn(),
    }))
    const loader = makeLoader()
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
    expect(err.message).toMatch(/incremental build failed: appendBatch: bad placement table/)
    expect(err.cause.message).toBe('appendBatch: bad placement table')
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
    const loader = makeLoader()
    loader.type = 'ifc'
    const model = await loader.parse(new ArrayBuffer(4), jest.fn(), jest.fn())
    expect(model).toBeTruthy()
    expect(buildConwayIfcModel).toHaveBeenCalledWith([], facade, OPENED_MODEL_ID, expect.anything())
  })

  it('isEngineWorkerLoad: IFC, .ifczip and STEP, with the flag, demand geometry and a scene', () => {
    expect(isEngineWorkerLoad('ifc', {})).toBe(true)
    expect(isEngineWorkerLoad('ifczip', {})).toBe(true)
    expect(isEngineWorkerLoad('step', {})).toBe(true)
    expect(isEngineWorkerLoad('stp', {})).toBe(true)
    expect(isEngineWorkerLoad('glb', {})).toBe(false)
    expect(isEngineWorkerLoad(undefined, {})).toBe(false)
    expect(isEngineWorkerLoad('ifc', null)).toBe(false)
    isFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
    expect(isEngineWorkerLoad('ifc', {})).toBe(false)
    isFeatureEnabled.mockImplementation((name) => name === 'engineWorker')
    expect(isEngineWorkerLoad('ifc', {})).toBe(false)
  })

  // §7 step 9: the flag is on by default, and engine/engineRoute.js keeps a
  // load on the main-thread engine for the kill switch. Each such load says
  // why.
  describe('loads that stay on the main-thread engine', () => {
    let originalLocation
    beforeEach(() => {
      originalLocation = window.location
    })
    afterEach(() => {
      Object.defineProperty(window, 'location', {writable: true, value: originalLocation})
    })

    it.each([
      ['?feature=disableEngineWorker', ['disableEngineWorker'], 'Engine: main thread (?feature=disableEngineWorker)'],
    ])('%s parses on the main-thread engine, and says so', async (search, urlFlags, note) => {
      Object.defineProperty(window, 'location', {writable: true, value: {...originalLocation, search}})
      isFeatureEnabled.mockImplementation((name) =>
        name === 'demandGeometry' || name === 'engineWorker' || urlFlags.includes(name))
      expect(isEngineWorkerLoad('ifc', {})).toBe(false)
      const loader = makeLoader()
      loader.type = 'ifc'
      await loader.parse(new ArrayBuffer(4), jest.fn(), jest.fn())
      // The same model load, on the viewer's engine.
      expect(createEngineModelLoad).toHaveBeenCalledTimes(1)
      await expect(spawnOfLoad()()).resolves.toBe(viewerEngine)
      expect(spawnWorker).not.toHaveBeenCalled()
      expect(assembleBatchedModel.mock.calls[0][3].engine).toBe(viewerEngine)
      expect(getConwayDirectLogs().map((l) => l.text)).toContain(note)
    })

    it('the prod rollback beats a ?feature=engineWorker link, and the report names it', async () => {
      Object.defineProperty(window, 'location', {writable: true, value: {...originalLocation, search: '?feature=engineWorker'}})
      // What isFeatureEnabled answers for that URL: engineWorker on.
      isFeatureEnabled.mockImplementation((name) => name === 'demandGeometry' || name === 'engineWorker')
      flags[0].isActive = true
      try {
        expect(isEngineWorkerLoad('ifc', {})).toBe(false)
        const loader = makeLoader()
        loader.type = 'ifc'
        await loader.parse(new ArrayBuffer(4), jest.fn(), jest.fn())
        expect(spawnWorker).not.toHaveBeenCalled()
        await expect(spawnOfLoad()()).resolves.toBe(viewerEngine)
        expect(getConwayDirectLogs().map((l) => l.text)).toContain(
          'Engine: main thread (the engine worker is rolled back: disableEngineWorker is on in FeatureFlags.js)')
      } finally {
        flags[0].isActive = false
      }
    })

    it('a load the worker never could have taken (a mesh format) says nothing about engines', async () => {
      Object.defineProperty(window, 'location', {writable: true, value: {...originalLocation, search: '?feature=disableEngineWorker'}})
      isFeatureEnabled.mockImplementation((name) =>
        name === 'demandGeometry' || name === 'engineWorker' || name === 'disableEngineWorker')
      const loader = makeLoader()
      loader.type = 'glb'
      await loader.parse(new ArrayBuffer(4), jest.fn(), jest.fn())
      expect(getConwayDirectLogs().some((l) => l.text.startsWith('Engine:'))).toBe(false)
    })
  })
})
