// stats_engineWasmBytes: the engine's wasm heap at load end. That heap only
// grows, so one reading is the load's high-water mark — the model's memory
// cost, which stats_memoryUsed (the page heap) cannot see once the engine runs
// in a worker.
import {engineWasmBytesOf} from './ShareIfcLoader'


describe('ShareIfcLoader#engineWasmBytesOf', () => {
  it('reads a worker load from the engine summary', () => {
    const engineLoad = {ifcAPI: {summary: {wasmBytes: 449_839_104}}}
    expect(engineWasmBytesOf(engineLoad, {})).toEqual({engineWasmBytes: 449_839_104})
  })

  it('reads a main-thread load from the engine heap itself', () => {
    const ifcAPI = {wasmModule: {HEAPU8: {byteLength: 16_777_216}}}
    expect(engineWasmBytesOf(null, ifcAPI)).toEqual({engineWasmBytes: 16_777_216})
  })

  it('says nothing when the engine cannot say, rather than sending a 0', () => {
    expect(engineWasmBytesOf({ifcAPI: {summary: {}}}, {})).toEqual({})
    expect(engineWasmBytesOf({ifcAPI: {summary: {wasmBytes: 0}}}, {})).toEqual({})
    expect(engineWasmBytesOf(null, {})).toEqual({})
    expect(engineWasmBytesOf(null, undefined)).toEqual({})
  })
})
