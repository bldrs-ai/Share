/* eslint-disable no-magic-numbers, require-await, new-cap */
import {EngineSession} from './EngineSession'
import {createEngineHandler} from './engineHandler'
import {
  createEngineIfcLoad,
  decodePlacements,
  isWorkerEngineModel,
  makeEngineIfcApi,
  makeGeometryStore,
  statisticsView,
} from './engineIfcLoad'
import {makeBatchEncoder, makeLogForwarder, previewMessage, snapshotStatistics} from './engineStream'
import {makeInProcessTransport} from './transports'
import {UnsupportedSchemaError} from '../loader/unsupportedSchema'


// engine-worker.md §7 step 3: an IFC load streamed from an engine session.
// A stub conway over the in-process transport, which structured-clones and
// transfers exactly as a worker would, so "the page received it" here means
// it would have crossed a real worker boundary too.

jest.mock('../loader/loadProgress', () => ({
  reportEngineLog: jest.fn(),
  reportEngineVersion: jest.fn(),
}))


const MB = 1024 * 1024
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


/**
 * A conway-compat-shaped FlatMesh: a parent and its placements, the
 * placements in an Embind-like vector.
 *
 * @param {number} expressID
 * @param {Array<object>} placed
 * @return {object}
 */
function flatMesh(expressID, placed) {
  return {expressID, geometries: {size: () => placed.length, get: (i) => placed[i]}}
}


/**
 * One geometry in the stub's "wasm heap": 2 vertices (6 floats each) and a
 * triangle.
 *
 * @param {number} seed
 * @return {object}
 */
function heapGeometry(seed) {
  return {
    vertices: new Float32Array(12).map((_, i) => seed + i),
    indices: new Uint32Array([0, 1, 0]),
  }
}


/**
 * A stub engine with a three-batch model: geometry 100 shared by two
 * products, 101 used once, and 102 degenerate.
 *
 * @param {object} [overrides]
 * @return {object}
 */
function makeStreamingApi(overrides = {}) {
  const degenerate = {vertices: new Float32Array(0), indices: new Uint32Array(0)}
  const heap = new Map([[100, heapGeometry(1)], [101, heapGeometry(50)], [102, degenerate]])
  const batches = [
    [flatMesh(10, [{geometryExpressID: 100, flatTransformation: IDENTITY, color: {x: 1, y: 0, z: 0, w: 1}}])],
    [flatMesh(11, [
      {geometryExpressID: 100, flatTransformation: IDENTITY, color: {x: 0, y: 1, z: 0, w: 1}},
      {geometryExpressID: 101, flatTransformation: IDENTITY, color: {x: 0, y: 0, z: 1, w: 0.5}},
    ])],
    [flatMesh(12, [{geometryExpressID: 102, flatTransformation: IDENTITY, color: {x: 1, y: 1, z: 1, w: 1}}])],
  ]
  const calls = []
  const api = {
    calls,
    globalModelIDCounter: 0,
    wasmModule: undefined,
    heap,
    async Init() {
      this.wasmModule = {HEAPU8: {byteLength: 16 * MB}}
    },
    getConwayVersion: () => 'Conway v-test',
    async OpenModelStream(store, settings) {
      calls.push('OpenModelStream')
      settings.ON_PREVIEW_MESH?.({
        expressID: 10, geometryExpressID: 100, color: {x: 1, y: 0, z: 0, w: 1},
        flatTransformation: IDENTITY, vertexData: new Float32Array(6), indexData: new Uint32Array(3),
      })
      return 0
    },
    async OpenModelStreamed() {
      calls.push('OpenModelStreamed')
      return 0
    },
    async ExtractGeometryBatchAsync(id, size, cb) {
      const next = batches.shift()
      if (next === undefined) {
        return {extracted: 0, remaining: 0}
      }
      calls.push('pump')
      next.forEach(cb)
      return {extracted: next.length, remaining: batches.length}
    },
    GetGeometry: (id, gid) => {
      const g = heap.get(gid)
      return g && {
        GetVertexDataSize: () => g.vertices.length,
        GetIndexDataSize: () => g.indices.length,
        GetVertexData: () => gid,
        GetIndexData: () => gid,
      }
    },
    GetVertexArray: (ptr) => heap.get(ptr).vertices,
    GetIndexArray: (ptr) => heap.get(ptr).indices,
    getStatistics: () => ({
      getGeometryMemory: () => 12.5,
      getTotalTime: () => 40,
      getLoadStatus: () => 'OK',
      getProductCount: () => 3,
      projectName: 'Stub project',
    }),
    GetCoordinationMatrix: async () => IDENTITY,
    GetAppliedCoordinationMatrix: () => new Float64Array(IDENTITY),
    GetLinearScalingFactor: () => 0.001,
    CloseModel: () => null,
    properties: {
      getSpatialStructure: async () => ({expressID: 1, type: 'IFCPROJECT', children: []}),
      getItemProperties: async (id, eid) => ({expressID: eid}),
      getPropertySets: async () => [],
      getAllItemsOfType: async () => [],
    },
    ...overrides,
  }
  return api
}


/**
 * @param {object} api
 * @return {Function} spawn, over the in-process transport
 */
function spawnOver(api) {
  return async () => {
    const transport = makeInProcessTransport((post) =>
      createEngineHandler({
        loadIfcAPI: async () => function IfcAPI() {
          return api
        },
        post,
        yieldToLoop: () => Promise.resolve(),
      }))
    const session = new EngineSession(transport, {epoch: 9})
    await session.init()
    return session
  }
}


describe('engine/engineIfcLoad streamed IFC load', () => {
  it('delivers each batch to onMeshBatch with geometry served from the facade, once per shape', async () => {
    const api = makeStreamingApi()
    const load = createEngineIfcLoad({spawn: spawnOver(api)})
    const seen = []
    const onMeshBatch = (flatMeshes, modelID, progress) => {
      // What incrementalBatchedBuilder does at delivery: resolve each new
      // placement's geometry through the facade, copying it out.
      for (const fm of flatMeshes) {
        for (let i = 0; i < fm.geometries.length; i++) {
          const gid = fm.geometries[i].geometryExpressID
          const geom = load.ifcAPI.GetGeometry(modelID, gid)
          seen.push([fm.expressID, gid, geom ? Array.from(load.ifcAPI.GetVertexArray(geom.GetVertexData()).slice(0, 2)) : null])
        }
      }
      seen.push(['progress', progress.done, progress.total])
    }
    const {modelID, summary} = await load.parse(new Blob(['ISO-10303-21;']), {onMeshBatch})
    expect(modelID).toBe(0)
    expect(seen).toEqual([
      [10, 100, [1, 2]],
      ['progress', 1, 3],
      // 100 again: the worker did not resend it, and the store dropped it
      // after the first batch, so a second lookup is the builder's cache's
      // job, not the store's (null here).
      [11, 100, null],
      [11, 101, [50, 51]],
      ['progress', 2, 3],
      // 102 is degenerate: never sent, so the builder's GetGeometry is null.
      [12, 102, null],
      ['progress', 3, 3],
    ])
    expect(summary).toMatchObject({batches: 3, meshes: 3, geometries: 3, windowed: true})
  })

  it('keeps no geometry on the page once each batch has been appended', async () => {
    const load = createEngineIfcLoad({spawn: spawnOver(makeStreamingApi())})
    await load.parse(new Blob(['x']), {onMeshBatch: () => null})
    expect(load.ifcAPI.GetGeometry(0, 100)).toBeNull()
    expect(load.ifcAPI.GetGeometry(0, 101)).toBeNull()
  })

  it('serves the done packet through the facade: statistics, matrices, unit scale, version', async () => {
    const load = createEngineIfcLoad({spawn: spawnOver(makeStreamingApi())})
    await load.parse(new Blob(['x']), {onMeshBatch: () => null})
    const stats = load.ifcAPI.getStatistics(0)
    expect(stats.getGeometryMemory()).toBe(12.5)
    expect(stats.getLoadStatus()).toBe('OK')
    expect(stats.projectName).toBe('Stub project')
    // A getter the engine lacked stays absent, so callers' ?.() read unknown.
    expect(stats.getErrorCount).toBeUndefined()
    await expect(load.ifcAPI.GetCoordinationMatrix(0)).resolves.toEqual(IDENTITY)
    expect(load.ifcAPI.GetAppliedCoordinationMatrix(0)).toEqual(IDENTITY)
    expect(load.ifcAPI.GetLinearScalingFactor(0)).toBe(0.001)
    expect(load.ifcAPI.getConwayVersion()).toBe('Conway v-test')
    expect(isWorkerEngineModel({ifcManager: {ifcAPI: load.ifcAPI}})).toBe(true)
  })

  it('forwards preview payloads, with their buffers', async () => {
    const load = createEngineIfcLoad({spawn: spawnOver(makeStreamingApi())})
    const previews = []
    await load.parse(new Blob(['x']), {onMeshBatch: () => null, onPreviewMesh: (p) => previews.push(p)})
    expect(previews).toHaveLength(1)
    expect(previews[0]).toMatchObject({expressID: 10, geometryExpressID: 100})
    // By name, not instanceof: under Jest the clone comes back in Node's
    // realm, not jsdom's (in a browser it is the page's own).
    expect(Object.prototype.toString.call(previews[0].vertexData)).toBe('[object Float32Array]')
    expect(previews[0].vertexData.length).toBe(6)
  })

  it('calls onIndexed at the index, with properties answering through the facade', async () => {
    const load = createEngineIfcLoad({spawn: spawnOver(makeStreamingApi())})
    let indexedTree = null
    const onIndexed = async (id) => {
      indexedTree = await load.ifcAPI.properties.getSpatialStructure(id, 'names')
    }
    await load.parse(new Blob(['x']), {onMeshBatch: () => null, onIndexed})
    expect(indexedTree).toMatchObject({type: 'IFCPROJECT'})
  })

  it('a schema refusal becomes the same UnsupportedSchemaError the main-thread path throws', async () => {
    const statistics = new Map()
    const api = makeStreamingApi({
      getStatistics: (id) => statistics.get(id),
      async OpenModelStream() {
        statistics.set(this.globalModelIDCounter, {getLoadStatus: () => 'UNSUPPORTED_SCHEMA'})
        return -1
      },
    })
    const load = createEngineIfcLoad({spawn: spawnOver(api)})
    const source = new Blob(['ISO-10303-21;\nHEADER;\nFILE_SCHEMA((\'IFC4X3_ADD2\'));\nENDSEC;'])
    await expect(load.parse(source, {onMeshBatch: () => null})).rejects.toBeInstanceOf(UnsupportedSchemaError)
    expect(load.ifcAPI.engineSession.closed).toBe(true)
  })

  it('a pump failure rejects the parse with the engine\'s message and frees the engine', async () => {
    const api = makeStreamingApi({
      ExtractGeometryBatchAsync: async () => {
        throw new RangeError('WebAssembly.Memory(): could not allocate memory')
      },
    })
    const load = createEngineIfcLoad({spawn: spawnOver(api)})
    await expect(load.parse(new Blob(['x']), {onMeshBatch: () => null}))
      .rejects.toThrow('could not allocate memory')
    expect(load.ifcAPI.engineSession.closed).toBe(true)
  })

  it('a model the pump could not stream is re-emitted as batches by the engine', async () => {
    const api = makeStreamingApi({
      ExtractGeometryBatchAsync: async () => ({extracted: 0, remaining: 0}),
      StreamAllMeshesAsync: async (id, cb) => {
        cb(flatMesh(20, [{geometryExpressID: 101, flatTransformation: IDENTITY, color: {x: 1, y: 1, z: 1, w: 1}}]))
      },
    })
    const load = createEngineIfcLoad({spawn: spawnOver(api)})
    const parents = []
    const {recapture} = await load.parse(new Blob(['x']), {
      onMeshBatch: (fms) => fms.forEach((fm) => parents.push(fm.expressID)),
    })
    expect(parents).toEqual([20])
    // Delivered as batches, so a degraded rebuild has nothing to rebuild
    // from and says so, rather than building an empty model.
    await expect(recapture()).rejects.toThrow('not retained')
  })

  it('a model with no geometry at all recaptures as empty, like the stream it was', async () => {
    const api = makeStreamingApi({
      ExtractGeometryBatchAsync: async () => ({extracted: 0, remaining: 0}),
      StreamAllMeshesAsync: async () => undefined,
    })
    const load = createEngineIfcLoad({spawn: spawnOver(api)})
    const {recapture} = await load.parse(new Blob(['x']), {onMeshBatch: () => null})
    await expect(recapture()).resolves.toEqual([])
  })

  it('a bytes source is copied for the engine, leaving the caller\'s buffer intact', async () => {
    const load = createEngineIfcLoad({spawn: spawnOver(makeStreamingApi())})
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer
    await load.parse(bytes, {onMeshBatch: () => null})
    expect(bytes.byteLength).toBe(4)
  })
})


describe('engine/engineHandler pump control', () => {
  it('pause holds the pump at a batch boundary; run resumes it to done', async () => {
    const api = makeStreamingApi()
    const session = await spawnOver(api)()
    const batches = []
    const done = new Promise((resolve) => session.on('done', resolve))
    session.on('batch', (msg) => batches.push(msg))
    await session.pump('pause')
    await session.open({file: new Blob(['x'])}, {stream: {}})
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(batches).toHaveLength(0)
    expect(api.calls.filter((c) => c === 'pump')).toHaveLength(0)
    await session.pump('run')
    await done
    expect(batches).toHaveLength(3)
  })

  it('abort ends the stream as failed{aborted} without pumping further', async () => {
    const api = makeStreamingApi()
    const session = await spawnOver(api)()
    const failed = new Promise((resolve) => session.on('failed', resolve))
    await session.pump('pause')
    await session.open({file: new Blob(['x'])}, {stream: {}})
    await session.abort()
    await expect(failed).resolves.toMatchObject({kind: 'aborted'})
    expect(api.calls.filter((c) => c === 'pump')).toHaveLength(0)
  })
})


describe('engine/engineStream helpers', () => {
  it('encodes placements as columns, with an occurrence-path column only when present', () => {
    const api = makeStreamingApi()
    const encoder = makeBatchEncoder(api, 0)
    const ifc = encoder.encode([flatMesh(10, [{geometryExpressID: 100, flatTransformation: IDENTITY, color: {x: 1, y: 0, z: 0, w: 1}}])])
    expect(ifc.placements.pathOffsets).toBeUndefined()
    expect(ifc.geometries.map((g) => g.id)).toEqual([100])
    const step = encoder.encode([flatMesh(20, [
      {geometryExpressID: 100, flatTransformation: IDENTITY, color: {x: 1, y: 0, z: 0, w: 1}, occurrencePath: [7, 8]},
      {geometryExpressID: 101, flatTransformation: IDENTITY, color: {x: 1, y: 0, z: 0, w: 1}},
    ])])
    // 100 was sent already; only 101 is new.
    expect(step.geometries.map((g) => g.id)).toEqual([101])
    expect(Array.from(step.placements.pathOffsets)).toEqual([0, 2, 2])
    const decoded = decodePlacements(step.placements)
    expect(decoded[0].geometries[0].occurrencePath).toEqual([7, 8])
    expect(decoded[0].geometries[1].occurrencePath).toBeUndefined()
    // Every column and geometry buffer is in the transfer list.
    expect(step.transfer).toHaveLength(6 + 2)
  })

  it('previewMessage transfers a view that owns its buffer and copies one that does not', () => {
    const owned = previewMessage({vertexData: new Float32Array(3), indexData: new Uint32Array(3)})
    expect(owned.transfer).toHaveLength(2)
    const shared = new Float32Array(10)
    const view = previewMessage({vertexData: shared.subarray(2, 5)})
    expect(view.payload.vertexData.buffer).not.toBe(shared.buffer)
    expect(view.payload.vertexData.length).toBe(3)
  })

  it('snapshotStatistics keeps primitive getter values and skips a throwing one', () => {
    expect(snapshotStatistics({getTotalTime: () => 5, getVersion: () => 'IFC4', getLoadStatus: () => {
      throw new Error('x')
    }})).toEqual({getTotalTime: 5, getVersion: 'IFC4'})
    expect(statisticsView({getTotalTime: 5}).getTotalTime()).toBe(5)
  })

  it('makeLogForwarder folds repeated entries and console lines with counts', () => {
    const proxies = []
    const logger = {addProxy: (p) => proxies.push(p), removeProxy: jest.fn()}
    const fakeConsole = {warn: jest.fn(), error: jest.fn()}
    const forwarder = makeLogForwarder({logger, console: fakeConsole, dataDefect: 'dataDefect'})
    for (let i = 0; i < 3; i++) {
      proxies[0].log({level: 'warning', message: 'bad thing', category: undefined})
    }
    proxies[0].log({level: 'info', message: 'ignored'})
    proxies[0].log({level: 'info', message: 'defect', category: 'dataDefect'})
    fakeConsole.warn('[conway]', 'bad thing #12')
    fakeConsole.warn('[conway]', 'bad thing #12')
    const taken = forwarder.take()
    expect(taken.entries).toEqual([
      {level: 'warning', category: undefined, message: 'bad thing', count: 3},
      {level: 'info', category: 'dataDefect', message: 'defect', count: 1},
    ])
    expect(taken.lines).toEqual([{level: 'warning', text: '[conway] bad thing #12', count: 2}])
    expect(forwarder.take()).toBeNull()
    forwarder.dispose()
    expect(logger.removeProxy).toHaveBeenCalled()
  })

  it('makeGeometryStore keeps the first copy of a shape, and drops on request', () => {
    const store = makeGeometryStore()
    store.put({id: 1, vertices: new Float32Array(6), indices: new Uint32Array(3)})
    store.put({id: 1, vertices: new Float32Array(12), indices: new Uint32Array(3)})
    expect(store.api.GetGeometry(0, 1).GetVertexDataSize()).toBe(6)
    store.drop([{id: 1}])
    expect(store.size).toBe(0)
    expect(makeEngineIfcApi(store).GetLinearScalingFactor).toBeUndefined()
  })
})
