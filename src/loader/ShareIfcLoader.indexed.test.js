// open-205 #2029: `ShareIfcLoader#parse` hands its caller the model at its
// index — the deferred open has returned, geometry has not streamed yet — so
// the tree, properties and search can come up before the last mesh. What is
// pinned here is ShareIfcLoader's part: that `onIndexed` reaches the engine
// parse as its index callback, and that what the caller then receives is the
// handle for the model the engine opened. The engine-side ordering (index
// before the first batch, best-effort) is engine/engineModelLoad.js's and the
// engines', tested there and in engine/engineContract.test.js; CadView's use
// of the handle is tested in CadView.test.jsx.
//
// Over a fake engine load (engineLoad.fixture.js), as the sibling
// ShareIfcLoader tests are.

import ShareIfcLoader from './ShareIfcLoader'
import {assembleBatchedModel} from '../model/buildBatchedConwayModel'
import {IncrementalBatchedBuilder} from '../model/incrementalBatchedBuilder'
import {createEngineModelLoad} from '../engine/engineModelLoad'
import {makeFakeEngine, makeFakeEngineLoad} from './engineLoad.fixture'
import {isFeatureEnabled} from '../FeatureFlags'


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
jest.mock('../FeatureFlags', () => ({isFeatureEnabled: jest.fn()}))
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


describe('loader/ShareIfcLoader at the model\'s index (open-205 #2029)', () => {
  let infoSpy
  let engine
  let load

  beforeEach(() => {
    jest.clearAllMocks()
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {})
    isFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
    // The engine's part, reduced to its contract: report the index with the
    // opened model's handle, then stream one batch.
    engine = makeFakeEngine({modelID: OPENED_MODEL_ID})
    createEngineModelLoad.mockImplementation(() => {
      load = makeFakeEngineLoad({
        ifcAPI: makeIfcAPI(),
        engine,
        play: async ({onMeshBatch, onIndexed}) => {
          await onIndexed?.(OPENED_MODEL_ID)
          onMeshBatch?.([{expressID: 101, geometries: {size: () => 1}}], OPENED_MODEL_ID, {done: 1, total: 1})
          return {modelID: OPENED_MODEL_ID}
        },
      })
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

  it('hands onIndexed the opened model before its geometry streams', async () => {
    const loader = new ShareIfcLoader({engine: makeFakeEngine(), ifc: makeIfcNamespace()})
    const order = []
    IncrementalBatchedBuilder.mockImplementation(() => ({
      root: {parent: null},
      appendBatch: () => order.push('batch'),
      setPumpProgress: jest.fn(),
      hasContent: () => true,
      finalize: () => ({batches: [], stats: {vertexCount: 3, triangleCount: 1}}),
    }))
    let handle
    await loader.parse(new ArrayBuffer(4), jest.fn(), jest.fn(), {
      onIndexed: (indexed) => {
        handle = indexed
        order.push('indexed')
      },
    })
    expect(order).toEqual(['indexed', 'batch'])
    expect(handle.isIndexedModel).toBe(true)
    expect(handle.modelID).toBe(OPENED_MODEL_ID)
    // Its reads go to the engine that opened the model, and its alias is the
    // load's.
    expect(handle.engine).toBe(engine)
    expect(handle.ifcManager.ifcAPI).toBe(load.ifcAPI)
    await handle.getSpatialStructure(0, 'names')
    expect(engine.tree).toHaveBeenCalledWith({mode: 'names', includeSolids: true})
  })

  it('asks the engine for no index callback when the caller passes none', async () => {
    const loader = new ShareIfcLoader({engine: makeFakeEngine(), ifc: makeIfcNamespace()})
    await loader.parse(new ArrayBuffer(4), jest.fn(), jest.fn())
    expect(load.parse.mock.calls[0][1].onIndexed).toBeUndefined()
  })
})
