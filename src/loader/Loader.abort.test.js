/* eslint-disable require-await */
// Loader#load given up by its caller (open-205 #2011 step A): CadView aborts
// a load's signal on an in-app switch under `?feature=spaModelNav`. The load
// must reject as aborted at its next await, never fall back to a second
// download, hand the parse the signal, quiet the callbacks of the work it
// could not stop, and skip the idle GLB writer of a model the user has left.
//
// Driven through the real `Loader#load` with the network and OPFS mocked, as
// Loader.engineSourceRelease.test.js does.

import {Group, Mesh, BufferGeometry} from 'three'
import axios from 'axios'
import {downloadToOPFS, doesFileExistInOPFS} from '../OPFS/utils'
import useStore from '../store/useStore'
import {LoadAbortedError} from '../utils/loadAbort'
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

jest.mock('./glbExport', () => ({
  ...jest.requireActual('./glbExport'),
  exportAndCacheGlb: jest.fn(),
}))


const IFC_TEXT = 'ISO-10303-21;\nHEADER;\nFILE_SCHEMA((\'IFC4\'));\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n'
const PATH = 'https://example.com/model.ifc'


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
 * The page side of an engine session, as `load` sees it on the parsed model.
 * Its spill answers what a windowed Blob-store open answers
 * (engineHandler.js, SPILL).
 *
 * @return {object}
 */
function makeEngineSession() {
  return {
    kind: 'worker',
    spill: jest.fn(async () => ({
      spilled: false, reason: 'windowed', released: true, source: {kind: 'blob', residentBytes: IFC_TEXT.length},
    })),
    capture: jest.fn(),
  }
}


/**
 * A viewer whose IFC loader returns a parsed model carrying its engine
 * (`model.engine`, model/engineModelReads.js).
 *
 * @param {object} engineSession
 * @return {object}
 */
function makeViewer(engineSession) {
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
      model.engine = engineSession
      model.ifcManager = {ifcAPI: {}}
      return model
    }),
  }
  return viewer
}


/** Let the idle-scheduled writer run (jsdom has no requestIdleCallback). */
async function flushScheduledWork() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  // Then the writer's `.finally` and the spill's own `.then`.
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
  }
}


/**
 * Wait, a macrotask at a time, until `isDone` holds: the load's awaits before
 * a given step (the hash, the cache lookup) take more than a microtask.
 *
 * @param {function(): boolean} isDone
 */
async function waitUntil(isDone) {
  const maxTicks = 50
  for (let i = 0; i < maxTicks && !isDone(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  expect(isDone()).toBe(true)
}


describe('Loader#load given up by its caller', () => {
  let file
  let onProgress
  let setOpfsFile

  beforeAll(() => {
    if (!window.crypto || !window.crypto.subtle) {
      const {webcrypto} = require('crypto')
      Object.defineProperty(window, 'crypto', {value: webcrypto, configurable: true})
    }
  })

  beforeEach(() => {
    jest.clearAllMocks()
    useStore.getState().setGlbArtifact(null)
    useStore.getState().setIsCacheWriteInFlight(false)
    doesFileExistInOPFS.mockResolvedValue(false)
    file = new FakeOpfsFile(IFC_TEXT)
    downloadToOPFS.mockResolvedValue(file)
    dereferenceAndProxyDownloadContents.mockImplementation(async (path) => [path, '', false, false])
    axios.get.mockResolvedValue({data: IFC_TEXT})
    exportAndCacheGlb.mockResolvedValue(true)
    onProgress = jest.fn()
    setOpfsFile = jest.fn()
  })

  afterEach(() => {
    useStore.getState().setGlbArtifact(null)
    useStore.getState().setIsCacheWriteInFlight(false)
  })

  /**
   * @param {object} viewer
   * @param {AbortSignal} signal
   * @return {Promise<object>}
   */
  function loadThroughOpfs(viewer, signal) {
    return load(PATH, viewer, onProgress, true, setOpfsFile, '', {signal})
  }

  it('rejects as aborted mid-download, and does not fetch the model a second time', async () => {
    let downloadProgress
    let finishDownload
    downloadToOPFS.mockImplementation((...args) => {
      downloadProgress = args[6]
      return new Promise((resolve) => {
        finishDownload = () => resolve(file)
      })
    })
    const viewer = makeViewer(makeEngineSession())
    const controller = new AbortController()
    const loading = loadThroughOpfs(viewer, controller.signal)
    await waitUntil(() => downloadToOPFS.mock.calls.length > 0)
    onProgress.mockClear()

    controller.abort()
    await expect(loading).rejects.toBeInstanceOf(LoadAbortedError)

    // The OPFS worker's request could not be stopped; what it reports after
    // the abort reaches nothing of the next model's.
    downloadProgress('Downloading model data...')
    finishDownload()
    await Promise.resolve()
    expect(onProgress).not.toHaveBeenCalled()
    expect(setOpfsFile).not.toHaveBeenCalled()
    // An abort in the OPFS path is not an OPFS failure: no direct fetch.
    expect(axios.get).not.toHaveBeenCalled()
    expect(viewer.ifcLoader.parse).not.toHaveBeenCalled()
  })

  it('hands the parse the signal, and rejects as aborted when it is given up there', async () => {
    const viewer = makeViewer(makeEngineSession())
    viewer.ifcLoader.parse.mockImplementation((buffer, progress, onError, {signal}) =>
      new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new LoadAbortedError()))
      }))
    const controller = new AbortController()
    const loading = loadThroughOpfs(viewer, controller.signal)
    await waitUntil(() => viewer.ifcLoader.parse.mock.calls.length > 0)
    expect(viewer.ifcLoader.parse.mock.calls[0][3].signal).toBe(controller.signal)

    controller.abort()
    await expect(loading).rejects.toBeInstanceOf(LoadAbortedError)
    expect(exportAndCacheGlb).not.toHaveBeenCalled()
  })

  it('drops a parse that settles after the abort, closing its engine', async () => {
    const session = {...makeEngineSession(), close: jest.fn()}
    const viewer = makeViewer(session)
    const controller = new AbortController()
    const parse = viewer.ifcLoader.parse.getMockImplementation()
    // The parse ignores the signal (a mesh loader cannot be stopped) and
    // returns after the user has left.
    viewer.ifcLoader.parse.mockImplementation(async (...args) => {
      const model = await parse(...args)
      controller.abort()
      return model
    })

    await expect(loadThroughOpfs(viewer, controller.signal)).rejects.toBeInstanceOf(LoadAbortedError)
    await flushScheduledWork()
    expect(session.close).toHaveBeenCalled()
    expect(exportAndCacheGlb).not.toHaveBeenCalled()
  })

  it('skips the idle GLB writer of a model left before it ran', async () => {
    const viewer = makeViewer(makeEngineSession())
    const controller = new AbortController()
    const model = await loadThroughOpfs(viewer, controller.signal)
    expect(model).toBeTruthy()
    expect(useStore.getState().isCacheWriteInFlight).toBe(true)

    controller.abort()
    await flushScheduledWork()

    expect(exportAndCacheGlb).not.toHaveBeenCalled()
    expect(useStore.getState().isCacheWriteInFlight).toBe(false)
  })

  it('a load whose signal never aborts runs its writer, as without one', async () => {
    const viewer = makeViewer(makeEngineSession())
    const controller = new AbortController()
    await loadThroughOpfs(viewer, controller.signal)
    await flushScheduledWork()
    expect(exportAndCacheGlb).toHaveBeenCalledTimes(1)
  })
})
