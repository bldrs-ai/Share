/* eslint-disable no-magic-numbers, require-await, new-cap */
import {EngineSession, SESSION_CLOSED} from './EngineSession'
import {createEngineHandler, plainProgress, wasmBytesOf} from './engineHandler'
import {ENGINE_PROTOCOL_VERSION, Op} from './protocol'
import {makeInProcessTransport, makeWorkerTransport} from './transports'


// The session layer of engine-worker.md §7 step 2, over the in-process
// transport and a stub IfcAPI. No Jest test runs real Conway (the sibling
// ShareIfcLoader tests say why); the real engine, in a real Worker, is
// exercised by `engineSession.spec.ts`.


const MB = 1024 * 1024


/**
 * A stub of Conway's compat IfcAPI: just the calls the handler makes,
 * recording them so a test can assert what reached the engine.
 *
 * @param {object} [overrides]
 * @return {object}
 */
function makeStubApi(overrides = {}) {
  const calls = []
  const api = {
    calls,
    wasmModule: undefined,
    async Init() {
      calls.push(['Init'])
      this.wasmModule = {HEAPU8: {byteLength: 16 * MB}}
    },
    SetLogLevel: (level) => calls.push(['SetLogLevel', level]),
    getConwayVersion: () => 'Conway v-test',
    async OpenModelStream(store, settings) {
      calls.push(['OpenModelStream', store.byteLength, settings.DEFER_GEOMETRY])
      settings.ON_MODEL_INFO({schema: 'IFC4', notCloneable: () => 0})
      settings.ON_PROGRESS({phase: 'dataParse', completed: 1, total: 2, unit: 'bytes', elapsedMs: 5})
      return 0
    },
    async OpenModelStreamed(bytes, settings) {
      calls.push(['OpenModelStreamed', bytes.byteLength, settings.DEFER_GEOMETRY])
      return 0
    },
    ExtractGeometryBatchAsync: () => null,
    IsModelOpen: () => true,
    ReleaseEntityCache: (id) => calls.push(['ReleaseEntityCache', id]),
    CloseModel: (id) => calls.push(['CloseModel', id]),
    properties: {
      getSpatialStructure: async (id, mode, opts) => {
        calls.push(['tree', id, mode, opts])
        return {expressID: 1, type: 'IFCPROJECT', children: [{expressID: 2, type: 'IFCSITE', children: []}]}
      },
      getItemProperties: async (id, expressID) => {
        calls.push(['props', expressID])
        return {expressID, Name: {value: `n${expressID}`}}
      },
      getPropertySets: async (id, expressID) => [{expressID: expressID + 100}],
      getAllItemsOfType: async (id, type) => (type === 'IFCWALL' ? [7, 8] : []),
    },
    ...overrides,
  }
  return api
}


/**
 * @param {object} [api]
 * @param {number} [epoch]
 * @return {{session: EngineSession, api: object, posted: Array}}
 */
function inProcessSession(api = makeStubApi(), epoch = 7) {
  const posted = []
  const transport = makeInProcessTransport((post) =>
    createEngineHandler({loadIfcAPI: async () => function IfcAPI() {
      return api
    }, post: (msg, transfer) => {
      posted.push(msg)
      post(msg, transfer)
    }}))
  const sentRequests = []
  const realPost = transport.post
  transport.post = (msg, transfer) => {
    sentRequests.push(msg)
    realPost(msg, transfer)
  }
  return {session: new EngineSession(transport, {epoch}), api, posted, sentRequests}
}


describe('engine/EngineSession over the in-process transport', () => {
  it('init stands the engine up and reports its capabilities and wasm bytes', async () => {
    const {session, api} = inProcessSession()
    const info = await session.init({flags: {}})
    expect(info.conwayVersion).toBe('Conway v-test')
    expect(info.capabilities).toEqual({openStream: true, openFromIndex: false, asyncPump: true, propertyTables: true})
    expect(info.wasmBytes).toBe(16 * MB)
    expect(session.capabilities).toEqual(info.capabilities)
    expect(api.calls[0]).toEqual(['Init'])
    expect(session.kind).toBe('inProcess')
  })

  it('opens a File windowed and index-only, and resolves `indexed`', async () => {
    const {session, api} = inProcessSession()
    await session.init()
    const file = new Blob([new Uint8Array(1234)])
    const opened = await session.open({file})
    expect(opened).toMatchObject({modelID: 0, windowed: true})
    // Index only: the deferred open, and never a geometry pump call.
    expect(api.calls).toContainEqual(['OpenModelStream', 1234, true])
    await expect(session.indexed).resolves.toEqual({modelID: 0, windowed: true})
  })

  it('opens bytes buffered, transferring them', async () => {
    const {session, api} = inProcessSession()
    await session.init()
    const bytes = new ArrayBuffer(64)
    const opened = await session.open({bytes})
    expect(opened.windowed).toBe(false)
    expect(api.calls).toContainEqual(['OpenModelStreamed', 64, true])
    // Transferred, as across a worker: the caller's copy is gone.
    expect(bytes.byteLength).toBe(0)
  })

  it('honours disableStreamOpen from the init flag snapshot', async () => {
    const {session, api} = inProcessSession()
    await session.init({flags: {disableStreamOpen: true}})
    await session.open({file: new Blob([new Uint8Array(10)])})
    expect(api.calls.map(([name]) => name)).not.toContain('OpenModelStream')
    expect(api.calls).toContainEqual(['OpenModelStreamed', 10, true])
  })

  it('forwards progress and model info as plain data, each carrying wasm bytes', async () => {
    const {session} = inProcessSession()
    await session.init()
    const progress = []
    const infos = []
    session.on('progress', (msg) => progress.push(msg))
    session.on('modelInfo', (msg) => infos.push(msg))
    await session.open({file: new Blob(['x'])})
    expect(progress).toHaveLength(1)
    expect(progress[0].event).toEqual({phase: 'dataParse', completed: 1, total: 2, unit: 'bytes', elapsedMs: 5})
    expect(progress[0].wasmBytes).toBe(16 * MB)
    // The non-cloneable field was dropped; with it the post would throw.
    expect(infos[0].info).toEqual({schema: 'IFC4'})
    expect(session.lastWasmBytes).toBe(16 * MB)
  })

  it('a failed open rejects open and indexed, and emits `failed`', async () => {
    const api = makeStubApi({OpenModelStream: async () => -1, OpenModelStreamed: async () => -1})
    const {session} = inProcessSession(api)
    await session.init()
    const failed = []
    session.on('failed', (msg) => failed.push(msg))
    await expect(session.open({file: new Blob(['x'])})).rejects.toThrow('engine: open failed (-1)')
    await expect(session.indexed).rejects.toThrow('open failed')
    expect(failed).toEqual([expect.objectContaining({kind: 'openFailure', code: -1})])
  })

  it('reads the tree, properties, property sets and items of a type', async () => {
    const {session, api} = inProcessSession()
    await session.init()
    await session.open({file: new Blob(['x'])})
    const tree = await session.tree({mode: 'names', includeSolids: true})
    expect(tree.children[0].type).toBe('IFCSITE')
    expect(api.calls).toContainEqual(['tree', 0, 'names', {includeSolids: true}])
    expect(await session.properties(2)).toEqual({expressID: 2, Name: {value: 'n2'}})
    expect(await session.propertySets(2)).toEqual([{expressID: 102}])
    expect(await session.itemsOfType('IFCWALL')).toEqual([7, 8])
  })

  it('propertiesMany is ONE request for N ids, answered in id order', async () => {
    const {session, sentRequests} = inProcessSession()
    await session.init()
    await session.open({file: new Blob(['x'])})
    const before = sentRequests.length
    const records = await session.propertiesMany([5, 3, 9])
    expect(sentRequests.length - before).toBe(1)
    expect(sentRequests.at(-1)).toMatchObject({op: Op.PROPS, args: {ids: [5, 3, 9]}})
    expect(records.map((r) => r.expressID)).toEqual([5, 3, 9])
  })

  it('propertiesApi presents the ifcAPI.properties shape over the session', async () => {
    const {session} = inProcessSession()
    await session.init()
    await session.open({file: new Blob(['x'])})
    const props = session.propertiesApi
    // The leading modelID is ignored: one model per session.
    expect((await props.getSpatialStructure(99, 'names')).type).toBe('IFCPROJECT')
    expect(await props.getItemProperties(99, 2)).toEqual({expressID: 2, Name: {value: 'n2'}})
    expect(await props.getPropertySets(99, 2)).toEqual([{expressID: 102}])
    expect(await props.getAllItemsOfType(99, 'IFCWALL')).toEqual([7, 8])
  })

  it('typeName is the static IFC type table, answered without the engine', () => {
    const {session, sentRequests} = inProcessSession()
    // IFCWALL's code in conway's types-map.
    expect(session.typeName(2391406946)).toBe('IFCWALL')
    expect(sentRequests).toHaveLength(0)
  })

  it('a read before any model is open rejects with the engine\'s message', async () => {
    const {session} = inProcessSession()
    await session.init()
    await expect(session.tree()).rejects.toThrow('engine: no model is open')
  })

  it('a second open in the same engine is refused', async () => {
    const {session} = inProcessSession()
    await session.init()
    await session.open({file: new Blob(['x'])})
    await expect(session.open({file: new Blob(['y'])})).rejects.toThrow('already open')
  })

  it('releases the entity cache on request', async () => {
    const {session, api} = inProcessSession()
    await session.init()
    await session.open({file: new Blob(['x'])})
    await expect(session.request(Op.RELEASE, {entityCache: true})).resolves.toBe(true)
    expect(api.calls).toContainEqual(['ReleaseEntityCache', 0])
  })

  it('close refuses pending and later requests, and disposes the engine', async () => {
    const {session, api} = inProcessSession()
    await session.init()
    await session.open({file: new Blob(['x'])})
    const pending = session.tree()
    session.close()
    await expect(pending).rejects.toThrow(SESSION_CLOSED)
    await expect(session.properties(1)).rejects.toThrow(SESSION_CLOSED)
    expect(api.calls).toContainEqual(['CloseModel', 0])
  })
})


describe('engine/EngineSession epochs and protocol', () => {
  it('drops replies and events from another epoch', async () => {
    const listeners = []
    const transport = {
      kind: 'test',
      post: jest.fn(),
      onMessage: (cb) => listeners.push(cb),
      onCrash: () => null,
      terminate: jest.fn(),
    }
    const session = new EngineSession(transport, {epoch: 2})
    const reply = session.request(Op.STATS)
    const {id} = transport.post.mock.calls[0][0]
    const progress = jest.fn()
    session.on('progress', progress)
    // A late reply with the right id but a dead engine's epoch.
    listeners[0]({v: ENGINE_PROTOCOL_VERSION, epoch: 1, re: id, ok: true, result: 'stale'})
    listeners[0]({v: ENGINE_PROTOCOL_VERSION, epoch: 1, ev: 'progress', seq: 1})
    expect(progress).not.toHaveBeenCalled()
    listeners[0]({v: ENGINE_PROTOCOL_VERSION, epoch: 2, re: id, ok: true, result: 'live'})
    await expect(reply).resolves.toBe('live')
  })

  it('the handler refuses another protocol version instead of guessing', async () => {
    const posted = []
    const handler = createEngineHandler({loadIfcAPI: async () => null, post: (m) => posted.push(m)})
    await handler.handle({v: ENGINE_PROTOCOL_VERSION + 1, id: 1, op: Op.STATS})
    expect(posted[0]).toMatchObject({re: 1, ok: false})
    expect(posted[0].error.message).toMatch(/protocol v2 unsupported/)
  })

  it('the handler answers an unknown op with an error, not silence', async () => {
    const posted = []
    const handler = createEngineHandler({loadIfcAPI: async () => null, post: (m) => posted.push(m)})
    await handler.handle({v: ENGINE_PROTOCOL_VERSION, id: 3, op: 'frobnicate'})
    expect(posted[0]).toMatchObject({re: 3, ok: false, error: {message: 'engine: unknown op frobnicate'}})
  })
})


describe('engine/transports worker transport', () => {
  /** @return {object} a Worker-shaped EventTarget that records posts */
  function makeFakeWorker() {
    const worker = new EventTarget()
    worker.posted = []
    worker.postMessage = (msg, transfer) => worker.posted.push({msg, transfer})
    worker.terminate = jest.fn()
    return worker
  }

  it('a worker that dies rejects every pending request and reports `failed: crash`', async () => {
    const worker = makeFakeWorker()
    const session = new EngineSession(makeWorkerTransport(worker), {epoch: 1})
    const failed = []
    session.on('failed', (msg) => failed.push(msg))
    const pending = session.request(Op.STATS)
    worker.dispatchEvent(Object.assign(new Event('error'), {message: 'wasm trap'}))
    await expect(pending).rejects.toThrow('wasm trap')
    expect(failed).toEqual([{ev: 'failed', kind: 'crash', message: 'wasm trap'}])
    await expect(session.request(Op.STATS)).rejects.toThrow(SESSION_CLOSED)
  })

  it('routes replies from the worker, and close terminates it', async () => {
    const worker = makeFakeWorker()
    const session = new EngineSession(makeWorkerTransport(worker), {epoch: 4})
    const reply = session.stats()
    const {msg} = worker.posted[0]
    expect(msg).toMatchObject({v: ENGINE_PROTOCOL_VERSION, epoch: 4, op: Op.STATS})
    worker.dispatchEvent(new MessageEvent('message', {
      data: {v: ENGINE_PROTOCOL_VERSION, epoch: 4, re: msg.id, ok: true, result: {wasmBytes: 5}},
    }))
    await expect(reply).resolves.toEqual({wasmBytes: 5})
    session.close()
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })
})


describe('engine/engineHandler helpers', () => {
  it('wasmBytesOf reads the heap length, and is 0 before Init', () => {
    expect(wasmBytesOf(null)).toBe(0)
    expect(wasmBytesOf({})).toBe(0)
    expect(wasmBytesOf({wasmModule: {HEAPU8: {byteLength: 42}}})).toBe(42)
  })

  it('plainProgress keeps primitive fields, including ones added later', () => {
    expect(plainProgress({phase: 'p', completed: 1, residentSourceMb: 4, fn: () => 1, nested: {a: 1}}))
      .toEqual({phase: 'p', completed: 1, residentSourceMb: 4})
  })
})


describe('engine/EngineSession teardown on a crash (review on #2057)', () => {
  /** @return {object} a Worker-shaped EventTarget */
  function makeFakeWorker() {
    const worker = new EventTarget()
    worker.postMessage = () => null
    worker.terminate = jest.fn()
    return worker
  }

  it('a messageerror terminates the worker, so its heap is freed', () => {
    const worker = makeFakeWorker()
    const session = new EngineSession(makeWorkerTransport(worker), {epoch: 1})
    worker.dispatchEvent(new Event('messageerror'))
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    expect(session.closed).toBe(true)
  })

  it('an error terminates the worker, and a later close() is a no-op', () => {
    const worker = makeFakeWorker()
    const session = new EngineSession(makeWorkerTransport(worker), {epoch: 1})
    worker.dispatchEvent(Object.assign(new Event('error'), {message: 'boom'}))
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    session.close()
    session.close()
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })
})


describe('engine worker prelude modules', () => {
  const g = globalThis
  let savedProcess

  beforeEach(() => {
    savedProcess = Object.getOwnPropertyDescriptor(g, 'process')
  })

  afterEach(() => {
    Object.defineProperty(g, 'process', savedProcess)
  })

  it('engineThreading forces the single-threaded engine through the guarded global', () => {
    jest.isolateModules(() => {
      require('./engineThreading')
    })
    // What conway reads: `typeof process !== 'undefined' &&
    // process?.env?.FORCE_SINGLE_THREAD === 'true'`.
    expect(typeof process).not.toBe('undefined')
    expect(g.process.env.FORCE_SINGLE_THREAD).toBe('true')
  })

  it('the worker entry imports engineThreading before anything else', () => {
    // A static check, because the worker bundle cannot run in Jest: the
    // single-thread switch must be set before conway's module code runs.
    const source = require('fs').readFileSync(require('path').join(__dirname, 'Engine.worker.js'), 'utf8')
    const imports = source.split('\n').filter((line) => line.startsWith('import '))
    expect(imports[0]).toBe('import \'./engineThreading\'')
  })
})


describe('engine protocol version mismatch (review on #2057)', () => {
  it('an engine on another version refuses init promptly, typed, instead of hanging', async () => {
    // The handler as a v(N+1) worker would run it, against this v(N) page.
    let createForeignHandler
    jest.isolateModules(() => {
      jest.doMock('./protocol', () => ({
        ...jest.requireActual('./protocol'),
        ENGINE_PROTOCOL_VERSION: ENGINE_PROTOCOL_VERSION + 1,
      }))
      createForeignHandler = require('./engineHandler').createEngineHandler
    })
    const transport = makeInProcessTransport((post) =>
      createForeignHandler({loadIfcAPI: async () => null, post}))
    const session = new EngineSession(transport, {epoch: 3})
    // A long backstop, so only the echoed refusal can make this settle in
    // time: without it the reply is dropped and the test times out.
    const init = session.init({timeoutMs: 60_000})
    await expect(init).rejects.toMatchObject({
      name: 'ProtocolMismatchError',
      pageVersion: ENGINE_PROTOCOL_VERSION,
      engineVersion: ENGINE_PROTOCOL_VERSION + 1,
    })
  }, 5_000)

  it('init times out as a mismatch when the engine only ever spoke another version', async () => {
    // An older worker that drops what it cannot read, and only announces
    // itself in its own version.
    const listeners = []
    const transport = {
      kind: 'test',
      post: () => listeners.forEach((cb) => cb({v: ENGINE_PROTOCOL_VERSION + 1, epoch: 0, ev: 'progress'})),
      onMessage: (cb) => listeners.push(cb),
      onCrash: () => null,
      terminate: jest.fn(),
    }
    const session = new EngineSession(transport, {epoch: 1})
    await expect(session.init({timeoutMs: 20})).rejects.toMatchObject({name: 'ProtocolMismatchError'})
  })

  it('init times out plainly when the engine never answers at all', async () => {
    const transport = {kind: 'test', post: () => null, onMessage: () => null, onCrash: () => null, terminate: jest.fn()}
    const session = new EngineSession(transport, {epoch: 1})
    await expect(session.init({timeoutMs: 20})).rejects
      .toThrow('engine did not answer init within 20 ms (no init reply after hello)')
  })
})


describe('engine open: a schema refusal is final (review on #2057)', () => {
  /**
   * An engine whose windowed open is refused on schema, as conway's IFC4X3
   * gate does: -1, with the attempt's statistics saying UNSUPPORTED_SCHEMA.
   *
   * @return {object}
   */
  function refusingApi() {
    const statistics = new Map()
    return makeStubApi({
      globalModelIDCounter: 0,
      getStatistics: (id) => statistics.get(id),
      async OpenModelStream() {
        this.calls.push(['OpenModelStream'])
        statistics.set(this.globalModelIDCounter, {
          getLoadStatus: () => 'UNSUPPORTED_SCHEMA',
          getLoadFailureReason: () => 'IFC4X3 is not supported',
        })
        return -1
      },
      async OpenModelStreamed() {
        this.calls.push(['OpenModelStreamed'])
        return 0
      },
    })
  }

  it('never retries as a buffered open, and rejects with the refusal classified', async () => {
    const api = refusingApi()
    const {session} = inProcessSession(api)
    await session.init()
    const opened = session.open({file: new Blob(['ISO-10303-21;'])})
    await expect(opened).rejects.toMatchObject({
      engineFailure: {code: -1, refusedSchema: true, openFailure: {status: 'UNSUPPORTED_SCHEMA'}},
    })
    expect(api.calls.map(([name]) => name)).toContain('OpenModelStream')
    expect(api.calls.map(([name]) => name)).not.toContain('OpenModelStreamed')
  })

  it('a windowed failure that is NOT a refusal still falls back to buffered', async () => {
    const api = makeStubApi({globalModelIDCounter: 0, getStatistics: () => undefined, OpenModelStream: async () => -1})
    const {session} = inProcessSession(api)
    await session.init()
    await expect(session.open({file: new Blob(['x'])})).resolves.toMatchObject({modelID: 0, windowed: false})
    expect(api.calls.map(([name]) => name)).toContain('OpenModelStreamed')
  })
})


describe('engine round-3 review fixes (#2057)', () => {
  it('two concurrent opens: one wins, the other is refused, and the engine holds one model', async () => {
    const api = makeStubApi()
    let opens = 0
    api.OpenModelStream = async () => {
      opens++
      await new Promise((resolve) => setTimeout(resolve, 5))
      return 0
    }
    const {session} = inProcessSession(api)
    await session.init()
    const results = await Promise.allSettled([
      session.open({file: new Blob(['a'])}),
      session.open({file: new Blob(['b'])}),
    ])
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect(results.find((r) => r.status === 'rejected').reason.message).toMatch(/already open/)
    expect(opens).toBe(1)
  })

  it('a second init is refused instead of replacing the engine', async () => {
    const {session} = inProcessSession()
    await session.init()
    await expect(session.request(Op.INIT, {epoch: 7})).rejects.toThrow('init has already run')
  })

  it('in process, close during init leaves no engine: Init never runs after close', async () => {
    const api = makeStubApi()
    let releaseLoad
    const posted = []
    const transport = makeInProcessTransport((post) => createEngineHandler({
      loadIfcAPI: () => new Promise((resolve) => {
        releaseLoad = () => resolve(function IfcAPI() {
          return api
        })
      }),
      post: (m, t) => {
        posted.push(m)
        post(m, t)
      },
    }))
    const session = new EngineSession(transport, {epoch: 7})
    const init = session.init()
    await new Promise((resolve) => setTimeout(resolve, 0))
    session.close()
    releaseLoad()
    await expect(init).rejects.toThrow()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(api.calls.map(([name]) => name)).not.toContain('Init')
  })

  it('in process, close during open closes the model the open goes on to make', async () => {
    const api = makeStubApi()
    let releaseOpen
    api.OpenModelStream = () => new Promise((resolve) => {
      releaseOpen = () => resolve(0)
    })
    const {session} = inProcessSession(api)
    await session.init()
    const opened = session.open({file: new Blob(['x'])})
    await new Promise((resolve) => setTimeout(resolve, 0))
    session.close()
    releaseOpen()
    await expect(opened).rejects.toThrow()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(api.calls).toContainEqual(['CloseModel', 0])
  })

  it('an Init() that leaves no wasm module fails init instead of reporting success', async () => {
    const api = makeStubApi({async Init() {
      this.calls.push(['Init'])
    }})
    const {session} = inProcessSession(api)
    await expect(session.init()).rejects.toThrow('left no wasm module')
  })

  it('a post that throws clears its pending slot', async () => {
    const transport = {
      kind: 'test', onMessage: () => null, onCrash: () => null, terminate: jest.fn(),
      post: () => {
        throw new Error('DataCloneError')
      },
    }
    const session = new EngineSession(transport, {epoch: 1})
    await expect(session.stats()).rejects.toThrow('DataCloneError')
    expect(session.pending.size).toBe(0)
  })

  it('a whole-buffer Uint8Array source is transferred, not cloned, and reaches the engine as-is', async () => {
    const api = makeStubApi()
    let received
    api.OpenModelStreamed = async (bytes) => {
      received = bytes
      return 0
    }
    const {session} = inProcessSession(api)
    await session.init()
    const view = new Uint8Array(32)
    await session.open({bytes: view})
    expect(view.byteLength).toBe(0)
    expect(received.byteLength).toBe(32)
  })

  it('a sub-view source is copied out before transfer, leaving the caller\'s buffer intact', async () => {
    const {session} = inProcessSession()
    await session.init()
    const whole = new Uint8Array(64)
    await session.open({bytes: whole.subarray(8, 40)})
    expect(whole.byteLength).toBe(64)
  })

  it('lastWasmBytes is live from the init reply, before any event', async () => {
    const {session} = inProcessSession()
    await session.init()
    expect(session.lastWasmBytes).toBe(16 * 1024 * 1024)
  })

  it('a closed session ignores late messages and drops its listeners', async () => {
    const listeners = []
    const transport = {kind: 'test', post: () => null, onMessage: (cb) => listeners.push(cb), onCrash: () => null, terminate: () => null}
    const session = new EngineSession(transport, {epoch: 1})
    const progress = jest.fn()
    session.on('progress', progress)
    session.close()
    listeners[0]({v: ENGINE_PROTOCOL_VERSION, epoch: 1, ev: 'indexed', modelID: 3})
    listeners[0]({v: ENGINE_PROTOCOL_VERSION, epoch: 1, ev: 'progress', seq: 1})
    expect(progress).not.toHaveBeenCalled()
    expect(session.modelID).toBe(-1)
    expect(session.listeners.size).toBe(0)
  })

  it('a worker\'s init waits for its hello, and a hello of another version refuses at once', async () => {
    const worker = new EventTarget()
    worker.posted = []
    worker.postMessage = (msg) => worker.posted.push(msg)
    worker.terminate = jest.fn()
    const session = new EngineSession(makeWorkerTransport(worker), {epoch: 2})
    const init = session.init({timeoutMs: 60_000})
    await new Promise((resolve) => setTimeout(resolve, 10))
    // No hello yet: the init request has not been sent.
    expect(worker.posted).toHaveLength(0)
    worker.dispatchEvent(new MessageEvent('message', {data: {v: ENGINE_PROTOCOL_VERSION + 1, epoch: 0, ev: 'hello'}}))
    await expect(init).rejects.toMatchObject({name: 'ProtocolMismatchError', engineVersion: ENGINE_PROTOCOL_VERSION + 1})
    expect(worker.terminate).toHaveBeenCalled()
  })

  it('a worker that never says hello times out instead of hanging (review on #2058)', async () => {
    const worker = new EventTarget()
    worker.postMessage = jest.fn()
    worker.terminate = jest.fn()
    const session = new EngineSession(makeWorkerTransport(worker), {epoch: 2})
    await expect(session.init({timeoutMs: 20})).rejects
      .toThrow('engine did not answer init within 20 ms (no hello from the worker)')
  })
})
