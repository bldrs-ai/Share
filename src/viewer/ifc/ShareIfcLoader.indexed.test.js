// open-205 #2029: `ShareIfcLoader#parse` hands its caller the model at its
// index — the deferred open has returned, geometry has not streamed yet — so
// the tree, properties and search can come up before the last mesh. What is
// pinned here is ShareIfcLoader's part: that `onIndexed` reaches the engine
// parse as its index callback, and that what the caller then receives is the
// handle for the model the engine opened. The engine-side ordering (index
// before the first batch, awaited, best-effort) is conwayDirectIfcLoader's and
// is tested there; CadView's use of the handle is tested in CadView.test.jsx.
//
// Over a mocked IfcAPI, as the sibling ShareIfcLoader tests are: no jest test
// here instantiates the conway wasm engine.

import ShareIfcLoader from './ShareIfcLoader'
import {assembleBatchedModel} from './buildBatchedConwayModel'
import {IncrementalBatchedBuilder} from './incrementalBatchedBuilder'
import {parseIfcWithConway} from './conwayDirectIfcLoader'
import {isFeatureEnabled} from '../../FeatureFlags'


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


describe('viewer/ifc/ShareIfcLoader at the model\'s index (open-205 #2029)', () => {
  let infoSpy

  beforeEach(() => {
    jest.clearAllMocks()
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {})
    isFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
    // The engine parse, reduced to its contract: report the index with the
    // opened model's handle, then stream one batch.
    parseIfcWithConway.mockImplementation(
      async (buffer, api, settings, onProgress, onMeshBatch, onPreviewMesh, onIndexed) => {
        await onIndexed?.(OPENED_MODEL_ID)
        onMeshBatch?.([{expressID: 101, geometries: {size: () => 1}}], OPENED_MODEL_ID, {done: 1, total: 1})
        // eslint-disable-next-line require-await
        return {modelID: OPENED_MODEL_ID, captured: [], recapture: async () => []}
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
    const ifcAPI = makeIfcAPI()
    const loader = new ShareIfcLoader({ifcAPI, ifc: makeIfcNamespace()})
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
    // Its reads go to the model the engine opened.
    await handle.getSpatialStructure(0, 'names')
    expect(ifcAPI.properties.getSpatialStructure).toHaveBeenCalledWith(OPENED_MODEL_ID, 'names', {includeSolids: true})
  })

  it('asks the engine for no index callback when the caller passes none', async () => {
    const loader = new ShareIfcLoader({ifcAPI: makeIfcAPI(), ifc: makeIfcNamespace()})
    await loader.parse(new ArrayBuffer(4), jest.fn(), jest.fn())
    expect(parseIfcWithConway.mock.calls[0][6]).toBeUndefined()
  })
})
