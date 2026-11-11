/** @jest-environment node */ // eslint-disable-line jsdoc/check-tag-names
/* eslint-disable no-magic-numbers, require-await, new-cap */
import v8 from 'v8'
import vm from 'vm'
import {createEngineHandler} from './engineHandler'
import {ENGINE_PROTOCOL_VERSION, Ev, Op} from './protocol'


// Share#2139: after the GLB writer's spill, a buffered open must not keep its
// source bytes reachable from the engine handler. The bug this guards was
// found with a worker heap snapshot (design/new/source-policy-measurements.md
// §"Why the buffered arms still retain the source"): the `settings`
// callbacks conway keeps on the model for the session closed over
// `engineHandler.js#openModel`'s scope, and `openModel`'s `loadBytes` closure
// put `source` and the held bytes in that same V8 context, so the file
// stayed alive for as long as the model did.
//
// The stub engine below behaves as conway does on that path: it keeps the
// open's `settings` (and so their callbacks) on the model, holds the bytes
// it was handed until `SpillModelSource`, and lets them go there. The only
// thing left that could reach the bytes after the spill is the handler, so a
// collected WeakRef says the handler retains nothing.
//
// The forced GC is V8's own (`--expose-gc` set at runtime, `gc` fetched from
// a fresh context, as conway's suite does); a WeakRef is cleared only by a
// GC that runs after the task that last dereferenced it, hence the awaits.


v8.setFlagsFromString('--expose-gc')
const gc = vm.runInNewContext('gc')


/** @return {Promise<void>} a turn of the event loop */
function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}


/**
 * Collect until `ref` is cleared or the attempts run out.
 *
 * @param {WeakRef} ref
 * @return {Promise<boolean>} whether the target was collected
 */
async function collected(ref) {
  for (let i = 0; i < 10; i++) {
    await tick()
    gc()
    if (ref.deref() === undefined) {
      return true
    }
  }
  return false
}


/**
 * A conway stand-in for a buffered open and its spill. `model` is what
 * conway's model object keeps for the session.
 *
 * @return {object}
 */
function retainingApi() {
  const api = {
    model: null,
    sourceRef: null,
    wasmModule: undefined,
    async Init() {
      this.wasmModule = {HEAPU8: {byteLength: 1}}
    },
    async OpenModelStream() {
      // A windowed open is refused, so every open here is buffered.
      return -1
    },
    async OpenModelStreamed(bytes, settings) {
      settings.ON_PROGRESS?.({phase: 'dataParse', completed: 1, total: 1})
      api.sourceRef = new WeakRef(bytes.buffer)
      // conway keeps the settings and the callbacks on them for the session
      // (the heap snapshot's `[the model] → .settings → .ON_PROGRESS`).
      api.model = {settings, source: bytes}
      return 0
    },
    SpillModelSource(_id, store) {
      // conway#781: the buffered source is released on spill.
      if (store.byteLength !== api.model.source.byteLength) {
        throw new Error('length mismatch')
      }
      api.model.source = null
      return true
    },
    async ExtractGeometryBatchAsync() {
      return {extracted: 0, remaining: 0}
    },
    StreamAllMeshesAsync: async () => null,
    StreamAllMeshes: () => null,
    getStatistics: () => ({getLoadStatus: () => 'OK', getLoadFailureReason: () => ''}),
    IsModelOpen: () => true,
    CloseModel: () => null,
    properties: {},
  }
  return api
}


/**
 * One handler, driven directly, with each reply and event recorded.
 *
 * @param {object} api
 * @param {object|null} [root] the OPFS root the source lookup searches
 * @return {{request: function(string, object): Promise<object>, events: Array}}
 */
function drive(api, root = null) {
  const events = []
  const waiting = new Map()
  let id = 0
  const handler = createEngineHandler({
    loadIfcAPI: async () => function IfcAPI() {
      return api
    },
    post: (msg) => {
      if (typeof msg.re === 'number') {
        waiting.get(msg.re)?.(msg)
        waiting.delete(msg.re)
      } else {
        events.push(msg.ev)
      }
    },
    yieldToLoop: () => Promise.resolve(),
    // No sync access handles: a File source gets the Blob store, which
    // holds the file whole when `root` has its entry.
    sourceOptions: {getOpfsRoot: async () => root, canSyncHandle: () => false},
  })
  const request = (op, args) => new Promise((resolve) => {
    const re = ++id
    waiting.set(re, resolve)
    handler.handle({v: ENGINE_PROTOCOL_VERSION, id: re, op, args})
  })
  return {request, events}
}


const NAME = 'model.ifc.etag.commit'
const MTIME = 1_700_000_000_000


/**
 * An OPFS root holding one entry for `file`, which is all the source lookup
 * reads (engineSources.js#locateOpfsEntry).
 *
 * @param {File} file
 * @return {object} a FileSystemDirectoryHandle stand-in
 */
function opfsWith(file) {
  const entry = {kind: 'file', getFile: async () => file}
  return {
    kind: 'directory',
    async* entries() {
      yield [file.name, entry]
    },
  }
}


/**
 * Wait until the pump has posted `done`.
 *
 * @param {Array} events
 */
async function untilDone(events) {
  for (let i = 0; i < 50 && !events.includes(Ev.DONE); i++) {
    await tick()
  }
  expect(events).toContain(Ev.DONE)
}


describe('engine/engineHandler: a buffered open lets its source go at the spill (Share#2139)', () => {
  it('a {bytes} source is collectable once the model has spilled', async () => {
    const api = retainingApi()
    const {request, events} = drive(api)
    await request(Op.INIT, {flags: {}})
    const SIZE = 1 << 20
    // Built inside the call, so this test holds no reference of its own.
    const opened = await request(Op.OPEN, {source: {bytes: new ArrayBuffer(SIZE)}, stream: {previews: true}})
    expect(opened.ok).toBe(true)
    expect(opened.result.windowed).toBe(false)
    await untilDone(events)
    const spilled = await request(Op.SPILL, {file: new Blob([new Uint8Array(SIZE)])})
    expect(spilled.result.spilled).toBe(true)
    // The engine still holds the settings and their callbacks, as conway does.
    expect(typeof api.model.settings.ON_PROGRESS).toBe('function')
    expect(await collected(api.sourceRef)).toBe(true)
  })

  it('a File source the Blob store held whole is collectable once the model has spilled', async () => {
    // The Blob store path (Firefox, Safari): the store reads the whole OPFS
    // file, and the open is buffered over those bytes.
    const api = retainingApi()
    const SIZE = 1 << 20
    const file = new File([new Uint8Array(SIZE)], NAME, {lastModified: MTIME})
    const {request, events} = drive(api, opfsWith(file))
    await request(Op.INIT, {flags: {disableEngineSidecar: true}})
    const opened = await request(Op.OPEN, {source: {file}, stream: {previews: true}})
    expect(opened.result.windowed).toBe(false)
    await untilDone(events)
    expect((await request(Op.SPILL, {file})).result.spilled).toBe(true)
    expect(await collected(api.sourceRef)).toBe(true)
  })

  it('the check can fail: bytes the engine still holds are not collected', async () => {
    // Without this, a WeakRef that never fills (or a gc that does nothing)
    // would pass the two tests above vacuously.
    const api = retainingApi()
    const {request, events} = drive(api)
    await request(Op.INIT, {flags: {}})
    await request(Op.OPEN, {source: {bytes: new ArrayBuffer(1 << 20)}, stream: {previews: false}})
    await untilDone(events)
    expect(api.sourceRef.deref()).toBeInstanceOf(ArrayBuffer)
    expect(await collected(api.sourceRef)).toBe(false)
  })
})
