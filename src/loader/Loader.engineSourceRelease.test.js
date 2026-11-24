/* eslint-disable require-await */
// A worker-engine load's source is released exactly once, whether or not the
// GLB writer runs (codex review of Share#2095).
//
// A windowed open on the engine worker's Blob store holds the whole source
// file in memory for the load (engine/engineSources.js#makeBlobStore,
// Share#2092), and only a SPILL lets it go. The GLB writer sends one once its
// capture is done (Loader.js#spillEngineSource) — but a load with no writer
// (a GLB cache lookup that failed, a source with no cache key) never reached
// it, so the copy, up to 1 GiB, stayed until the session closed. `load` now
// sends the same request itself when it schedules no writer.
//
// Driven through the real `Loader#load`, with the network and OPFS mocked and
// the IFC loader stood in for by one whose model carries a stub engine
// session: what the worker answers is engineSources.test.js's concern; this
// file pins WHEN the page asks, and how often.

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
 * A viewer whose IFC loader returns a parsed model carrying `engineSession`,
 * the shape engineModelLoad.js gives a worker load (`ifcAPI.engineSession`).
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
      model.ifcManager = {ifcAPI: {engineSession}}
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


describe('Loader#load and the engine worker\'s source release', () => {
  let file

  // The non-GitHub cache key is a SHA-1 of the source bytes (as in
  // Loader.bldNested.test.js).
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
    // A cache MISS, so a load with a cache key schedules the writer.
    doesFileExistInOPFS.mockResolvedValue(false)
    file = new FakeOpfsFile(IFC_TEXT)
    downloadToOPFS.mockResolvedValue(file)
    dereferenceAndProxyDownloadContents.mockImplementation(async (path) => [path, '', false, false])
    axios.get.mockResolvedValue({data: IFC_TEXT})
    exportAndCacheGlb.mockResolvedValue(true)
  })

  afterEach(() => {
    useStore.getState().setGlbArtifact(null)
  })

  it('releases the source once the load is parsed when the cache lookup failed and no writer runs', async () => {
    // The lookup fails, so the load goes on with no cache key and no writer.
    sha1Hex.mockRejectedValue(new Error('crypto.subtle unavailable'))
    const session = makeEngineSession()

    await loadThroughOpfs(makeViewer(session))

    // The load did come through OPFS and reach the lookup: it was the
    // lookup's failure, not some earlier exit, that left no writer.
    expect(downloadToOPFS).toHaveBeenCalledTimes(1)
    expect(sha1Hex).toHaveBeenCalledTimes(1)
    expect(exportAndCacheGlb).not.toHaveBeenCalled()
    // Sent by the load itself, not deferred to idle time: no writer is
    // coming to send it, and the copy is the whole file.
    expect(session.spill).toHaveBeenCalledTimes(1)
    expect(session.spill).toHaveBeenCalledWith(null)

    await flushScheduledWork()
    expect(session.spill).toHaveBeenCalledTimes(1)
  })

  it('leaves the release to the writer when one is scheduled, and it releases exactly once', async () => {
    const session = makeEngineSession()
    // Held until the test lets it finish, so the release is seen to wait for
    // the writer, not merely to happen by the time the test looks.
    let finishWriter
    exportAndCacheGlb.mockImplementation(() => new Promise((resolve) => {
      finishWriter = () => resolve(true)
    }))

    await loadThroughOpfs(makeViewer(session))
    // Scheduled, not yet run: nothing may release the copy the capture reads.
    expect(session.spill).not.toHaveBeenCalled()

    await flushScheduledWork()
    expect(exportAndCacheGlb).toHaveBeenCalledTimes(1)
    expect(session.spill).not.toHaveBeenCalled()

    finishWriter()
    await flushScheduledWork()
    expect(session.spill).toHaveBeenCalledTimes(1)
    // The writer's spill names the OPFS File, so a buffered open can spill
    // to windows over it.
    expect(session.spill).toHaveBeenCalledWith(file)
  })

  it('asks nothing of a main-thread load, which has no engine session', async () => {
    sha1Hex.mockRejectedValue(new Error('crypto.subtle unavailable'))
    const viewer = makeViewer(null)

    const model = await loadThroughOpfs(viewer)
    await flushScheduledWork()

    expect(model).toBeTruthy()
    expect(exportAndCacheGlb).not.toHaveBeenCalled()
  })
})
