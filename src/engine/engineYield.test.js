/** @jest-environment node */ // eslint-disable-line jsdoc/check-tag-names
/* eslint-disable no-magic-numbers, require-await */
import {createEngineHandler} from './engineHandler'


// Review on #2058 (P2-5): in a worker the page's requests arrive as message
// tasks, so the pump's yield between calls must let them in, in arrival
// order. Node environment: jsdom has no MessageChannel, and without one the
// handler's yield falls back to a timer and this would test nothing.

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

/**
 * @param {number} expressID
 * @param {Array<object>} placed
 * @return {object}
 */
function flatMesh(expressID, placed) {
  return {expressID, geometries: {size: () => placed.length, get: (i) => placed[i]}}
}

/**
 * @param {object} overrides
 * @return {object} a stub engine with one shape
 */
function makeStreamingApi(overrides) {
  const vertices = new Float32Array(12)
  const indices = new Uint32Array([0, 1, 0])
  return {
    wasmModule: undefined,
    async Init() {
      this.wasmModule = {HEAPU8: {byteLength: 16}}
    },
    async OpenModelStreamed() {
      return 0
    },
    GetGeometry: () => ({
      GetVertexDataSize: () => vertices.length, GetIndexDataSize: () => indices.length,
      GetVertexData: () => 1, GetIndexData: () => 1,
    }),
    GetVertexArray: () => vertices,
    GetIndexArray: () => indices,
    properties: {getSpatialStructure: async () => ({expressID: 1, type: 'IFCPROJECT', children: []})},
    ...overrides,
  }
}


describe('engine/engineHandler pump yield', () => {
  it('a request that arrives during a buffered pump is answered before the pump ends', async () => {
    // A worker's requests arrive as message tasks. A pump whose yield runs
    // its continuation AHEAD of queued tasks (scheduler.yield, stubbed here
    // as a microtask) would answer this only after Geometry; the reused
    // MessageChannel tick is FIFO with them.
    const savedScheduler = globalThis.scheduler
    globalThis.scheduler = {yield: () => Promise.resolve()}
    let remaining = 200
    const api = makeStreamingApi({
      async ExtractGeometryBatchAsync(id, size, cb) {
        if (remaining === 0) {
          return {extracted: 0, remaining: 0}
        }
        remaining--
        cb(flatMesh(10, [{geometryExpressID: 100, flatTransformation: IDENTITY}]))
        return {extracted: 1, remaining}
      },
    })
    const order = []
    const channel = new MessageChannel()
    try {
      const handler = createEngineHandler({
        loadIfcAPI: async () => function IfcAPI() {
          return api
        },
        post: (m) => {
          if (m.re === 3) {
            order.push(['tree reply', remaining])
          }
          if (m.ev === 'done') {
            order.push(['done', remaining])
          }
        },
      })
      channel.port1.onmessage = (event) => handler.handle(event.data)
      await handler.handle({v: 1, id: 1, op: 'init', args: {epoch: 1}})
      await handler.handle({v: 1, id: 2, op: 'open', args: {source: {bytes: new ArrayBuffer(4)}, stream: {}}})
      // As the page would: posted while the pump is running.
      channel.port2.postMessage({v: 1, id: 3, op: 'tree', args: {mode: 'names'}})
      await new Promise((resolve) => {
        const poll = () => (order.some(([what]) => what === 'done') ? resolve() : setTimeout(poll, 5))
        poll()
      })
    } finally {
      globalThis.scheduler = savedScheduler
      channel.port1.close()
    }
    expect(order[0][0]).toBe('tree reply')
    // ...and long before the end: most of the pump was still to come.
    expect(order[0][1]).toBeGreaterThan(100)
  })
})
