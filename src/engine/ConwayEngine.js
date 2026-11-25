// `ConwayEngine`: Conway's `IfcAPI` on the page, behind `Engine` (Engine.js;
// design/tracks/open-t200/layering.md §4.1, slice 1a). It is the main-thread
// engine, the one `?feature=disableEngineWorker` and the `disableEngineWorker`
// rollback keep a load on (engineRoute.js), and the engine a load runs on when
// there is no scene to stream into. IFC and STEP/AP214 alike: Conway's compat
// `IfcAPI` serves both behind one surface, so nothing here branches on format.
//
// It took over `conwayDirectIfcLoader.js#parseIfcWithConway`'s open and pump,
// and its `captureWholeModel` and `makeRecapture`. What that function handed
// to callbacks arrives as the same events a WorkerEngine sends
// (Engine.js#EngineEvent), called in the same tick and by reference: a batch
// is conway's own FlatMeshes, with no column encoding and no copy, and its
// shapes are read from the wasm heap through `geometry`. So the parse does the
// work it did, in the order it did it, and `ShareIfcLoader#parse` has one path
// for both engines. The values the load reads after the build (statistics,
// the coordination matrices, the unit scale) arrive in the `done` summary, as
// a worker's do.
//
// What it shares with the worker's handler is only what has to be the same:
// the open sequence (conwayOpen.js), the open settings and pump batch size
// (engineHandler.js), the statistics snapshot (engineStream.js), and the GLB
// writer's capture job (glbEngineCapture.js). It shares none of the protocol,
// the transport or the stream encoding, which is what makes it the path for a
// bug in any of those.
//
// What only this engine can do is `recapture`: the whole model's FlatMeshes
// again, for `ShareIfcLoader#parse`'s degraded end-of-load builds and its two
// opt-in diagnostics. A caller asks `capabilities.recapture`, never `kind`.
//
// Freed by `close()` (CloseModel) and dropping every reference, then garbage
// collection: the wasm heap is returned only once nothing references the
// `IfcAPI` (in-app-model-switch.md §4.5).
import {IfcAPI} from '@bldrs-ai/conway/web-ifc'
import {isFeatureEnabled} from '../FeatureFlags'
import debug, {WARN} from '../utils/debug'
import {ENGINE_CLOSED, EngineEvent, ifcTypeName, makePropertiesApi} from './Engine'
import {classifyOpenFailure, openDeferred} from './conwayOpen'
import {BASE_OPEN_SETTINGS, PUMP_BATCH_SIZE, wasmBytesOf} from './engineHandler'
import {snapshotStatistics} from './engineStream'
import {captureEngineExtensions, ifcManagerOver} from './glbEngineCapture'
import {beginOpenAttempt, conwayRefusedSchema} from './openAttempt'
import {makeBlobByteStore} from './opfsSourceByteStore'
import {resolvePropertyTables, schemaTypeName} from './propertyTable'
import {enableStepPreviewFinishParse} from './pumpTestSeams'


/**
 * Products per pump call on an engine without `ExtractGeometryBatchAsync`
 * (old pins, which read a resident source). The async pump pages each
 * product's #ref closure from the source before extracting it, so it uses the
 * handler's smaller PUMP_BATCH_SIZE, which keeps file-order streaming; a
 * resident extract has no such cost, and 64 amortises the per-batch scene
 * update.
 */
const SYNC_PUMP_BATCH_SIZE = 64

/**
 * FlatMeshes per `batch` when a model the pump could not stream is served by
 * the one-shot whole-model ask instead: the worker's chunk
 * (engineHandler.js#oneShotFallback), so the two engines deliver it alike.
 */
const ONE_SHOT_CHUNK = 256

// Conway's numeric log levels (its SetLogLevel shim keeps web-ifc's
// numbering), as the handler sets them.
const ENGINE_LOG_LEVEL_DEBUG = 1
const ENGINE_LOG_LEVEL_WARN = 3


/**
 * One model on the page's Conway engine. See the file header.
 */
export class ConwayEngine {
  /**
   * @param {object} [options]
   * @param {object} [options.ifcAPI] a Conway `IfcAPI`; one is made when not
   *   given (tests pass a stub)
   * @param {function(): number} [options.now] clock, for timings
   */
  constructor({ifcAPI = new IfcAPI(), now = () => performance.now()} = {}) {
    this.kind = 'mainThread'
    // Conway's object, exposed for the two holders slice 1b and slice N
    // remove: the viewer's `ShareIfcManager` (a GLB cache hit's and a mesh
    // model's manager) and a spec's WeakRef proving it is collected
    // (modelSwitchMemory.spec.ts). Null once closed. No reader outside
    // `src/engine` calls it: they use this engine.
    this.ifcAPI = ifcAPI
    this.now = now
    this.closed = false
    this.modelID = -1
    this.windowed = false
    this.info = null
    this.listeners = new Map()
    // Pump control, as the worker's handler has it: `paused` is the page's
    // test holds and backpressure; `pauseAfterBatch` is `pump('step')`.
    this.paused = false
    this.pauseAfterBatch = false
    this.aborted = false
    this.resume = null
    // The streamed load's pump, while it runs; close() waits for it before
    // closing the model under it.
    this.pumping = null
    this.opening = false
    // The pumped stream, kept only where nothing else takes delivery or
    // nothing could re-extract it (see `runPump`).
    this.retain = false
    this.captured = []
    this.recaptured = null
    // A prototype method, so known before Init: Loader.js#canOpenFromStore
    // asks it of the viewer's idle engine to decide whether a load may hand
    // the parse a File.
    this.capabilities = {
      openStream: typeof ifcAPI.OpenModelStream === 'function',
      openFromIndex: false,
      asyncPump: typeof ifcAPI.ExtractGeometryBatchAsync === 'function',
      propertyTables: true,
      // No source policy (sourcePolicy.js is the worker handler's): this
      // engine opens windowed when the source is a File and conway can, and
      // buffered otherwise, as the main-thread path always has.
      sourcePolicy: false,
      recapture: true,
    }
    /* eslint-disable new-cap */
    this.geometry = {
      GetGeometry: (modelID, id) => this.ifcAPI.GetGeometry(modelID, id),
      GetVertexArray: (ptr, size) => this.ifcAPI.GetVertexArray(ptr, size),
      GetIndexArray: (ptr, size) => this.ifcAPI.GetIndexArray(ptr, size),
    }
    /* eslint-enable new-cap */
    this.propertiesApi = makePropertiesApi(this)
    // propertyTable.js's reads over this engine: the calls the worker's
    // handler makes for its PROPERTY_TABLES op (engineHandler.js#tableReader),
    // so a table is resolved the same on either engine.
    this.tableReader = {
      read: (id, recursive) => this.properties(id, {recursive}),
      readMember: (id) => this.properties(id),
      typeLookups: [schemaTypeName],
    }
  }


  /**
   * Record the directory the engine's wasm is served from. Init itself is
   * lazy (the first `open`), so this only stores the path.
   *
   * @param {string} path
   */
  setWasmPath(path) {
    // eslint-disable-next-line new-cap
    this.ifcAPI?.SetWasmPath?.(path)
  }


  /**
   * Stand the engine up, once: `Init()` on first use (the wasm is decoded and
   * compiled then, not at construction), then the log level. Idempotent.
   *
   * @return {Promise<object>} `{conwayVersion}`
   */
  async init() {
    this.requireOpen_()
    const api = this.ifcAPI
    if (api.wasmModule === undefined && typeof api.Init === 'function') {
      // eslint-disable-next-line new-cap
      await api.Init()
    }
    if (this.info === null) {
      if (typeof api.SetLogLevel === 'function') {
        try {
          // Warnings and errors only for a clean load (#301 §6); everything,
          // the deduped log table included, under `glbVerbose`.
          // eslint-disable-next-line new-cap
          api.SetLogLevel(isFeatureEnabled('glbVerbose') ? ENGINE_LOG_LEVEL_DEBUG : ENGINE_LOG_LEVEL_WARN)
        } catch (e) {
          debug(WARN).warn('ConwayEngine#init: SetLogLevel failed:', e)
        }
      }
      this.info = {conwayVersion: typeof api.getConwayVersion === 'function' ? api.getConwayVersion() : null}
    }
    return this.info
  }


  /**
   * @param {string} ev an EngineEvent
   * @param {function(object): void} cb
   * @return {function(): void} unsubscribe
   */
  on(ev, cb) {
    if (!this.listeners.has(ev)) {
      this.listeners.set(ev, new Set())
    }
    this.listeners.get(ev).add(cb)
    return () => this.listeners.get(ev)?.delete(cb)
  }


  /**
   * Call every listener of `ev` now, in this tick (see the file header).
   *
   * @param {string} ev
   * @param {object} [payload]
   */
  emit_(ev, payload = {}) {
    const listeners = this.listeners.get(ev)
    if (!listeners || listeners.size === 0) {
      return
    }
    const msg = {ev, wasmBytes: wasmBytesOf(this.ifcAPI), ...payload}
    for (const cb of listeners) {
      cb(msg)
    }
  }


  /**
   * Open the engine's one model; resolves at the index. With `stream`, the
   * geometry pump then runs and the load ends with `done` or `failed`
   * (Engine.js#EngineEvent).
   *
   * The open sequence is `parseIfcWithConway`'s, moved here unchanged:
   *   - deferred (the `demandGeometry` path, on by default): windowed over a
   *     Blob store when the source is a File and the engine can (the shared
   *     conwayOpen.js#openDeferred, which buffers when the windowed open fails
   *     other than by a schema refusal), else buffered;
   *   - classic, under `disableStreamOpen` or on a pin without the deferred
   *     calls: OpenModelStream, OpenModelStreamed, OpenModelAsync, OpenModel,
   *     most preferred first, each feature-detected. The one-shot stream then
   *     comes from the pump's `meshes === 0` arm below.
   * A failed open rejects with an Error whose `engineFailure` is
   * `{code, refusedSchema, openFailure}`, as a WorkerEngine's does, for
   * unsupportedSchema.js#openModelFailure.
   *
   * @param {object} source `{file}` (a Blob/File) or `{bytes}`
   * @param {object} [options]
   * @param {'ifc'|'step'|null} [options.format] a label, echoed in `done`
   * @param {object|null} [options.stream] `{previews, batchSize, startPaused,
   *   previewFinishParse, retain}`; `retain` keeps the pumped stream for
   *   `recapture`, for a load that takes no batches (`engineModelLoad.js`)
   * @return {Promise<object>} `{modelID, windowed, deferred, format, openMs, wasmBytes}`
   */
  async open(source, {format = null, stream = null} = {}) {
    this.requireOpen_()
    if (this.modelID >= 0 || this.opening) {
      // One model per engine (Engine.js): closing it is what frees it.
      throw new Error('engine: a model is already open in this engine')
    }
    this.opening = true
    let id
    let attempt
    let windowed = false
    let deferred = false
    const t0 = this.now()
    // Held locally: close() drops `ifcAPI`, and an open that finishes after a
    // close must still be able to CloseModel what it opened.
    const api = this.ifcAPI
    try {
      await this.init()
      const file = isBlobSource(source?.file) ? source.file : null
      const store = file !== null && !isFeatureEnabled('disableStreamOpen') &&
        typeof api.OpenModelStream === 'function' ? makeBlobByteStore(file) : null
      const loadBytes = () => bytesOf(source)
      const settings = this.openSettings_(stream)
      if (isFeatureEnabled('demandGeometry') && !isFeatureEnabled('disableStreamOpen') &&
          (typeof api.OpenModelStreamed === 'function' || typeof api.OpenModelStream === 'function') &&
          (typeof api.ExtractGeometryBatch === 'function' || typeof api.ExtractGeometryBatchAsync === 'function')) {
        deferred = true
        ;({modelID: id, windowed, attempt} = await openDeferred(api, {store, loadBytes, settings}))
      } else {
        ({id, attempt} = await openClassic(api, {store, loadBytes, settings: withoutDeferral(settings)}))
      }
    } finally {
      this.opening = false
    }
    if (this.closed) {
      // Closed while the open ran: the open is one call into the wasm on this
      // thread and could not be stopped, so release what it made now.
      closeModelQuietly(api, id)
      throw new Error('engine: closed during open')
    }
    if (typeof id !== 'number' || id < 0) {
      const failure = classifyOpenFailure(api, attempt, id)
      this.emit_(EngineEvent.FAILED, {
        kind: failure.refusedSchema ? 'refusedSchema' : 'openFailure',
        message: `engine: open failed (${id})`,
        ...failure,
      })
      const error = new Error(`engine: open failed (${id})`)
      error.engineFailure = failure
      throw error
    }
    this.modelID = id
    this.windowed = windowed
    // `deferred: false` says there is no index before the geometry to hand
    // anyone: a classic open parses the whole model, and its one-shot stream
    // follows at once (engineModelLoad.js#parse then skips `onIndexed`, as
    // parseIfcWithConway did). A worker's opens are always deferred.
    const result = {modelID: id, windowed, deferred, format, openMs: this.now() - t0, wasmBytes: wasmBytesOf(api)}
    this.emit_(EngineEvent.INDEXED, {modelID: id, windowed})
    if (stream) {
      this.paused = stream.startPaused === true
      // Retention (conway#638, completed by conway#660), as parseIfcWithConway
      // decided it. The pumped stream is dead weight once each batch is in the
      // durable model, so it is kept only where nothing else takes delivery
      // (a load with no builder, `stream.retain`) or nothing could re-extract
      // it: a windowed source on a pin without `StreamAllMeshesAsync`, whose
      // sync whole-model ask cannot page a window. Everywhere else
      // `recapture` re-extracts at the moment a degraded build asks.
      this.retain = stream.retain === true ||
        (windowed && typeof api.StreamAllMeshesAsync !== 'function')
      // Started, not awaited: the open resolves at the index, and the reads a
      // caller makes then (the tree, properties) run beside the pump, each
      // paging the same source window (#2037).
      this.pumping = this.runPump_({deferred, windowed, format, batchSize: stream.batchSize})
    }
    return result
  }


  /**
   * Conway open settings: the handler's, with this engine's callbacks.
   *
   * @param {object|null} stream
   * @return {object}
   */
  openSettings_(stream) {
    const settings = {
      ...BASE_OPEN_SETTINGS,
      // ON_MODEL_INFO (a conway extension) arrives once, right after the
      // header parses.
      ON_PROGRESS: (event) => this.emit_(EngineEvent.PROGRESS, {event}),
      ON_MODEL_INFO: (info) => this.emit_(EngineEvent.MODEL_INFO, {info}),
    }
    if (stream?.previews) {
      // Slice A2's parse-time preview channel: payloads between the parse's
      // cooperative yields. Harmless on an engine without it (unknown
      // settings are ignored).
      settings.ON_PREVIEW_MESH = (payload) => this.emit_(EngineEvent.PREVIEW, {payload})
      if (stream.previewFinishParse === true) {
        enableStepPreviewFinishParse()
      }
    }
    return settings
  }


  /**
   * The geometry pump: extract, deliver, yield, until the model is drained;
   * then `done`. `parseIfcWithConway`'s deferred loop with the worker
   * handler's pause/step/abort (engineHandler.js#runPump), so the page's test
   * holds drive both engines the same way (engineModelLoad.js). Any throw
   * ends the load as `failed`.
   *
   * @param {object} opts
   * @param {boolean} opts.deferred whether the open was deferred (a classic
   *   open has nothing to pump, only the one-shot stream)
   * @param {boolean} opts.windowed
   * @param {string|null} opts.format
   * @param {number} [opts.batchSize]
   */
  async runPump_({deferred, windowed, format, batchSize}) {
    const api = this.ifcAPI
    const modelID = this.modelID
    const hasAsyncWholeModelAsk = typeof api.StreamAllMeshesAsync === 'function'
    const size = batchSize ??
      (typeof api.ExtractGeometryBatchAsync === 'function' ? PUMP_BATCH_SIZE : SYNC_PUMP_BATCH_SIZE)
    let total
    let done = 0
    let batches = 0
    let meshes = 0
    const tPump = this.now()
    // Conway's deferred open emits only headerParse/dataParse; the pump never
    // starts a geometry phase. Reported here, so the load log splits Parsing
    // from Geometry as a classic open does.
    const reportGeometry = () => this.emit_(EngineEvent.PROGRESS,
      {event: {phase: 'geometry', completed: done, total, unit: 'products'}})
    try {
      // Started on the next task, not in the open's own: the open's caller
      // is then at the index (its `onIndexed` called, its test holds in
      // place, engineModelLoad.js#parse) before the first batch, as it was
      // when the pump ran after the index in parseIfcWithConway. A sync
      // extract (or an async one's first, synchronous stretch) would
      // otherwise deliver a batch before the open had even resolved.
      await yieldToEventLoop()
      for (;;) {
        if (!deferred) {
          break
        }
        if (this.paused) {
          await new Promise((resolve) => {
            this.resume = resolve
          })
        }
        if (this.closed) {
          // close() has already ended the stream (`failed {kind: 'closed'}`).
          return
        }
        if (this.aborted) {
          this.emit_(EngineEvent.FAILED, {kind: 'aborted', message: 'engine: load aborted'})
          return
        }
        const batch = []
        const push = (flatMesh) => batch.push(flatMesh)
        const {extracted, remaining} = typeof api.ExtractGeometryBatchAsync === 'function' ?
          // eslint-disable-next-line new-cap
          await api.ExtractGeometryBatchAsync(modelID, size, push) : api.ExtractGeometryBatch(modelID, size, push)
        if (total === undefined && (extracted > 0 || remaining > 0)) {
          total = extracted + remaining
          reportGeometry()
        }
        done += extracted
        if (total !== undefined) {
          reportGeometry()
        }
        if (batch.length > 0) {
          batches++
          meshes += batch.length
          // `progress` is the only whole-model size a batch-at-a-time builder
          // can see: it sizes its buffers from it rather than doubling into
          // them, which past ~125k geometries is not survivable (Share#1809).
          this.deliver_(batch, {done, total})
          if (this.pauseAfterBatch) {
            this.pauseAfterBatch = false
            this.paused = true
          }
        }
        // `batch` goes out of scope on the next iteration, so the last
        // reference to its FlatMeshes is whatever a listener kept: for the
        // incremental builder, nothing (it copies every payload at delivery,
        // the Share#1640 invariant). Delivery is between pump calls, and
        // conway#654 evicts at the head of the NEXT call, so what this call
        // delivered is resident while the listener copies it.
        if (remaining === 0 && extracted === 0) {
          break
        }
        // Yield so the renderer paints between batches.
        await yieldToEventLoop()
      }
      if (deferred) {
        // Permanent boundary log (Share#1744): whether the pump produced
        // batches is the difference between a load that streams onto the
        // screen and one that shows nothing until the end, and E2E specs tell
        // this engine from a worker by it (tests/e2e/engineWorker.ts).
        // `asyncAsk` is the ENGINE's capability (conway#660), not which ask ran.
        // eslint-disable-next-line no-console
        console.info(
          `[conwayDirect] demand pump: batches=${batches} ` +
          `meshes=${meshes} onMeshBatch=${this.listens_(EngineEvent.BATCH) ? 'yes' : 'no'} ` +
          `onPreviewMesh=${this.listens_(EngineEvent.PREVIEW) ? 'yes' : 'no'} ` +
          `windowed=${windowed ? 'yes' : 'no'} ` +
          `asyncAsk=${hasAsyncWholeModelAsk ? 'yes' : 'no'} ` +
          `retained=${this.retain ? 'yes' : 'no'}`)
      }
      if (meshes === 0) {
        await this.deliverOneShot_(deferred)
      }
      if (this.closed) {
        return
      }
      this.emit_(EngineEvent.DONE, {summary: await this.summarize_({
        batches, meshes, pumpMs: this.now() - tPump, windowed, format,
      })})
    } catch (e) {
      if (!this.closed) {
        this.emit_(EngineEvent.FAILED, {kind: 'pump', message: e?.message ?? String(e), name: e?.name})
      }
    } finally {
      this.pumping = null
    }
  }


  /**
   * A model the pump produced nothing for: conway fell back to a classic open
   * internally, a deferred model has nothing to extract (a properties-only
   * IFC, one whose every product failed), or the open was classic. Served by
   * the one-shot whole-model ask and delivered as batches, as the worker does
   * (engineHandler.js#oneShotFallback), so both engines put it through the
   * builder. Retained whatever `retain` said: this IS the stream now, and a
   * second whole-model ask on a live model re-pushes into conway's cache and
   * doubles every triangle (IfcItemsMap.js §"Why this is a separate entry
   * point"), so `recapture` must hand back this one.
   *
   * The entry point, stated precisely because the shorthand is wrong:
   * `meshes === 0` does not imply a non-deferred model, and on a WINDOWED
   * source a deferred model's sync `StreamAllMeshes` throws ("cannot page a
   * windowed source", conway#661). So a windowed source drives conway#660's
   * `StreamAllMeshesAsync`, which pages the window and serves both cases; a
   * resident one keeps the sync call, which always worked.
   *
   * @param {boolean} deferred
   */
  async deliverOneShot_(deferred) {
    if (deferred) {
      console.warn(
        '[conwayDirect] demand pump produced no batches; ' +
        'falling back to one-shot StreamAllMeshes — no progressive render')
    }
    this.retain = true
    const captured = await this.wholeModel_()
    for (let at = 0; at < captured.length && !this.closed; at += ONE_SHOT_CHUNK) {
      this.deliver_(captured.slice(at, at + ONE_SHOT_CHUNK), {done: undefined, total: undefined})
    }
  }


  /**
   * @param {Array} batch FlatMeshes, by reference
   * @param {object} progress `{done, total}`
   */
  deliver_(batch, progress) {
    if (this.retain) {
      for (const flatMesh of batch) {
        this.captured.push(flatMesh)
      }
    }
    this.emit_(EngineEvent.BATCH, {flatMeshes: batch, progress})
  }


  /**
   * @param {string} ev
   * @return {boolean}
   */
  listens_(ev) {
    return (this.listeners.get(ev)?.size ?? 0) > 0
  }


  /**
   * One whole-model ask, through whichever entry point can serve this model
   * (see deliverOneShot_).
   *
   * @return {Promise<Array>} every FlatMesh it served
   */
  async wholeModel_() {
    const api = this.ifcAPI
    const meshes = []
    const push = (flatMesh) => meshes.push(flatMesh)
    if (this.windowed && typeof api.StreamAllMeshesAsync === 'function') {
      // eslint-disable-next-line new-cap
      await api.StreamAllMeshesAsync(this.modelID, push)
    } else {
      // eslint-disable-next-line new-cap
      api.StreamAllMeshes(this.modelID, push)
    }
    return meshes
  }


  /**
   * The whole model's FlatMeshes again, for `ShareIfcLoader#parse`'s DEGRADED
   * end-of-load builds and its two opt-in diagnostics (`capabilities
   * .recapture`). The retained stream where there is one; else re-extracted
   * now, which is the point of not retaining: 475 MB is not worth holding
   * against a fallback that almost never runs (conway#638).
   *
   * **Equivalent, not identical**, to what was pumped: a deferred model's
   * whole-model ask serves per-entity FULL FlatMeshes from conway's re-walk,
   * not the per-batch deltas (the builders iterate placements and do not
   * care), and under `GEOMETRY_BUDGET_MB` it filters out placements whose
   * natives were evicted, with one aggregate warning, where the retained
   * deltas would log a `[GetGeometry]` error per evicted placement
   * (conway#654, #672). The pixels are the same either way: the native is gone.
   *
   * Memoised, the PROMISE and not the array, because the two degraded builds
   * are consecutive and a second whole-model ask doubles every triangle (see
   * deliverOneShot_); two asks before the first resolves still drive the
   * engine once. A rejection stays memoised and is not swallowed: re-extraction
   * is wired only where it is known to work, so a throw is a broken
   * assumption the user should see as a failed load, not an empty scene.
   *
   * @return {Promise<Array>}
   */
  recapture() {
    if (this.retain) {
      return Promise.resolve(this.captured)
    }
    if (this.recaptured === null) {
      this.recaptured = this.wholeModel_().then((meshes) => {
        // eslint-disable-next-line no-console
        console.info(
          `[conwayDirect] recaptured ${meshes.length} mesh(es) via ` +
          `${this.windowed && typeof this.ifcAPI.StreamAllMeshesAsync === 'function' ?
            'StreamAllMeshesAsync' : 'StreamAllMeshes'} for a degraded end-of-load build`)
        return meshes
      })
    }
    return this.recaptured
  }


  /**
   * The `done` summary: what the load reads off the engine after the build,
   * read here, once the pump has drained, as the worker's handler does
   * (engineHandler.js#summarize). The counts it carries are final then: the
   * pump refreshes products-with-geometry as it runs (conway#740).
   *
   * @param {object} counts
   * @return {Promise<object>}
   */
  async summarize_(counts) {
    const api = this.ifcAPI
    const modelID = this.modelID
    const summary = {...counts, wasmBytes: wasmBytesOf(api)}
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
        // Plain Arrays, as the worker's summary carries them: the readers
        // index them, and the two engines' summaries then compare equal.
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
   * Backpressure and the page's test holds: pause at the next batch boundary,
   * run again, or run until one batch is delivered and pause there.
   *
   * @param {'run'|'pause'|'step'} mode
   * @return {Promise<{paused: boolean}>}
   */
  pump(mode) {
    this.paused = mode === 'pause'
    this.pauseAfterBatch = mode === 'step'
    if (!this.paused && this.resume !== null) {
      this.resume()
      this.resume = null
    }
    return Promise.resolve({paused: this.paused})
  }


  /**
   * End a streamed load at its next batch boundary; it then emits
   * `failed {kind: 'aborted'}`. An open in progress runs to its end: it is
   * one call into the wasm on this thread.
   *
   * @return {Promise<boolean>}
   */
  abort() {
    this.aborted = true
    if (this.resume !== null) {
      this.resume()
      this.resume = null
    }
    return Promise.resolve(true)
  }


  /**
   * @param {object} [opts]
   * @param {'names'|boolean} [opts.mode]
   * @param {boolean} [opts.includeSolids] STEP sub-solids
   * @return {Promise<object>} the spatial tree
   */
  async tree({mode = 'names', includeSolids = false} = {}) {
    this.requireModel_()
    return await this.ifcAPI.properties.getSpatialStructure(this.modelID, mode, {includeSolids})
  }


  /**
   * @param {number} id expressID
   * @param {object} [opts]
   * @param {boolean} [opts.recursive]
   * @return {Promise<object>} one property record
   */
  async properties(id, {recursive = false} = {}) {
    this.requireModel_()
    return await this.ifcAPI.properties.getItemProperties(this.modelID, id, recursive)
  }


  /**
   * Sequential, as the worker's PROPS op: each read may page a window, and a
   * parallel fan-out would only queue them inside the engine.
   *
   * @param {Array<number>} ids
   * @param {object} [opts]
   * @return {Promise<Array<object>>} records in `ids` order
   */
  async propertiesMany(ids, opts = {}) {
    const records = []
    for (const id of ids) {
      records.push(await this.properties(id, opts))
    }
    return records
  }


  /**
   * The Properties panel's tables, resolved here as the worker's
   * PROPERTY_TABLES op resolves them (engine/propertyTable.js).
   *
   * @param {Array<object>} tables `{record, isPset}` each
   * @return {Promise<Array<object>>}
   */
  async propertyTables(tables) {
    this.requireModel_()
    return await resolvePropertyTables(this.tableReader, tables)
  }


  /**
   * @param {number} id
   * @param {object} [opts]
   * @param {boolean} [opts.recursive]
   * @return {Promise<Array<object>>}
   */
  async propertySets(id, {recursive = false} = {}) {
    this.requireModel_()
    return await this.ifcAPI.properties.getPropertySets(this.modelID, id, recursive)
  }


  /**
   * @param {number|string} type IFC type code or name
   * @param {object} [opts]
   * @param {boolean} [opts.verbose]
   * @return {Promise<Array>} ids, or records with `verbose`
   */
  async itemsOfType(type, {verbose = false} = {}) {
    this.requireModel_()
    return await this.ifcAPI.properties.getAllItemsOfType(this.modelID, type, verbose)
  }


  /**
   * @param {number} code IFC type code
   * @return {string|undefined}
   */
  typeName(code) {
    return ifcTypeName(code)
  }


  /**
   * The GLB writer's engine captures, the job the worker's CAPTURE op runs
   * (glbEngineCapture.js), over this engine: so an artifact written from
   * either engine carries the same tree and properties.
   *
   * @param {object} [options]
   * @param {Array<number>|null} [options.geometryExpressIds]
   * @return {Promise<object>} `{spatialTree, elementProperties,
   *   geometryItemIdentities, captureMs, wasmBytes}`
   */
  async capture({geometryExpressIds = null} = {}) {
    this.requireModel_()
    const t0 = this.now()
    const captured = await captureEngineExtensions(ifcManagerOver(this.ifcAPI), this.modelID, {geometryExpressIds})
    return {...captured, captureMs: this.now() - t0, wasmBytes: wasmBytesOf(this.ifcAPI)}
  }


  /**
   * Release a resident source to windows over `file`, the OPFS File it was
   * parsed from, once the load's last synchronous sweep (the writer's
   * capture) is done. Fail-soft: a refusal keeps the source resident, which
   * is the pre-spill behaviour. Conway checks the store's byteLength against
   * the parsed source and throws BEFORE swapping providers, so a mismatched
   * File degrades to "kept resident", never to wrong bytes.
   *
   * @param {File|Blob|null} file
   * @return {Promise<{spilled: boolean, reason: (string|null), source: object}>}
   */
  spill(file) {
    const api = this.ifcAPI
    const source = () => ({kind: this.windowed ? 'blob' : 'resident', fallbackReason: null})
    if (this.closed || this.modelID < 0 || !isBlobSource(file) ||
        // eslint-disable-next-line new-cap
        typeof api?.SpillModelSource !== 'function' || !api.IsModelOpen?.(this.modelID)) {
      return Promise.resolve({spilled: false, reason: 'unsupported', source: source()})
    }
    let spilled = false
    let reason = null
    try {
      // eslint-disable-next-line new-cap
      spilled = api.SpillModelSource(this.modelID, makeBlobByteStore(file)) === true
    } catch (e) {
      reason = e?.message ?? String(e)
    }
    if (spilled) {
      this.windowed = true
    }
    return Promise.resolve({spilled, reason, source: source()})
  }


  /**
   * @param {object} [what]
   * @param {boolean} [what.entityCache]
   * @param {boolean} [what.geometry]
   * @return {Promise<boolean>} whether anything was released
   */
  release({entityCache = false, geometry = false} = {}) {
    const api = this.ifcAPI
    // eslint-disable-next-line new-cap
    if (this.closed || this.modelID < 0 || !api.IsModelOpen?.(this.modelID)) {
      return Promise.resolve(false)
    }
    let released = false
    if (entityCache && typeof api.ReleaseEntityCache === 'function') {
      // eslint-disable-next-line new-cap
      api.ReleaseEntityCache(this.modelID)
      released = true
    }
    if (geometry && typeof api.ReleaseModelGeometry === 'function') {
      // eslint-disable-next-line new-cap
      released = api.ReleaseModelGeometry(this.modelID) || released
    }
    return Promise.resolve(released)
  }


  /** @return {Promise<{wasmBytes: number, modelID: number}>} */
  stats() {
    return Promise.resolve({wasmBytes: wasmBytesOf(this.ifcAPI), modelID: this.modelID})
  }


  /**
   * End the engine, once: the stream ends with `failed {kind: 'closed'}`, every
   * later read is refused, and the model is closed. A pump in flight stops at
   * its next batch boundary and the model is closed after it, never under an
   * extraction still running. Idempotent.
   *
   * @return {Promise<void>} settles once the model is closed
   */
  close() {
    if (this.closing) {
      return this.closing
    }
    this.closed = true
    this.aborted = true
    if (this.resume !== null) {
      this.resume()
      this.resume = null
    }
    for (const cb of this.listeners.get(EngineEvent.FAILED) ?? []) {
      cb({ev: EngineEvent.FAILED, kind: 'closed', message: ENGINE_CLOSED})
    }
    // Nothing is delivered after this, so nothing should stay reachable from
    // a closed engine.
    this.listeners.clear()
    const release = () => {
      closeModelQuietly(this.ifcAPI, this.modelID)
      this.modelID = -1
      this.captured = []
      this.recaptured = null
      this.ifcAPI = null
    }
    this.closing = (this.pumping ?? Promise.resolve()).then(release, release)
    return this.closing
  }


  /** Refuse once closed. */
  requireOpen_() {
    if (this.closed) {
      throw new Error(ENGINE_CLOSED)
    }
  }


  /** Refuse unless a model is open. */
  requireModel_() {
    this.requireOpen_()
    if (this.modelID < 0) {
      throw new Error('engine: no model is open')
    }
  }
}


/**
 * The classic (non-deferred) open: `disableStreamOpen`, or an engine pin
 * without the deferred calls. Most preferred first, each feature-detected:
 *   1. `OpenModelStream` over a Blob store, falling back to the buffered
 *      streamed open unless the store open was a schema refusal (final: the
 *      buffered one would only reach the same refusal after up to two more
 *      whole-file parses);
 *   2. `OpenModelStreamed` (conway #390): the streamed columnar parse, no
 *      per-record object phase; conway falls back to the classic open
 *      internally on any failure;
 *   3. `OpenModelAsync` (conway #301 §2): yields between progress ticks;
 *   4. `OpenModel`: the synchronous open of old pins.
 * Each open is marked with `beginOpenAttempt` immediately before it is made,
 * so `attempt` is the LAST open's, which is how a refusal's status is found.
 *
 * @param {object} api
 * @param {object} options
 * @param {object|null} options.store
 * @param {function(): Promise<Uint8Array>} options.loadBytes
 * @param {object} options.settings
 * @return {Promise<{id: number, attempt: object}>}
 */
async function openClassic(api, {store, loadBytes, settings}) {
  const streamOpen = !isFeatureEnabled('disableStreamOpen')
  let attempt
  let id
  if (streamOpen && store !== null) {
    attempt = beginOpenAttempt(api)
    // eslint-disable-next-line new-cap
    id = await api.OpenModelStream(store, settings)
    if (typeof id === 'number' && id >= 0) {
      return {id, attempt}
    }
    if (conwayRefusedSchema(api, attempt)) {
      return {id, attempt}
    }
  }
  const data = await loadBytes()
  attempt = beginOpenAttempt(api)
  if (streamOpen && typeof api.OpenModelStreamed === 'function') {
    // eslint-disable-next-line new-cap
    id = await api.OpenModelStreamed(data, settings)
  } else if (typeof api.OpenModelAsync === 'function') {
    // eslint-disable-next-line new-cap
    id = await api.OpenModelAsync(data, settings)
  } else {
    // eslint-disable-next-line new-cap
    id = api.OpenModel(data, settings)
  }
  return {id, attempt}
}


/**
 * The handler's deferred settings, for a classic open: the same progress
 * callbacks and frame, without the deferral, budget, streaming-consumer and
 * preview settings, which only mean anything to a deferred model (the
 * preview channel runs between a deferred parse's yields).
 *
 * @param {object} settings
 * @return {object}
 */
function withoutDeferral(settings) {
  // eslint-disable-next-line no-unused-vars
  const {DEFER_GEOMETRY, GEOMETRY_BUDGET_MB, STREAMING_CONSUMER, ON_PREVIEW_MESH, ...rest} = settings
  return rest
}


/**
 * @param {object|null} api
 * @param {number} modelID
 */
function closeModelQuietly(api, modelID) {
  if (api && typeof modelID === 'number' && modelID >= 0) {
    try {
      // eslint-disable-next-line new-cap
      api.CloseModel(modelID)
    } catch {
      // Best-effort; dropping the reference is what frees.
    }
  }
}


/**
 * A Blob/File a windowed open can read through `slice()`.
 *
 * @param {*} value
 * @return {boolean}
 */
function isBlobSource(value) {
  return value !== null && value !== undefined &&
    typeof value.size === 'number' && typeof value.slice === 'function' &&
    !(value instanceof ArrayBuffer) && !ArrayBuffer.isView(value)
}


/**
 * The open's source as bytes, for a buffered open.
 *
 * @param {object} source `{file}` or `{bytes}`
 * @return {Promise<Uint8Array>}
 */
async function bytesOf(source) {
  const bytes = source?.bytes
  if (bytes instanceof Uint8Array) {
    return bytes
  }
  if (ArrayBuffer.isView(bytes)) {
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }
  if (bytes !== undefined && bytes !== null) {
    // An ArrayBuffer, by structure rather than `instanceof`, which fails for
    // one from another realm (a jsdom test's, a frame's).
    return new Uint8Array(bytes)
  }
  if (typeof source?.file?.arrayBuffer === 'function') {
    return new Uint8Array(await source.file.arrayBuffer())
  }
  // Nothing to read: no bytes at all, which the open then refuses as the
  // engine's own failure, as parseIfcWithConway's `new Uint8Array(buffer)`
  // did, rather than a second kind of error of this module's.
  return new Uint8Array(0)
}


/**
 * Yield to the event loop without background-tab timer throttling: a
 * backgrounded tab clamps setTimeout to >=1 s, which collapsed the pump to a
 * ~5 % duty cycle. `scheduler.yield()` (and a MessageChannel fallback) post
 * ordinary tasks, which are not clamped.
 *
 * @return {Promise<void>}
 */
function yieldToEventLoop() {
  if (typeof globalThis.scheduler?.yield === 'function') {
    return globalThis.scheduler.yield()
  }
  if (typeof globalThis.MessageChannel === 'function') {
    return new Promise((resolve) => {
      const channel = new MessageChannel()
      channel.port1.onmessage = () => {
        channel.port1.close()
        resolve()
      }
      channel.port2.postMessage(null)
    })
  }
  return new Promise((resolve) => setTimeout(resolve, 0))
}
