import fs from 'fs'
import path from 'path'
import {IfcAPI} from '@bldrs-ai/conway/web-ifc'
import {captureBldrsElementProperties} from './bldrsElementProperties'
import {captureBldrsSpatialTree} from './bldrsSpatialTree'


/**
 * #2038 against the real engine: the GLB capture of a WINDOWED source must
 * equal the capture of the same model fully resident.
 *
 * conway's store-backed open (how every IFC staged in OPFS opens) keeps a
 * few 4 MiB windows of the file resident, and a sync `getLine` on a record
 * outside them throws `StepBufferNotResidentError`. The capture used to skip
 * those records silently (sp-231MB's artifact kept 41,244 of 161,754 records
 * and none of its 4,432 tree names). A fixture big enough to overflow real
 * windows would not belong in the repo, so this spills the 18 KB demo model
 * into 4 KiB windows with ONE resident, through `SpillModelSource` — the same
 * windowed provider a store-backed open builds. With the old sync-only
 * reads, most records and every node name outside the last-touched window
 * go missing.
 */
describe('loader/GLB capture of a windowed source (#2038)', () => {
  const WINDOW_BYTES = 4096
  // A cold engine instantiation (wasm compile) plus a parse: ~5 s locally.
  const TIMEOUT_MS = 60_000
  let consoleLog

  beforeAll(() => {
    // conway's Init and open announce themselves on console.log (version,
    // model line, environment probe); not this test's subject.
    consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterAll(() => {
    consoleLog.mockRestore()
  })

  /**
   * @return {Promise<{api: object, modelID: number, bytes: Uint8Array}>}
   */
  async function openDemoModel() {
    const api = new IfcAPI()
    // eslint-disable-next-line new-cap
    await api.Init()
    const bytes = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../public/index.ifc')))
    // eslint-disable-next-line new-cap
    const modelID = await api.OpenModelStreamed(bytes, {DEFER_GEOMETRY: true, STREAMING_CONSUMER: true})
    return {api, modelID, bytes}
  }

  /**
   * The writer's two engine captures, as `glbExport.js#exportAndCacheGlb`
   * runs them.
   *
   * @param {object} api
   * @param {number} modelID
   * @return {Promise<{tree: object, properties: Uint8Array}>}
   */
  async function capture(api, modelID) {
    const ifcManager = {
      ifcAPI: api,
      getItemProperties: (m, id, r) => api.properties.getItemProperties(m, id, r),
      getPropertySets: (m, id, r) => api.properties.getPropertySets(m, id, r),
    }
    const tree = await captureBldrsSpatialTree(ifcManager, modelID)
    const properties = (await captureBldrsElementProperties(ifcManager, modelID, tree)).compressedBytes
    return {tree, properties}
  }

  it('captures the same properties and tree as the resident model', async () => {
    const {api, modelID, bytes} = await openDemoModel()
    const resident = await capture(api, modelID)

    // eslint-disable-next-line new-cap
    expect(api.SpillModelSource(modelID, {
      byteLength: bytes.byteLength,
      read: (offset, length) => Promise.resolve(bytes.slice(offset, offset + length)),
    }, WINDOW_BYTES, 1)).toBe(true)
    // The premise: the source is now windowed, and a sync read of a record
    // outside the resident window throws. Without it this test proves
    // nothing.
    const proxy = api.getPassthrough(modelID)
    expect(proxy.sourceIsExternal).toBe(true)
    expect(() => proxy.getLine(resident.tree.expressID)).toThrow(/not resident/)

    const windowed = await capture(api, modelID)
    expect(windowed.tree).toEqual(resident.tree)
    // Byte-identical, not just the same records: the artifact must not
    // depend on how the source was read. (The drain's id-order sort, which
    // is about window I/O, is pinned by bldrsElementProperties.test.js.)
    expect(Buffer.from(windowed.properties).equals(Buffer.from(resident.properties))).toBe(true)
  }, TIMEOUT_MS)
})
