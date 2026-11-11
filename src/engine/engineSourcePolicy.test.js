/** @jest-environment node */ // eslint-disable-line jsdoc/check-tag-names
/* eslint-disable no-magic-numbers, require-await */
import {flags as staticFlags, isFeatureEnabled} from '../FeatureFlags'
import {EngineSession} from './EngineSession'
import {createEngineHandler, isAllocationFailure} from './engineHandler'
import {sourceModeLine} from './engineModelLoad'
import {ENGINE_PROTOCOL_VERSION, Ev} from './protocol'
import {SourceModeReason} from './sourcePolicy'
import {engineDeviceSnapshot, engineFlagSnapshot} from './spawnEngine'
import {makeWorkerTransport} from './transports'


// The source policy at the handler (sourcePolicy.js, Share#2139): which open
// each store and flag gets, what it reports, and the allocation-failure
// fallback. The rules themselves are sourcePolicy.test.js's.

jest.mock('../FeatureFlags', () => ({flags: [], isFeatureEnabled: jest.fn(() => false)}))
jest.mock('../loader/loadProgress', () => ({
  reportEngineLog: jest.fn(),
  reportEngineVersion: jest.fn(),
  reportSourceInfo: jest.fn(),
}))


const BYTES = Uint8Array.from({length: 64}, (_, i) => i)
const NAME = 'model.ifc.etag.commit'
const MTIME = 1_700_000_000_000
const SIDECAR = Uint8Array.of(0x43, 0x49, 0x44, 0x58, 3)
// An 8 GiB desktop: cap 1 GiB, so the 64-byte fixture is under it.
const DESKTOP = {deviceMemoryGiB: 8, isMobile: false}


/** @return {File} the snapshot OPFS.worker.js hands the page for the entry */
function snapshot() {
  return new File([BYTES], NAME, {lastModified: MTIME})
}


/**
 * An in-memory OPFS: the source entry (with a read-only sync access handle)
 * and the sidecar directory the handler writes into.
 *
 * @param {Array<string>} log records the handle's whole-file reads and closes
 * @param {object} [options]
 * @param {Error|null} [options.wholeReadThrows] thrown by a read of the whole
 *   file through the handle (the policy's one buffered read)
 * @return {object} a FileSystemDirectoryHandle stand-in
 */
function opfs(log, {wholeReadThrows = null} = {}) {
  const file = (name, bytes) => {
    const entry = {
      kind: 'file', name, bytes,
      getFile: async () => new File([entry.bytes], name, {lastModified: MTIME}),
      async createWritable() {
        const parts = []
        return {
          write: async (chunk) => parts.push(new Uint8Array(chunk)),
          close: async () => {
            entry.bytes = new Uint8Array(await new Blob(parts).arrayBuffer())
          },
          abort: async () => null,
        }
      },
      async createSyncAccessHandle() {
        return {
          mode: 'read-only',
          getSize: () => entry.bytes.length,
          read: (into, {at}) => {
            if (into.length === entry.bytes.length) {
              log.push('whole read')
              if (wholeReadThrows) {
                throw wholeReadThrows
              }
            }
            into.set(entry.bytes.subarray(at, at + into.length))
            return into.length
          },
          close: () => log.push('access.close'),
        }
      },
      async move(dir, newName) {
        delete entry.parent.children[entry.name]
        dir.children[newName] = entry
        entry.parent = dir
        entry.name = newName
      },
    }
    return entry
  }
  const dir = (children) => {
    const d = {
      kind: 'directory', children,
      async* entries() {
        yield* Object.entries(d.children)
      },
      async getDirectoryHandle(name, {create = false} = {}) {
        if (!d.children[name]) {
          if (!create) {
            throw Object.assign(new Error(name), {name: 'NotFoundError'})
          }
          d.children[name] = dir({})
        }
        return d.children[name]
      },
      async getFileHandle(name, {create = false} = {}) {
        if (!d.children[name]) {
          if (!create) {
            throw Object.assign(new Error(name), {name: 'NotFoundError'})
          }
          d.children[name] = file(name, new Uint8Array(0))
        }
        d.children[name].parent = d
        return d.children[name]
      },
      async removeEntry(name) {
        delete d.children[name]
      },
    }
    return d
  }
  return dir({owner: dir({[NAME]: file(NAME, BYTES)})})
}


/**
 * A stub engine: the windowed and buffered opens, the index-first open and
 * the sidecar export, logging which ran.
 *
 * @param {Array<string>} log
 * @return {object}
 */
function policyApi(log) {
  return {
    wasmModule: undefined,
    async Init() {
      this.wasmModule = {HEAPU8: {byteLength: 1}}
    },
    async OpenModelStream(store, settings) {
      log.push(`stream ${store.kind} recordHash=${settings.RECORD_SOURCE_HASH === true}`)
      await store.read(0, 4)
      return 0
    },
    async OpenModelStreamed(bytes, settings) {
      log.push(`streamed ${bytes.byteLength} recordHash=${settings.RECORD_SOURCE_HASH === true}`)
      return 0
    },
    async OpenModelFromIndex(store) {
      log.push(`index ${store.kind}`)
      return 0
    },
    async ExportIndexSidecar() {
      log.push('export')
      return SIDECAR
    },
    SpillModelSource(_id, store) {
      log.push(`spill ${store.kind}`)
      return true
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
 * A worker-transport session over the handler, as production runs it.
 *
 * @param {object} api
 * @param {object} root
 * @param {object} [options]
 * @param {object} [options.flags]
 * @param {object} [options.device]
 * @return {Promise<EngineSession>}
 */
async function session(api, root, {flags = {}, device = DESKTOP} = {}) {
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
  const s = new EngineSession(makeWorkerTransport(fakeWorker), {epoch: 1})
  toPage({v: ENGINE_PROTOCOL_VERSION, epoch: 0, ev: Ev.HELLO, seq: 0})
  await s.init({flags, device})
  return s
}


/**
 * Open the fixture streamed, to its `done` packet.
 *
 * @param {EngineSession} s
 * @return {Promise<{opened: object, summary: object}>}
 */
async function load(s) {
  const done = new Promise((resolve) => s.on(Ev.DONE, (msg) => resolve(msg.summary)))
  const opened = await s.open({file: snapshot()}, {format: 'ifc', stream: {previews: false}})
  return {opened, summary: await done}
}


/**
 * Make `api`'s buffered open fail as conway 1.1645.781's does on a wasm OOM:
 * the open's own statistics (a new object under the attempted id, as
 * openAttempt.js#beginOpenAttempt expects) get OPEN_FAIL and the caught
 * error's message, and OpenModelStreamed returns -1.
 *
 * @param {object} api from policyApi
 * @param {Array<string>} log
 * @param {string} [reason] the message conway recorded
 * @return {object} the same api
 */
function conwayOomApi(api, log, reason = 'Aborted(OOM). Build with -sASSERTIONS for more info.') {
  const statistics = new Map()
  api.globalModelIDCounter = 0
  api.getStatistics = (id) => statistics.get(id)
  api.OpenModelStreamed = async () => {
    log.push('streamed')
    statistics.set(api.globalModelIDCounter++, {getLoadStatus: () => 'OPEN_FAIL', getLoadFailureReason: () => reason})
    return -1
  }
  return api
}


// writeSidecar picks its writer off this prototype (engineSidecars.js
// #sidecarWriter), which node lacks.
beforeEach(() => {
  globalThis.FileSystemFileHandle = class {
    /** @return {null} */
    createWritable() {
      return null
    }
  }
})
afterEach(() => {
  delete globalThis.FileSystemFileHandle
})


describe('engine/engineHandler: the source policy', () => {
  it('opens buffered under the cap over one whole-file read, saves a sidecar, and lets the handle go', async () => {
    const log = []
    const root = opfs(log)
    const s = await session(policyApi(log), root)
    const {opened, summary} = await load(s)
    expect(opened.windowed).toBe(false)
    // One read of the whole file through the handle, the buffered parse
    // recording the source hash, the handle closed once the open has run
    // (nothing pages from it), and the export after the pump.
    expect(log).toEqual(['whole read', `streamed ${BYTES.length} recordHash=true`, 'access.close', 'export'])
    expect(summary.sourceMode).toMatchObject({
      mode: 'buffered', reason: SourceModeReason.UNDER_CAP, bytes: BYTES.length, capBytes: 1024 * 1024 * 1024,
    })
    expect(summary.sourceMode.readMs).toEqual(expect.any(Number))
    expect(summary.source).toEqual({kind: 'resident', fallbackReason: null})
    expect(summary.index).toEqual({source: 'parse', bytes: SIDECAR.length, saved: true})
    await s.close()

    // The reopen comes back from that sidecar, windowed.
    log.length = 0
    const again = await session(policyApi(log), root)
    const reopened = await load(again)
    expect(reopened.opened.windowed).toBe(true)
    expect(log).toEqual(['index syncHandle'])
    expect(reopened.summary.sourceMode).toMatchObject({mode: 'windowed', reason: SourceModeReason.INDEX_REOPEN})
    expect(reopened.summary.index.source).toBe('sidecar')
    await again.close()
  })

  it('a spill with no File releases a buffered source to a store over the open\'s own File', async () => {
    // A load with no GLB writer sends this (Loader.js#load): without the
    // open's own File, a buffered source would stay resident for the session.
    const log = []
    const s = await session(policyApi(log), opfs(log))
    await load(s)
    log.length = 0
    expect(await s.spill(null)).toMatchObject({spilled: true, source: {kind: 'syncHandle'}})
    expect(log).toEqual(['spill syncHandle'])
    await s.close()
  })

  it('opens windowed over the cap', async () => {
    const log = []
    // 128 MiB × 3e-7 GiB ≈ 40 bytes: the 64-byte fixture is over it.
    const s = await session(policyApi(log), opfs(log), {device: {deviceMemoryGiB: 3e-7, isMobile: false}})
    const {opened, summary} = await load(s)
    expect(opened.windowed).toBe(true)
    expect(log[0]).toBe('stream syncHandle recordHash=true')
    expect(log).not.toContain('whole read')
    expect(summary.sourceMode).toMatchObject({mode: 'windowed', reason: SourceModeReason.OVER_CAP, capBytes: 40})
    expect(summary.source.kind).toBe('syncHandle')
    await s.close()
  })

  it('the kill switch opens windowed, as before the policy', async () => {
    const log = []
    const s = await session(policyApi(log), opfs(log), {flags: {disableBufferedSource: true}})
    const {opened, summary} = await load(s)
    expect(opened.windowed).toBe(true)
    expect(log.slice(0, 2)).toEqual(['stream syncHandle recordHash=true', 'export'])
    expect(summary.sourceMode).toMatchObject({mode: 'windowed', reason: SourceModeReason.KILL_SWITCH})
    await s.close()
  })

  it('over the Blob store (no sync handles) it opens buffered over the bytes the store held', async () => {
    const log = []
    const s = await session(policyApi(log), opfs(log), {flags: {disableEngineSyncHandle: true}})
    const {opened, summary} = await load(s)
    expect(opened.windowed).toBe(false)
    expect(log).toEqual([`streamed ${BYTES.length} recordHash=true`, 'export'])
    expect(summary.sourceMode).toMatchObject({mode: 'buffered', reason: SourceModeReason.HELD_BY_BLOB_STORE})
    expect(summary.index.saved).toBe(true)
    await s.close()
  })

  it('over a Blob store that holds nothing it opens windowed', async () => {
    const log = []
    const s = await session(policyApi(log), opfs(log),
      {flags: {disableEngineSyncHandle: true, disableEngineResidentSource: true}})
    const {summary} = await load(s)
    expect(log[0]).toBe('stream blob recordHash=true')
    expect(summary.sourceMode).toMatchObject({mode: 'windowed', reason: SourceModeReason.BLOB_NOT_HELD})
    await s.close()
  })

  it('a whole-file read that cannot be allocated falls back to the windowed open, saying why', async () => {
    const log = []
    const root = opfs(log, {wholeReadThrows: new RangeError('Array buffer allocation failed')})
    const s = await session(policyApi(log), root)
    const {opened, summary} = await load(s)
    expect(opened.windowed).toBe(true)
    expect(log.slice(0, 2)).toEqual(['whole read', 'stream syncHandle recordHash=true'])
    expect(summary.sourceMode).toMatchObject({
      mode: 'windowed', reason: SourceModeReason.BUFFERED_FAILED, failure: 'RangeError', capBytes: 1024 * 1024 * 1024,
    })
    expect(summary.source.kind).toBe('syncHandle')
    // A sidecar is still saved: the windowed parse keyed it.
    expect(summary.index.saved).toBe(true)
    expect(sourceModeLine(summary.sourceMode)).toBe('Engine source: windowed (buffered open failed: RangeError)')
    await s.close()
  })

  it('a buffered open that runs out of memory fails as real conway does: -1, reason recorded, no same-engine retry', async () => {
    // conway 1.1645.781: `fromStreamed` catches the parse's error and falls
    // back to the classic open, whose `fromAsync` catches again and calls
    // `recordOpenFailure` (status OPEN_FAIL, reason = the error's message),
    // so OpenModelStreamed RETURNS -1. Nothing here throws. The windowed
    // retry is the page's, on a fresh engine (engineModelLoad.js#parse).
    const log = []
    const api = conwayOomApi(policyApi(log), log)
    const s = await session(api, opfs(log))
    const failed = []
    s.on(Ev.FAILED, (msg) => failed.push(msg))
    const opening = s.open({file: snapshot()}, {format: 'ifc', stream: {previews: false}})
    await expect(opening).rejects.toThrow('engine: open failed (-1)')
    const failure = await opening.catch((e) => e.engineFailure)
    expect(log.filter((line) => line.startsWith('stream'))).toEqual(['streamed'])
    // The failure says the open was the policy's buffered one, and what
    // conway recorded: what the page's retry keys on.
    expect(failure.sourceMode).toMatchObject({mode: 'buffered', reason: SourceModeReason.UNDER_CAP})
    expect(failure.openFailure).toEqual({status: 'OPEN_FAIL', reason: 'Aborted(OOM). Build with -sASSERTIONS for more info.'})
    expect(failed[0]).toMatchObject({kind: 'openFailure', sourceMode: {mode: 'buffered'}})
    expect(log).toContain('access.close')
  })

  it('the page\'s retry override opens windowed, saying the buffered open ran out of memory', async () => {
    const log = []
    const s = await session(policyApi(log), opfs(log))
    const done = new Promise((resolve) => s.on(Ev.DONE, (msg) => resolve(msg.summary)))
    const opened = await s.open({file: snapshot()},
      {format: 'ifc', stream: {previews: false}, sourceOverride: {windowed: true, failure: 'outOfMemory'}})
    const summary = await done
    expect(opened.windowed).toBe(true)
    // No whole-file read: the override is decided before it.
    expect(log[0]).toBe('stream syncHandle recordHash=true')
    expect(log).not.toContain('whole read')
    expect(summary.sourceMode).toMatchObject({mode: 'windowed', reason: SourceModeReason.BUFFERED_FAILED,
      failure: 'outOfMemory'})
    expect(sourceModeLine(summary.sourceMode)).toBe('Engine source: windowed (buffered open failed: out of memory)')
    await s.close()
  })

  it('on the Blob store, the page\'s retry override holds no copy of the file', async () => {
    // Firefox and Safari: the retry follows a buffered open that ran out of
    // memory, so it must not read the whole file into the worker again.
    const run = async (sourceOverride) => {
      const log = []
      const s = await session(policyApi(log), opfs(log), {flags: {disableEngineSyncHandle: true}})
      const done = new Promise((resolve) => s.on(Ev.DONE, (msg) => resolve(msg.summary)))
      await s.open({file: snapshot()}, {format: 'ifc', stream: {previews: false}, sourceOverride})
      const summary = await done
      await s.close()
      return summary
    }
    const retry = await run({windowed: true, failure: 'engineException'})
    expect(retry.sourceMode).toMatchObject({mode: 'windowed', reason: SourceModeReason.BUFFERED_FAILED,
      failure: 'engineException'})
    expect(retry.source).toMatchObject({kind: 'blob', residentBytes: 0, residentReads: 0})
    // The control: without the override the same store holds the file.
    expect((await run(null)).sourceMode).toMatchObject({mode: 'buffered', reason: SourceModeReason.HELD_BY_BLOB_STORE})
  })

  it('an override with an unknown failure code reports a fixed one', async () => {
    const log = []
    const s = await session(policyApi(log), opfs(log))
    const done = new Promise((resolve) => s.on(Ev.DONE, (msg) => resolve(msg.summary)))
    await s.open({file: snapshot()}, {format: 'ifc', stream: {previews: false},
      sourceOverride: {windowed: true, failure: 'model.ifc ran out'}})
    expect((await done).sourceMode.failure).toBe('outOfMemory')
    await s.close()
  })

  it('an open that throws (not a conway failure) is not retried here either', async () => {
    const log = []
    const api = policyApi(log)
    api.OpenModelStreamed = async () => {
      log.push('streamed')
      throw new Error('malformed')
    }
    const s = await session(api, opfs(log))
    await expect(s.open({file: snapshot()}, {format: 'ifc', stream: {previews: false}})).rejects.toThrow('malformed')
    expect(log.filter((line) => line.startsWith('stream '))).toEqual([])
    expect(log).toContain('access.close')
  })

  it('a windowed open over the cap that fails falls through to buffered, labelled windowedFailed', async () => {
    // Pre-dates the policy (conwayOpen.js#openDeferred buffers after any
    // non-schema store-open failure); the label says what happened.
    const log = []
    const api = policyApi(log)
    api.OpenModelStream = async () => {
      log.push('stream')
      return -1
    }
    const s = await session(api, opfs(log), {device: {deviceMemoryGiB: 3e-7, isMobile: false}})
    const {opened, summary} = await load(s)
    expect(opened.windowed).toBe(false)
    expect(summary.sourceMode).toMatchObject({mode: 'buffered', reason: SourceModeReason.WINDOWED_FAILED})
    expect(sourceModeLine(summary.sourceMode)).toMatch(/^Engine source: buffered \(0\.0 MB, windowed open failed\)$/)
    await s.close()
  })
})


describe('engine/engineHandler#isAllocationFailure', () => {
  it('a failed whole-file allocation, and not any RangeError', () => {
    expect(isAllocationFailure(new RangeError('Array buffer allocation failed'))).toBe(true)
    expect(isAllocationFailure(new RangeError('Out of memory'))).toBe(true)
    expect(isAllocationFailure(new RangeError('invalid array length'))).toBe(true)
    expect(isAllocationFailure(new Error('Aborted(OOM)'))).toBe(true)
    expect(isAllocationFailure(new RangeError('Maximum call stack size exceeded'))).toBe(false)
    expect(isAllocationFailure(new RangeError('Offset is outside the bounds of the DataView'))).toBe(false)
    expect(isAllocationFailure(new Error('malformed'))).toBe(false)
  })
})


describe('engine/spawnEngine: what the page snapshots for the policy', () => {
  afterEach(() => {
    staticFlags.length = 0
    isFeatureEnabled.mockImplementation(() => false)
  })

  it('disableBufferedSource from the URL', () => {
    expect(engineFlagSnapshot().disableBufferedSource).toBe(false)
    isFeatureEnabled.mockImplementation((name) => name === 'disableBufferedSource')
    expect(engineFlagSnapshot().disableBufferedSource).toBe(true)
  })

  it('disableBufferedSource from the static flag, read before the URL (the prod rollback)', () => {
    staticFlags.push({name: 'disableBufferedSource', isActive: true})
    expect(engineFlagSnapshot().disableBufferedSource).toBe(true)
  })

  it('the old experimental flag is gone from the snapshot', () => {
    expect(Object.keys(engineFlagSnapshot())).not.toContain('engineHeldBufferOpen')
  })

  it('the device: deviceMemory when the browser has it, and the repo\'s width rule for a phone', () => {
    const saved = {navigator: globalThis.navigator, innerWidth: globalThis.innerWidth}
    try {
      Object.defineProperty(globalThis, 'navigator', {value: {deviceMemory: 4}, configurable: true})
      globalThis.innerWidth = 390
      expect(engineDeviceSnapshot()).toEqual({deviceMemoryGiB: 4, isMobile: true})
      Object.defineProperty(globalThis, 'navigator', {value: {}, configurable: true})
      globalThis.innerWidth = 1280
      expect(engineDeviceSnapshot()).toEqual({deviceMemoryGiB: null, isMobile: false})
    } finally {
      Object.defineProperty(globalThis, 'navigator', {value: saved.navigator, configurable: true})
      globalThis.innerWidth = saved.innerWidth
    }
  })
})
