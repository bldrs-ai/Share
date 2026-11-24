// Preview units that ShareIfcLoader#parse skips best-effort are COUNTED and
// stamped on the model as `previewUnitsSkipped`, which Loader.js#load turns
// into one GA event after the load succeeds (loader/reportLoadDiagnostics.js).
// Harness as in ShareIfcLoader.coordination.test.js.

import ShareIfcLoader from './ShareIfcLoader'
import {assembleBatchedModel} from './buildBatchedConwayModel'
import {buildConwayIfcModel} from './buildConwayIfcModel'
import {flatMeshToBufferGeometry} from './flatMeshToBufferGeometry'
import {IncrementalBatchedBuilder} from './incrementalBatchedBuilder'
import {parseIfcWithConway} from './conwayDirectIfcLoader'
import {payloadToPreviewMesh} from './parsePreviewMesh'
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
  vertexCount: 3, triangleCount: 1, instanceCount: 1, parentCount: 1, materialCount: 1,
  skippedFlatMeshes: 0, skippedPlacedGeometries: 0,
}
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


describe('viewer/ifc/ShareIfcLoader skipped preview units', () => {
  let appendBatch

  beforeEach(() => {
    jest.clearAllMocks()
    isFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
    appendBatch = jest.fn()
    IncrementalBatchedBuilder.mockImplementation(() => ({
      root: {parent: null},
      appendBatch,
      setPumpProgress: jest.fn(),
      hasContent: () => true,
      finalize: () => ({batches: [], stats: BUILD_STATS}),
    }))
    assembleBatchedModel.mockReturnValue({matrix: null, geometry: null, capabilities: {}, userData: {}})
    payloadToPreviewMesh.mockReturnValue(null)
    // A load that emits no batch takes the end-of-load merged build.
    buildConwayIfcModel.mockReturnValue({
      mesh: {matrix: null, geometry: null, capabilities: {}, userData: {}}, stats: BUILD_STATS,
    })
  })

  /**
   * @param {Function} drive called with the parse hooks, to emit preview payloads / batches
   * @return {Promise<object>} the parsed model
   */
  async function parseDriving(drive) {
    parseIfcWithConway.mockImplementation(
      // eslint-disable-next-line require-await
      async (buffer, api, settings, onProgress, onMeshBatch, onPreviewMesh) => {
        drive({onMeshBatch, onPreviewMesh})
        // eslint-disable-next-line require-await
        return {modelID: 7, captured: [], recapture: async () => PUMPED}
      })
    const ifcAPI = {
      GetCoordinationMatrix: jest.fn().mockResolvedValue(IDENTITY),
      OpenModel: jest.fn(),
      StreamAllMeshes: jest.fn(),
      properties: {},
    }
    const ifc = {
      ifcLastError: null,
      addIfcModel: jest.fn(),
      context: {
        items: {ifcModels: []},
        getScene: () => ({add: jest.fn(), remove: jest.fn()}),
        ifcCamera: {cameraControls: null, perspectiveCamera: null},
      },
    }
    return await new ShareIfcLoader({ifcAPI, ifc}).parse(new ArrayBuffer(4), jest.fn(), jest.fn())
  }

  it('counts a skipped parse preview mesh', async () => {
    payloadToPreviewMesh.mockImplementation(() => {
      throw new Error('bad payload')
    })
    const model = await parseDriving(({onPreviewMesh}) => {
      onPreviewMesh({expressID: 1})
      onPreviewMesh({expressID: 2})
    })
    expect(model.previewUnitsSkipped).toBe(2)
  })

  it('counts a demand preview batch skipped after the builder failed', async () => {
    appendBatch.mockImplementation(() => {
      throw new Error('append failed')
    })
    flatMeshToBufferGeometry.mockImplementation(() => {
      throw new Error('preview failed too')
    })
    const model = await parseDriving(({onMeshBatch}) => {
      onMeshBatch(PUMPED, 7, {done: 1, total: 2})
    })
    expect(model.previewUnitsSkipped).toBe(1)
  })

  it('reports zero when nothing was skipped', async () => {
    const model = await parseDriving(({onPreviewMesh, onMeshBatch}) => {
      onPreviewMesh({expressID: 1})
      onMeshBatch(PUMPED, 7, {done: 1, total: 1})
    })
    expect(model.previewUnitsSkipped).toBe(0)
  })
})
