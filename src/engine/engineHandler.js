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
// Format-neutral: IFC and STEP/AP214 open through the same compat `IfcAPI`
// and the same calls (§7 step 6). What differs is data — the source kind,
// the occurrence-path column, `includeSolids` on the tree — and none of it
// branches here (engineModelLoad.js says where each one enters).
//
// What it does: `init`; `open`, index-only or streamed (§7 step 3: previews
// while the parse runs, then the geometry pump's batches as transferable
// columns, then a `done` packet), with a failed open classified here, where
// conway's statistics are (§2.4 G3); the async reads (`tree`, `props`,
// `propertySets`, `itemsOfType`, and the Properties panel's `propertyTables`);
// and `pump` pause/run and `abort`. The GLB capture job comes in step 5.
import {resolvePropertyTables, schemaTypeName} from '../Components/Properties/propertyTable'
import {classifyOpenFailure, openDeferred} from '../loader/conwayOpen'
import {ENGINE_PROTOCOL_VERSION, Ev, Op, serializeError} from './protocol'
import {openSourceStore} from './engineSources'
import {makeBatchEncoder, previewMessage, snapshotStatistics} from './engineStream'


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

/**
 * Products per pump call. The same as the main-thread path's async pump
 * (`conwayDirectIfcLoader.js` ASYNC_DEMAND_EXTRACT_BATCH_SIZE): a windowed
 * extract pages each product's #ref closure before extracting it, and 8
 * keeps file-order streaming while still amortising the page-side append.
 */
export const PUMP_BATCH_SIZE = 8

/**
 * FlatMeshes per `batch` event when a load that pumped nothing is served by
 * the one-shot whole-model ask instead (see `oneShotFallback`). Bigger than a
 * pump call because nothing renders in between anyway; bounded so a large
 * one-shot model is not one multi-hundred-MB message.
 */
const ONE_SHOT_CHUNK = 256

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


// The source byte stores (Blob, and the OPFS sync access handle) live in
// engineSources.js; re-exported for the tests that build a store directly.
export {makeBlobStore} from './engineSources'


/**
 * @param {object} options
 * @param {function(): Promise<Function>} options.loadIfcAPI resolves to the
 *   `IfcAPI` constructor (Conway's web-ifc compat surface)
 * @param {function(object, Array=): void} options.post sends one message to
 *   the client, with an optional transfer list
 * @param {function(): number} [options.now] clock, for timings
 * @param {object} [options.logForwarder] `engineStream.js#makeLogForwarder`,
 *   in a worker only: in process the page's load report already sees the
 *   engine's Logger and console, and forwarding would count them twice
 * @param {function(): Promise<void>} [options.yieldToLoop] between pump
 *   calls, so requests (a tree read, `pump` pause, `abort`) get a turn
 * @param {object} [options.sourceOptions] passed to
 *   engineSources.js#openSourceStore (tests: `getOpfsRoot`, `canSyncHandle`)
 * @return {{handle: function(object): Promise<void>, dispose: function(): void}}
 */
export function createEngineHandler({
  loadIfcAPI, post, now = () => performance.now(), logForwarder = null,
  yieldToLoop = yieldToEventLoop, sourceOptions = {},
}) {
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
  // Pump control. `paused` is backpressure from the page (§5.2): the pump
  // stops at the next batch boundary and waits, keeping its engine and its
  // place in the stream. `aborted` ends it there for good.
  let paused = false
  let aborted = false
  let resume = null
  // The byte store the open model's windowed source reads through, kept for
  // the session's whole life: property reads page windows from it long
  // after the load. Closed in dispose(), after CloseModel, so a sync access
  // handle is released only once nothing can read through it.
  let sourceStore = null
  // Why the store is not the sync access handle, when it is not (reported
  // in the `open` reply and the `done` packet).
  let sourceFallback = null

  const send = (msg, transfer) => post({v: ENGINE_PROTOCOL_VERSION, epoch, ...msg}, transfer)
  const flushLog = () => {
    const log = logForwarder?.take()
    if (log) {
      send({ev: Ev.LOG, seq: ++seq, wasmBytes: wasmBytesOf(api), ...log})
    }
  }
  const emit = (ev, payload = {}, transfer = undefined) => {
    // The log first, so the page's tally is never behind the event that
    // follows it (a `failed` carries the count the report needs).
    flushLog()
    send({ev, seq: ++seq, wasmBytes: wasmBytesOf(api), ...payload}, transfer)
  }


  // propertyTable.js's reads over this engine. The same calls the page's
  // reads make through the facade (a model's `getItemProperties(id,
  // recursive)` is a PROPS request, and its `getIfcType` the static table),
  // so a table resolved here is the one resolved on the page
  // (itemProperties.jsx#readerFor).
  //
  // A table is many awaited reads, and handle() does not serialise ops, so a
  // CLOSE can land between two of them. Each read checks the model is still
  // open, so the table then stops at its next read with "no model is open"
  // rather than reading a disposed engine.
  const tableReader = {
    read: (id, recursive) => {
      requireModel()
      return api.properties.getItemProperties(modelID, id, recursive)
    },
    readMember: (id) => {
      requireModel()
      return api.properties.getItemProperties(modelID, id, false)
    },
    typeLookups: [schemaTypeName],
  }

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
          // This handler's, not conway's: says the page may send
          // PROPERTY_TABLES. A stale worker bundle (a deploy mid-session)
          // does not say it, and the page resolves its tables itself.
          propertyTables: true,
        },
        wasmBytes: wasmBytesOf(api),
        initMs: now() - t0,
      }
    },

    async [Op.OPEN]({source, format = null, stream = null} = {}) {
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
        return await openModel(source, stream, format)
      } finally {
        opening = false
      }
    },

    [Op.PUMP]({mode = 'run'} = {}) {
      paused = mode === 'pause'
      if (!paused && resume !== null) {
        resume()
        resume = null
      }
      return {paused}
    },

    [Op.ABORT]() {
      aborted = true
      if (resume !== null) {
        resume()
        resume = null
      }
      return true
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

    async [Op.PROPERTY_TABLES]({tables = []} = {}) {
      requireModel()
      // The panel's whole table in one reply (Share#2070): every read it
      // needs is made here, under 1 ms each, instead of one round trip per
      // reference, each waiting behind a page frame. `tableReader` makes the
      // calls the page's facade would have made for each one, so the table is
      // the one the main-thread engine builds.
      return await resolvePropertyTables(tableReader, tables)
    },

    async [Op.PROPERTY_SETS]({id, recursive = false} = {}) {
      requireModel()
      return await api.properties.getPropertySets(modelID, id, recursive)
    },

    async [Op.ITEMS_OF_TYPE]({type, verbose = false} = {}) {
      requireModel()
      return await api.properties.getAllItemsOfType(modelID, type, verbose)
    },

    [Op.RELEASE]({entityCache = false, geometry = false} = {}) {
      requireModel()
      // eslint-disable-next-line new-cap
      if (!api.IsModelOpen?.(modelID)) {
        return false
      }
      let released = false
      if (entityCache && typeof api.ReleaseEntityCache === 'function') {
        // eslint-disable-next-line new-cap
        api.ReleaseEntityCache(modelID)
        released = true
      }
      if (geometry && typeof api.ReleaseModelGeometry === 'function') {
        // The scene is built; nothing reads the native geometry again. Lets
        // this engine reuse those wasm pages rather than grow (Loader.js'
        // main-thread twin runs in the GLB writer's `finally`).
        // eslint-disable-next-line new-cap
        released = api.ReleaseModelGeometry(modelID) || released
      }
      return released
    },

    [Op.STATS]() {
      // The worker's JS heap is not reported: `performance.memory` is absent
      // in a dedicated worker (and bucketed where present). Measure it from
      // outside, with CDP `Runtime.getHeapUsage` on the worker target.
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
   * @param {object|null} stream `{previews, batchSize, startPaused}`, or null
   *   for an index-only open
   * @param {string|null} format `'ifc'` or `'step'` (engineModelLoad.js
   *   #engineFormatOf), or null when the caller did not say. A label only:
   *   conway detects the schema from the bytes, and the source kind (not
   *   this) decides whether the open is windowed, so a mislabelled file
   *   opens as what it is. It is echoed in the reply and the `done` packet.
   * @return {Promise<object>}
   */
  async function openModel(source, stream, format) {
    const settings = {
      ...BASE_OPEN_SETTINGS,
      ON_PROGRESS: (event) => emit(Ev.PROGRESS, {event: plainProgress(event)}),
      ON_MODEL_INFO: (info) => emit(Ev.MODEL_INFO, {info: plainProgress(info)}),
    }
    if (stream?.previews) {
      settings.ON_PREVIEW_MESH = (payload) => {
        try {
          const {payload: out, transfer} = previewMessage(payload)
          emit(Ev.PREVIEW, {payload: out}, transfer)
        } catch {
          // Best-effort, as on the main thread: a preview must never break
          // the load (ShareIfcLoader#parse's onPreviewMesh).
        }
      }
    }
    const t0 = now()
    const blob = source?.file
    const windowable = Boolean(blob && typeof blob.slice === 'function') &&
      !flags.disableStreamOpen && typeof api.OpenModelStream === 'function'
    // The same sequence the main-thread path runs (loader/conwayOpen.js):
    // windowed from the Blob/File when it can be (a File structured-clones
    // by reference, so nothing was copied to get it here, §2.2); else, or
    // when that open fails other than by a schema refusal, buffered. A STEP
    // takes the buffered arm: the Loader hands it over as bytes, because
    // conway's store-backed open is IFC-only (a windowed STEP open is a
    // conway ask, engine-worker.md §2.3).
    // Held locally: dispose() nulls `api`, and an open that finishes after
    // close must still be able to CloseModel what it opened.
    const engine = api
    // A read-only OPFS sync access handle on the File's own entry, which this
    // worker finds itself, else the Blob store (engineSources.js#openSourceStore
    // says when and why).
    const opened = windowable ?
      await openSourceStore(source, {allowSyncHandle: !flags.disableEngineSyncHandle, now, ...sourceOptions}) :
      null
    const store = opened?.store ?? null
    let adopted = false
    let id
    let windowed
    let attempt
    try {
      ({modelID: id, windowed, attempt} = await openDeferred(engine, {
        store,
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
      }))
      if (windowed && !disposed && typeof id === 'number' && id >= 0) {
        // Kept for the session: property reads page windows from it long
        // after the load. Released in dispose(), after CloseModel.
        sourceStore = store
        sourceFallback = opened.fallbackReason
        adopted = true
      }
    } finally {
      // Not adopted (a buffered fallback, a failed or refused open, an open
      // that threw, or a close that came first): nothing reads it again, so
      // a sync access handle's lock is let go now rather than at terminate.
      if (!adopted) {
        store?.close()
      }
    }
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
    const result = {
      modelID, windowed, format, openMs: now() - t0, wasmBytes: wasmBytesOf(api),
      source: sourceSummary(),
    }
    emit(Ev.INDEXED, {modelID, windowed})
    if (stream) {
      // `startPaused`: the page's test hold (engineModelLoad.js); the pump
      // waits at its first boundary for `pump {mode: 'run'}`.
      if (stream.startPaused) {
        paused = true
      }
      // Started, not awaited: the open's reply is the index (§4), and the
      // page's reads (tree, properties) are served beside the pump, each
      // paging the same windows, exactly as on the main thread (#2037).
      runPump({windowed, format, batchSize: stream.batchSize ?? PUMP_BATCH_SIZE})
    }
    return result
  }

  /** Abort INIT / OPEN after an await if dispose() ran meanwhile. */
  function throwIfDisposed() {
    if (disposed) {
      throw new Error('engine: closed during init')
    }
  }

  /** @return {Promise<void>} settles when `pump {mode: 'run'}` or `abort` arrives */
  function waitForResume() {
    return new Promise((resolve) => {
      resume = resolve
    })
  }

  /**
   * The geometry pump, worker-side (§2.4 G1): extract, copy each new
   * geometry out once, post the batch as transferable columns, repeat; then
   * the `done` packet. Mirrors `conwayDirectIfcLoader.js#parseIfcWithConway`'s
   * deferred loop, including its geometry progress and its one-shot fallback
   * when the pump produced nothing. Any throw ends the load as `failed`.
   *
   * @param {object} opts
   * @param {boolean} opts.windowed
   * @param {string|null} opts.format the open's label, for the `done` packet
   * @param {number} opts.batchSize
   */
  async function runPump({windowed, format, batchSize}) {
    const encoder = makeBatchEncoder(api, modelID)
    let total
    let done = 0
    let batches = 0
    let meshes = 0
    let bytes = 0
    const tPump = now()
    const reportGeometry = () => emit(Ev.PROGRESS, {event: {phase: 'geometry', completed: done, total, unit: 'products'}})
    const postBatch = (flatMeshes, progress) => {
      const encoded = encoder.encode(flatMeshes)
      batches++
      meshes += encoded.meshCount
      bytes += encoded.bytes
      emit(Ev.BATCH, {
        placements: encoded.placements,
        geometries: encoded.geometries,
        progress,
        bytes: encoded.bytes,
      }, encoded.transfer)
    }
    try {
      for (;;) {
        if (paused) {
          await waitForResume()
        }
        if (aborted) {
          emit(Ev.FAILED, {kind: 'aborted', message: 'engine: load aborted'})
          return
        }
        const batch = []
        let pumped
        if (typeof api.ExtractGeometryBatchAsync === 'function') {
          // eslint-disable-next-line new-cap
          pumped = await api.ExtractGeometryBatchAsync(modelID, batchSize, (flatMesh) => batch.push(flatMesh))
        } else {
          // eslint-disable-next-line new-cap
          pumped = api.ExtractGeometryBatch(modelID, batchSize, (flatMesh) => batch.push(flatMesh))
        }
        const {extracted, remaining} = pumped
        if (total === undefined && (extracted > 0 || remaining > 0)) {
          total = extracted + remaining
          reportGeometry()
        }
        done += extracted
        if (total !== undefined) {
          reportGeometry()
        }
        if (batch.length > 0) {
          // Copied out inside the pump call's turn, before the next call can
          // evict anything (engineStream.js#makeBatchEncoder).
          postBatch(batch, {done, total})
        }
        if (remaining === 0 && extracted === 0) {
          break
        }
        await yieldToLoop()
      }
      if (meshes === 0) {
        await oneShotFallback(windowed, postBatch)
      }
      emit(Ev.DONE, {summary: await summarize({batches, meshes, bytes, pumpMs: now() - tPump,
        geometries: encoder.sentCount(), windowed, format})})
    } catch (e) {
      emit(Ev.FAILED, {kind: 'pump', message: e?.message ?? String(e), name: e?.name})
    }
  }

  /**
   * A load whose pump produced nothing (conway fell back to a classic open
   * internally, or a deferred model with nothing to pump): serve the
   * one-shot whole-model ask and re-emit it as batches, so the page has one
   * delivery path and keeps no `recapture` (§2.4 G1). The same entry-point
   * choice as `parseIfcWithConway`'s: the async ask only where the sync one
   * cannot page a windowed source.
   *
   * @param {boolean} windowed
   * @param {function(Array, object): void} postBatch
   */
  async function oneShotFallback(windowed, postBatch) {
    const captured = []
    const push = (flatMesh) => captured.push(flatMesh)
    if (windowed && typeof api.StreamAllMeshesAsync === 'function') {
      // eslint-disable-next-line new-cap
      await api.StreamAllMeshesAsync(modelID, push)
    } else {
      // eslint-disable-next-line new-cap
      api.StreamAllMeshes(modelID, push)
    }
    for (let at = 0; at < captured.length; at += ONE_SHOT_CHUNK) {
      postBatch(captured.slice(at, at + ONE_SHOT_CHUNK), {done: undefined, total: undefined})
    }
  }

  /**
   * The `done` packet: everything `ShareIfcLoader#parse` reads off the engine
   * after the build, as plain data (§4).
   *
   * @param {object} counts
   * @return {Promise<object>}
   */
  async function summarize(counts) {
    const summary = {...counts, wasmBytes: wasmBytesOf(api), source: sourceSummary()}
    if (typeof api.getStatistics === 'function') {
      summary.statistics = snapshotStatistics(api.getStatistics(modelID))
    }
    if (typeof api.GetCoordinationMatrix === 'function') {
      // eslint-disable-next-line new-cap
      summary.coordinationMatrix = Array.from(await api.GetCoordinationMatrix(modelID))
    }
    if (typeof api.GetAppliedCoordinationMatrix === 'function') {
      try {
        // eslint-disable-next-line new-cap
        const applied = api.GetAppliedCoordinationMatrix(modelID)
        summary.appliedCoordination = applied ? Array.from(applied) : applied
      } catch {
        // Left absent: stampAppliedCoordination then leaves the model
        // unstamped, as it does for an engine without the call.
      }
    }
    if (typeof api.GetLinearScalingFactor === 'function') {
      // eslint-disable-next-line new-cap
      summary.linearScalingFactor = api.GetLinearScalingFactor(modelID)
    }
    return summary
  }

  /**
   * Close the model and drop the engine. In process it is the whole of the
   * cleanup, because the wasm heap is only returned once nothing references
   * the `IfcAPI` (in-app-model-switch.md §4.5). In a worker `terminate()`
   * follows and frees the heap regardless, but a session reading through a
   * sync access handle asks for this first (EngineSession#close): the
   * handle's OPFS lock is then let go here, after CloseModel, at a known
   * point, rather than whenever the browser gets round to it after
   * termination.
   */
  function dispose() {
    disposed = true
    // A pump still running stops at its next boundary instead of reaching
    // for an engine that is gone.
    aborted = true
    if (resume !== null) {
      resume()
      resume = null
    }
    logForwarder?.dispose()
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
    sourceStore?.close()
    sourceStore = null
  }

  /**
   * How the open model's source is being read, for the load report:
   * `{kind: 'syncHandle' | 'blob' | 'resident', fallbackReason, reads,
   * bytes, ms}`.
   *
   * @return {object}
   */
  function sourceSummary() {
    if (sourceStore === null) {
      return {kind: 'resident', fallbackReason: null}
    }
    return {kind: sourceStore.kind, fallbackReason: sourceFallback, ...sourceStore.counters}
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
    let reply
    try {
      reply = {re: msg.id, ok: true, result: await op(msg.args)}
    } catch (e) {
      reply = {re: msg.id, ok: false, error: serializeError(e)}
    }
    // The engine's log first, before EVERY reply and not only before
    // events: a failed open's reply is what makes the page close the
    // session, and the Logger errors that explain the failure would
    // otherwise die with it (review on #2058). Cheap when empty.
    flushLog()
    send(reply)
  }

  return {handle, dispose}
}


// One reused channel, and the pump continuations waiting on it, FIFO.
let tickChannel = null
const tickWaiters = []


/**
 * Give queued requests (a tree read, `pump` pause, `abort`) a turn between
 * pump calls, without a timer.
 *
 * - NOT `setTimeout(0)`: nested timeouts are clamped to 4 ms after the fifth
 *   level, and a pump yields once per batch of 8 products, so on sp-231MB
 *   (thousands of batches) the clamp alone added ~16 s to Geometry in this
 *   PR's first measurement.
 * - NOT `scheduler.yield()` either, though conway's own pump prefers it: its
 *   continuation is scheduled AHEAD of tasks already queued, which on the
 *   main thread still lets rendering and input in, but in a worker the only
 *   other work is the page's requests, which arrive as posted-message tasks.
 *   A pump that never waits on I/O (a buffered source) could hold a tree or
 *   properties request until Geometry ends (review on #2058).
 * - A MessageChannel tick is a posted-message task too, queued behind any
 *   request that arrived first, so requests are served in arrival order.
 *   One channel, reused, rather than one per yield (~12k on PSB).
 *
 * @return {Promise<void>}
 */
export function yieldToEventLoop() {
  if (typeof MessageChannel !== 'function') {
    return new Promise((resolve) => setTimeout(resolve, 0))
  }
  if (tickChannel === null) {
    tickChannel = new MessageChannel()
    tickChannel.port1.onmessage = () => tickWaiters.shift()?.()
    // Node (Jest) only: an open port would otherwise keep the process alive.
    tickChannel.port1.unref?.()
    tickChannel.port2.unref?.()
  }
  return new Promise((resolve) => {
    tickWaiters.push(resolve)
    tickChannel.port2.postMessage(null)
  })
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
