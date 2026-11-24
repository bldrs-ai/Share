// The cache writer's batched-native path takes the GlbWriter worker for its
// build (open-205 #2030 target 1), and the container it writes that way is
// byte-for-byte the one it writes with no worker at all.
//
// The worker here is the REAL `GlbWriter.worker.js` handler, loaded into the
// test realm behind a stub `Worker` that forwards each request to it and each
// reply back — so the request shapes, the transfer lists and the replies are
// the production ones; only the thread is not.

const mockWriteGlbBytesToOPFS = jest.fn()
jest.mock('../OPFS/utils', () => ({
  writeGlbBytesToOPFS: (...args) => mockWriteGlbBytesToOPFS(...args),
}))

jest.mock('./glbCompress', () => ({
  activeGlbCompressionMode: () => null,
  isGlbBatchedActive: () => true,
  isGlbCollapseActive: () => true,
  schemaVersionFor: () => jest.requireActual('./glbCacheKey').BLDRS_GLB_SCHEMA_VERSION,
  compressGlb: (bytes, mode) => Promise.resolve({bytes, mode: mode || null}),
}))

import {liveBatchedModel} from './glbArtifact.fixture'
import {setGlbLogSink} from './glbLog'
import {gitHubCacheKey} from './sourceCacheKey'


const cacheKeyArgs = gitHubCacheKey({
  owner: 'bldrs-ai',
  repo: 'share',
  branch: 'main',
  filePath: 'sub/dir/index.ifc',
  shaHash: 'abc123',
})


/**
 * A `Worker` stand-in that runs the real worker module's message handler in
 * this realm, recording every request it is given.
 *
 * @param {Array<object>} requests receives `{command, transfer}` per request
 * @return {Function} a Worker class
 */
function workerRunningTheRealHandler(requests) {
  let handler = null
  let deliver = null
  const listen = jest.spyOn(self, 'addEventListener').mockImplementation((name, fn) => {
    if (name === 'message') {
      handler = fn
    }
  })
  jest.spyOn(self, 'postMessage').mockImplementation((data) => deliver(data))
  jest.isolateModules(() => {
    require('./GlbWriter.worker')
  })
  listen.mockRestore()
  return class {
    /** */
    constructor() {
      this.listeners = []
      deliver = (data) => setTimeout(() => this.listeners.forEach((fn) => fn({data})), 0)
    }
    /**
     * @param {object} data
     * @param {Array} transfer
     */
    postMessage(data, transfer) {
      requests.push({command: data.command, transfer})
      handler({data})
    }
    /**
     * @param {string} name
     * @param {Function} fn
     */
    addEventListener(name, fn) {
      if (name === 'message') {
        this.listeners.push(fn)
      }
    }
    /** Nothing to release. */
    terminate() {
      // Intentionally empty: the stub holds no thread.
    }
  }
}


/**
 * Run the cache writer on a fresh copy of the fixture model and return the
 * container it wrote.
 *
 * @return {Promise<Uint8Array>}
 */
async function writtenContainer() {
  mockWriteGlbBytesToOPFS.mockReset().mockResolvedValue(true)
  const {exportAndCacheGlb} = require('./glbExport')
  const ok = await exportAndCacheGlb({model: liveBatchedModel(), kindLabel: 'github', cacheKeyArgs})
  expect(ok).toBe(true)
  expect(mockWriteGlbBytesToOPFS).toHaveBeenCalledTimes(1)
  return mockWriteGlbBytesToOPFS.mock.calls[0][0]
}


describe('loader/glbExport batched-native writer in the GlbWriter worker', () => {
  let originalWorker
  let originalCreateObjectURL
  beforeEach(() => {
    jest.resetModules()
    originalWorker = global.Worker
    originalCreateObjectURL = global.URL.createObjectURL
    global.URL.createObjectURL = () => 'blob:fake'
    setGlbLogSink(() => {})
  })
  afterEach(() => {
    global.Worker = originalWorker
    global.URL.createObjectURL = originalCreateObjectURL
    setGlbLogSink(null)
    jest.restoreAllMocks()
  })

  it('builds in the worker and writes the container the no-worker writer writes', async () => {
    // No Worker: both the build and the inject-and-pack run in-process.
    global.Worker = undefined
    const inProcess = await writtenContainer()

    jest.resetModules()
    const requests = []
    global.Worker = workerRunningTheRealHandler(requests)
    const viaWorker = await writtenContainer()

    expect(requests.map((r) => r.command)).toEqual(['build-batched-glb', 'inject-and-pack'])
    // The snapshot's buffers were handed over, not copied.
    expect(requests[0].transfer.length).toBeGreaterThan(0)
    expect(Buffer.from(viaWorker).equals(Buffer.from(inProcess))).toBe(true)
    // Batched-collapsed slot, as the in-process writer chooses.
    expect(mockWriteGlbBytesToOPFS.mock.calls[0][1]).toMatch(/batched-collapsed/)
  })
})
