/** @jest-environment node */ // eslint-disable-line jsdoc/check-tag-names
/* eslint-disable no-magic-numbers, require-await */
import {EngineSession} from './EngineSession'
import {createEngineHandler} from './engineHandler'
import {indexLine} from './engineModelLoad'
import {SIDECAR_DIR, discardSidecar, readSidecar, sidecarKey, writeSidecar} from './engineSidecars'
import {makeBlobStore, makeSyncHandleStore, openSourceStore} from './engineSources'
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
  it('keys a sidecar by the entry\'s path, size and lastModified', async () => {
    const key = await sidecarKey('owner/repo/main/logo.step', snapshot())
    expect(key).toMatch(/^[0-9a-f]{64}\.cidx$/)
    expect(await sidecarKey('owner/repo/main/logo.step', snapshot())).toBe(key)
    expect(await sidecarKey('owner/repo/other/logo.step', snapshot())).not.toBe(key)
    expect(await sidecarKey('owner/repo/main/logo.step', new File([BYTES], NAME, {lastModified: MTIME + 1})))
      .not.toBe(key)
  })

  it('writes, reads back, replaces and discards a sidecar in its own directory', async () => {
    const root = memoryDir()
    const getOpfsRoot = async () => root
    expect(await readSidecar('k.cidx', getOpfsRoot)).toBeNull()
    expect(await writeSidecar('k.cidx', Uint8Array.of(1, 2, 3), getOpfsRoot)).toBe(true)
    expect(Object.keys(root.children)).toEqual([SIDECAR_DIR])
    expect(Array.from(await readSidecar('k.cidx', getOpfsRoot))).toEqual([1, 2, 3])
    expect(await writeSidecar('k.cidx', Uint8Array.of(9), getOpfsRoot)).toBe(true)
    expect(Array.from(await readSidecar('k.cidx', getOpfsRoot))).toEqual([9])
    await discardSidecar('k.cidx', getOpfsRoot)
    expect(await readSidecar('k.cidx', getOpfsRoot)).toBeNull()
    // Discarding what is not there is not an error.
    await discardSidecar('k.cidx', getOpfsRoot)
  })

  it('a failed write reports false and leaves nothing half-written', async () => {
    const root = memoryDir()
    const failing = memoryFile('k.cidx', Uint8Array.of(7))
    failing.createWritable = async () => ({
      write: async () => {
        throw new Error('quota')
      },
      close: async () => null,
      abort: async () => null,
    })
    root.children[SIDECAR_DIR] = memoryDir({'k.cidx': failing})
    expect(await writeSidecar('k.cidx', Uint8Array.of(1), async () => root)).toBe(false)
    expect(Array.from(await readSidecar('k.cidx', async () => root))).toEqual([7])
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

  it('a source with no OPFS entry gets no sidecar', async () => {
    const log = []
    const summary = await loadOnce(sidecarApi(log), memoryDir())
    expect(summary.index).toBeUndefined()
    expect(log[0]).toBe('stream recordHash=false readSync=undefined')
  })
})
