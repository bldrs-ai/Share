// The engine side of an engine session (design/new/engine-worker.md §4).
//
// One handler owns one Conway `IfcAPI` and the one model open in it. It is
// the same code in both places it runs:
//   - inside `Engine.worker.js`, posting to the worker's own port;
//   - on the main thread, behind the in-process transport, which is the
//     permanent fallback for browsers without module workers and the
//     kill switch (§8 item 6).
// So it must stay off the DOM, the store and three, and take its engine
// through `loadIfcAPI` rather than importing it: the worker and the page
// each bundle their own copy of Conway, and the Jest suite drives it with a
// stub.
//
// Step 2 of §7 scope: `init`, an index-only `open` (deferred, no geometry
// pump), and the async reads (`tree`, `props`, `propertySets`,
// `itemsOfType`). The pump, previews, failure classification and the GLB
// capture job come in steps 3–5.
import {classifyOpenFailure, openDeferred} from '../loader/conwayOpen'
import {ENGINE_PROTOCOL_VERSION, Ev, Op, serializeError} from './protocol'


/**
 * Conway open settings for an index-only open. Mirrors the deferred path in
 * `conwayDirectIfcLoader.js#parseIfcWithConway` so a worker open indexes
 * exactly what a main-thread one does; the two must not drift (§8 item 6:
 * one path, not two).
 */
export const GEOMETRY_BUDGET_MB = 64
const BASE_OPEN_SETTINGS = Object.freeze({
  COORDINATE_TO_ORIGIN: true,
  USE_FAST_BOOLS: true,
  DEFER_GEOMETRY: true,
  GEOMETRY_BUDGET_MB,
  STREAMING_CONSUMER: true,
})

/** Conway log levels; see `conwayDirectIfcLoader.js#applyEngineLogLevel`. */
const ENGINE_LOG_LEVEL_DEBUG = 1
const ENGINE_LOG_LEVEL_WARN = 3


/**
 * The worker's wasm heap, in bytes. Read on every event (§5.2: the budget
 * runs on a live figure, and wasm grows from 16 MB to ~900 MB during a PSB
 * pump), so it must stay cheap: one property chain, no allocation.
 *
 * @param {object|null} api Conway IfcAPI
 * @return {number}
 */
export function wasmBytesOf(api) {
  return api?.wasmModule?.HEAPU8?.byteLength ?? 0
}


/**
 * A Conway `StepExternalByteStore` over a Blob or File. The same contract as
 * `loader/opfsSourceByteStore.js#makeBlobByteStore`, redeclared here because
 * that module logs through the page's GLB log and must not be pulled into
 * the worker bundle. Step 4 adds the OPFS sync-access-handle store beside it.
 *
 * @param {Blob} blob
 * @return {{byteLength: number, read: function(number, number): Promise<Uint8Array>}}
 */
export function makeBlobStore(blob) {
  return {
    get byteLength() {
      return blob.size
    },
    async read(offset, length) {
      return new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer())
    },
  }
}


/**
 * @param {object} options
 * @param {function(): Promise<Function>} options.loadIfcAPI resolves to the
 *   `IfcAPI` constructor (Conway's web-ifc compat surface)
 * @param {function(object, Array=): void} options.post sends one message to
 *   the client, with an optional transfer list
 * @param {function(): number} [options.now] clock, for timings
 * @return {{handle: function(object): Promise<void>, dispose: function(): void}}
 */
export function createEngineHandler({loadIfcAPI, post, now = () => performance.now()}) {
  let epoch = 0
  let seq = 0
  let api = null
  let modelID = -1
  let flags = {}
  // Claimed synchronously on entry to INIT / OPEN, before their first
  // await, because `handle()` does not serialise requests: two concurrent
  // opens would otherwise both pass a `modelID >= 0` check made before
  // either had assigned it, and one engine would hold two models (§6:
  // terminating an engine must free exactly one model).
  let initing = false
  let opening = false
  // Set by dispose(). In a worker, terminate() follows and stops everything;
  // in process (the permanent fallback, §8 item 6) an INIT or OPEN still
  // awaiting would otherwise carry on after close, rebuilding or keeping an
  // engine nobody holds. Each checks it after every await.
  let disposed = false

  const send = (msg, transfer) => post({v: ENGINE_PROTOCOL_VERSION, epoch, ...msg}, transfer)
  const emit = (ev, payload = {}) => send({ev, seq: ++seq, wasmBytes: wasmBytesOf(api), ...payload})

  const requireModel = () => {
    if (api === null) {
      throw new Error('engine: init has not run')
    }
    if (modelID < 0) {
      throw new Error('engine: no model is open')
    }
  }

  const ops = {
    async [Op.INIT](args = {}) {
      if (api !== null || initing) {
        // A second init would replace `api` and leak the first IfcAPI.
        throw new Error('engine: init has already run')
      }
      initing = true
      if (typeof args.epoch === 'number') {
        epoch = args.epoch
      }
      flags = args.flags ?? {}
      const t0 = now()
      let created
      try {
        const IfcAPI = await loadIfcAPI()
        throwIfDisposed()
        created = new IfcAPI()
        // eslint-disable-next-line new-cap
        await created.Init()
        throwIfDisposed()
      } finally {
        initing = false
      }
      if (created.wasmModule === undefined || created.wasmModule === null) {
        // conway's Init() logs "Could not initialize Conway Wasm" and RETURNS
        // when the wasm will not instantiate. Reporting success then would
        // only move the failure to the first open, as an unrelated TypeError;
        // failing here lets the caller fall back.
        throw new Error('engine: Init() left no wasm module (the engine wasm did not instantiate)')
      }
      api = created
      if (typeof api.SetLogLevel === 'function') {
        // eslint-disable-next-line new-cap
        api.SetLogLevel(args.verbose ? ENGINE_LOG_LEVEL_DEBUG : ENGINE_LOG_LEVEL_WARN)
      }
      return {
        conwayVersion: typeof api.getConwayVersion === 'function' ? api.getConwayVersion() : null,
        capabilities: {
          openStream: typeof api.OpenModelStream === 'function',
          openFromIndex: typeof api.OpenModelFromIndex === 'function',
          asyncPump: typeof api.ExtractGeometryBatchAsync === 'function',
        },
        wasmBytes: wasmBytesOf(api),
        initMs: now() - t0,
      }
    },

    async [Op.OPEN]({source} = {}) {
      if (api === null) {
        throw new Error('engine: init has not run')
      }
      if (modelID >= 0 || opening) {
        // One model per engine, by design (§6): eviction is terminating the
        // engine, which only frees one model if it holds only one.
        throw new Error('engine: a model is already open in this engine')
      }
      opening = true
      try {
        return await openModel(source)
      } finally {
        opening = false
      }
    },

    async [Op.TREE]({mode = 'names', includeSolids = false} = {}) {
      requireModel()
      return await api.properties.getSpatialStructure(modelID, mode, {includeSolids})
    },


    async [Op.PROPS]({ids, recursive = false} = {}) {
      requireModel()
      // Batched on purpose: N ids is one message, not N (§4). Sequential,
      // because each read may page a window and a parallel fan-out would only
      // queue them inside the engine anyway.
      const list = Array.isArray(ids) ? ids : [ids]
      const records = []
      for (const id of list) {
        records.push(await api.properties.getItemProperties(modelID, id, recursive))
      }
      return records
    },

    async [Op.PROPERTY_SETS]({id, recursive = false} = {}) {
      requireModel()
      return await api.properties.getPropertySets(modelID, id, recursive)
    },

    async [Op.ITEMS_OF_TYPE]({type, verbose = false} = {}) {
      requireModel()
      return await api.properties.getAllItemsOfType(modelID, type, verbose)
    },

    [Op.RELEASE]({entityCache = false} = {}) {
      requireModel()
      // eslint-disable-next-line new-cap
      if (entityCache && typeof api.ReleaseEntityCache === 'function' && api.IsModelOpen(modelID)) {
        // eslint-disable-next-line new-cap
        api.ReleaseEntityCache(modelID)
        return true
      }
      return false
    },

    [Op.STATS]() {
      return {wasmBytes: wasmBytesOf(api), modelID}
    },

    [Op.CLOSE]() {
      dispose()
      return true
    },
  }


  /**
   * OPEN's body, once the one-model slot is claimed (see `opening`).
   *
   * @param {object} source `{file}` or `{bytes}`
   * @return {Promise<object>}
   */
  async function openModel(source) {
    const settings = {
      ...BASE_OPEN_SETTINGS,
      ON_PROGRESS: (event) => emit(Ev.PROGRESS, {event: plainProgress(event)}),
      ON_MODEL_INFO: (info) => emit(Ev.MODEL_INFO, {info: plainProgress(info)}),
    }
    const t0 = now()
    const blob = source?.file
    const windowable = Boolean(blob && typeof blob.slice === 'function') &&
      !flags.disableStreamOpen && typeof api.OpenModelStream === 'function'
    // The same sequence the main-thread path runs (loader/conwayOpen.js):
    // windowed from the Blob/File when it can be (a File structured-clones
    // by reference, so nothing was copied to get it here, §2.2); else, or
    // when that open fails other than by a schema refusal, buffered.
    // Held locally: dispose() nulls `api`, and an open that finishes after
    // close must still be able to CloseModel what it opened.
    const engine = api
    const {modelID: id, windowed, attempt} = await openDeferred(engine, {
      store: windowable ? makeBlobStore(blob) : null,
      loadBytes: async () => {
        const bytes = source?.bytes ?? (blob ? await blob.arrayBuffer() : null)
        if (!bytes) {
          throw new Error('engine: open needs source.file or source.bytes')
        }
        // A transferred Uint8Array is used as it is: another copy here would
        // briefly hold the file three times over on a buffered open.
        return ArrayBuffer.isView(bytes) ? bytes : new Uint8Array(bytes)
      },
      settings,
    })
    if (disposed) {
      // Closed while the open ran: release what it made, and stop.
      if (typeof id === 'number' && id >= 0) {
        try {
          // eslint-disable-next-line new-cap
          engine.CloseModel(id)
        } catch {
          // Best-effort; the reference drop in dispose() is what frees.
        }
      }
      throw new Error('engine: closed during open')
    }
    if (typeof id !== 'number' || id < 0) {
      // Classified here, where conway's statistics are (§2.4 G3); the page
      // builds the user-facing error from it with
      // unsupportedSchema.js#openModelFailure, as the main-thread path does.
      const failure = classifyOpenFailure(engine, attempt, id)
      emit(Ev.FAILED, {
        kind: failure.refusedSchema ? 'refusedSchema' : 'openFailure',
        message: `engine: open failed (${id})`,
        ...failure,
      })
      return {modelID: -1, windowed: false, failure}
    }
    modelID = id
    const result = {modelID, windowed, openMs: now() - t0, wasmBytes: wasmBytesOf(api)}
    emit(Ev.INDEXED, {modelID, windowed})
    return result
  }

  /** Abort INIT / OPEN after an await if dispose() ran meanwhile. */
  function throwIfDisposed() {
    if (disposed) {
      throw new Error('engine: closed during init')
    }
  }

  /**
   * Close the model and drop the engine. In a worker this is a courtesy:
   * `terminate()` follows and frees everything regardless. In process it is
   * the whole of the cleanup, because the wasm heap is only returned once
   * nothing references the `IfcAPI` (in-app-model-switch.md §4.5).
   */
  function dispose() {
    disposed = true
    if (api !== null && modelID >= 0) {
      try {
        // eslint-disable-next-line new-cap
        api.CloseModel(modelID)
      } catch {
        // Closing is best-effort; the reference drop below is what frees.
      }
    }
    api = null
    modelID = -1
  }

  /**
   * Answer one request. Never throws: a failure becomes an `ok: false`
   * reply, so the client's promise rejects instead of hanging.
   *
   * @param {object} msg a request `{v, id, op, args}`
   */
  async function handle(msg) {
    if (!msg || typeof msg.id !== 'number') {
      return
    }
    if (msg.v !== ENGINE_PROTOCOL_VERSION) {
      // Echo the REQUEST's version and epoch, not ours: the client drops any
      // message whose version or epoch is not its own, and a refusal it
      // drops leaves its `init` waiting forever. `engineVersion` says what
      // this side speaks, for EngineSession's ProtocolMismatchError.
      post({
        v: msg.v,
        epoch: msg.epoch,
        re: msg.id,
        ok: false,
        error: {
          name: 'ProtocolMismatchError',
          message: `engine: protocol v${msg.v} unsupported (engine speaks v${ENGINE_PROTOCOL_VERSION})`,
          engineVersion: ENGINE_PROTOCOL_VERSION,
        },
      })
      return
    }
    const op = ops[msg.op]
    if (!op) {
      send({re: msg.id, ok: false, error: {name: 'Error', message: `engine: unknown op ${msg.op}`}})
      return
    }
    try {
      const result = await op(msg.args)
      send({re: msg.id, ok: true, result})
    } catch (e) {
      send({re: msg.id, ok: false, error: serializeError(e)})
    }
  }

  return {handle, dispose}
}


/**
 * Conway's ProgressEvent (or ModelInfo) as plain data: its primitive fields
 * only. It already is plain today, but the engine is free to add a field
 * that does not structured-clone (a callback, a native view), and one such
 * field would make every progress post throw. Keeping primitives rather
 * than a named list means a new numeric field (as `residentSourceMb` once
 * was) crosses without a change here.
 *
 * @param {object} event
 * @return {object}
 */
export function plainProgress(event) {
  if (!event || typeof event !== 'object') {
    return event
  }
  const out = {}
  for (const [key, value] of Object.entries(event)) {
    const type = typeof value
    if (type === 'number' || type === 'string' || type === 'boolean') {
      out[key] = value
    }
  }
  return out
}
