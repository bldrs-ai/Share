/* eslint-disable new-cap */
import fs from 'fs'
import path from 'path'
import {IfcAPI} from '@bldrs-ai/conway/web-ifc'
import {captureEngineExtensions, ifcManagerOver} from '../loader/glbEngineCapture'
import {EngineSession} from './EngineSession'
import {createEngineHandler} from './engineHandler'
import {makeInProcessTransport} from './transports'


// The GLB writer's engine captures as the engine's `capture` op, and the
// source spill as its `spill` op (engine-worker.md §7 step 5).
//
// Against the REAL engine: the claim step 5 rests on is that an artifact a
// worker load writes carries the same tree and properties as one a
// main-thread load writes. Both run glbEngineCapture.js, but over different
// engines and across the protocol, so this compares the bytes. The handler
// runs behind the in-process transport here, the permanent fallback; in a
// real Worker it is the same handler (batchedGlbCache.spec.ts covers that
// end to end).


const DEMO_IFC = path.resolve(__dirname, '../../public/index.ifc')
// A cold engine instantiation (wasm compile) per engine, plus a parse.
const TIMEOUT_MS = 60_000


/**
 * @param {Function} loadIfcAPI
 * @return {{session: EngineSession, posts: Array}}
 */
function sessionOver(loadIfcAPI) {
  const posts = []
  const transport = makeInProcessTransport((post) => createEngineHandler({
    loadIfcAPI,
    post: (msg, transfer) => {
      posts.push({msg, transfer})
      post(msg, transfer)
    },
  }))
  return {session: new EngineSession(transport), posts}
}


describe('engine/capture and spill against the real engine', () => {
  let consoleLog

  beforeAll(() => {
    // conway's Init and open announce themselves on console.log (version,
    // model line, environment probe); not this test's subject.
    consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterAll(() => {
    consoleLog.mockRestore()
  })

  it('captures what the main-thread engine captures, before and after a spill', async () => {
    const bytes = new Uint8Array(fs.readFileSync(DEMO_IFC))

    // The main-thread capture: what glbExport.js runs over viewer.IFC's
    // engine for a flag-off load.
    const mainApi = new IfcAPI()
    await mainApi.Init()
    const mainID = await mainApi.OpenModelStreamed(bytes.slice(), {DEFER_GEOMETRY: true, STREAMING_CONSUMER: true})
    const onMain = await captureEngineExtensions(ifcManagerOver(mainApi), mainID)
    expect(onMain.spatialTree?.expressID).toBeGreaterThan(0)
    expect(onMain.elementProperties?.byteLength).toBeGreaterThan(0)

    const {session, posts} = sessionOver(() => Promise.resolve(IfcAPI))
    await session.init()
    await session.open({bytes: bytes.slice()})
    const inEngine = await session.capture()
    expect(inEngine.spatialTree).toEqual(onMain.spatialTree)
    expect(Buffer.from(inEngine.elementProperties).equals(Buffer.from(onMain.elementProperties))).toBe(true)
    // The container crossed as a transfer, not a clone.
    const reply = posts.find(({msg}) => msg.result?.elementProperties)
    expect(reply.transfer).toHaveLength(1)

    // A buffered open is resident; the spill releases it to windows over
    // the File, and the capture must still answer the same. index.ifc is
    // smaller than one window, so this checks the spill path, not paging
    // (bldrsCaptureWindowed.test.js pins that).
    const spilled = await session.spill(new Blob([bytes]))
    expect(spilled).toMatchObject({spilled: true, source: {kind: 'blob'}})
    const afterSpill = await session.capture()
    expect(afterSpill.spatialTree).toEqual(onMain.spatialTree)
    expect(Buffer.from(afterSpill.elementProperties).equals(Buffer.from(onMain.elementProperties))).toBe(true)
    // Windowed now: a second spill is refused, not stacked.
    await expect(session.spill(new Blob([bytes]))).resolves.toMatchObject({spilled: false, reason: 'windowed'})
    await session.close()
  }, TIMEOUT_MS)
})


describe('engine/spill', () => {
  /**
   * @param {object} overrides on the stub engine
   * @return {Promise<EngineSession>} with a buffered model open
   */
  async function openBuffered(overrides = {}) {
    const api = {
      wasmModule: {HEAPU8: {byteLength: 1}},
      Init: () => Promise.resolve(),
      OpenModelStreamed: () => Promise.resolve(0),
      ExtractGeometryBatchAsync: () => ({extracted: 0, remaining: 0}),
      CloseModel: () => undefined,
      ...overrides,
    }
    const {session} = sessionOver(() => Promise.resolve(function StubIfcAPI() {
      return api
    }))
    await session.init()
    await session.open({bytes: new ArrayBuffer(8)})
    return session
  }

  it('keeps the source resident, and says why, when conway refuses the store', async () => {
    // conway throws on a store whose byteLength is not the parsed source's
    // (step_model_base.js#spillSourceToExternalStore), before swapping.
    const session = await openBuffered({
      SpillModelSource: () => {
        throw new Error('External store byteLength 3 does not match source byteLength 8')
      },
    })
    const result = await session.spill(new Blob([new Uint8Array(3)]))
    expect(result).toMatchObject({spilled: false, source: {kind: 'resident'}})
    expect(result.reason).toMatch(/does not match/)
    // Nothing adopted, so close() needs no polite release.
    expect(session.sourceKind).not.toBe('syncHandle')
    await session.close()
  })

  it('answers `unsupported` for an engine without SpillModelSource', async () => {
    const session = await openBuffered()
    await expect(session.spill(new Blob([new Uint8Array(8)]))).resolves
      .toMatchObject({spilled: false, reason: 'unsupported'})
    await session.close()
  })
})
