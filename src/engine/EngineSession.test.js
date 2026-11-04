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
    expect(info.capabilities).toEqual({openStream: true, openFromIndex: false, asyncPump: true})
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
