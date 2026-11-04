/* eslint-disable require-await */
import {ENGINE_PROTOCOL_VERSION} from './protocol'
import {spawnEngineSession} from './spawnEngine'


// Review on #2058: a worker engine that cannot start must not fail the load.
// spawnEngineSession retries once on the in-process engine.

jest.mock('../FeatureFlags', () => ({isFeatureEnabled: jest.fn(() => false)}))


/** @return {Function} an IfcAPI constructor over a minimal stub engine */
function stubIfcAPI() {
  return function IfcAPI() {
    return {
      wasmModule: undefined,
      async Init() {
        this.wasmModule = {HEAPU8: {byteLength: 16}}
      },
      properties: {},
    }
  }
}


/**
 * A Worker-shaped EventTarget that posts `hello` in another protocol
 * version, as a stale cached worker beside a newer page would.
 *
 * @return {object}
 */
function staleWorker() {
  const worker = new EventTarget()
  worker.postMessage = jest.fn()
  worker.terminate = jest.fn()
  queueMicrotask(() => worker.dispatchEvent(new MessageEvent('message', {
    data: {v: ENGINE_PROTOCOL_VERSION + 1, epoch: 0, ev: 'hello'},
  })))
  return worker
}


describe('engine/spawnEngineSession fallback', () => {
  let warnSpy
  let savedWorker

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    // Module workers "exist", so the worker transport is tried first.
    savedWorker = globalThis.Worker
    globalThis.Worker = function Worker() {
      return {terminate: () => null}
    }
    URL.createObjectURL = URL.createObjectURL ?? (() => 'blob:x')
    URL.revokeObjectURL = URL.revokeObjectURL ?? (() => null)
  })

  afterEach(() => {
    warnSpy.mockRestore()
    globalThis.Worker = savedWorker
  })

  it('a mismatched worker falls back to the in-process engine, and says so', async () => {
    let worker
    const session = await spawnEngineSession({
      makeWorker: () => {
        worker = staleWorker()
        return worker
      },
      loadIfcAPI: async () => stubIfcAPI(),
    })
    expect(session.kind).toBe('inProcess')
    expect(session.capabilities).toBeTruthy()
    expect(worker.terminate).toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/ProtocolMismatchError.*in process instead/))
  })

  it('a worker that cannot even be constructed falls back too', async () => {
    const session = await spawnEngineSession({
      makeWorker: () => {
        throw new Error('blocked by CSP')
      },
      loadIfcAPI: async () => stubIfcAPI(),
    })
    expect(session.kind).toBe('inProcess')
  })

  it('an in-process failure is not retried: there is nowhere left to go', async () => {
    await expect(spawnEngineSession({
      inProcess: true,
      loadIfcAPI: async () => function IfcAPI() {
        return {Init: () => Promise.resolve()}
      },
    })).rejects.toThrow('left no wasm module')
  })
})
