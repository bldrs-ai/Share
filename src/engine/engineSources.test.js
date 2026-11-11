/** @jest-environment node */ // eslint-disable-line jsdoc/check-tag-names
/* eslint-disable no-magic-numbers, require-await */
import {ENGINE_CLOSE_TIMEOUT_MS, EngineSession} from './EngineSession'
import {createEngineHandler} from './engineHandler'
import {sourceIoLine} from './engineModelLoad'
import {
  RESIDENT_SOURCE_MAX_BYTES, findOpfsEntry, makeBlobStore, makeSyncHandleStore, openSourceStore,
} from './engineSources'
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
  })

  it('does not take a same-named entry whose bytes are not the snapshot\'s', async () => {
    // Only the stale copies, so the match test itself decides.
    expect(await findOpfsEntry(snapshot(), fakeDir({[NAME]: fakeEntry({lastModified: MTIME - 1})}))).toBeNull()
    expect(await findOpfsEntry(snapshot(), fakeDir({[NAME]: fakeEntry({size: 8})}))).toBeNull()
  })

  it('skips a same-named entry it cannot read and keeps looking', async () => {
    const broken = fakeEntry()
    broken.getFile = async () => {
      throw Object.assign(new Error('gone'), {name: 'NotFoundError'})
    }
    const entry = fakeEntry()
    const root = fakeDir({a: fakeDir({[NAME]: entry}), b: fakeDir({[NAME]: broken})})
    expect(await findOpfsEntry(snapshot(), root)).toBe(entry)
  })

  it('a scan past its bound falls back with its own reason', async () => {
    const root = fakeDir({x: fakeDir({y: fakeDir({[NAME]: fakeEntry()})})})
    await expect(findOpfsEntry(snapshot(), root, 2)).rejects.toThrow('OPFS scan limit (2 entries)')
    const {fallbackReason} = await openSourceStore({file: snapshot()},
      {getOpfsRoot: async () => root, canSyncHandle: () => true, maxOpfsEntries: 2})
    expect(fallbackReason).toBe('OPFS lookup failed: Error: OPFS scan limit (2 entries)')
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

  it('uses the Blob store off OPFS, on the page, and with the kill switch, opening no handle', async () => {
    const getOpfsRoot = jest.fn(async () => fakeDir({}))
    expect((await openSourceStore({file: snapshot()}, {getOpfsRoot, canSyncHandle: () => true})).fallbackReason)
      .toBe('not an OPFS file')
    // On the page and under the kill switch the entry is still LOOKED UP —
    // its path keys the index sidecar a Blob-store open reopens from — but
    // no sync access handle is ever requested on it.
    const entry = fakeEntry()
    const root = fakeDir({[NAME]: entry})
    const onPage = await openSourceStore({file: snapshot()}, {getOpfsRoot: async () => root, canSyncHandle: () => false})
    expect(onPage).toMatchObject({fallbackReason: 'no sync access handles here', entryPath: NAME})
    const disabled = await openSourceStore({file: snapshot()}, {getOpfsRoot: async () => root, allowSyncHandle: false})
    expect(disabled).toMatchObject({fallbackReason: 'disabled', entryPath: NAME})
    expect(entry.requested).toEqual([])
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

  it('over an OPFS entry the Blob store reads the whole file once for the load, and reads the Blob again after the release', async () => {
    // Share#2092: conway re-reads PSB ~4.7× over, and each Blob read is slow
    // in Firefox, so the load reads the file once and copies out of that.
    const root = fakeDir({[NAME]: fakeEntry()})
    const {store, fallbackReason} = await openIn(root, {allowSyncHandle: false, holdResident: true})
    expect(fallbackReason).toBe('disabled')
    expect(store.counters).toMatchObject({reads: 1, bytes: BYTES.length, residentBytes: BYTES.length})
    const first = await store.read(4, 3)
    await store.read(60, 8)
    expect(Array.from(first)).toEqual([4, 5, 6])
    // A standalone copy: a view would pin the whole file past the release.
    expect(first.buffer.byteLength).toBe(3)
    expect(store.counters).toMatchObject({reads: 1, residentReads: 2})
    expect(store.releaseResident()).toBe(true)
    expect(Array.from(await store.read(4, 3))).toEqual([4, 5, 6])
    expect(store.counters).toMatchObject({reads: 2, bytes: BYTES.length + 3, residentReads: 2})
    expect(store.releaseResident()).toBe(false)
  })

  it('takeWhole hands the whole-file copy over once, and later reads go to the Blob (Share#2139)', async () => {
    const root = fakeDir({[NAME]: fakeEntry()})
    const {store} = await openIn(root, {allowSyncHandle: false, holdResident: true})
    const held = store.takeWhole()
    expect(Array.from(held)).toEqual(Array.from(BYTES))
    expect(store.takeWhole()).toBeNull()
    expect(store.releaseResident()).toBe(false)
    expect(Array.from(await store.read(4, 3))).toEqual([4, 5, 6])
    expect(store.counters).toMatchObject({reads: 2, residentReads: 0})
  })

  it('a synchronous read is served from the whole-file copy too', async () => {
    // STEP's windowed open faults windows in through readSync (conway#757).
    const reader = jest.fn(function ReaderSync() {
      this.readAsArrayBuffer = () => {
        throw new Error('read the Blob')
      }
    })
    const store = makeBlobStore(new Blob([BYTES]), undefined, reader)
    await store.holdResident()
    expect(Array.from(store.readSync(1, 2))).toEqual([1, 2])
    expect(store.counters).toMatchObject({reads: 1, residentReads: 1})
  })

  it('holds no whole-file copy off OPFS, for a spill, over the ceiling, or when the read fails', async () => {
    const offOpfs = await openSourceStore({file: snapshot()},
      {getOpfsRoot: async () => fakeDir({}), canSyncHandle: () => true, holdResident: true})
    expect(offOpfs.store.counters).toMatchObject({reads: 0, residentBytes: 0})
    // A spill does not ask (holdResident defaults off): it exists to free memory.
    const spill = await openIn(fakeDir({[NAME]: fakeEntry()}), {allowSyncHandle: false})
    expect(spill.store.counters).toMatchObject({reads: 0, residentBytes: 0})

    // An entry over the ceiling: a File stand-in that only claims the size.
    const huge = RESIDENT_SOURCE_MAX_BYTES + 1
    const arrayBuffer = jest.fn()
    const big = {name: NAME, size: huge, lastModified: MTIME, slice: () => new Blob([BYTES]), arrayBuffer}
    const bigEntry = {kind: 'file', name: NAME, getFile: async () => ({size: huge, lastModified: MTIME})}
    const over = await openSourceStore({file: big},
      {getOpfsRoot: async () => fakeDir({[NAME]: bigEntry}), allowSyncHandle: false, holdResident: true})
    expect(arrayBuffer).not.toHaveBeenCalled()
    expect(over.store.counters).toMatchObject({residentBytes: 0, residentSkipped: 'over 1024 MB'})

    const stale = new File([BYTES], NAME, {lastModified: MTIME})
    stale.arrayBuffer = async () => {
      throw Object.assign(new Error('changed'), {name: 'NotReadableError'})
    }
    const failed = await openSourceStore({file: stale},
      {getOpfsRoot: async () => fakeDir({[NAME]: fakeEntry()}), allowSyncHandle: false, holdResident: true})
    expect(failed.store.counters).toMatchObject({reads: 0, residentBytes: 0, residentSkipped: 'NotReadableError: changed'})
    expect(Array.from(await failed.store.read(0, 2))).toEqual([0, 1])
  })

  it('sourceIoLine says which store, how much, and why it fell back', () => {
    expect(sourceIoLine({kind: 'syncHandle', reads: 3, bytes: 2 * 1024 * 1024, ms: 1500}))
      .toBe('Engine source I/O: OPFS sync access handle, 3 reads, 2.0 MB, 1.50s')
    expect(sourceIoLine({kind: 'blob', fallbackReason: 'not an OPFS file', reads: 1, bytes: 0, ms: 0}))
      .toBe('Engine source I/O: Blob store (not an OPFS file), 1 reads, 0.0 MB, 0.00s')
    expect(sourceIoLine({kind: 'resident'})).toBeUndefined()
    // Share#2092: whether the Blob store held the whole file for the load.
    expect(sourceIoLine({kind: 'blob', fallbackReason: 'read-only sync access handles unsupported', reads: 1,
      bytes: 860 * 1024 * 1024, ms: 680, residentBytes: 860 * 1024 * 1024, residentReads: 927}))
      .toBe('Engine source I/O: Blob store (read-only sync access handles unsupported; whole file held, ' +
        '927 reads from memory), 1 reads, 860.0 MB, 0.68s')
    expect(sourceIoLine({kind: 'blob', fallbackReason: 'disabled', reads: 2, bytes: 0, ms: 0, residentBytes: 0,
      residentSkipped: 'over 1024 MB'}))
      .toBe('Engine source I/O: Blob store (disabled; whole file not held: over 1024 MB), 2 reads, 0.0 MB, 0.00s')
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
 * @param {object} [flags] init flags, over `disableBufferedSource`: these
 *   tests are of the windowed open, which the source policy
 *   (sourcePolicy.js) takes by default only over the cap; its buffered
 *   default is tested in engineSourcePolicy.test.js
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
  await session.init({flags: {disableBufferedSource: true, ...flags}})
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

  it('closing twice is one polite close', async () => {
    const log = []
    const api = readingApi(log)
    const session = await workerSession(api, fakeDir({[NAME]: fakeEntry({log})}), log)
    await session.open({file: snapshot()})
    const first = session.close()
    expect(session.close()).toBe(first)
    await first
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

  it('a Blob-store open holds the whole file for the load, and the writer\'s spill lets it go', async () => {
    const log = []
    const api = readingApi(log)
    const session = await workerSession(api, fakeDir({[NAME]: fakeEntry({log})}), log, {disableEngineSyncHandle: true})
    const opened = await session.open({file: snapshot()})
    expect(api.seen).toEqual([0, 1, 2, 3])
    expect(opened.source).toMatchObject({kind: 'blob', reads: 1, bytes: BYTES.length, residentBytes: BYTES.length,
      residentReads: 1})
    // The GLB writer's spill (Loader.js#spillEngineSource) is the release.
    expect(await session.spill(snapshot())).toMatchObject({spilled: false, reason: 'windowed', released: true})
    expect(await session.spill(snapshot())).toMatchObject({released: false})
    await session.close()
  })

  it('a load with no GLB writer lets the whole-file copy go with a spill that names no file', async () => {
    // Loader.js#load sends this when it schedules no writer (a failed cache
    // lookup, no cache key): without it the copy stayed until close (codex
    // review of Share#2095). There is no File to name on that path.
    const log = []
    const api = readingApi(log)
    const open = api.OpenModelStream
    api.OpenModelStream = async function(store) {
      this.store = store
      return open.call(this, store)
    }
    const session = await workerSession(api, fakeDir({[NAME]: fakeEntry({log})}), log, {disableEngineSyncHandle: true})
    await session.open({file: snapshot()})
    expect(api.store.counters).toMatchObject({reads: 1, residentReads: 1})
    expect(await session.spill(null)).toMatchObject({spilled: false, reason: 'windowed', released: true})
    // Let go: the next read is a Blob read, not a copy out of the held file.
    expect(Array.from(await api.store.read(0, 4))).toEqual([0, 1, 2, 3])
    expect(api.store.counters).toMatchObject({reads: 2, residentReads: 1})
    expect(await session.spill(null)).toMatchObject({released: false})
    await session.close()
  })

  it('disableEngineResidentSource reads windows from the Blob for the whole load', async () => {
    const log = []
    const api = readingApi(log)
    const session = await workerSession(api, fakeDir({[NAME]: fakeEntry({log})}), log,
      {disableEngineSyncHandle: true, disableEngineResidentSource: true})
    expect((await session.open({file: snapshot()})).source)
      .toMatchObject({kind: 'blob', reads: 1, bytes: 4, residentBytes: 0, residentReads: 0})
    await session.close()
  })

  it('the kill switch in the init flags keeps the Blob store and never opens a sync handle', async () => {
    const log = []
    const api = readingApi(log)
    const entry = fakeEntry({log})
    const session = await workerSession(api, fakeDir({[NAME]: entry}), log, {disableEngineSyncHandle: true})
    expect((await session.open({file: snapshot()})).source).toMatchObject({kind: 'blob', fallbackReason: 'disabled'})
    expect(entry.requested).toEqual([])
  })
})
