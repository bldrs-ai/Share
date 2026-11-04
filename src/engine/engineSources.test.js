/** @jest-environment node */ // eslint-disable-line jsdoc/check-tag-names
/* eslint-disable no-magic-numbers, require-await */
import {ENGINE_CLOSE_TIMEOUT_MS, EngineSession} from './EngineSession'
import {createEngineHandler} from './engineHandler'
import {sourceIoLine} from './engineModelLoad'
import {findOpfsEntry, makeBlobStore, makeSyncHandleStore, openSourceStore} from './engineSources'
import {ENGINE_PROTOCOL_VERSION, Ev} from './protocol'
import {makeWorkerTransport} from './transports'


// engine-worker.md §7 step 4: the engine worker reads an OPFS source through a
// READ-ONLY sync access handle on the entry it finds itself, and the Blob
// store otherwise.

jest.mock('../loader/loadProgress', () => ({
  reportEngineLog: jest.fn(),
  reportEngineVersion: jest.fn(),
  reportSourceInfo: jest.fn(),
}))


const BYTES = Uint8Array.from({length: 64}, (_, i) => i)
const NAME = 'model.ifc.etag.commit'
const MTIME = 1_700_000_000_000


/** @return {File} the snapshot OPFS.worker.js hands the page for the entry */
function snapshot() {
  return new File([BYTES], NAME, {lastModified: MTIME})
}


/**
 * A FileSystemFileHandle stand-in whose sync access handle reads BYTES.
 *
 * @param {object} [options]
 * @param {string} [options.name]
 * @param {string} [options.mode] what the opened handle reports (a browser
 *   that ignores the option reports 'readwrite')
 * @param {Error} [options.refuse] thrown by createSyncAccessHandle
 * @param {number} [options.size]
 * @param {number} [options.lastModified] of the entry as it is now
 * @param {Array<string>} [options.log] records `access.close`
 * @return {object}
 */
function fakeEntry({name = NAME, mode = 'read-only', refuse = null, size = BYTES.length, lastModified = MTIME,
  log = []} = {}) {
  const entry = {
    kind: 'file',
    name,
    requested: [],
    access: null,
    getFile: async () => new File([BYTES.subarray(0, size)], name, {lastModified}),
    async createSyncAccessHandle(options) {
      entry.requested.push(options)
      if (refuse) {
        throw refuse
      }
      entry.access = {
        mode,
        closed: false,
        getSize: () => size,
        read: (into, {at}) => {
          const n = Math.max(0, Math.min(into.length, BYTES.length - at))
          into.set(BYTES.subarray(at, at + n))
          return n
        },
        close() {
          this.closed = true
          log.push('access.close')
        },
      }
      return entry.access
    },
  }
  return entry
}


/**
 * @param {object} children name → entry or directory
 * @return {object} a FileSystemDirectoryHandle stand-in
 */
function fakeDir(children) {
  return {
    kind: 'directory',
    async* entries() {
      for (const [name, handle] of Object.entries(children)) {
        yield [name, handle]
      }
    },
  }
}


/**
 * openSourceStore as the engine worker runs it, over a fake OPFS.
 *
 * @param {object} root
 * @param {object} [options]
 * @return {Promise<object>}
 */
function openIn(root, options = {}) {
  return openSourceStore({file: snapshot()}, {getOpfsRoot: async () => root, canSyncHandle: () => true, ...options})
}


describe('engine/engineSources', () => {
  it('finds the entry by name, size and lastModified anywhere in OPFS', async () => {
    const entry = fakeEntry()
    const root = fakeDir({
      BldrsLocalStorage: fakeDir({
        V1: fakeDir({
          // Same name, other bytes: an older copy elsewhere is not the snapshot.
          stale: fakeDir({[NAME]: fakeEntry({lastModified: MTIME - 1})}),
          owner: fakeDir({repo: fakeDir({[NAME]: entry})}),
        }),
      }),
    })
    expect(await findOpfsEntry(snapshot(), root)).toBe(entry)
    // A Blob has no name, and an upload kept in memory matches nothing.
    expect(await findOpfsEntry(new Blob([BYTES]), root)).toBeNull()
    expect(await findOpfsEntry(new File([BYTES], 'other.ifc', {lastModified: MTIME}), root)).toBeNull()
    // The scan is bounded.
    expect(await findOpfsEntry(snapshot(), root, 3)).toBeNull()
  })

  it('opens a read-only sync access handle on that entry and reads through it', async () => {
    const entry = fakeEntry()
    const {store, fallbackReason} = await openIn(fakeDir({[NAME]: entry}))
    expect(fallbackReason).toBeNull()
    expect(store.kind).toBe('syncHandle')
    // Asked for read-only, never the exclusive default.
    expect(entry.requested).toEqual([{mode: 'read-only'}])
    expect(store.byteLength).toBe(64)
    expect(Array.from(await store.read(10, 4))).toEqual([10, 11, 12, 13])
    expect(store.counters).toMatchObject({reads: 1, bytes: 4})
    store.close()
    expect(entry.access.closed).toBe(true)
  })

  it('closes and falls back when the browser ignored read-only and opened an exclusive handle', async () => {
    const entry = fakeEntry({mode: 'readwrite'})
    const {store, fallbackReason} = await openIn(fakeDir({[NAME]: entry}))
    expect(store.kind).toBe('blob')
    expect(fallbackReason).toBe('read-only sync access handles unsupported')
    expect(entry.access.closed).toBe(true)
  })

  it('falls back with the reason when the file is locked for writing', async () => {
    const locked = Object.assign(new Error('locked'), {name: 'NoModificationAllowedError'})
    const {store, fallbackReason} = await openIn(fakeDir({[NAME]: fakeEntry({refuse: locked})}))
    expect(store.kind).toBe('blob')
    expect(fallbackReason).toBe('NoModificationAllowedError: locked')
    expect(Array.from(await store.read(0, 3))).toEqual([0, 1, 2])
  })

  it('falls back, and closes the handle, when the entry changed between the lookup and the open', async () => {
    // Found as the snapshot, then rewritten under the same name and size
    // before the handle opened: only lastModified tells.
    const entry = fakeEntry()
    let reads = 0
    const first = entry.getFile
    entry.getFile = async () => (reads++ === 0 ? first() : new File([BYTES], NAME, {lastModified: MTIME + 5}))
    const {store, fallbackReason} = await openIn(fakeDir({[NAME]: entry}))
    expect(store.kind).toBe('blob')
    expect(fallbackReason).toMatch(/^entry changed since the snapshot/)
    expect(entry.access.closed).toBe(true)
  })

  it('uses the Blob store off OPFS, on the page, and with the kill switch, without touching OPFS', async () => {
    const getOpfsRoot = jest.fn(async () => fakeDir({}))
    expect((await openSourceStore({file: snapshot()}, {getOpfsRoot, canSyncHandle: () => true})).fallbackReason)
      .toBe('not an OPFS file')
    getOpfsRoot.mockClear()
    expect((await openSourceStore({file: snapshot()}, {getOpfsRoot, canSyncHandle: () => false})).fallbackReason)
      .toBe('no sync access handles here')
    expect((await openSourceStore({file: snapshot()}, {getOpfsRoot, allowSyncHandle: false})).fallbackReason)
      .toBe('disabled')
    expect(getOpfsRoot).not.toHaveBeenCalled()
    // Jest's global, like a page, has no createSyncAccessHandle.
    expect((await openSourceStore({file: snapshot()})).fallbackReason).toBe('no sync access handles here')
  })

  it('a short read through the handle fails the read rather than returning wrong bytes', async () => {
    const store = makeSyncHandleStore({read: () => 2, close: () => null}, 64)
    await expect(store.read(0, 8)).rejects.toThrow('short read at 0 (2 of 8 bytes)')
  })

  it('the Blob store counts its reads too', async () => {
    const store = makeBlobStore(new Blob([BYTES]))
    await store.read(0, 8)
    await store.read(8, 8)
    expect(store.counters).toMatchObject({reads: 2, bytes: 16})
  })

  it('sourceIoLine says which store, how much, and why it fell back', () => {
    expect(sourceIoLine({kind: 'syncHandle', reads: 3, bytes: 2 * 1024 * 1024, ms: 1500}))
      .toBe('Engine source I/O: OPFS sync access handle, 3 reads, 2.0 MB, 1.50s')
    expect(sourceIoLine({kind: 'blob', fallbackReason: 'not an OPFS file', reads: 1, bytes: 0, ms: 0}))
      .toBe('Engine source I/O: Blob store (not an OPFS file), 1 reads, 0.0 MB, 0.00s')
    expect(sourceIoLine({kind: 'resident'})).toBeUndefined()
  })
})


/**
 * A stub engine that reads 4 bytes through its store, logging CloseModel.
 *
 * @param {Array<string>} log
 * @return {object}
 */
function readingApi(log) {
  return {
    wasmModule: undefined,
    seen: null,
    async Init() {
      this.wasmModule = {HEAPU8: {byteLength: 1}}
    },
    async OpenModelStream(store) {
      this.seen = Array.from(await store.read(0, 4))
      return 0
    },
    CloseModel: jest.fn(() => log.push('CloseModel')),
    IsModelOpen: () => true,
    properties: {},
  }
}


/**
 * A session over the handler the way production runs it: a WORKER transport
 * (whose terminate() does not run the handler's dispose; only a `close`
 * request does), over a fake Worker that hands messages to the handler
 * without cloning (the fake entry has functions).
 *
 * @param {object} api
 * @param {object} root fake OPFS root
 * @param {Array<string>} log records `terminate`
 * @param {object} [flags] init flags
 * @return {Promise<EngineSession>}
 */
async function workerSession(api, root, log, flags = {}) {
  const listeners = []
  const toPage = (data) => queueMicrotask(() => listeners.forEach((cb) => cb({data})))
  const handler = createEngineHandler({
    loadIfcAPI: async () => function IfcAPI() {
      return api
    },
    post: toPage,
    yieldToLoop: () => Promise.resolve(),
    sourceOptions: {getOpfsRoot: async () => root, canSyncHandle: () => true},
  })
  const fakeWorker = {
    addEventListener: (type, cb) => type === 'message' && listeners.push(cb),
    postMessage: (msg) => queueMicrotask(() => handler.handle(msg)),
    terminate: () => log.push('terminate'),
  }
  const session = new EngineSession(makeWorkerTransport(fakeWorker), {epoch: 1})
  toPage({v: ENGINE_PROTOCOL_VERSION, epoch: 0, ev: Ev.HELLO, seq: 0})
  await session.init({flags})
  return session
}


describe('engine/engineHandler reads a windowed source through the sync handle', () => {
  it('reports the sync handle, and a worker session\'s close releases it AFTER CloseModel and BEFORE terminate', async () => {
    const log = []
    const api = readingApi(log)
    const entry = fakeEntry({log})
    const session = await workerSession(api, fakeDir({[NAME]: entry}), log)
    const opened = await session.open({file: snapshot()})
    expect(api.seen).toEqual([0, 1, 2, 3])
    expect(opened.source).toMatchObject({kind: 'syncHandle', fallbackReason: null, reads: 1, bytes: 4})
    expect(log).toEqual([])
    await session.close()
    expect(log).toEqual(['CloseModel', 'access.close', 'terminate'])
  })

  it('a session reading through the Blob store is terminated at once, with no close request', async () => {
    const log = []
    const api = readingApi(log)
    const session = await workerSession(api, fakeDir({}), log)
    expect((await session.open({file: snapshot()})).source).toMatchObject({kind: 'blob'})
    await session.close()
    expect(log).toEqual(['terminate'])
  })

  it('a close the engine never answers still terminates, after ENGINE_CLOSE_TIMEOUT_MS', async () => {
    const log = []
    const api = readingApi(log)
    const session = await workerSession(api, fakeDir({[NAME]: fakeEntry({log})}), log)
    await session.open({file: snapshot()})
    // The engine wedged: requests go out, nothing comes back.
    session.transport.post = () => null
    jest.useFakeTimers()
    try {
      const closing = session.close()
      expect(log).toEqual([])
      jest.advanceTimersByTime(ENGINE_CLOSE_TIMEOUT_MS)
      await closing
    } finally {
      jest.useRealTimers()
    }
    expect(log).toEqual(['terminate'])
  })

  it('a windowed open that falls back to buffered closes the handle at once', async () => {
    const log = []
    const api = readingApi(log)
    api.OpenModelStream = async () => -1
    api.OpenModelStreamed = async () => 0
    const entry = fakeEntry({log})
    const session = await workerSession(api, fakeDir({[NAME]: entry}), log)
    const opened = await session.open({file: snapshot()})
    expect(opened).toMatchObject({windowed: false, source: {kind: 'resident'}})
    expect(entry.access.closed).toBe(true)
  })

  it('an open that throws still closes the handle it opened', async () => {
    const log = []
    const api = readingApi(log)
    api.OpenModelStream = async () => {
      throw new Error('engine source: short read')
    }
    api.OpenModelStreamed = async () => {
      throw new Error('buffered too')
    }
    const entry = fakeEntry({log})
    const session = await workerSession(api, fakeDir({[NAME]: entry}), log)
    await expect(session.open({file: snapshot()})).rejects.toThrow()
    expect(entry.access.closed).toBe(true)
  })

  it('the kill switch in the init flags keeps the Blob store and never looks in OPFS', async () => {
    const log = []
    const api = readingApi(log)
    const entry = fakeEntry({log})
    const session = await workerSession(api, fakeDir({[NAME]: entry}), log, {disableEngineSyncHandle: true})
    expect((await session.open({file: snapshot()})).source).toMatchObject({kind: 'blob', fallbackReason: 'disabled'})
    expect(entry.requested).toEqual([])
  })
})
