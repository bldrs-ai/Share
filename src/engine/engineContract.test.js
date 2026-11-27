
// One contract for every `Engine` (Engine.js; design/tracks/open-t200/layering.md
// §7 "1a"): the same suite against a ConwayEngine and a WorkerEngine on the
// in-process transport, over the REAL Conway engine, on both demo fixtures,
// `public/index.ifc` and `public/index.step`. What the two engines send and
// answer must be the same, or `ShareIfcLoader#parse`'s one path would build
// two different models:
//   - the events: `indexed` before the first `batch`, `done` last, and the
//     same sequence of everything but progress on both;
//   - every batch's placements, field for field, STEP's occurrence paths
//     included (a field one engine dropped is a difference here);
//   - the reads: `tree`, `properties` of a known element, `propertySets`,
//     `itemsOfType`;
//   - the `done` summary the load reads after the build (statistics but for
//     the timings, the coordination and applied matrices, the unit scale),
//     and what the parse stamped from it on the model (its matrix, its
//     applied frame);
//   - `close()` twice, on an open model, closes it once;
//   - and the GLB artifact the load writes (the cache writer, run over each
//     engine's model and capture) has one SHA-256 through either engine,
//     which engine-worker.md §7.1 had only checked by hand, on PSB.
// The worker's in-process transport runs the worker's own handler, protocol
// and stream encoding (transports.js), so this is the worker's code, not a
// stand-in for it; only the thread is not.
//
// jsdom, not the node environment layering.md §7 names: the parse's import
// chain reaches the store (loadProgress.js → useStore), which needs a
// `window`. Conway runs the same in either.
import fs from 'fs'
import path from 'path'
import {createHash} from 'crypto'
import {Scene} from 'three'
import {IfcAPI} from '@bldrs-ai/conway/web-ifc'
import EntityTypesAP214 from '@bldrs-ai/conway/src/AP214E3_2010/AP214E3_2010_gen/entity_types_ap214.gen'
import {ConwayEngine} from './ConwayEngine'
import {EngineEvent} from './Engine'
import {WorkerEngine} from './WorkerEngine'
import {createEngineHandler} from './engineHandler'
import {forEachVectorItem} from './conwayVector'
import {makeInProcessTransport} from './transports'
import ShareIfcLoader from '../loader/ShareIfcLoader'
import {exportAndCacheGlb} from '../loader/glbExport'
import {localCacheKey} from '../loader/sourceCacheKey'
import {decorateShareModel, inferModelCapabilities} from '../model/ShareModel'


const mockWriteGlbBytesToOPFS = jest.fn()
jest.mock('../OPFS/utils', () => ({
  ...jest.requireActual('../OPFS/utils'),
  writeGlbBytesToOPFS: (...args) => mockWriteGlbBytesToOPFS(...args),
}))


const FIXTURES = {
  ifc: path.resolve(__dirname, '../../public/index.ifc'),
  step: path.resolve(__dirname, '../../public/index.step'),
}
// Two cold engine instantiations (wasm compiles) and two parses per format,
// then the cache writer twice.
const TIMEOUT_MS = 120_000


// Every CloseModel either engine makes, by model handle.
const closeModelCalls = []


/** Conway's IfcAPI, counting its CloseModel calls. */
class CountingIfcAPI extends IfcAPI {
  /**
   * @param {number} modelID
   * @return {*} what Conway's returns
   */
  CloseModel(modelID) {
    closeModelCalls.push(modelID)
    return super.CloseModel(modelID) // eslint-disable-line new-cap
  }
}


/** @return {Promise<ConwayEngine>} the page's engine, as a main-thread load gets it */
function conwayEngine() {
  return Promise.resolve(new ConwayEngine({ifcAPI: new CountingIfcAPI()}))
}


/** @return {Promise<WorkerEngine>} the worker's engine, on the in-process transport */
async function workerEngine() {
  const engine = new WorkerEngine(makeInProcessTransport((post) =>
    createEngineHandler({loadIfcAPI: () => Promise.resolve(CountingIfcAPI), post})))
  await engine.init()
  return engine
}


const MAT4_ELEMENTS = 16

// The summary's timings, which differ run to run whichever engine ran.
const TIMING_GETTERS = ['getTotalTime', 'getGeometryTime', 'getParseTime']


/**
 * What the load reads off an engine's `done` summary (ShareIfcLoader#parse's
 * tail), without the timings and the engine's own bookkeeping (wasm bytes,
 * pump time, the worker's source-policy and sidecar fields).
 *
 * @param {object} summary
 * @return {object}
 */
function readsOfSummary(summary) {
  const statistics = {...summary.statistics}
  for (const getter of TIMING_GETTERS) {
    delete statistics[getter]
  }
  return {
    statistics,
    coordinationMatrix: summary.coordinationMatrix,
    appliedCoordination: summary.appliedCoordination,
    linearScalingFactor: summary.linearScalingFactor,
  }
}


/**
 * Every placement of a batch, flattened and as plain data, so the two
 * engines' batches compare field for field: conway's own FlatMeshes from the
 * page's engine (Embind vectors and all), the decoded columns from a worker.
 *
 * @param {Array<object>} flatMeshes a `batch` event's
 * @return {Array<object>}
 */
function placementsOf(flatMeshes) {
  const out = []
  for (const flatMesh of flatMeshes) {
    forEachVectorItem(flatMesh.geometries, (placed) => {
      const row = {
        parent: flatMesh.expressID,
        geometryExpressID: placed.geometryExpressID,
        transform: Array.from(placed.flatTransformation),
      }
      if (placed.color) {
        row.color = {x: placed.color.x, y: placed.color.y, z: placed.color.z, w: placed.color.w}
      }
      if (placed.occurrencePath !== undefined && placed.occurrencePath !== null) {
        const pathIds = []
        forEachVectorItem(placed.occurrencePath, (id) => pathIds.push(id))
        row.occurrencePath = pathIds
      }
      out.push(row)
    })
  }
  return out
}


/**
 * Load one fixture through `ShareIfcLoader#parse` on the engine `make`
 * makes, recording what the engine sent, then read the model back and write
 * its GLB artifact. The parse is handed the engine as its spawn: it is the
 * same code whichever engine it gets, which is the point.
 *
 * @param {function(): Promise<object>} make
 * @param {'ifc'|'step'} format
 * @return {Promise<object>} `{engine, events, placements, reads, artifactSha256}`
 */
async function loadOn(make, format) {
  const engine = await make()
  const events = []
  const placements = []
  let summary = null
  for (const ev of Object.values(EngineEvent)) {
    engine.on(ev, (msg) => {
      if (ev !== EngineEvent.PROGRESS && ev !== EngineEvent.LOG) {
        events.push(ev)
      }
      if (ev === EngineEvent.BATCH) {
        placements.push(...placementsOf(msg.flatMeshes))
      }
    })
  }
  engine.on(EngineEvent.DONE, (msg) => {
    summary = msg.summary
  })
  const scene = new Scene()
  const ifc = {
    ifcLastError: null,
    addIfcModel: (model) => scene.add(model),
    context: {items: {ifcModels: []}, getScene: () => scene, ifcCamera: {}},
  }
  const loader = new ShareIfcLoader({engine: new ConwayEngine({ifcAPI: {}}), ifc, spawnWorker: () => Promise.resolve(engine)})
  loader.type = format
  // The route sends a Conway format with a scene to the worker spawn, here
  // either engine (engineRoute.js); the parse does not ask which it got.
  const bytes = new Uint8Array(fs.readFileSync(FIXTURES[format]))
  // Before the parse: a worker's open transfers (detaches) a bytes source.
  const sourceBytes = bytes.byteLength
  const model = await loader.parse(bytes, () => null, (e) => {
    throw e
  })
  expect(model, `${format} on ${engine.kind}: the parse built a model`).toBeTruthy()
  expect(model.engine).toBe(engine)
  const fromSummary = {
    ...readsOfSummary(summary),
    // What the parse stamped from it, so a value the alias misread shows too.
    modelMatrix: Array.from(model.matrix.elements),
    modelAppliedCoordination: model.userData.appliedCoordination,
  }

  const tree = await engine.tree({mode: 'names', includeSolids: true})
  const leaf = firstLeaf(tree)
  const properties = await engine.properties(leaf.expressID, {recursive: true})
  const reads = {
    tree,
    properties,
    propertySets: await engine.propertySets(leaf.expressID, {recursive: true}),
    // By numeric type, which is what every schema's type index takes: an
    // IFC record carries its code, an AP214 record its entity name, which
    // that schema's table maps (its index refuses the name itself).
    itemsOfType: await engine.itemsOfType(
      typeof properties.type === 'number' ? properties.type : EntityTypesAP214[properties.type]),
  }

  // The cache writer, as Loader.js#load schedules it: over the decorated
  // model, its captures run in the model's engine.
  decorateShareModel(model, format)
  Object.assign(model.capabilities, inferModelCapabilities(model))
  mockWriteGlbBytesToOPFS.mockReset().mockResolvedValue(true)
  const ok = await exportAndCacheGlb({
    model,
    kindLabel: 'local',
    cacheKeyArgs: localCacheKey({filePath: `index.${format}`, contentSha: 'contract'}),
    // A worker's re-made in this realm: jsdom's `instanceof Uint8Array`
    // refuses the Node-realm array the in-process transport's
    // `structuredClone` hands back (a browser has one realm), and the writer
    // would then drop the element properties as absent
    // (injectGlbExtensions.js). The page engine's is passed as it is, so a
    // wrong type from ConwayEngine#capture would show here.
    capture: (opts) => engine.capture(opts).then((captured) => (engine.kind === 'mainThread' ? captured : {
      ...captured,
      elementProperties: captured.elementProperties ? new Uint8Array(captured.elementProperties) : null,
    })),
    modelID: model.modelID,
    sourceBytes,
  })
  expect(ok, `${format} on ${engine.kind}: the writer wrote`).toBe(true)
  const written = mockWriteGlbBytesToOPFS.mock.calls[0][0]
  const artifactSha256 = createHash('sha256').update(written).digest('hex')
  if (process.env.BLDRS_DUMP_ARTIFACT) {
    fs.writeFileSync(`${process.env.BLDRS_DUMP_ARTIFACT}-${format}-${engine.kind}.bin`, written)
  }
  return {engine, events, placements, reads, fromSummary, artifactSha256}
}


/**
 * @param {object} node a spatial tree node
 * @return {object} the first node with no children, depth first
 */
function firstLeaf(node) {
  return node.children?.length ? firstLeaf(node.children[0]) : node
}


describe.each(['ifc', 'step'])('engine/contract on index.%s', (format) => {
  let consoleLog
  let consoleInfo
  let consoleWarn
  let onPage
  let onWorker

  beforeAll(async () => {
    // conway's Init and open announce themselves on console.log, and the
    // load's boundary lines (the pump, the parse, the writer) on
    // console.info; none of them is this test's subject.
    consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined)
    consoleInfo = jest.spyOn(console, 'info').mockImplementation(() => undefined)
    // conway's own notes on the demo STEP (a shimmed line flattener, a
    // missing raw line), the same from either engine.
    consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    onPage = await loadOn(conwayEngine, format)
    onWorker = await loadOn(workerEngine, format)
  }, TIMEOUT_MS)

  afterAll(async () => {
    await onPage?.engine.close()
    await onWorker?.engine.close()
    consoleLog.mockRestore()
    consoleInfo.mockRestore()
    consoleWarn.mockRestore()
  })

  it('sends indexed before the first batch and done last, the same sequence on both engines', () => {
    for (const {events} of [onPage, onWorker]) {
      expect(events.indexOf(EngineEvent.INDEXED)).toBeGreaterThanOrEqual(0)
      expect(events.indexOf(EngineEvent.INDEXED)).toBeLessThan(events.indexOf(EngineEvent.BATCH))
      expect(events[events.length - 1]).toBe(EngineEvent.DONE)
    }
    expect(onWorker.events).toEqual(onPage.events)
  })

  it('streams the same placements, field for field', () => {
    expect(onPage.placements.length).toBeGreaterThan(0)
    expect(onWorker.placements).toEqual(onPage.placements)
  })

  it('ends with the same done summary, and stamps the same frame on the model', () => {
    expect(onPage.fromSummary.coordinationMatrix).toHaveLength(MAT4_ELEMENTS)
    expect(onPage.fromSummary.statistics.getProductCount).toBeGreaterThan(0)
    expect(onWorker.fromSummary).toEqual(onPage.fromSummary)
  })

  it('answers the same reads', () => {
    expect(onPage.reads.tree.expressID).toBeGreaterThan(0)
    expect(onWorker.reads).toEqual(onPage.reads)
  })

  it('writes one GLB artifact, byte for byte, whichever engine parsed it', () => {
    expect(onWorker.artifactSha256).toBe(onPage.artifactSha256)
  })

  it('close() twice, on an open model, closes it once', async () => {
    for (const make of [conwayEngine, workerEngine]) {
      const engine = await make()
      await engine.open({bytes: new Uint8Array(fs.readFileSync(FIXTURES[format]))}, {format})
      const failed = jest.fn()
      engine.on(EngineEvent.FAILED, failed)
      closeModelCalls.length = 0
      await Promise.all([engine.close(), engine.close()])
      expect(engine.closed).toBe(true)
      expect(failed).toHaveBeenCalledTimes(1)
      expect(closeModelCalls, engine.kind).toHaveLength(1)
    }
  })
})


describe('engine/contract on index.step: occurrence paths', () => {
  it('a STEP batch carries its occurrence paths on both engines', async () => {
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined)
    const consoleInfo = jest.spyOn(console, 'info').mockImplementation(() => undefined)
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      for (const make of [conwayEngine, workerEngine]) {
        const {engine, placements} = await loadOn(make, 'step')
        expect(placements.length).toBeGreaterThan(0)
        expect(placements.every((p) => Array.isArray(p.occurrencePath)), engine.kind).toBe(true)
        await engine.close()
      }
    } finally {
      consoleLog.mockRestore()
      consoleInfo.mockRestore()
      consoleWarn.mockRestore()
    }
  }, TIMEOUT_MS)
})
