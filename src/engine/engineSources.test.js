/* eslint-disable no-magic-numbers, require-await */
import {makeBlobStore, makeSyncHandleStore, openSourceStore} from './engineSources'
import {sourceIoLine} from './engineIfcLoad'
import {opfsFileHandleFor, rememberOpfsFileHandle} from '../OPFS/opfsFileHandles'


// engine-worker.md §7 step 4: the engine reads an OPFS source through a
// READ-ONLY sync access handle when it can, and the Blob store otherwise.

jest.mock('../loader/loadProgress', () => ({
  reportEngineLog: jest.fn(),
  reportEngineVersion: jest.fn(),
  reportSourceInfo: jest.fn(),
}))


const BYTES = Uint8Array.from({length: 64}, (_, i) => i)


/**
 * A FileSystemFileHandle stand-in whose sync access handle reads BYTES.
 *
 * @param {object} [options]
 * @param {string} [options.mode] what the opened handle reports (a browser
 *   that ignores the option reports 'readwrite')
 * @param {Error} [options.refuse] thrown by createSyncAccessHandle
 * @param {number} [options.size]
 * @return {object}
 */
function fakeEntry({mode = 'read-only', refuse = null, size = BYTES.length} = {}) {
  const entry = {
    requested: [],
    access: null,
    getFile: () => new Blob([BYTES]),
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
        },
      }
      return entry.access
    },
  }
  return entry
}


describe('engine/engineSources', () => {
  it('opens a read-only sync access handle and reads through it', async () => {
    const entry = fakeEntry()
    const {store, fallbackReason} = await openSourceStore({file: new Blob([BYTES]), opfsHandle: entry})
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
    const {store, fallbackReason} = await openSourceStore({file: new Blob([BYTES]), opfsHandle: entry})
    expect(store.kind).toBe('blob')
    expect(fallbackReason).toBe('read-only sync access handles unsupported')
    expect(entry.access.closed).toBe(true)
  })

  it('falls back with the reason when the file is locked for writing', async () => {
    const locked = Object.assign(new Error('locked'), {name: 'NoModificationAllowedError'})
    const {store, fallbackReason} = await openSourceStore({
      file: new Blob([BYTES]), opfsHandle: fakeEntry({refuse: locked}),
    })
    expect(store.kind).toBe('blob')
    expect(fallbackReason).toBe('NoModificationAllowedError: locked')
    expect(Array.from(await store.read(0, 3))).toEqual([0, 1, 2])
  })

  it('falls back when the entry is no longer the snapshot\'s bytes', async () => {
    const entry = fakeEntry({size: 99})
    const {store, fallbackReason} = await openSourceStore({file: new Blob([BYTES]), opfsHandle: entry})
    expect(store.kind).toBe('blob')
    expect(fallbackReason).toMatch(/entry is 99 bytes, snapshot 64/)
    expect(entry.access.closed).toBe(true)
  })

  it('uses the Blob store for a non-OPFS file, and when the kill switch is on', async () => {
    expect((await openSourceStore({file: new Blob([BYTES])})).fallbackReason).toBe('not an OPFS file')
    const entry = fakeEntry()
    const off = await openSourceStore({file: new Blob([BYTES]), opfsHandle: entry}, {allowSyncHandle: false})
    expect(off).toMatchObject({fallbackReason: 'disabled'})
    expect(entry.requested).toEqual([])
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

  it('opfsFileHandles pairs a File with the entry it came from', () => {
    const file = new Blob(['x'])
    const entry = fakeEntry()
    expect(opfsFileHandleFor(file)).toBeNull()
    rememberOpfsFileHandle(file, entry)
    expect(opfsFileHandleFor(file)).toBe(entry)
    rememberOpfsFileHandle(new Blob(['y']), {notAHandle: true})
    expect(opfsFileHandleFor(null)).toBeNull()
  })
})


describe('engine/engineHandler reads a windowed source through the sync handle', () => {
  /**
   * Drive a handler directly (no transport: a fake entry has functions, and
   * does not structured-clone the way a real FileSystemFileHandle does).
   *
   * @param {object} api
   * @return {Promise<object>} `{request, posted, handler}`
   */
  async function handlerOver(api) {
    const {createEngineHandler} = require('./engineHandler')
    const posted = []
    const handler = createEngineHandler({
      loadIfcAPI: async () => function IfcAPI() {
        return api
      },
      post: (m) => posted.push(m),
      yieldToLoop: () => Promise.resolve(),
    })
    let id = 0
    const request = async (op, args) => {
      const mine = ++id
      await handler.handle({v: 1, id: mine, op, args})
      const reply = posted.find((m) => m.re === mine)
      if (!reply.ok) {
        throw new Error(reply.error.message)
      }
      return reply.result
    }
    await request('init', {epoch: 1})
    return {request, posted, handler}
  }

  /** @return {object} a stub engine that reads 4 bytes through its store */
  function readingApi() {
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
      CloseModel: jest.fn(),
      properties: {},
    }
  }

  it('the open reports the sync handle, and close releases it after CloseModel', async () => {
    const api = readingApi()
    const entry = fakeEntry()
    const {request, handler} = await handlerOver(api)
    const opened = await request('open', {source: {file: new Blob([BYTES]), opfsHandle: entry}})
    expect(api.seen).toEqual([0, 1, 2, 3])
    expect(opened.source).toMatchObject({kind: 'syncHandle', fallbackReason: null, reads: 1, bytes: 4})
    expect(entry.access.closed).toBe(false)
    handler.dispose()
    expect(api.CloseModel).toHaveBeenCalledWith(0)
    expect(entry.access.closed).toBe(true)
  })

  it('a windowed open that falls back to buffered closes the handle at once', async () => {
    const api = readingApi()
    api.OpenModelStream = async () => -1
    api.OpenModelStreamed = async () => 0
    const entry = fakeEntry()
    const {request} = await handlerOver(api)
    const opened = await request('open', {source: {file: new Blob([BYTES]), opfsHandle: entry}})
    expect(opened).toMatchObject({windowed: false, source: {kind: 'resident'}})
    expect(entry.access.closed).toBe(true)
  })

  it('the kill switch in the init flags keeps the Blob store', async () => {
    const api = readingApi()
    const entry = fakeEntry()
    const {createEngineHandler} = require('./engineHandler')
    const posted = []
    const handler = createEngineHandler({
      loadIfcAPI: async () => function IfcAPI() {
        return api
      },
      post: (m) => posted.push(m),
    })
    await handler.handle({v: 1, id: 1, op: 'init', args: {epoch: 1, flags: {disableEngineSyncHandle: true}}})
    await handler.handle({v: 1, id: 2, op: 'open', args: {source: {file: new Blob([BYTES]), opfsHandle: entry}}})
    expect(posted.find((m) => m.re === 2).result.source).toMatchObject({kind: 'blob', fallbackReason: 'disabled'})
    expect(entry.requested).toEqual([])
  })
})
