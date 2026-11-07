/** @jest-environment node */ // eslint-disable-line jsdoc/check-tag-names
/* eslint-disable no-magic-numbers, require-await */
import {EngineSession} from './EngineSession'
import {createEngineHandler} from './engineHandler'
import {indexLine} from './engineModelLoad'
import {SIDECAR_DIR, discardSidecar, readSidecar, sidecarKey, sweepSidecars, writeSidecar} from './engineSidecars'
import {locateOpfsEntry, makeBlobStore, makeSyncHandleStore, openSourceStore} from './engineSources'
import {ENGINE_PROTOCOL_VERSION, Ev} from './protocol'
import {makeWorkerTransport} from './transports'


// engine-worker.md §7 step 8, §11 (conway#756, #757): the engine worker
// reopens a model from the index sidecar a previous open saved, so the
// reopen skips the parse — for IFC and STEP alike — and both of its stores
// read synchronously, which is what a windowed STEP open needs.

jest.mock('../loader/loadProgress', () => ({
  reportEngineLog: jest.fn(),
  reportEngineVersion: jest.fn(),
  reportSourceInfo: jest.fn(),
}))


const BYTES = Uint8Array.from({length: 64}, (_, i) => i)
const NAME = 'logo.step.etag.commit'
const MTIME = 1_700_000_000_000


/** @return {File} the snapshot OPFS.worker.js hands the page for the entry */
function snapshot() {
  return new File([BYTES], NAME, {lastModified: MTIME})
}


/**
 * A writable in-memory OPFS directory: what sidecars are read from and
 * written to, and what the source entry is found in.
 *
 * @param {object} [children] name → file entry or directory
 * @return {object} a FileSystemDirectoryHandle stand-in
 */
function memoryDir(children = {}) {
  const dir = {
    kind: 'directory',
    children,
    async* entries() {
      for (const entry of Object.entries(dir.children)) {
        yield entry
      }
    },
    async getDirectoryHandle(name, {create = false} = {}) {
      if (!dir.children[name]) {
        if (!create) {
          throw Object.assign(new Error(name), {name: 'NotFoundError'})
        }
        dir.children[name] = memoryDir()
      }
      return dir.children[name]
    },
    async getFileHandle(name, {create = false} = {}) {
      if (!dir.children[name]) {
        if (!create) {
          throw Object.assign(new Error(name), {name: 'NotFoundError'})
        }
        dir.children[name] = memoryFile(name, new Uint8Array(0))
      }
      return dir.children[name]
    },
    async removeEntry(name) {
      if (!dir.children[name]) {
        throw Object.assign(new Error(name), {name: 'NotFoundError'})
      }
      delete dir.children[name]
    },
  }
  return dir
}


/**
 * @param {string} name
 * @param {Uint8Array} bytes
 * @param {object} [options]
 * @param {number} [options.lastModified]
 * @return {object} a FileSystemFileHandle stand-in, with a read-only sync
 *   access handle for a source entry
 */
function memoryFile(name, bytes, {lastModified = MTIME} = {}) {
  const file = {
    kind: 'file',
    name,
    bytes,
    getFile: async () => new File([file.bytes], name, {lastModified}),
    async createWritable() {
      const parts = []
      return {
        write: async (chunk) => parts.push(new Uint8Array(chunk)),
        close: async () => {
          file.bytes = new Uint8Array(await new Blob(parts).arrayBuffer())
        },
        abort: async () => null,
      }
    },
    async createSyncAccessHandle() {
      return {
        mode: 'read-only',
        getSize: () => file.bytes.length,
        read: (into, {at}) => {
          const n = Math.max(0, Math.min(into.length, file.bytes.length - at))
          into.set(file.bytes.subarray(at, at + n))
          return n
        },
        close: () => null,
      }
    },
  }
  return file
}


describe('engine/engineSidecars', () => {
  it('keys a sidecar by the entry\'s path alone: one slot per entry, whatever its version', async () => {
    const key = await sidecarKey('owner/repo/main/logo.step')
    expect(key).toMatch(/^[0-9a-f]{64}\.cidx$/)
    expect(await sidecarKey('owner/repo/main/logo.step')).toBe(key)
    expect(await sidecarKey('owner/repo/other/logo.step')).not.toBe(key)
  })

  it('writes, reads back, replaces and discards a sidecar in its own directory', async () => {
    const root = memoryDir()
    const getOpfsRoot = async () => root
    const PATH = 'owner/repo/logo.step'
    expect(await readSidecar(PATH, snapshot(), getOpfsRoot)).toBeNull()
    expect(await writeSidecar(PATH, snapshot(), Uint8Array.of(1, 2, 3), getOpfsRoot)).toBe(true)
    expect(Object.keys(root.children)).toEqual([SIDECAR_DIR])
    expect(Array.from(await readSidecar(PATH, snapshot(), getOpfsRoot))).toEqual([1, 2, 3])
    expect(await writeSidecar(PATH, snapshot(), Uint8Array.of(9), getOpfsRoot)).toBe(true)
    expect(Array.from(await readSidecar(PATH, snapshot(), getOpfsRoot))).toEqual([9])
    await discardSidecar(PATH, getOpfsRoot)
    expect(await readSidecar(PATH, snapshot(), getOpfsRoot)).toBeNull()
    // Discarding what is not there is not an error.
    await discardSidecar(PATH, getOpfsRoot)
  })

  it('a failed write reports false and leaves the previous sidecar', async () => {
    const root = memoryDir()
    const getOpfsRoot = async () => root
    const PATH = 'owner/logo.step'
    await writeSidecar(PATH, snapshot(), Uint8Array.of(7), getOpfsRoot)
    const slot = root.children[SIDECAR_DIR].children[await sidecarKey(PATH)]
    slot.createWritable = async () => ({
      write: async () => {
        throw new Error('quota')
      },
      close: async () => null,
      abort: async () => null,
    })
    expect(await writeSidecar(PATH, snapshot(), Uint8Array.of(1), getOpfsRoot)).toBe(false)
    expect(Array.from(await readSidecar(PATH, snapshot(), getOpfsRoot))).toEqual([7])
  })

  it('a replaced entry\'s sidecar is not a candidate, and its save leaves one sidecar, not two', async () => {
    const root = memoryDir()
    const getOpfsRoot = async () => root
    const PATH = 'owner/repo/logo.step'
    await writeSidecar(PATH, snapshot(), Uint8Array.of(1), getOpfsRoot)
    const replaced = new File([BYTES], NAME, {lastModified: MTIME + 1})
    // The envelope describes the old version: no candidate for the new one.
    expect(await readSidecar(PATH, replaced, getOpfsRoot)).toBeNull()
    expect(await readSidecar(PATH, new File([BYTES.subarray(0, 8)], NAME, {lastModified: MTIME}), getOpfsRoot))
      .toBeNull()
    await writeSidecar(PATH, replaced, Uint8Array.of(2), getOpfsRoot)
    expect(Object.keys(root.children[SIDECAR_DIR].children)).toHaveLength(1)
    expect(Array.from(await readSidecar(PATH, replaced, getOpfsRoot))).toEqual([2])
  })

  it('the sweep removes the sidecars of entries that are gone, and keeps the rest', async () => {
    const root = memoryDir({owner: memoryDir({[NAME]: memoryFile(NAME, BYTES)})})
    const getOpfsRoot = async () => root
    await writeSidecar(`owner/${NAME}`, snapshot(), Uint8Array.of(1), getOpfsRoot)
    await writeSidecar('owner/deleted.step', snapshot(), Uint8Array.of(2), getOpfsRoot)
    await writeSidecar('gone/dir/x.ifc', snapshot(), Uint8Array.of(3), getOpfsRoot)
    root.children[SIDECAR_DIR].children['not-an-envelope.cidx'] = memoryFile('n', Uint8Array.of(0))
    expect(await sweepSidecars(getOpfsRoot)).toBe(3)
    expect(Object.keys(root.children[SIDECAR_DIR].children)).toEqual([await sidecarKey(`owner/${NAME}`)])
    expect(Array.from(await readSidecar(`owner/${NAME}`, snapshot(), getOpfsRoot))).toEqual([1])
  })

  it('Clear cache leaves no sidecar behind', async () => {
    const root = memoryDir({owner: memoryDir({[NAME]: memoryFile(NAME, BYTES)})})
    await writeSidecar(`owner/${NAME}`, snapshot(), Uint8Array.of(1), async () => root)
    // OPFS.worker.js registers its message handler on `self` at import, as
    // OPFS.worker.test.js stubs it; this node environment has none.
    global.importScripts = jest.fn()
    global.self = {addEventListener: jest.fn(), postMessage: jest.fn()}
    const {deleteAllEntries} = require('../OPFS/OPFS.worker')
    expect(await deleteAllEntries(root)).toEqual([])
    expect(root.children).toEqual({})
  })

  it('the engine\'s entry search never descends into the sidecar directory', async () => {
    const root = memoryDir({owner: memoryDir({[NAME]: memoryFile(NAME, BYTES)})})
    await writeSidecar(`owner/${NAME}`, snapshot(), Uint8Array.of(1), async () => root)
    const dir = root.children[SIDECAR_DIR]
    const entries = dir.entries.bind(dir)
    let entered = 0
    dir.entries = () => {
      entered++
      return entries()
    }
    expect((await locateOpfsEntry(snapshot(), root)).path).toBe(`owner/${NAME}`)
    expect(entered).toBe(0)
  })

  it('indexLine says where the index came from and whether a sidecar was saved', () => {
    const MIB = 1024 * 1024
    expect(indexLine({source: 'sidecar', bytes: 16.5 * MIB, saved: false}))
      .toBe('Engine index: from sidecar (16.5 MB), no parse')
    expect(indexLine({source: 'parse', bytes: 2 * MIB, saved: true}))
      .toBe('Engine index: parsed; sidecar saved (2.0 MB)')
    expect(indexLine({source: 'sidecarRejected', bytes: 2 * MIB, saved: true}))
      .toBe('Engine index: sidecar refused, parsed; sidecar saved (2.0 MB)')
    expect(indexLine({source: 'parse', bytes: 0, saved: false}))
      .toBe('Engine index: parsed; no sidecar saved')
    expect(indexLine(undefined)).toBeUndefined()
  })
})


describe('engine/engineSources: both worker stores read synchronously (conway#757)', () => {
  it('the sync access handle store offers readSync over the same handle', () => {
    const access = {read: (into, {at}) => {
      into.set(BYTES.subarray(at, at + into.length))
      return into.length
    }, close: () => null}
    const store = makeSyncHandleStore(access, 64)
    expect(Array.from(store.readSync(10, 3))).toEqual([10, 11, 12])
    expect(store.counters).toMatchObject({reads: 1, bytes: 3})
  })

  it('the Blob store offers readSync where FileReaderSync exists (a worker), and not elsewhere', () => {
    expect(makeBlobStore(new Blob([BYTES]), undefined, undefined).readSync).toBeUndefined()
    // FileReaderSync reads a Blob synchronously; stand in with one over a
    // slice of BYTES, since jsdom/node has none.
    const blob = {size: 64, slice: (start, end) => ({start, end})}
    /** A FileReaderSync stand-in. */
    class FakeReaderSync {
      /**
       * @param {object} slice
       * @return {ArrayBuffer}
       */
      readAsArrayBuffer({start, end}) {
        return BYTES.slice(start, end).buffer
      }
    }
    const store = makeBlobStore(blob, () => 0, FakeReaderSync)
    expect(Array.from(store.readSync(4, 4))).toEqual([4, 5, 6, 7])
    expect(store.counters).toMatchObject({reads: 1, bytes: 4})
  })

  it('openSourceStore reports the entry\'s path, which keys its sidecar', async () => {
    const root = memoryDir({owner: memoryDir({repo: memoryDir({[NAME]: memoryFile(NAME, BYTES)})})})
    const opened = await openSourceStore({file: snapshot()}, {getOpfsRoot: async () => root, canSyncHandle: () => true})
    expect(opened).toMatchObject({fallbackReason: null, entryPath: `owner/repo/${NAME}`})
    expect(opened.store.kind).toBe('syncHandle')
    const offOpfs = await openSourceStore({file: snapshot()}, {getOpfsRoot: async () => memoryDir(),
      canSyncHandle: () => true})
    expect(offOpfs).toMatchObject({fallbackReason: 'not an OPFS file', entryPath: null})
  })
})


/**
 * A stub engine with the index sidecar calls: a parse reads the store and
 * exports `SIDECAR`; an index-first open accepts only a sidecar equal to it.
 *
 * @param {Array<string>} log what was called
 * @param {object} [options]
 * @param {boolean} [options.refuseIndex] OpenModelFromIndex returns -1
 * @return {object}
 */
function sidecarApi(log, {refuseIndex = false} = {}) {
  const SIDECAR = Uint8Array.of(0x43, 0x49, 0x44, 0x58, 3)
  return {
    SIDECAR,
    wasmModule: undefined,
    async Init() {
      this.wasmModule = {HEAPU8: {byteLength: 1}}
    },
    async OpenModelStream(store, settings) {
      log.push(`stream recordHash=${settings.RECORD_SOURCE_HASH === true} readSync=${typeof store.readSync}`)
      await store.read(0, 4)
      return 0
    },
    async OpenModelFromIndex(store, sidecar, settings) {
      log.push(`index verify=${settings.VERIFY_INDEX_SOURCE_HASH}`)
      return refuseIndex || sidecar.length !== SIDECAR.length ? -1 : 0
    },
    async ExportIndexSidecar() {
      log.push('export')
      return SIDECAR
    },
    async ExtractGeometryBatchAsync() {
      return {extracted: 0, remaining: 0}
    },
    StreamAllMeshesAsync: async () => null,
    StreamAllMeshes: () => null,
    getStatistics: () => null,
    CloseModel: () => log.push('CloseModel'),
    IsModelOpen: () => true,
    properties: {},
  }
}


/**
 * One streamed open in a worker-transport session over `root`, to its
 * `done` packet.
 *
 * @param {object} api
 * @param {object} root
 * @param {object} [flags]
 * @return {Promise<object>} the `done` summary
 */
async function loadOnce(api, root, flags = {}) {
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
    terminate: () => null,
  }
  const session = new EngineSession(makeWorkerTransport(fakeWorker), {epoch: 1})
  toPage({v: ENGINE_PROTOCOL_VERSION, epoch: 0, ev: Ev.HELLO, seq: 0})
  await session.init({flags})
  const done = new Promise((resolve) => session.on(Ev.DONE, (msg) => resolve(msg.summary)))
  await session.open({file: snapshot()}, {format: 'step', stream: {previews: false}})
  const summary = await done
  await session.close()
  return summary
}


describe('engine/engineHandler: index sidecar reopen (engine-worker.md §7 step 8)', () => {
  it('the first open parses and saves a sidecar; the reopen opens from it, with the sampled check', async () => {
    const log = []
    const api = sidecarApi(log)
    const root = memoryDir({owner: memoryDir({[NAME]: memoryFile(NAME, BYTES)})})

    const first = await loadOnce(api, root)
    expect(first.index).toEqual({source: 'parse', bytes: api.SIDECAR.length, saved: true})
    // The parse recorded the digests the export needs, and read through a
    // store a windowed STEP can fault into.
    expect(log).toEqual(['stream recordHash=true readSync=function', 'export', 'CloseModel'])

    log.length = 0
    const second = await loadOnce(api, root)
    expect(second.index).toEqual({source: 'sidecar', bytes: api.SIDECAR.length, saved: false})
    // No parse, and no second export.
    expect(log).toEqual(['index verify=sampled', 'CloseModel'])
  })

  it('a refused sidecar falls back to the parse and is replaced', async () => {
    const log = []
    const root = memoryDir({owner: memoryDir({[NAME]: memoryFile(NAME, BYTES)})})
    await loadOnce(sidecarApi([]), root)
    const reopened = await loadOnce(sidecarApi(log, {refuseIndex: true}), root)
    expect(reopened.index).toEqual({source: 'sidecarRejected', bytes: 5, saved: true})
    expect(log).toEqual([
      'index verify=sampled', 'stream recordHash=true readSync=function', 'export', 'CloseModel',
    ])
  })

  it('the kill switch neither reads nor writes one, and the parse records no hash', async () => {
    const log = []
    const root = memoryDir({owner: memoryDir({[NAME]: memoryFile(NAME, BYTES)})})
    const summary = await loadOnce(sidecarApi(log), root, {disableEngineSidecar: true})
    expect(summary.index).toBeUndefined()
    expect(log).toEqual(['stream recordHash=false readSync=function', 'CloseModel'])
    expect(root.children[SIDECAR_DIR]).toBeUndefined()
  })

  it('under the sync-handle kill switch the Blob store reopens from the sidecar too', async () => {
    // The worker's Blob store (FileReaderSync) serves the index path as well
    // as the sync handle does, so the entry must be found, and its sidecar
    // used, whichever store reads it (codex review of Share#2085). Node has
    // no FileReaderSync, so these opens read with `readSync` undefined.
    const log = []
    const api = sidecarApi(log)
    const root = memoryDir({owner: memoryDir({[NAME]: memoryFile(NAME, BYTES)})})
    const first = await loadOnce(api, root, {disableEngineSyncHandle: true})
    expect(first.index).toEqual({source: 'parse', bytes: api.SIDECAR.length, saved: true})
    expect(first.source).toMatchObject({kind: 'blob', fallbackReason: 'disabled'})
    const second = await loadOnce(api, root, {disableEngineSyncHandle: true})
    expect(second.index).toEqual({source: 'sidecar', bytes: api.SIDECAR.length, saved: false})
  })

  it('a source with no OPFS entry gets no sidecar', async () => {
    const log = []
    const summary = await loadOnce(sidecarApi(log), memoryDir())
    expect(summary.index).toBeUndefined()
    expect(log[0]).toBe('stream recordHash=false readSync=undefined')
  })
})


describe('engine/engineHandler: a STEP whose session fell back in process (#1776, conway#757)', () => {
  it('a refused store open buffers inside the session\'s own engine, with nothing windowed or leaked', async () => {
    // In process there is no createSyncAccessHandle and no FileReaderSync,
    // so the store cannot read synchronously and conway refuses a STEP's
    // store open (STORE_NOT_SYNCHRONOUS, -1). The buffered retry must run
    // on THIS session's IfcAPI — the burned handle is the session's — and
    // the model it opens is the one the session reports.
    const calls = []
    const api = {
      wasmModule: undefined,
      async Init() {
        this.wasmModule = {HEAPU8: {byteLength: 1}}
      },
      async OpenModelStream(store) {
        calls.push(`stream readSync=${typeof store.readSync}`)
        return typeof store.readSync === 'function' ? 0 : -1
      },
      async OpenModelStreamed(bytes) {
        calls.push(`streamed ${bytes.byteLength}`)
        return 1
      },
      getStatistics: () => ({getLoadStatus: () => 'STORE_NOT_SYNCHRONOUS', getLoadFailureReason: () => ''}),
      CloseModel: (id) => calls.push(`close ${id}`),
      IsModelOpen: () => true,
      properties: {},
    }
    const listeners = []
    const toPage = (data) => queueMicrotask(() => listeners.forEach((cb) => cb({data})))
    const handler = createEngineHandler({
      loadIfcAPI: async () => function IfcAPI() {
        return api
      },
      post: toPage,
      yieldToLoop: () => Promise.resolve(),
      // The page: no sync access handles, and (node) no FileReaderSync.
      sourceOptions: {canSyncHandle: () => false},
    })
    const fakeWorker = {
      addEventListener: (type, cb) => type === 'message' && listeners.push(cb),
      postMessage: (msg) => queueMicrotask(() => handler.handle(msg)),
      terminate: () => null,
    }
    const session = new EngineSession(makeWorkerTransport(fakeWorker), {epoch: 1})
    toPage({v: ENGINE_PROTOCOL_VERSION, epoch: 0, ev: Ev.HELLO, seq: 0})
    await session.init({flags: {}})
    const opened = await session.open({file: snapshot()}, {format: 'step'})
    expect(calls).toEqual(['stream readSync=undefined', `streamed ${BYTES.length}`])
    expect(opened).toMatchObject({modelID: 1, windowed: false, source: {kind: 'resident'}})
    await session.close()
  })
})
