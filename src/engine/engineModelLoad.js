// One Conway model load over an `Engine` (Engine.js), whichever engine is
// behind it: a `WorkerEngine` (engine-worker.md §7 steps 3 and 6, the default)
// or the page's `ConwayEngine` (the kill switch, engineRoute.js; and a load
// with no scene to stream into). `ShareIfcLoader#parse` runs it on one path
// (design/tracks/open-t200/layering.md §7 "1a"): which engine it gets is the
// route's decision, passed in as `spawn`, and nothing here asks what kind it
// got. Where the engines differ in what they can do, a caller asks
// `engine.capabilities` (`recapture` is the page engine's alone).
//
// ONE load for both Conway formats, IFC and STEP/AP214 (AGENTS.md "IFC and
// STEP converge"; engine-worker.md §11 maps the two pipelines stage by
// stage). Conway's web-ifc compat `IfcAPI` serves both (it routes AP214 to
// its own proxy behind the same surface), so the engines, the protocol and
// this load are format-neutral code. What differs between the formats is
// data, and none of it needs a branch here:
//   - the SOURCE kind is the same for both since conway#757: a part-21
//     file staged in OPFS crosses as a File (`{file}`) and opens windowed.
//     What differs is what the windowed open needs of its store — IFC any,
//     STEP one that reads synchronously — and the worker's stores both do
//     (engineSources.js). The Loader asks conway which (Loader.js
//     #canOpenFromStore); only the main-thread engine still buffers a STEP;
//   - the ID scheme: STEP placements carry an occurrence path, which every
//     engine's `batch` carries on each placement (Engine.js#EngineEvent);
//   - the tree's `includeSolids`, which the model's reads ask for
//     (model/engineModelReads.js#attachEngineReads).
// `format` itself only travels as a label (the `open` request, the `done`
// packet, the pump line): what the file's suffix names
// (engine/part21Formats.js), which is not evidence of the schema, so it
// decides nothing.
//
// The model keeps an IfcAPI-shaped alias of its engine (`makeEngineIfcApi`,
// at `model.ifcManager.ifcAPI`) until slice N renames its readers onto
// `model.engine`. Through it:
//   - the builder's three geometry calls are the engine's `geometry`: the
//     shapes a worker copied out and transferred (§2.4 G1), or the wasm heap;
//   - `properties.*` are the engine's reads (Engine.js#makePropertiesApi);
//   - the engine values read after the build (statistics, the coordination
//     and applied matrices, the unit scale) come from the `done` summary.
// It offers no other engine method, so none can be reached synchronously
// by accident.
import {reportEngineLog, reportEngineVersion, reportSourceInfo} from '../loader/loadProgress'
import {HEADER_SNIFF_BYTES, openModelFailure} from './unsupportedSchema'
import {engineFormatOf} from './part21Formats'
import {testPumpBatchSize, testStepPreviewFinishParse} from './pumpTestSeams'
import {EngineEvent} from './Engine'
import {POLICY_BUFFERED_REASONS, SourceModeReason} from './sourcePolicy'
import {isOutOfMemoryError} from '../utils/oom'
import {spawnWorkerEngine} from './spawnEngine'
import {LoadAbortedError} from '../utils/loadAbort'


// Re-exported: callers that pick an engine load ask the same list the
// Loader does (engine/part21Formats.js).
export {engineFormatOf}


/**
 * conway's Statistics object, re-presented over the `done` packet's plain
 * snapshot (`engineStream.js#snapshotStatistics`): each `getX()` returns
 * the value the worker read. A getter the engine lacked is absent here too,
 * so the optional chains in `ShareIfcLoader#parse` read it as unknown.
 *
 * @param {object|undefined} snapshot
 * @return {object|undefined}
 */
export function statisticsView(snapshot) {
  if (!snapshot) {
    return undefined
  }
  const view = {}
  for (const [key, value] of Object.entries(snapshot)) {
    if (key.startsWith('get')) {
      view[key] = () => value
    } else {
      view[key] = value
    }
  }
  return view
}


/**
 * The IfcAPI-shaped alias of a load's engine (see the file header).
 * `engine` is set when the load's engine is up (a windowed retry replaces
 * it), and `summary` by the `done` packet; nothing reads either before then,
 * because the reads they serve all come after the build.
 *
 * @return {object}
 */
export function makeEngineIfcApi() {
  const facade = {
    engine: null,
    summary: null,
    get properties() {
      return facade.engine?.propertiesApi
    },
    /* eslint-disable new-cap */
    GetGeometry: (modelID, id) => facade.engine.geometry.GetGeometry(modelID, id),
    GetVertexArray: (ptr, size) => facade.engine.geometry.GetVertexArray(ptr, size),
    GetIndexArray: (ptr, size) => facade.engine.geometry.GetIndexArray(ptr, size),
    /* eslint-enable new-cap */
    // Async on the engine, so callers already await it.
    GetCoordinationMatrix: () => Promise.resolve(facade.summary?.coordinationMatrix),
    // The two load-end releases, as fire-and-forget calls: CadView drops the
    // entity cache after its load-time reads, and Loader.js the native
    // geometry once the scene is built (Engine.js `release`).
    IsModelOpen: () => facade.engine !== null && !facade.engine.closed,
    ReleaseEntityCache: () => {
      facade.engine?.release({entityCache: true}).catch(() => null)
    },
    ReleaseModelGeometry: () => {
      facade.engine?.release({geometry: true}).catch(() => null)
      return true
    },
    getConwayVersion: () => facade.engine?.info?.conwayVersion,
  }
  // These are present only when the engine reported a value, as the
  // method is on an engine that has it: `ShareIfcLoader#parse` feature-detects
  // both with `typeof`, and an always-present one would print
  // `units=undefined m`, or warn of a non-frame where the engine had none to
  // give (stampAppliedCoordination).
  Object.defineProperty(facade, 'GetLinearScalingFactor', {
    get: () => (typeof facade.summary?.linearScalingFactor === 'number' ?
      () => facade.summary.linearScalingFactor : undefined),
  })
  // And statistics, the same way: `parse` reads them only when the engine has
  // the call, and an engine without it (an old pin) sends none.
  Object.defineProperty(facade, 'getStatistics', {
    get: () => (facade.summary?.statistics ? () => statisticsView(facade.summary.statistics) : undefined),
  })
  Object.defineProperty(facade, 'GetAppliedCoordinationMatrix', {
    get: () => (facade.summary?.appliedCoordination !== undefined ?
      () => facade.summary.appliedCoordination : undefined),
  })
  return facade
}


/**
 * Prepare a model load. Returns the alias at once, so the caller can close
 * its builder callbacks over it before the parse starts.
 *
 * @param {object} [options]
 * @param {'ifc'|'step'|null} [options.format] from {@link engineFormatOf}:
 *   what the file's SUFFIX names, so a label only (see the file header);
 *   null when the caller did not say
 * @param {function(): Promise<object>} [options.spawn] resolves to an
 *   initialised Engine: `spawnWorkerEngine` by default, or the route's
 *   ConwayEngine (ShareIfcLoader#parse). Called again only for the windowed
 *   retry after a buffered open ran out of memory, which only an engine that
 *   reports a source mode can ask for (retryableBufferedFailure)
 * @return {{ifcAPI: object, parse: Function, abort: Function, aborted: boolean, engine: (object|null)}}
 */
export function createEngineModelLoad({format = null, spawn = spawnWorkerEngine} = {}) {
  const ifcAPI = makeEngineIfcApi()
  // open-205 #2011 step A: the load can be given up before its parse ends —
  // the user switched to another model in-app (CadView's load signal, through
  // ShareIfcLoader#parse), or the viewer it streams into was disposed
  // (ShareIfc#dispose). `abort()` closes the engine at once: a worker is
  // terminated, and the open, the pump and every request still pending
  // reject (WorkerEngine#fail); the page's engine stops its pump at the next
  // batch, its open runs to its end (one call into the wasm on this thread).
  // Either way the stream ends `failed {kind: 'closed'}` and the parse below
  // unwinds at its next await. `aborted` rejects too, for the
  // awaits that are not on the engine (a spawn still starting, the test
  // holds), so none of them can keep a given-up load suspended.
  let isAbortedLoad = false
  let rejectAborted
  const aborted = new Promise((resolve, reject) => {
    rejectAborted = reject
  })
  aborted.catch(() => null)
  const untilAborted = (promise) => Promise.race([promise, aborted])
  /** Give the load up; see above. Idempotent. */
  const abort = () => {
    if (isAbortedLoad) {
      return
    }
    isAbortedLoad = true
    rejectAborted(new LoadAbortedError())
    ifcAPI.engine?.close()
  }

  /**
   * Open and stream the model, delivering what the engine sends to the
   * callbacks.
   *
   * @param {Blob|ArrayBuffer|Uint8Array} buffer the source
   * @param {object} callbacks
   * @param {Function} [callbacks.onProgress] conway ProgressEvents, and
   *   `{modelInfo}` envelopes
   * @param {Function} [callbacks.onMeshBatch] `(flatMeshes, modelID,
   *   {done, total})`
   * @param {Function} [callbacks.onPreviewMesh] preview payloads
   * @param {Function} [callbacks.onIndexed] `(modelID)`, not awaited
   * @return {Promise<{modelID: number, recapture: function(): Promise<Array>, summary: object}>}
   */
  async function parse(buffer, {onProgress, onMeshBatch, onPreviewMesh, onIndexed} = {}) {
    // Shapes delivered so far: what a `recapture` with nothing to re-extract
    // from decides by (below). A worker sends each shape once and never a
    // degenerate one, so this counts drawable shapes, not placements.
    let deliveredGeometries = 0
    // `window.__bldrsTestHoldMidPump`: awaited after every batch, with durable
    // geometry on screen and the load not finished (streamingBatchPick.spec.ts).
    // The engine is stepped one batch at a time while the hook is installed.
    const holdMidPump = typeof globalThis.__bldrsTestHoldMidPump === 'function' ?
      globalThis.__bldrsTestHoldMidPump : null
    // The other two test seams, absent in production (property reads); each
    // installed by a spec with `addInitScript`, and a function returning a
    // Promise the spec resolves to let the load go on. Every one of them
    // holds a state a large model's load is in for seconds, which on a
    // fixture small enough to ship lasts well under a second:
    //   - `window.__bldrsTestHoldIndex`: hold between the parse and the index
    //     being published, with only previews on screen
    //     (previewInteraction.spec.ts);
    //   - `window.__bldrsTestHoldGeometryPump`: hold between the index and the
    //     first batch (navTreeAtIndex.spec.ts);
    //   - `window.__bldrsTestHoldMidPump` (above): hold after each batch.
    // The engine starts PAUSED when any is set, and is let go once both have
    // resolved: pausing after the index would race a worker's first batch.
    const holdIndex = typeof globalThis.__bldrsTestHoldIndex === 'function' ?
      globalThis.__bldrsTestHoldIndex : null
    const holdPump = typeof globalThis.__bldrsTestHoldGeometryPump === 'function' ?
      globalThis.__bldrsTestHoldGeometryPump : null
    const startPaused = holdIndex !== null || holdPump !== null || holdMidPump !== null
    // In this order: the failure's header and size first, because opening
    // transfers (detaches) a bytes source.
    const failureSource = openFailureSource(buffer)
    const source = sourceFor(buffer)
    const stream = {
      previews: Boolean(onPreviewMesh), startPaused, batchSize: testPumpBatchSize(),
      // The worker's conway is its own; the page's seam reaches it here
      // (pumpTestSeams.js#testStepPreviewFinishParse).
      previewFinishParse: testStepPreviewFinishParse(),
      // A load with no builder: the stream itself is the delivery, which only
      // an engine that can keep it can serve (ConwayEngine; ShareIfcLoader
      // builds from `recapture` then). Said only when true, so a worker's
      // `open` request is the one it always was.
      ...(onMeshBatch ? {} : {retain: true}),
    }

    /**
     * Subscribe the load's callbacks to one engine. Once per engine: a
     * windowed retry (below) wires its fresh engine the same way.
     *
     * @param {object} engine
     * @return {Promise<object>} the `done` summary, or the stream's failure
     */
    const wire = (engine) => {
      ifcAPI.engine = engine
      engine.on(EngineEvent.PROGRESS, (msg) => onProgress?.(msg.event))
      engine.on(EngineEvent.MODEL_INFO, (msg) => onProgress?.({modelInfo: msg.info}))
      engine.on(EngineEvent.LOG, (msg) => reportEngineLog(msg))
      if (onPreviewMesh) {
        engine.on(EngineEvent.PREVIEW, (msg) => onPreviewMesh(msg.payload))
      }
      if (onMeshBatch || holdMidPump !== null) {
        engine.on(EngineEvent.BATCH, (msg) => {
          // A worker's batch says which shapes crossed with it; a page engine's
          // shapes never cross, and it can recapture, so its count is moot.
          deliveredGeometries += msg.geometries?.length ?? 0
          // `engine.modelID`, set at the index, which every engine reaches
          // before its first batch; a worker's `open` reply can arrive after
          // its first batches (the pump starts before the reply is sent).
          onMeshBatch?.(msg.flatMeshes, engine.modelID, msg.progress ?? {})
          // The mid-pump test hold: the engine was stepped to this one batch
          // and has paused itself; it steps on to the next when the test lets
          // it.
          if (holdMidPump !== null) {
            Promise.resolve(holdMidPump()).then(() => engine.pump('step')).catch(() => null)
          }
        })
      }
      // `done` or `failed`, whichever ends the stream. Open failures are
      // answered by `open` itself (below), so only what comes after the index
      // ends up here.
      const finishedLoad = new Promise((resolve, reject) => {
        engine.on(EngineEvent.DONE, (msg) => resolve(msg.summary))
        engine.on(EngineEvent.FAILED, (msg) => {
          if (msg.kind !== 'openFailure' && msg.kind !== 'refusedSchema') {
            reject(engineLoadError(msg))
          }
        })
      })
      // Handled where it is awaited; this keeps an early rejection (a crash
      // during the open) from surfacing as unhandled meanwhile.
      finishedLoad.catch(() => null)
      return finishedLoad
    }

    // A spawn is not cancellable: an engine that comes up after the abort is
    // closed here, before it is wired or opened.
    const spawnLive = async () => {
      const spawning = spawn()
      try {
        return await untilAborted(spawning)
      } catch (e) {
        if (isAbortedLoad) {
          spawning.then((late) => late.close(), () => null)
        }
        throw e
      }
    }
    let engine = await spawnLive()
    reportEngineVersion(engine.info?.conwayVersion)
    let finished = wire(engine)
    let opened
    let sourceOverride = null
    for (;;) {
      try {
        opened = await engine.open(source, {format, stream, sourceOverride})
        break
      } catch (e) {
        engine.close()
        if (isAbortedLoad) {
          // The open failed because the engine was closed under it.
          throw new LoadAbortedError()
        }
        const failure = e.engineFailure
        const retryFailure = sourceOverride === null ? retryableBufferedFailure(failure) : null
        if (retryFailure !== null) {
          // The policy's buffered open failed in a way a heap exhaustion
          // looks like (retryableBufferedFailure says which). conway does not
          // throw for it: it records the failure and the open returns -1, and
          // an Emscripten abort leaves that engine's wasm unusable, so the
          // retry is windowed on a NEW engine, once (`sourceOverride` is set
          // from here on, so the retry's own failure is final). The failed
          // worker is terminated above, BEFORE the respawn, so the two heaps
          // never coexist. Only an engine that runs the source policy reports
          // the source mode this needs, so the page's engine never retries. If this open fails too, its failure is the load's,
          // reported once like any other.
          sourceOverride = {windowed: true, failure: retryFailure}
          // Said in the report before the retry's lines, so the failed
          // attempt's engine warnings and errors in the load's tally read as
          // that attempt's (loadProgress.js#reportEngineLog counts both).
          reportSourceInfo(`Engine retry: buffered open failed (${FAILURE_TEXT[retryFailure]}); ` +
            'retrying windowed on a fresh engine')
          engine = await spawnLive()
          finished = wire(engine)
          continue
        }
        if (failure) {
          throw withEngineSource(
            await openModelFailure(failure.code, failureSource, failure.refusedSchema, failure.openFailure),
            failure.sourceMode)
        }
        // A direct open exception (no classified failure) still failed this
        // open: carry the handler's source mode into the Sentry tags, as
        // for a classified one. A missing mode is ignored.
        throw withEngineSource(e, e?.sourceMode)
      }
    }
    const modelID = opened.modelID
    if (holdIndex !== null) {
      await untilAborted(holdIndex())
    }
    // Not after a classic open (`deferred: false`, ConwayEngine#open), which
    // parsed the whole model and streams it at once: there is no window
    // between the index and the geometry for an early tree to fill.
    if (onIndexed && opened.deferred !== false) {
      // Started, not awaited (codex/PSB review on #2037): the caller's tree
      // walk pages the same source window the pump does, and awaited here it
      // held the whole pump back for its length (~86 s on PSB before
      // conway#753). The finished model re-reads the tree when this fails.
      try {
        Promise.resolve(onIndexed(modelID)).catch(warnIndexFailure)
      } catch (e) {
        warnIndexFailure(e)
      }
    }
    if (holdPump !== null) {
      await untilAborted(holdPump())
    }
    if (startPaused) {
      // Held mid-pump: one batch, then the engine pauses itself and the
      // BATCH handler above waits on the hold.
      await engine.pump(holdMidPump !== null ? 'step' : 'run')
    }
    try {
      ifcAPI.summary = await finished
    } catch (e) {
      engine.close()
      // A closed engine ends the stream with `failed {kind: 'closed'}`,
      // which says nothing of why: say it was given up.
      throw isAbortedLoad ? new LoadAbortedError() : e
    }
    reportSourceInfo(sourceModeLine(ifcAPI.summary.sourceMode))
    reportSourceInfo(sourceIoLine(ifcAPI.summary.source))
    reportSourceInfo(indexLine(ifcAPI.summary.index))
    // The degraded end-of-load builds in ShareIfcLoader#parse read the whole
    // stream back through `recapture`. The page's engine can re-extract it
    // (`capabilities.recapture`). A worker cannot, and re-emits a one-shot
    // stream as batches itself (engineHandler.js#oneShotFallback), so every
    // mesh it had has already gone to `onMeshBatch`. When no drawable shape
    // was delivered (no products, or every one degenerate) empty IS the
    // stream, and the model opens empty with the "nothing to draw" verdict,
    // as it does on the page's engine. When shapes were delivered and a
    // fallback still asks, building from nothing would hide the failure, so
    // it refuses (ShareIfcLoader#parse throws the builder's own error first).
    const recapture = engine.capabilities?.recapture === true ?
      () => engine.recapture() :
      () => (deliveredGeometries > 0 ?
        Promise.reject(new Error('engine worker load: the stream is not retained; ' +
          'the incremental build is the only build')) :
        Promise.resolve([]))
    return {modelID, recapture, summary: ifcAPI.summary}
  }

  return {
    ifcAPI,
    parse,
    abort,
    /** @return {boolean} whether {@link abort} has run */
    get aborted() {
      return isAbortedLoad
    },
    /** @return {object|null} the load's engine, once spawned */
    get engine() {
      return ifcAPI.engine
    },
  }
}


/**
 * The `open` source. Which kind a load sends is decided upstream, by the
 * Loader's header sniff (Loader.js#canOpenFromStore), not by the format
 * tag: a part-21 file conway can open from a store arrives as a File and
 * opens windowed, whatever its suffix says; anything else (not staged in
 * OPFS, not a format the store open takes) arrives as bytes.
 *
 * Bytes are TRANSFERRED as they are, not copied first (WorkerEngine.js
 * #transferableSource copies only a view onto part of a larger buffer): the
 * caller's buffer is detached, which is the point. A copy would hold a
 * buffered source twice on the page for the length of the open, while nothing reads the
 * caller's buffer after the parse (Loader.js#load hands it to `readModel`
 * and drops it). The one late reader is a failed open's error, which needs
 * only the header and the size: {@link openFailureSource} keeps those.
 *
 * @param {Blob|ArrayBuffer|Uint8Array} buffer
 * @return {object} `{file}` for a Blob/File (windowed, cloned by
 *   reference), else `{bytes}`
 */
function sourceFor(buffer) {
  if (isBlobLike(buffer)) {
    return {file: buffer}
  }
  return {bytes: buffer}
}


/**
 * @param {*} source
 * @return {boolean}
 */
function isBlobLike(source) {
  return typeof source?.slice === 'function' && typeof source?.size === 'number' &&
    !ArrayBuffer.isView(source) && Object.prototype.toString.call(source) !== '[object ArrayBuffer]'
}


/**
 * What `unsupportedSchema.js#openModelFailure` reads off a failed open's
 * source, taken BEFORE the bytes are transferred away: the header (it names
 * a refused schema; exactly the bytes its sniff reads, HEADER_SNIFF_BYTES)
 * and the size. A Blob/File is not transferred, so it is
 * its own answer.
 *
 * @param {Blob|ArrayBuffer|Uint8Array} buffer
 * @return {Blob|{size: number, slice: Function}} Blob-shaped, which is all
 *   `openModelFailure` asks of a source
 */
export function openFailureSource(buffer) {
  if (isBlobLike(buffer)) {
    return buffer
  }
  const view = ArrayBuffer.isView(buffer) ?
    new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength) :
    new Uint8Array(buffer)
  const header = new Blob([view.slice(0, HEADER_SNIFF_BYTES)])
  return {size: view.byteLength, slice: (start, end) => header.slice(start, end)}
}


/**
 * What a heap exhaustion looks like from this conway-geom build
 * (`@bldrs-ai/conway/compiled/dependencies/conway-geom/Dist/ConwayGeomWasmWeb.js`,
 * in conway 1.1645.781), as conway records it (`recordOpenFailure` stores
 * `error.message`, or `String(error)` for a non-Error). Heap growth is on,
 * `_emscripten_resize_heap` returns false when it can't grow, and there is
 * no `abortOnCannotGrowMemory`, so the ASSERTIONS-only texts
 * (`Aborted(OOM)`, "Cannot enlarge memory") are never produced. Instead:
 * - a failed malloc in C++ throws `std::bad_alloc` as a `CppException`,
 *   which is not an Error, so the recorded reason is `"[object Object]"`;
 * - `abort()` throws `"Aborted(). Build with -sASSERTIONS for more info."`;
 * - conway's own guard on `_malloc` (`core/wasm_heap.js`) throws
 *   `"wasm _malloc returned an unusable address for N bytes - …"`.
 * A conway-geom rebuild can change all three; re-read the glue then.
 */
export const CPP_EXCEPTION_REASON = '[object Object]'
export const WASM_ABORT_PREFIX = 'Aborted('
export const CONWAY_MALLOC_FAILURE_PREFIX = 'wasm _malloc returned an unusable address'


/**
 * Should a failed open be retried windowed, on a fresh engine, and with
 * which failure code? Only when the source policy itself chose buffered over
 * a store (sourcePolicy.js#POLICY_BUFFERED_REASONS: not `disableStreamOpen`,
 * not a bytes source, which have nothing to window over), it was not a
 * schema refusal, and conway's recorded reason looks like memory.
 *
 * The signal is conway's own record of the failure: a buffered open that
 * fails in its parse does not throw (`fromStreamed` catches, falls back to
 * the classic open, whose `fromAsync` catches again and calls
 * `recordOpenFailure`, so the open returns -1), and what it caught is in
 * `openFailure.reason` (openAttempt.js#conwayOpenFailure). Codes:
 * - `outOfMemory`: the app's OOM classifier matches (utils/oom.js: V8's
 *   "Array buffer allocation failed", Firefox's and Safari's "out of
 *   memory", "WebAssembly.Memory(): could not allocate memory", …) or
 *   conway's `_malloc` guard fired;
 * - `engineException`: a non-Error thrown out of wasm ({@link
 *   CPP_EXCEPTION_REASON}), which in this build is how `std::bad_alloc`
 *   arrives;
 * - `engineAbort`: an Emscripten `abort()` ({@link WASM_ABORT_PREFIX}).
 * The last two are not always memory: a C++ exception or abort for another
 * reason costs one wasted windowed attempt, bounded to one, and then fails
 * as before. The shared `utils/oom.js` patterns are deliberately not
 * widened for these: other callers use them to tell the user their device
 * ran out of memory.
 *
 * @param {object|undefined} failure the open's `engineFailure`
 * @return {string|null} the failure code, or null for no retry
 */
export function retryableBufferedFailure(failure) {
  if (!failure || failure.refusedSchema) {
    return null
  }
  if (failure.sourceMode?.mode !== 'buffered' || !POLICY_BUFFERED_REASONS.includes(failure.sourceMode.reason)) {
    return null
  }
  const reason = failure.openFailure?.reason
  if (typeof reason !== 'string') {
    return null
  }
  if (reason.startsWith(CONWAY_MALLOC_FAILURE_PREFIX) || isOutOfMemoryError({message: reason})) {
    return 'outOfMemory'
  }
  if (reason === CPP_EXCEPTION_REASON) {
    return 'engineException'
  }
  if (reason.startsWith(WASM_ABORT_PREFIX)) {
    return 'engineAbort'
  }
  return null
}


/**
 * @param {object|undefined} failure the open's `engineFailure`
 * @return {boolean} whether {@link retryableBufferedFailure} would retry it
 */
export function shouldRetryWindowed(failure) {
  return retryableBufferedFailure(failure) !== null
}


/**
 * Stamp a failed open's error with how its source was read, as structured
 * values only (`buffered` / `windowed` and the policy's reason code), for
 * the Sentry tags CadView puts on it (engineOpenFailure.js
 * #engineSourceTags). Never the file's name or size.
 *
 * @param {Error} error
 * @param {object|undefined} sourceMode the failure's `sourceMode`
 * @return {Error} the same error
 */
export function withEngineSource(error, sourceMode) {
  if (error && typeof error === 'object' && sourceMode?.mode) {
    error.engineSource = sourceMode.mode
    error.engineSourceReason = sourceMode.reason
  }
  return error
}


/**
 * @param {object} msg a `failed` event
 * @return {Error} the engine's own Error when it could send one (the page's
 *   engine, by reference: its stack and `cause` intact, so Sentry groups
 *   conway's faults apart, as it did before the page engine went behind
 *   `Engine`), else the message verbatim, so `isOutOfMemoryError` and the
 *   load report classify a worker's failure as they would a page one
 */
function engineLoadError(msg) {
  if (msg.error instanceof Error) {
    try {
      msg.error.engineFailureKind = msg.kind
    } catch {
      // A frozen or non-extensible Error: it fails the load untagged. This
      // runs inside the page engine's FAILED emit, so a throw from here would
      // escape the listener and leave the load's `finished` unsettled.
    }
    return msg.error
  }
  // A string, whatever the worker sent: a stale worker beside a new page can
  // still post an object here (SHARE-1Y7, `Error: [object Object]`). Only a
  // worker gets here (the page engine sends its Error, above), so the text,
  // and its Sentry grouping, stays the worker's.
  const message = typeof msg.message === 'string' ? msg.message :
    `engine worker load failed (${typeof msg.kind === 'string' ? msg.kind : 'unknown'})`
  const error = new Error(message)
  if (typeof msg.name === 'string' && msg.name) {
    error.name = msg.name
  }
  error.engineFailureKind = msg.kind
  return error
}


/**
 * @param {*} e
 */
function warnIndexFailure(e) {
  console.warn('[conwayDirect] onIndexed failed; tree waits for the load to finish:', e)
}


/* eslint-disable no-magic-numbers */
const MIB = 1024 * 1024
const MS_PER_S = 1000
/* eslint-enable no-magic-numbers */


/**
 * The load report's line for where the engine's index came from (§7 step
 * 8): a persisted sidecar (no parse), or the parse, and whether that parse
 * saved one for the next open — through which writer, when not the usual
 * one, or why not. Absent when the open could not use one (a
 * buffered source, no OPFS entry, the kill switch).
 *
 * @param {object|undefined} index the `done` packet's `index`
 * @return {string|undefined}
 */
export function indexLine(index) {
  if (!index) {
    return undefined
  }
  // The sidecar's source digest, 'sha256' or 'fnv' (Share#2092), so a report
  // says which hash a reopen verified; absent when the worker could not read it.
  const size = `${(index.bytes / MIB).toFixed(1)} MB${index.hash ? `, ${index.hash}` : ''}`
  if (index.source === 'sidecar') {
    return `Engine index: from sidecar (${size}), no parse`
  }
  const refused = index.source === 'sidecarRejected' ? 'sidecar refused, ' : ''
  // Which writer saved it when it was not `createWritable` (Safari before
  // 26 writes through a sync access handle), and why nothing was saved when
  // nothing was (Share#2093): an unsupported browser reads apart from a
  // quota or export error.
  const via = index.writer === 'syncAccessHandle' ? ', via sync access handle' : ''
  const saved = index.saved ?
    `sidecar saved (${size}${via})` :
    `no sidecar saved${index.saveError ? ` (${index.saveError})` : ''}`
  return `Engine index: ${refused}parsed; ${saved}`
}


/** How each `bufferedFailed` failure code reads on the report line. */
const FAILURE_TEXT = {
  RangeError: 'RangeError', outOfMemory: 'out of memory', engineException: 'engine exception',
  engineAbort: 'engine abort',
}


/**
 * The load report's line for the source policy's decision
 * (sourcePolicy.js, Share#2139): which mode the open ran in and why, with
 * the size and, over the sync access handle, the device's cap. Printed
 * before `Engine source I/O:`, which follows only a windowed open (it is the
 * store the windowed source pages from). Absent for an engine that sent no
 * decision (a worker bundle from before the policy).
 *
 * @param {object|undefined} mode the `done` packet's `sourceMode`
 * @return {string|undefined}
 */
export function sourceModeLine(mode) {
  if (!mode?.mode) {
    return undefined
  }
  const size = `${(mode.bytes / MIB).toFixed(1)} MB`
  const cap = Number.isFinite(mode.capBytes) ? `${Math.round(mode.capBytes / MIB)} MB` : null
  const why = {
    [SourceModeReason.UNDER_CAP]: `${size}, cap ${cap}`,
    [SourceModeReason.OVER_CAP]: `${size}, over cap ${cap}`,
    [SourceModeReason.HELD_BY_BLOB_STORE]: `${size}, held by the Blob store`,
    [SourceModeReason.BLOB_NOT_HELD]: `${size}, Blob store does not hold the file`,
    [SourceModeReason.INDEX_REOPEN]: 'index reopen',
    [SourceModeReason.KILL_SWITCH]: 'disableBufferedSource',
    [SourceModeReason.STREAM_OPEN_DISABLED]: `${size}, disableStreamOpen`,
    [SourceModeReason.NO_STORE]: `${size}, no store to window over`,
    [SourceModeReason.WINDOWED_REFUSED]: `${size}, windowed open refused`,
    [SourceModeReason.WINDOWED_FAILED]: `${size}, windowed open failed`,
    [SourceModeReason.BUFFERED_FAILED]: `buffered open failed: ${FAILURE_TEXT[mode.failure] ?? 'unknown'}`,
  }[mode.reason] ?? mode.reason
  return `Engine source: ${mode.mode} (${why})`
}


/**
 * The load report's line for how the engine read its source (§7 step 4):
 * through an OPFS sync access handle, or the Blob store and why — and, on
 * the Blob store, whether it held the whole file for the load (Share#2092:
 * `whole file held, N reads from memory`, with the one whole-file read in
 * the counts that follow) or why not.
 *
 * @param {object|undefined} source the `done` packet's `source`
 * @return {string|undefined}
 */
export function sourceIoLine(source) {
  if (!source || source.kind === 'resident') {
    return undefined
  }
  let via = 'OPFS sync access handle'
  if (source.kind !== 'syncHandle') {
    const notes = []
    if (source.fallbackReason) {
      notes.push(source.fallbackReason)
    }
    if (source.residentBytes > 0) {
      notes.push(`whole file held, ${source.residentReads} reads from memory`)
    } else if (source.residentSkipped) {
      notes.push(`whole file not held: ${source.residentSkipped}`)
    }
    via = `Blob store${notes.length > 0 ? ` (${notes.join('; ')})` : ''}`
  }
  return `Engine source I/O: ${via}, ${source.reads} reads, ` +
    `${(source.bytes / MIB).toFixed(1)} MB, ${(source.ms / MS_PER_S).toFixed(2)}s`
}
