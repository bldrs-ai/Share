/* eslint-disable require-await */
// The idle GLB writer belongs to the load that scheduled it (open-205 #2019,
// design/new/in-app-model-switch.md §4.9): it captures from the engine THAT
// load parsed into, bound when the load ends, not from whatever the viewer
// holds when the browser is finally idle; and only it takes down the
// "Caching for next load…" flag it put up, so a left model's writer ending
// can't clear the next model's.
//
// Driven through the real `Loader#load` with the network and OPFS mocked,
// as in Loader.engineSourceRelease.test.js (whose helpers these are).

import {Group, Mesh, BufferGeometry} from 'three'
import axios from 'axios'
import {downloadToOPFS, doesFileExistInOPFS} from '../OPFS/utils'
import useStore from '../store/useStore'
import {sha1Hex} from '../utils/contentHash'
import {load} from './Loader'
import {exportAndCacheGlb} from './glbExport'
import {dereferenceAndProxyDownloadContents} from './urls'


jest.mock('axios')

jest.mock('../OPFS/utils', () => ({
  getModelFromOPFS: jest.fn(),
  downloadToOPFS: jest.fn(),
  downloadModel: jest.fn(),
  doesFileExistInOPFS: jest.fn(),
  writeBase64Model: jest.fn(),
  deleteFileFromOPFS: jest.fn(),
  readModelByPathFromOPFS: jest.fn(),
}))

jest.mock('./urls', () => ({
  dereferenceAndProxyDownloadContents: jest.fn(),
}))

// Only `exportAndCacheGlb` is replaced; the module's constants stay real
// because `Loader.js` imports one of them for the GLB title extras.
jest.mock('./glbExport', () => ({
  ...jest.requireActual('./glbExport'),
  exportAndCacheGlb: jest.fn(),
}))

// The real hash, unless a test makes the cache-key lookup fail.
jest.mock('../utils/contentHash', () => ({
  ...jest.requireActual('../utils/contentHash'),
  sha1Hex: jest.fn(),
}))


const IFC_TEXT = 'ISO-10303-21;\nHEADER;\nFILE_SCHEMA((\'IFC4\'));\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n'
const PATH = 'https://example.com/model.ifc'


/**
 * A page-level load through OPFS, the only route whose engine source is a
 * File (and so the only one a worker can open windowed).
 *
 * @param {object} viewer
 * @return {Promise<object>}
 */
function loadThroughOpfs(viewer) {
  return load(PATH, viewer, () => {}, true, () => {})
}


/** An OPFS `File` stand-in: what `Loader#load` actually calls on one. */
class FakeOpfsFile {
  /** @param {string} content */
  constructor(content) {
    this.content = content
    this.name = 'model.ifc'
    this.size = content.length
    this.lastModified = 1
  }

  /** @return {Promise<ArrayBuffer>} */
  async arrayBuffer() {
    return new TextEncoder().encode(this.content).buffer
  }

  /** @return {Promise<string>} */
  async text() {
    return this.content
  }

  /**
   * @param {number} start
   * @param {number} end
   * @return {FakeOpfsFile}
   */
  slice(start, end) {
    return new FakeOpfsFile(this.content.slice(start, end))
  }
}


/**
 * A viewer whose IFC loader returns a parsed model carrying its engine, the
 * shape every IFC/STEP load has (`model.engine`, model/engineModelReads.js).
 *
 * @param {object} engine the model's engine
 * @return {object}
 */
function makeViewer(engine) {
  const viewer = {
    IFC: {
      type: null,
      ifcLastError: null,
      addIfcModel: jest.fn(),
      loader: {
        ifcManager: {state: {models: []}, ifcAPI: {}},
      },
      context: {items: {ifcModels: []}, fitToFrame: jest.fn()},
    },
  }
  viewer.ifcLoader = {
    type: 'ifc',
    parse: jest.fn(async () => {
      const model = new Group()
      model.add(new Mesh(new BufferGeometry()))
      model.modelID = 0
      model.engine = engine
      model.ifcManager = {ifcAPI: {}}
      return model
    }),
  }
  return viewer
}


/** @return {object} an Engine's writer-facing half (engine/Engine.js) */
function makeEngine() {
  return {
    kind: 'mainThread',
    capture: jest.fn(async () => ({captureMs: 1})),
    spill: jest.fn(async () => ({spilled: false})),
  }
}


/** Let the idle-scheduled writer run (jsdom has no requestIdleCallback). */
async function flushScheduledWork() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  // Then the writer's `.finally` and the spill's own `.then`.
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
  }
}


describe('Loader#load: the idle GLB writer is bound to its own load', () => {
  beforeAll(() => {
    if (!window.crypto || !window.crypto.subtle) {
      const {webcrypto} = require('crypto')
      Object.defineProperty(window, 'crypto', {value: webcrypto, configurable: true})
    }
  })

  beforeEach(() => {
    jest.clearAllMocks()
    const actualHash = jest.requireActual('../utils/contentHash')
    sha1Hex.mockImplementation(actualHash.sha1Hex)
    useStore.getState().setGlbArtifact(null)
    useStore.getState().setIsCacheWriteInFlight(false)
    // A cache MISS, so each load schedules the writer.
    doesFileExistInOPFS.mockResolvedValue(false)
    downloadToOPFS.mockImplementation(async () => new FakeOpfsFile(IFC_TEXT))
    dereferenceAndProxyDownloadContents.mockImplementation(async (path) => [path, '', false, false])
    axios.get.mockResolvedValue({data: IFC_TEXT})
    exportAndCacheGlb.mockResolvedValue(true)
  })

  afterEach(() => {
    useStore.getState().setGlbArtifact(null)
    useStore.getState().setIsCacheWriteInFlight(false)
  })

  it('captures from the engine its load parsed into, even if the viewer\'s changed before it runs', async () => {
    // A main-thread load: its engine is the viewer's ConwayEngine as it was
    // when the load ran.
    const engineOfThisLoad = makeEngine()
    const viewer = makeViewer(engineOfThisLoad)

    await loadThroughOpfs(viewer)
    // Before the browser is idle, the viewer moves on: the next load's
    // engine (a theme rebuild, or the viewer's dispose dropping it).
    viewer.IFC.engine = makeEngine()
    await flushScheduledWork()

    expect(exportAndCacheGlb).toHaveBeenCalledTimes(1)
    const {capture} = exportAndCacheGlb.mock.calls[0][0]
    await capture({geometryExpressIds: null})
    expect(engineOfThisLoad.capture).toHaveBeenCalledTimes(1)
    expect(viewer.IFC.engine.capture).not.toHaveBeenCalled()
  })

  it('leaves the next load\'s in-flight flag up when the previous writer ends', async () => {
    const finishers = []
    exportAndCacheGlb.mockImplementation(() => new Promise((resolve) => {
      finishers.push(() => resolve(true))
    }))

    // A's writer starts, and is still running when B's starts.
    await loadThroughOpfs(makeViewer(makeEngine()))
    await flushScheduledWork()
    await loadThroughOpfs(makeViewer(makeEngine()))
    await flushScheduledWork()
    expect(finishers).toHaveLength(2)
    expect(useStore.getState().isCacheWriteInFlight).toBe(true)

    const [finishA, finishB] = finishers
    finishA()
    await flushScheduledWork()
    expect(useStore.getState().isCacheWriteInFlight, 'A ending leaves B\'s write shown').toBe(true)

    finishB()
    await flushScheduledWork()
    expect(useStore.getState().isCacheWriteInFlight).toBe(false)
  })
})
