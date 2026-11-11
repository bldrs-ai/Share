/** @jest-environment node */ // eslint-disable-line jsdoc/check-tag-names
/* eslint-disable require-await */
import {reportSourceInfo} from '../loader/loadProgress'
import {EngineSession} from './EngineSession'
import {createEngineHandler} from './engineHandler'
import {createEngineModelLoad, shouldRetryWindowed} from './engineModelLoad'
import {SourceModeReason} from './sourcePolicy'
import {ENGINE_PROTOCOL_VERSION, Ev} from './protocol'
import {makeWorkerTransport} from './transports'


// The source policy's out-of-memory fallback, at the page-side seam that
// owns the session lifecycle (engineModelLoad.js#parse; engine-worker.md
// §5.6). Each "engine" here is a real handler behind a worker transport
// over a fake Worker that hands messages across without cloning (Node's
// structuredClone turns a File into a nameless Blob, which no OPFS lookup
// can match), with a conway double that fails the way conway 1.1645.781 does: a
// buffered open that runs out of memory does NOT throw. `fromStreamed`
// catches, falls back to the classic open, `fromAsync` catches again and
// calls `recordOpenFailure` (status OPEN_FAIL, reason the error's message),
// and OpenModelStreamed returns -1. So the page sees an open that failed
// with an OOM-shaped recorded reason, and must retry on a NEW engine: an
// Emscripten OOM abort leaves the failed one's wasm unusable.

jest.mock('../loader/loadProgress', () => ({
  reportEngineLog: jest.fn(),
  reportEngineVersion: jest.fn(),
  reportSourceInfo: jest.fn(),
}))


const BYTES = Uint8Array.from({length: 64}, (_, i) => i)
const NAME = 'model.ifc.etag.commit'
const MTIME = 1_700_000_000_000
const WASM_OOM = 'Aborted(OOM). Build with -sASSERTIONS for more info.'


/** @return {File} the OPFS snapshot the Loader hands the engine load */
function snapshot() {
  return new File([BYTES], NAME, {lastModified: MTIME})
}


/** @return {object} an OPFS root with the source entry and a read-only sync access handle */
function opfs() {
  const entry = {
    kind: 'file', name: NAME,
    getFile: async () => snapshot(),
    createSyncAccessHandle: async () => ({
      mode: 'read-only',
      getSize: () => BYTES.length,
      read: (into, {at}) => {
        into.set(BYTES.subarray(at, at + into.length))
        return into.length
      },
      close: () => null,
    }),
  }
  return {
    kind: 'directory',
    async* entries() {
      yield [NAME, entry]
    },
  }
}


/**
 * A conway double. `fail` names which opens fail, and how: each entry
 * `{status, reason}` is recorded on the open's own statistics and the open
 * returns -1, as `recordOpenFailure` does.
 *
 * @param {Array<string>} log
 * @param {object} [fail]
 * @param {object} [fail.buffered] the buffered open's failure, if it fails
 * @param {object} [fail.windowed] the windowed open's failure, if it fails
 * @return {object}
 */
function conwayDouble(log, {buffered = null, windowed = null} = {}) {
  const statistics = new Map()
  const fails = (failure) => {
    statistics.set(api.globalModelIDCounter++,
      {getLoadStatus: () => failure.status, getLoadFailureReason: () => failure.reason})
    return -1
  }
  const api = {
    globalModelIDCounter: 0,
    wasmModule: undefined,
    async Init() {
      this.wasmModule = {HEAPU8: {byteLength: 1}}
    },
    getConwayVersion: () => 'Conway v-test',
    getStatistics: (id) => statistics.get(id),
    async OpenModelStreamed() {
      log.push('buffered open')
      return buffered ? fails(buffered) : api.globalModelIDCounter++
    },
    async OpenModelStream() {
      log.push('windowed open')
      return windowed ? fails(windowed) : api.globalModelIDCounter++
    },
    async ExtractGeometryBatchAsync() {
      return {extracted: 0, remaining: 0}
    },
    StreamAllMeshesAsync: async () => null,
    StreamAllMeshes: () => null,
    CloseModel: () => log.push('CloseModel'),
    IsModelOpen: () => true,
    properties: {},
  }
  return api
}


/**
 * A `spawn` for createEngineModelLoad that stands up one fresh engine per
 * call, from `engines` in order, and records each session.
 *
 * @param {Array<object>} engines conway doubles, one per expected spawn
 * @param {object} [flags] init flags
 * @return {{spawn: function(): Promise<EngineSession>, sessions: Array<EngineSession>}}
 */
function spawner(engines, flags = {}) {
  const sessions = []
  const spawn = async () => {
    const api = engines[sessions.length]
    if (!api) {
      throw new Error('spawned more engines than the test allows')
    }
    const listeners = []
    const toPage = (data) => queueMicrotask(() => listeners.forEach((cb) => cb({data})))
    const handler = createEngineHandler({
      loadIfcAPI: async () => function IfcAPI() {
        return api
      },
      post: toPage,
      yieldToLoop: () => Promise.resolve(),
      sourceOptions: {getOpfsRoot: async () => opfs(), canSyncHandle: () => true},
    })
    const fakeWorker = {
      addEventListener: (type, cb) => type === 'message' && listeners.push(cb),
      postMessage: (msg) => queueMicrotask(() => handler.handle(msg)),
      terminate: () => null,
    }
    const session = new EngineSession(makeWorkerTransport(fakeWorker), {epoch: sessions.length + 1})
    toPage({v: ENGINE_PROTOCOL_VERSION, epoch: 0, ev: Ev.HELLO, seq: 0})
    sessions.push(session)
    // No sidecar: keep these opens to the policy's buffered/windowed choice.
    await session.init({flags: {disableEngineSidecar: true, ...flags}, device: {deviceMemoryGiB: 8, isMobile: false}})
    return session
  }
  return {spawn, sessions}
}


/** @return {Array<string>} the report lines the load added */
function reportedLines() {
  return reportSourceInfo.mock.calls.map(([line]) => line).filter(Boolean)
}


beforeEach(() => {
  reportSourceInfo.mockClear()
})


describe('engine/engineModelLoad: a buffered open that runs out of memory (Share#2139)', () => {
  it('is retried once, windowed, on a fresh engine, and the load says so', async () => {
    const log = []
    const first = conwayDouble(log, {buffered: {status: 'OPEN_FAIL', reason: WASM_OOM}})
    const second = conwayDouble(log)
    const {spawn, sessions} = spawner([first, second])
    const load = createEngineModelLoad({format: 'ifc', spawn})
    const result = await load.parse(snapshot(), {})
    expect(sessions).toHaveLength(2)
    expect(sessions[0].closed).toBe(true)
    expect(load.ifcAPI.engineSession).toBe(sessions[1])
    // The first engine buffered and failed; the second never tried buffered.
    expect(log).toEqual(['buffered open', 'windowed open'])
    expect(result.summary.sourceMode).toMatchObject({
      mode: 'windowed', reason: SourceModeReason.BUFFERED_FAILED, failure: 'outOfMemory',
    })
    expect(reportedLines()).toContain('Engine source: windowed (buffered open failed: out of memory)')
    await sessions[1].close()
  })

  it('a JS-heap allocation failure recorded by conway is retried the same way', async () => {
    const log = []
    const first = conwayDouble(log, {buffered: {status: 'OPEN_FAIL', reason: 'Array buffer allocation failed'}})
    const {spawn, sessions} = spawner([first, conwayDouble(log)])
    const result = await createEngineModelLoad({format: 'step', spawn}).parse(snapshot(), {})
    expect(sessions).toHaveLength(2)
    expect(result.summary.sourceMode.reason).toBe(SourceModeReason.BUFFERED_FAILED)
    await sessions[1].close()
  })

  it('when the windowed retry fails too, the load fails once, with the retry\'s failure', async () => {
    const log = []
    const oom = {status: 'OPEN_FAIL', reason: WASM_OOM}
    const {spawn, sessions} = spawner([conwayDouble(log, {buffered: oom}), conwayDouble(log, {windowed: oom})])
    const parse = createEngineModelLoad({format: 'ifc', spawn}).parse(snapshot(), {})
    const error = await parse.catch((e) => e)
    expect(error).toBeInstanceOf(Error)
    // Exactly two engines: no third attempt.
    expect(sessions).toHaveLength(2)
    expect(sessions.every((s) => s.closed)).toBe(true)
    expect(log).toEqual(['buffered open', 'windowed open'])
    // The error carries how the failed open read its source, for Sentry.
    expect(error.engineSource).toBe('windowed')
    expect(error.engineSourceReason).toBe(SourceModeReason.BUFFERED_FAILED)
  })

  it('a buffered open that fails for another reason (a corrupt file) is not retried', async () => {
    const log = []
    const corrupt = {status: 'OPEN_FAIL', reason: 'Unexpected token at offset 1234'}
    const {spawn, sessions} = spawner([conwayDouble(log, {buffered: corrupt})])
    const error = await createEngineModelLoad({format: 'ifc', spawn}).parse(snapshot(), {}).catch((e) => e)
    expect(error).toBeInstanceOf(Error)
    expect(sessions).toHaveLength(1)
    expect(log).toEqual(['buffered open'])
    expect(error.engineSource).toBe('buffered')
    expect(error.engineSourceReason).toBe(SourceModeReason.UNDER_CAP)
  })

  it('a schema refusal is never retried, whatever its message', async () => {
    const log = []
    const refused = {status: 'UNSUPPORTED_SCHEMA', reason: 'out of memory while refusing'}
    const {spawn, sessions} = spawner([conwayDouble(log, {buffered: refused})])
    await expect(createEngineModelLoad({format: 'ifc', spawn}).parse(snapshot(), {})).rejects.toThrow()
    expect(sessions).toHaveLength(1)
  })

  it('under the kill switch (windowed from the start) an OOM is not retried', async () => {
    const log = []
    const oom = {status: 'OPEN_FAIL', reason: WASM_OOM}
    // The windowed open fails, openDeferred falls through to its buffered
    // open, which fails too: neither is the policy's buffered open.
    const {spawn, sessions} = spawner([conwayDouble(log, {windowed: oom, buffered: oom})],
      {disableBufferedSource: true})
    await expect(createEngineModelLoad({format: 'ifc', spawn}).parse(snapshot(), {})).rejects.toThrow()
    expect(sessions).toHaveLength(1)
    expect(log).toEqual(['windowed open', 'buffered open'])
  })
})


describe('engine/engineModelLoad#shouldRetryWindowed', () => {
  const buffered = {mode: 'buffered', reason: SourceModeReason.UNDER_CAP}
  const oom = {status: 'OPEN_FAIL', reason: WASM_OOM}

  it('only the policy\'s own buffered open, failed out of memory, not refused', () => {
    expect(shouldRetryWindowed({refusedSchema: false, openFailure: oom, sourceMode: buffered})).toBe(true)
    expect(shouldRetryWindowed({refusedSchema: false, openFailure: oom,
      sourceMode: {mode: 'buffered', reason: SourceModeReason.HELD_BY_BLOB_STORE}})).toBe(true)
    // Not the policy's choice: no store to window over.
    for (const reason of [SourceModeReason.NO_STORE, SourceModeReason.STREAM_OPEN_DISABLED,
      SourceModeReason.WINDOWED_REFUSED, SourceModeReason.WINDOWED_FAILED]) {
      expect(shouldRetryWindowed({refusedSchema: false, openFailure: oom, sourceMode: {mode: 'buffered', reason}}))
        .toBe(false)
    }
    expect(shouldRetryWindowed({refusedSchema: true, openFailure: oom, sourceMode: buffered})).toBe(false)
    expect(shouldRetryWindowed({refusedSchema: false, openFailure: {status: 'OPEN_FAIL', reason: 'bad'},
      sourceMode: buffered})).toBe(false)
    // An engine from before the policy sends no source mode.
    expect(shouldRetryWindowed({refusedSchema: false, openFailure: oom})).toBe(false)
    expect(shouldRetryWindowed(undefined)).toBe(false)
  })
})
