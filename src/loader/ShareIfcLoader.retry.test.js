// A failed main-thread load must leave the viewer able to parse again (review
// of #2373, round 1). Two things re-parse into the same viewer after a
// failure: CadView's auth-state effect re-runs the open, and
// `loadModelWithAuthRetry` retries a Drive load. A failed load closes its
// engine (close is terminal, engine/ConwayEngine.js), so the load must have
// parsed into an engine of its own (`forLoad`), never the viewer's.
//
// Over the real model load (engine/engineModelLoad.js) and a real
// ConwayEngine, with only Conway's IfcAPI stubbed: the first open is refused,
// the second succeeds.
import ShareIfcLoader from './ShareIfcLoader'
import {ConwayEngine} from '../engine/ConwayEngine'
import {buildConwayIfcModel} from '../model/buildConwayIfcModel'
import {isFeatureEnabled} from '../FeatureFlags'


jest.mock('../model/buildConwayIfcModel', () => ({buildConwayIfcModel: jest.fn()}))
jest.mock('../model/engineModelReads', () => ({
  decorateConwayDirectIfcModel: jest.fn(),
  makeIndexedModelHandle: jest.fn(),
}))
jest.mock('../FeatureFlags', () => ({isFeatureEnabled: jest.fn(() => false), flags: []}))
jest.mock('../utils/location', () => ({hasParams: jest.fn(() => false)}))


const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


/** @return {object} a Conway IfcAPI stub whose first open is refused */
function makeIfcAPI() {
  let opens = 0
  return {
    wasmModule: {},
    OpenModel: jest.fn(() => (opens++ === 0 ? -1 : 0)),
    StreamAllMeshes: jest.fn(),
    CloseModel: jest.fn(),
    GetCoordinationMatrix: jest.fn(() => Promise.resolve(IDENTITY)),
  }
}


/** @return {object} a `viewer.IFC` stub */
function makeIfcNamespace() {
  return {
    ifcLastError: null,
    addIfcModel: jest.fn(),
    context: {items: {ifcModels: []}, getScene: () => null, ifcCamera: {}},
  }
}


describe('loader/ShareIfcLoader after a failed main-thread load', () => {
  let errorSpy
  let infoSpy

  beforeEach(() => {
    jest.clearAllMocks()
    isFeatureEnabled.mockImplementation(() => false)
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {})
    buildConwayIfcModel.mockImplementation(() => ({
      mesh: {matrix: null, geometry: null, userData: {}},
      stats: {vertexCount: 0, triangleCount: 0},
    }))
  })

  afterEach(() => {
    errorSpy.mockRestore()
    infoSpy.mockRestore()
  })

  it('parses again into the same viewer, each load on an engine of its own', async () => {
    const ifcAPI = makeIfcAPI()
    const viewerEngine = new ConwayEngine({ifcAPI})
    const loader = new ShareIfcLoader({engine: viewerEngine, ifc: makeIfcNamespace()})
    loader.type = 'ifc'
    const onError = jest.fn()

    await expect(loader.parse(new Uint8Array(4), jest.fn(), onError)).resolves.toBeNull()
    expect(onError).toHaveBeenCalledTimes(1)
    // The refusal's own error, not a closed engine's.
    expect(onError.mock.calls[0][0].message).not.toMatch(/closed/)

    const model = await loader.parse(new Uint8Array(4), jest.fn(), onError)
    expect(model).toBeTruthy()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(ifcAPI.OpenModel).toHaveBeenCalledTimes(2)
    // The viewer's engine was never the one a load closed.
    expect(viewerEngine.closed).toBe(false)
  })
})
