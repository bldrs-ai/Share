/* eslint-disable no-magic-numbers, require-await, new-cap */
import {EngineSession} from './EngineSession'
import {createEngineHandler} from './engineHandler'
import {
  createEngineModelLoad,
  decodePlacements,
  hasLegacyViewRules,
  isWorkerEngineModel,
  makeEngineIfcApi,
  makeGeometryStore,
  statisticsView,
} from './engineModelLoad'
import {makeBatchEncoder, makeLogForwarder, previewMessage, snapshotStatistics} from './engineStream'
import {makeInProcessTransport} from './transports'
import {UnsupportedSchemaError} from '../loader/unsupportedSchema'
import {getConwayDirectLogs} from '../../tools/jest/conwayDirectLogCapture'


// engine-worker.md §7 step 3: an IFC load streamed from an engine session.
// A stub conway over the in-process transport, which structured-clones and
// transfers exactly as a worker would, so "the page received it" here means
// it would have crossed a real worker boundary too.

jest.mock('../loader/loadProgress', () => ({
  reportEngineLog: jest.fn(),
  reportEngineVersion: jest.fn(),
  reportSourceInfo: jest.fn(),
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


describe('engine/engineModelLoad streamed IFC load', () => {
  it('delivers each batch to onMeshBatch with geometry served from the facade, once per shape', async () => {
    const api = makeStreamingApi()
    const load = createEngineModelLoad({spawn: spawnOver(api)})
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
    const load = createEngineModelLoad({spawn: spawnOver(makeStreamingApi())})
    await load.parse(new Blob(['x']), {onMeshBatch: () => null})
    expect(load.ifcAPI.GetGeometry(0, 100)).toBeNull()
    expect(load.ifcAPI.GetGeometry(0, 101)).toBeNull()
  })

  it('serves the done packet through the facade: statistics, matrices, unit scale, version', async () => {
    const load = createEngineModelLoad({spawn: spawnOver(makeStreamingApi())})
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
    const load = createEngineModelLoad({spawn: spawnOver(makeStreamingApi())})
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
    const load = createEngineModelLoad({spawn: spawnOver(makeStreamingApi())})
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
    const load = createEngineModelLoad({spawn: spawnOver(api)})
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
    const load = createEngineModelLoad({spawn: spawnOver(api)})
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
    const load = createEngineModelLoad({spawn: spawnOver(api)})
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
    const load = createEngineModelLoad({spawn: spawnOver(api)})
    const {recapture} = await load.parse(new Blob(['x']), {onMeshBatch: () => null})
    await expect(recapture()).resolves.toEqual([])
  })

  it('a bytes source is transferred to the engine, not copied first', async () => {
    // A copy would hold a buffered source (every STEP) twice on the page for
    // the length of the open; nothing reads the caller's buffer afterwards.
    const api = makeStreamingApi()
    let opened = null
    api.OpenModelStreamed = async (bytes) => {
      opened = bytes
      return 0
    }
    const load = createEngineModelLoad({spawn: spawnOver(api)})
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer
    await load.parse(bytes, {onMeshBatch: () => null})
    expect(bytes.byteLength).toBe(0)
    expect(Array.from(opened)).toEqual([1, 2, 3, 4])
  })

  it('a refusal of a transferred bytes source still names the schema and the size', async () => {
    const statistics = new Map()
    const api = makeStreamingApi({
      getStatistics: (id) => statistics.get(id),
      async OpenModelStreamed() {
        statistics.set(this.globalModelIDCounter, {getLoadStatus: () => 'UNSUPPORTED_SCHEMA'})
        return -1
      },
    })
    const text = 'ISO-10303-21;\nHEADER;\nFILE_SCHEMA((\'IFC4X3_RC2\'));\nENDSEC;\nDATA;\n'
    const bytes = new TextEncoder().encode(text.padEnd(200_000, ' ')).buffer
    const load = createEngineModelLoad({spawn: spawnOver(api)})
    const error = await load.parse(bytes, {onMeshBatch: () => null}).catch((e) => e)
    expect(bytes.byteLength).toBe(0)
    expect(error).toBeInstanceOf(UnsupportedSchemaError)
    expect(error.schema).toBe('IFC4X3_RC2')
    expect(error.sizeBytes).toBe(200_000)
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

  it('step runs the pump to one batch and pauses it there; run resumes it to done', async () => {
    const api = makeStreamingApi()
    const session = await spawnOver(api)()
    const batches = []
    const done = new Promise((resolve) => session.on('done', resolve))
    session.on('batch', (msg) => batches.push(msg))
    await session.pump('pause')
    await session.open({file: new Blob(['x'])}, {stream: {}})
    await session.pump('step')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(batches).toHaveLength(1)
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
    expect(step.transfer).toHaveLength(7 + 2)
  })

  it('keeps a present but EMPTY occurrence path apart from no path at all', () => {
    // A STEP root-level instance (geometry on the root product, under no
    // NAUO) has the path `[]`, which batchedInstanceTables.js
    // #getRootLevelInstances needs to tell from "no occurrence data" (#1901,
    // #1909). A batch of only empty paths must still send the columns.
    const encoder = makeBatchEncoder(makeStreamingApi(), 0)
    const onlyRoot = encoder.encode([flatMesh(8, [
      {geometryExpressID: 100, flatTransformation: IDENTITY, color: {x: 1, y: 0, z: 0, w: 1}, occurrencePath: []},
      {geometryExpressID: 101, flatTransformation: IDENTITY, color: {x: 1, y: 0, z: 0, w: 1}, occurrencePath: []},
    ])])
    expect(decodePlacements(onlyRoot.placements)[0].geometries.map((g) => g.occurrencePath)).toEqual([[], []])
    const mixed = encoder.encode([flatMesh(9, [
      {geometryExpressID: 100, flatTransformation: IDENTITY, color: {x: 1, y: 0, z: 0, w: 1}, occurrencePath: []},
      {geometryExpressID: 100, flatTransformation: IDENTITY, color: {x: 1, y: 0, z: 0, w: 1}, occurrencePath: [5]},
      {geometryExpressID: 100, flatTransformation: IDENTITY, color: {x: 1, y: 0, z: 0, w: 1}},
    ])])
    expect(decodePlacements(mixed.placements)[0].geometries.map((g) => g.occurrencePath))
      .toEqual([[], [5], undefined])
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


describe('engine/engineModelLoad legacy ?view= rules', () => {
  it('names a non-default view rule set, and nothing else', () => {
    expect(hasLegacyViewRules('?view=ch.sia380-1.heatmap')).toBe(true)
    expect(hasLegacyViewRules('?view=default')).toBe(false)
    expect(hasLegacyViewRules('?feature=engineWorker')).toBe(false)
    // A name ShareViewer does not know already does nothing: no message.
    expect(hasLegacyViewRules('?view=made-up')).toBe(false)
  })
})


describe('engine/engineModelLoad review fixes (#2058 round 1)', () => {
  it('a model whose every shape is degenerate recaptures as empty, so it opens like flag-off', async () => {
    const api = makeStreamingApi()
    // Only the degenerate geometry 102: placements arrive, shapes do not.
    const only102 = [flatMesh(12, [{geometryExpressID: 102, flatTransformation: IDENTITY}])]
    api.ExtractGeometryBatchAsync = async (id, size, cb) => {
      const next = only102.shift()
      if (!next) {
        return {extracted: 0, remaining: 0}
      }
      cb(next)
      return {extracted: 1, remaining: 0}
    }
    const load = createEngineModelLoad({spawn: spawnOver(api)})
    const batches = []
    const {recapture} = await load.parse(new Blob(['x']), {onMeshBatch: (fms) => batches.push(fms)})
    expect(batches).toHaveLength(1)
    await expect(recapture()).resolves.toEqual([])
  })

  it('the first batch gets the real modelID, not -1', async () => {
    const api = makeStreamingApi({
      async OpenModelStream() {
        return 5
      },
    })
    const load = createEngineModelLoad({spawn: spawnOver(api)})
    const ids = []
    await load.parse(new Blob(['x']), {onMeshBatch: (fms, id) => ids.push(id)})
    expect(ids[0]).toBe(5)
  })

  it('a placement without a colour decodes without one, for the builder\'s default', () => {
    const encoder = makeBatchEncoder(makeStreamingApi(), 0)
    const {placements} = encoder.encode([flatMesh(1, [{geometryExpressID: 100, flatTransformation: IDENTITY}])])
    expect(decodePlacements(placements)[0].geometries[0].color).toBeUndefined()
  })

  it('closing the session mid-stream rejects the parse instead of leaving it pending', async () => {
    const api = makeStreamingApi()
    let release
    api.ExtractGeometryBatchAsync = () => new Promise((resolve) => {
      release = () => resolve({extracted: 0, remaining: 0})
    })
    const load = createEngineModelLoad({spawn: spawnOver(api)})
    const parsing = load.parse(new Blob(['x']), {onMeshBatch: () => null})
    await new Promise((resolve) => setTimeout(resolve, 10))
    load.ifcAPI.engineSession.close()
    release()
    await expect(parsing).rejects.toThrow('engine session closed')
  })

  it('the load-end releases reach the worker engine', async () => {
    const api = makeStreamingApi({
      IsModelOpen: () => true,
      ReleaseEntityCache: jest.fn(),
      ReleaseModelGeometry: jest.fn(() => true),
    })
    const load = createEngineModelLoad({spawn: spawnOver(api)})
    await load.parse(new Blob(['x']), {onMeshBatch: () => null})
    expect(load.ifcAPI.IsModelOpen(0)).toBe(true)
    load.ifcAPI.ReleaseEntityCache(0)
    load.ifcAPI.ReleaseModelGeometry(0)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(api.ReleaseEntityCache).toHaveBeenCalledWith(0)
    expect(api.ReleaseModelGeometry).toHaveBeenCalledWith(0)
  })
})


describe('engine/engineHandler review fixes (#2058 round 1)', () => {
  it('a failed open flushes the engine log BEFORE its reply', async () => {
    const posted = []
    let pending = {entries: [{level: 'error', message: 'parse blew up', count: 1}], lines: []}
    const handler = createEngineHandler({
      loadIfcAPI: async () => function IfcAPI() {
        return makeStreamingApi({
          async OpenModelStream() {
            throw new RangeError('WebAssembly.Memory(): could not allocate memory')
          },
        })
      },
      post: (m) => posted.push(m),
      logForwarder: {
        take: () => {
          const out = pending
          pending = null
          return out
        },
        dispose: () => null,
      },
    })
    await handler.handle({v: 1, id: 1, op: 'init', args: {epoch: 1}})
    await handler.handle({v: 1, id: 2, op: 'open', args: {source: {file: new Blob(['x'])}}})
    const logAt = posted.findIndex((m) => m.ev === 'log')
    const replyAt = posted.findIndex((m) => m.re === 2)
    expect(posted[replyAt].ok).toBe(false)
    expect(logAt).toBeGreaterThanOrEqual(0)
    expect(logAt).toBeLessThan(replyAt)
  })
})


describe('engine/engineModelLoad with the real IncrementalBatchedBuilder', () => {
  it('assembles the same model through the facade as from the engine directly, shared shapes included', async () => {
    // Geometry 100 is placed in batch 1 and again in batch 2. By then the
    // facade's store has DROPPED it (after batch 1's append), so batch 2's
    // placement must come from the builder's own cache: the invariant the
    // store's drop rests on (review on #2058).
    const {IncrementalBatchedBuilder} = jest.requireActual('../viewer/ifc/incrementalBatchedBuilder')
    const directApi = makeStreamingApi()
    const direct = new IncrementalBatchedBuilder(directApi, 0)
    for (;;) {
      const batch = []
      const {extracted, remaining} = await directApi.ExtractGeometryBatchAsync(0, 8, (fm) => batch.push(fm))
      if (batch.length > 0) {
        direct.appendBatch(batch)
      }
      if (extracted === 0 && remaining === 0) {
        break
      }
    }
    const load = createEngineModelLoad({spawn: spawnOver(makeStreamingApi())})
    let viaWorker = null
    await load.parse(new Blob(['x']), {
      onMeshBatch: (flatMeshes, modelID) => {
        viaWorker = viaWorker ?? new IncrementalBatchedBuilder(load.ifcAPI, modelID)
        viaWorker.appendBatch(flatMeshes)
      },
    })
    const expected = direct.finalize().stats
    const actual = viaWorker.finalize().stats
    expect(actual).toEqual(expected)
    expect(actual).toMatchObject({uniqueGeometryCount: 2, instanceCount: 3})
  })
})


/**
 * A stub AP214 engine: an assembly whose one part shape (geometry 200,
 * owned by product_definition_shape 30) is placed twice, once per
 * occurrence, each placement carrying its own occurrence path — the shape
 * conway's AP214 deferred pump emits (step-occurrence-selection.md). Its
 * store-backed open refuses, as conway's does for AP214.
 *
 * @return {object}
 */
function makeStepApi() {
  const tree = {expressID: 1, type: 'PRODUCT_DEFINITION', children: []}
  const api = makeStreamingApi({
    async OpenModelStream() {
      api.calls.push('OpenModelStream')
      return -1
    },
    async OpenModelStreamed(bytes, settings) {
      api.calls.push(`OpenModelStreamed:${bytes.byteLength}`)
      settings.ON_PREVIEW_MESH?.({
        expressID: 30, geometryExpressID: 200, color: {x: 0, y: 1, z: 0, w: 1},
        flatTransformation: IDENTITY, vertexData: new Float32Array(6), indexData: new Uint32Array(3),
      })
      return 0
    },
    treeCalls: [],
    properties: {
      getSpatialStructure: async (id, mode, opts) => {
        api.treeCalls.push([mode, opts])
        return tree
      },
      getItemProperties: async (id, eid) => ({expressID: eid}),
      getPropertySets: async () => [],
      getAllItemsOfType: async () => [],
    },
  })
  api.heap.set(200, heapGeometry(7))
  const batches = [
    [flatMesh(30, [
      {geometryExpressID: 200, flatTransformation: IDENTITY, color: {x: 0, y: 1, z: 0, w: 1}, occurrencePath: [41, 42]},
      {geometryExpressID: 200, flatTransformation: IDENTITY.map((v, i) => (i === 12 ? 15 : v)),
        color: {x: 0, y: 1, z: 0, w: 1}, occurrencePath: [41, 43]},
    ])],
    // A body under a second, deeper occurrence: paths are variable length.
    [flatMesh(31, [
      {geometryExpressID: 200, flatTransformation: IDENTITY.map((v, i) => (i === 13 ? 30 : v)),
        color: {x: 0, y: 1, z: 0, w: 1}, occurrencePath: [44, 45, 46]},
    ])],
    // Geometry on the root product itself, under no occurrence: the path is
    // present and EMPTY, which is not the same as absent (#1901, #1909).
    [flatMesh(32, [
      {geometryExpressID: 200, flatTransformation: IDENTITY.map((v, i) => (i === 14 ? 45 : v)),
        color: {x: 0, y: 1, z: 0, w: 1}, occurrencePath: []},
    ])],
  ]
  api.ExtractGeometryBatchAsync = async (id, size, cb) => {
    const next = batches.shift()
    if (next === undefined) {
      return {extracted: 0, remaining: 0}
    }
    api.calls.push('pump')
    next.forEach(cb)
    return {extracted: next.length, remaining: batches.length}
  }
  return api
}


// engine-worker.md §7 step 6: STEP through the SAME load as IFC. What
// differs is data (source kind, occurrence paths, includeSolids), so each
// test here pins one of those crossing the worker boundary intact.
describe('engine/engineModelLoad streamed STEP load', () => {
  it('a STEP arrives as bytes and opens buffered, never trying the IFC-only windowed open', async () => {
    const api = makeStepApi()
    const load = createEngineModelLoad({format: 'step', spawn: spawnOver(api)})
    const {summary} = await load.parse(new Uint8Array(9).buffer, {onMeshBatch: () => null})
    expect(api.calls.filter((c) => c.startsWith('Open'))).toEqual(['OpenModelStreamed:9'])
    expect(summary).toMatchObject({format: 'step', windowed: false, meshes: 3, geometries: 1})
  })

  it('the format is a label: an IFC handed over as a File opens windowed even when labelled step', async () => {
    // A suffix is not evidence of the schema (Loader.js#canOpenFromStore): an
    // IFC payload named `.step` reaches the worker as a File, because the
    // Loader's header sniff read it as IFC, and must keep its windowed open.
    const api = makeStreamingApi()
    const load = createEngineModelLoad({format: 'step', spawn: spawnOver(api)})
    const {summary} = await load.parse(new Blob(['ISO-10303-21;']), {onMeshBatch: () => null})
    expect(api.calls.filter((c) => c.startsWith('Open'))).toEqual(['OpenModelStream'])
    expect(summary).toMatchObject({format: 'step', windowed: true})
  })

  it('every placement keeps its own occurrence path through the worker', async () => {
    const load = createEngineModelLoad({format: 'step', spawn: spawnOver(makeStepApi())})
    const paths = []
    await load.parse(new Uint8Array(4).buffer, {
      onMeshBatch: (flatMeshes) => {
        for (const fm of flatMeshes) {
          for (const placed of fm.geometries) {
            paths.push([fm.expressID, placed.geometryExpressID, placed.occurrencePath])
          }
        }
      },
    })
    expect(paths).toEqual([[30, 200, [41, 42]], [30, 200, [41, 43]], [31, 200, [44, 45, 46]], [32, 200, []]])
  })

  it('the at-index tree asks the worker for STEP\'s sub-solids', async () => {
    const api = makeStepApi()
    const load = createEngineModelLoad({format: 'step', spawn: spawnOver(api)})
    // What makeIndexedModelHandle's getSpatialStructure asks, for both formats.
    const onIndexed = (id) => load.ifcAPI.properties.getSpatialStructure(id, 'names', {includeSolids: true})
    await load.parse(new Uint8Array(4).buffer, {onMeshBatch: () => null, onIndexed})
    expect(api.treeCalls).toEqual([['names', {includeSolids: true}]])
  })

  it('a STEP preview crosses with its element id and buffers', async () => {
    const load = createEngineModelLoad({format: 'step', spawn: spawnOver(makeStepApi())})
    const previews = []
    await load.parse(new Uint8Array(4).buffer, {onMeshBatch: () => null, onPreviewMesh: (p) => previews.push(p)})
    expect(previews).toHaveLength(1)
    expect(previews[0]).toMatchObject({expressID: 30, geometryExpressID: 200})
    expect(previews[0].vertexData.length).toBe(6)
  })

  it('the pump line names the format, so a spec can tell a STEP worker load from an IFC one', async () => {
    await createEngineModelLoad({format: 'step', spawn: spawnOver(makeStepApi())})
      .parse(new Uint8Array(4).buffer, {onMeshBatch: () => null})
    await createEngineModelLoad({spawn: spawnOver(makeStreamingApi())})
      .parse(new Blob(['x']), {onMeshBatch: () => null})
    const pumpLines = getConwayDirectLogs().map((l) => l.text).filter((text) => text.includes('engine worker pump:'))
    expect(pumpLines).toHaveLength(2)
    expect(pumpLines[0]).toContain('format=step')
    expect(pumpLines[0]).toContain('windowed=no')
    expect(pumpLines[0]).toContain('(by suffix)')
    expect(pumpLines[1]).toContain('format=unknown')
  })

  it('assembles the same per-occurrence tables through the facade as from the engine directly', async () => {
    const {IncrementalBatchedBuilder} = jest.requireActual('../viewer/ifc/incrementalBatchedBuilder')
    const directApi = makeStepApi()
    const direct = new IncrementalBatchedBuilder(directApi, 0)
    for (;;) {
      const batch = []
      const {extracted, remaining} = await directApi.ExtractGeometryBatchAsync(0, 8, (fm) => batch.push(fm))
      if (batch.length > 0) {
        direct.appendBatch(batch)
      }
      if (extracted === 0 && remaining === 0) {
        break
      }
    }
    const load = createEngineModelLoad({format: 'step', spawn: spawnOver(makeStepApi())})
    let viaWorker = null
    await load.parse(new Uint8Array(4).buffer, {
      onMeshBatch: (flatMeshes, modelID) => {
        viaWorker = viaWorker ?? new IncrementalBatchedBuilder(load.ifcAPI, modelID)
        viaWorker.appendBatch(flatMeshes)
      },
    })
    const expected = direct.finalize()
    const actual = viaWorker.finalize()
    expect(actual.stats).toEqual(expected.stats)
    expect(actual.stats).toMatchObject({uniqueGeometryCount: 1, instanceCount: 4})
    const tables = (result) => result.batches.map((b) => ({
      parents: Array.from(b.mesh.instanceParents),
      paths: b.mesh.instanceOccurrencePaths,
    }))
    expect(tables(actual)).toEqual(tables(expected))
    expect(tables(actual)[0].paths).toEqual([[41, 42], [41, 43], [44, 45, 46], []])
  })
})
