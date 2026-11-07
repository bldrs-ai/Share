// A Conway model load whose engine runs in its own worker
// (design/new/engine-worker.md §7 steps 3 and 6, `?feature=engineWorker`).
// The page side of a streamed open: what `parseIfcWithConway` does for a
// main-thread engine, re-expressed over an EngineSession so
// `ShareIfcLoader#parse` keeps one assembly path.
//
// ONE load for both Conway formats, IFC and STEP/AP214 (AGENTS.md "IFC and
// STEP converge"; engine-worker.md §11 maps the two pipelines stage by
// stage). Conway's web-ifc compat `IfcAPI` serves both (it routes AP214 to
// its own proxy behind the same surface), so the worker, the protocol, the
// session and this facade are format-neutral code. What differs between the
// formats is data, and none of it needs a branch here:
//   - the SOURCE kind is the same for both since conway#757: a part-21
//     file staged in OPFS crosses as a File (`{file}`) and opens windowed.
//     What differs is what the windowed open needs of its store — IFC any,
//     STEP one that reads synchronously — and the worker's stores both do
//     (engineSources.js). The Loader asks conway which (Loader.js
//     #canOpenFromStore); only the main-thread engine still buffers a STEP;
//   - the ID scheme: STEP placements carry an occurrence path, which rides
//     the batch's path column (engineStream.js#makeBatchEncoder) and is
//     decoded back onto each placement below;
//   - the tree's `includeSolids`, which the caller already passes
//     (conwayDirectIfcLoader.js#attachConwayDirectModelMethods) and the
//     session forwards (EngineSession.js#makePropertiesApi).
// `format` itself only travels as a label (the `open` request, the `done`
// packet, the pump line): what the file's suffix names
// (loader/part21Formats.js), which is not evidence of the schema, so it
// decides nothing.
//
// The seam is an IfcAPI-shaped facade (`makeEngineIfcApi`). Everything that
// assembles and decorates the model — `IncrementalBatchedBuilder`,
// `assembleBatchedModel`, `decorateConwayDirectIfcModel`,
// `makeIndexedModelHandle`, `stampAppliedCoordination`, the load-stats block
// — reads an `ifcAPI`, and is handed this instead:
//   - the builder's four geometry calls are served from the geometry the
//     worker copied out and transferred (`makeGeometryStore`, §2.4 G1);
//   - `properties.*` are requests to the worker (EngineSession#propertiesApi);
//   - the engine values read after the build (statistics, the coordination
//     and applied matrices, the unit scale) come from the `done` packet.
// There is no other engine on the page for this model, so no sync engine
// method can be reached by accident: the facade has none to offer.
import {reportEngineLog, reportEngineVersion, reportSourceInfo} from '../loader/loadProgress'
import {HEADER_SNIFF_BYTES, openModelFailure} from '../loader/unsupportedSchema'
import {engineFormatOf} from '../loader/part21Formats'
import {conwayDirectInfo, conwayDirectWarn} from '../viewer/ifc/conwayDirectLog'
import {testPumpBatchSize, testStepPreviewFinishParse} from '../viewer/ifc/pumpTestSeams'
import {viewRules} from '../viewer/legacyViewRules'
import {Ev, Op} from './protocol'
import {spawnEngineSession} from './spawnEngine'


// Re-exported: callers that pick an engine load ask the same list the
// Loader does (loader/part21Formats.js).
export {engineFormatOf}


/* Column-major mat4 elements per placement. */
const MATRIX_ELEMENTS = 16
/* RGBA per placement. */
const COLOR_COMPONENTS = 4


/**
 * The geometry the worker copied out, served through the slice of conway's
 * IfcAPI that `incrementalBatchedBuilder` uses. Adapted from #1756's
 * `workerGeometryApi.js` (the geometry worker pool, draft): adapting the
 * input rather than teaching the builder a second shape keeps its geometry
 * cache, coincidence dedup, capacity growth and bounds accounting on one
 * code path for both engines.
 *
 * Unlike #1756's, entries are DROPPED once their batch has been appended
 * (`drop`): the builder copies every payload at delivery (the Share#1640
 * invariant) and caches by geometry id, so keeping the worker's copy too
 * would hold each shape twice — 337 MB extra on PSB (§3).
 *
 * The "pointer" the builder round-trips (`GetVertexData()` →
 * `GetVertexArray(ptr, size)`) is the geometry's express ID here.
 *
 * @return {object} `{api, put, drop, size}`
 */
export function makeGeometryStore() {
  const geometries = new Map()
  return {
    /** @param {object} geometry `{id, vertices, indices}` */
    put(geometry) {
      if (geometry?.id !== undefined && !geometries.has(geometry.id)) {
        geometries.set(geometry.id, geometry)
      }
    },
    /** @param {Array<object>} list the batch's geometries, once appended */
    drop(list) {
      for (const geometry of list) {
        geometries.delete(geometry.id)
      }
    },
    get size() {
      return geometries.size
    },
    api: {
      GetGeometry(_modelID, geometryExpressID) {
        const entry = geometries.get(geometryExpressID)
        if (entry === undefined) {
          // Never sent (the worker found it degenerate by the builder's own
          // rules), or already appended and cached by the builder.
          return null
        }
        return {
          GetVertexDataSize: () => entry.vertices.length,
          GetIndexDataSize: () => entry.indices.length,
          GetVertexData: () => geometryExpressID,
          GetIndexData: () => geometryExpressID,
        }
      },
      GetVertexArray: (token) => geometries.get(token).vertices,
      GetIndexArray: (token) => geometries.get(token).indices,
    },
  }
}


/**
 * Rebuild FlatMesh-shaped deltas from a batch's columns
 * (`engineStream.js#makeBatchEncoder`). Consecutive placements sharing a
 * parent are grouped into one entry, which changes nothing the builder
 * computes (it only sees `(parent, placement)` pairs). Adapted from #1756's
 * `decodePlacements`, plus the occurrence-path columns.
 *
 * @param {object} placements `{parents, geometryIds, transforms, colors,
 *   pathOffsets?, pathIds?, pathPresent?}`
 * @return {Array<object>}
 */
export function decodePlacements(placements) {
  const {parents, geometryIds, transforms, colors, pathOffsets, pathIds, pathPresent} = placements
  const flatMeshes = []
  let current = null
  for (let i = 0; i < parents.length; i++) {
    const parent = parents[i]
    if (current === null || current.expressID !== parent) {
      current = {expressID: parent, geometries: []}
      flatMeshes.push(current)
    }
    const m = i * MATRIX_ELEMENTS
    const c = i * COLOR_COMPONENTS
    const placed = {
      geometryExpressID: geometryIds[i],
      // A plain Array, not a subarray: the builder reads it positionally
      // (`Matrix4.fromArray`, its coincidence key), and a copy keeps the
      // placement independent of the transferred buffer.
      flatTransformation: Array.from(transforms.subarray(m, m + MATRIX_ELEMENTS)),
    }
    if (!Number.isNaN(colors[c])) {
      // NaN is the encoder's "no colour" (engineStream.js); left unset, the
      // builder applies its DEFAULT_COLOR.
      placed.color = {x: colors[c], y: colors[c + 1], z: colors[c + 2], w: colors[c + 3]}
    }
    if (pathPresent && pathPresent[i] === 1) {
      // Present, and possibly EMPTY: `[]` is a STEP root-level instance, not
      // a missing path (engineStream.js#makeBatchEncoder says why it must
      // survive). A plain Array, as the builder and its consumers expect.
      placed.occurrencePath = Array.from(pathIds.subarray(pathOffsets[i], pathOffsets[i + 1]))
    }
    current.geometries.push(placed)
  }
  return flatMeshes
}


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
 * The IfcAPI-shaped facade a worker load assembles against (see the file
 * header). `summary` is filled by the `done` packet; nothing reads it
 * before then, because the reads it serves all come after the build.
 *
 * @param {object} store from {@link makeGeometryStore}
 * @return {object}
 */
export function makeEngineIfcApi(store) {
  const facade = {
    // The session this model's engine lives in. `Loader.js` and
    // `ShareIfc#dispose` key off it (no GLB write in this step; close on
    // teardown).
    engineSession: null,
    summary: null,
    get properties() {
      return facade.engineSession?.propertiesApi
    },
    ...store.api,
    // Async on the engine, so callers already await it.
    GetCoordinationMatrix: () => Promise.resolve(facade.summary?.coordinationMatrix),
    // The two load-end releases (§2.1 rows 30, 31), as fire-and-forget
    // messages: CadView drops the entity cache after its load-time reads,
    // and Loader.js the native geometry once the scene is built. Without
    // them the worker kept both for the life of the session (review on
    // #2058).
    IsModelOpen: () => facade.engineSession !== null && !facade.engineSession.closed,
    ReleaseEntityCache: () => {
      facade.engineSession?.request(Op.RELEASE, {entityCache: true}).catch(() => null)
    },
    ReleaseModelGeometry: () => {
      facade.engineSession?.request(Op.RELEASE, {geometry: true}).catch(() => null)
      return true
    },
    GetAppliedCoordinationMatrix: () => facade.summary?.appliedCoordination,
    getStatistics: () => statisticsView(facade.summary?.statistics),
    getConwayVersion: () => facade.engineSession?.info?.conwayVersion,
  }
  // Present only when the engine reported one, as the method is on an
  // engine that has it: `ShareIfcLoader#parse` feature-detects it with
  // `typeof`, and an always-present one would print `units=undefined m`.
  Object.defineProperty(facade, 'GetLinearScalingFactor', {
    get: () => (typeof facade.summary?.linearScalingFactor === 'number' ?
      () => facade.summary.linearScalingFactor : undefined),
  })
  return facade
}


/**
 * Prepare a worker-engine load. Returns the facade at once, so the caller
 * can close its builder callbacks over it before the parse starts, the way
 * `ShareIfcLoader#parse` closes over `this.ifcManager.ifcAPI` today.
 *
 * @param {object} [options]
 * @param {'ifc'|'step'|null} [options.format] from {@link engineFormatOf}:
 *   what the file's SUFFIX names, so a label only (see the file header);
 *   null when the caller did not say
 * @param {function(): Promise<object>} [options.spawn] for tests
 * @return {{ifcAPI: object, parse: Function}}
 */
export function createEngineModelLoad({format = null, spawn = spawnEngineSession} = {}) {
  const store = makeGeometryStore()
  const ifcAPI = makeEngineIfcApi(store)

  /**
   * The worker-engine twin of `parseIfcWithConway`, with the same callback
   * shapes.
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
    const session = await spawn()
    ifcAPI.engineSession = session
    reportEngineVersion(session.info?.conwayVersion)

    let deliveredGeometries = 0
    session.on(Ev.PROGRESS, (msg) => onProgress?.(msg.event))
    session.on(Ev.MODEL_INFO, (msg) => onProgress?.({modelInfo: msg.info}))
    session.on(Ev.LOG, (msg) => reportEngineLog(msg))
    session.on(Ev.PREVIEW, (msg) => onPreviewMesh?.(msg.payload))
    // `window.__bldrsTestHoldMidPump` (conwayDirectIfcLoader.js
    // #holdMidPumpForTest): awaited after every batch, with durable geometry
    // on screen and the load not finished (streamingBatchPick.spec.ts). The
    // engine is stepped one batch at a time while the hook is installed.
    const holdMidPump = typeof globalThis.__bldrsTestHoldMidPump === 'function' ?
      globalThis.__bldrsTestHoldMidPump : null
    session.on(Ev.BATCH, (msg) => {
      for (const geometry of msg.geometries) {
        store.put(geometry)
      }
      deliveredGeometries += msg.geometries.length
      try {
        // `session.modelID`, set by the `indexed` event, which the engine
        // posts before its first batch; the `open` reply can arrive after the
        // first batches (the pump starts before the reply is sent).
        onMeshBatch?.(decodePlacements(msg.placements), session.modelID, msg.progress ?? {})
      } finally {
        store.drop(msg.geometries)
      }
      // The mid-pump test hold: the engine was stepped to this one batch and
      // has paused itself; it steps on to the next when the test lets it.
      if (holdMidPump !== null) {
        Promise.resolve(holdMidPump()).then(() => session.pump('step')).catch(() => null)
      }
    })
    // `done` or `failed`, whichever ends the stream. Open failures are
    // answered by `open` itself (below), so only what comes after the index
    // ends up here.
    const finished = new Promise((resolve, reject) => {
      session.on(Ev.DONE, (msg) => resolve(msg.summary))
      session.on(Ev.FAILED, (msg) => {
        if (msg.kind !== 'openFailure' && msg.kind !== 'refusedSchema') {
          reject(engineLoadError(msg))
        }
      })
    })
    // Handled where it is awaited; this keeps an early rejection (a crash
    // during the open) from surfacing as unhandled meanwhile.
    finished.catch(() => null)

    // The same two test seams as conwayDirectIfcLoader.js, absent in
    // production (property reads):
    //   - `window.__bldrsTestHoldIndex` (#holdIndexForTest): hold between the
    //     parse and the index being published, with only previews on screen
    //     (previewInteraction.spec.ts);
    //   - `window.__bldrsTestHoldGeometryPump` (#holdGeometryPumpForTest):
    //     hold between the index and the first batch (navTreeAtIndex.spec.ts);
    //   - `window.__bldrsTestHoldMidPump` (above): hold after each batch.
    // Here the engine starts PAUSED when any is set, and is let go once
    // both have resolved: pausing after the index would race the worker's
    // first batch.
    const holdIndex = typeof globalThis.__bldrsTestHoldIndex === 'function' ?
      globalThis.__bldrsTestHoldIndex : null
    const holdPump = typeof globalThis.__bldrsTestHoldGeometryPump === 'function' ?
      globalThis.__bldrsTestHoldGeometryPump : null
    const startPaused = holdIndex !== null || holdPump !== null || holdMidPump !== null
    // In this order: the failure's header and size first, because opening
    // transfers (detaches) a bytes source.
    const failureSource = openFailureSource(buffer)
    const source = sourceFor(buffer)
    let opened
    try {
      opened = await session.open(source,
        {format, stream: {
          previews: Boolean(onPreviewMesh), startPaused, batchSize: testPumpBatchSize(),
          // The worker's conway is its own; the page's seam reaches it here
          // (pumpTestSeams.js#testStepPreviewFinishParse).
          previewFinishParse: testStepPreviewFinishParse(),
        }})
    } catch (e) {
      session.close()
      const failure = e.engineFailure
      if (failure) {
        throw await openModelFailure(failure.code, failureSource, failure.refusedSchema, failure.openFailure)
      }
      throw e
    }
    const modelID = opened.modelID
    if (holdIndex !== null) {
      await holdIndex()
    }
    if (onIndexed) {
      // Started, not awaited, as in parseIfcWithConway (#2037).
      try {
        Promise.resolve(onIndexed(modelID)).catch(warnIndexFailure)
      } catch (e) {
        warnIndexFailure(e)
      }
    }
    if (holdPump !== null) {
      await holdPump()
    }
    if (startPaused) {
      // Held mid-pump: one batch, then the engine pauses itself and the
      // BATCH handler above waits on the hold.
      await session.pump(holdMidPump !== null ? 'step' : 'run')
    }
    try {
      ifcAPI.summary = await finished
    } catch (e) {
      session.close()
      throw e
    }
    reportSourceInfo(sourceIoLine(ifcAPI.summary.source))
    reportSourceInfo(indexLine(ifcAPI.summary.index))
    // The integration-boundary line conwayDirectIfcLoader prints for the
    // main-thread pump (Share#1744), for a worker load. Named differently on
    // purpose: E2E specs tell the two engines apart by which line appears.
    const done = ifcAPI.summary
    // `format` is what the suffix named (part21Formats.js), said as such: the
    // bytes may be the other schema, and conway opened whatever they are.
    conwayDirectInfo(`engine worker pump: format=${done.format ?? format ?? 'unknown'} (by suffix) ` +
      `batches=${done.batches} meshes=${done.meshes} ` +
      `geometries=${done.geometries} windowed=${done.windowed ? 'yes' : 'no'}`)
    if (done.meshes === 0) {
      conwayDirectWarn('engine worker pump produced no meshes; the model has nothing to draw')
    }
    // The degraded end-of-load builds in ShareIfcLoader#parse read the whole
    // stream back through `recapture`. Here the engine re-emits a one-shot
    // stream as batches itself (engineHandler.js#oneShotFallback), so every
    // mesh it had has already gone to `onMeshBatch`. When no drawable shape
    // was delivered (no products, or every one degenerate) empty IS the
    // stream, and the model opens empty with the "nothing to draw" verdict,
    // as it does on the main thread. When shapes were delivered and a
    // fallback still asks, building from nothing would hide the failure, so
    // it refuses (ShareIfcLoader#parse throws the builder's own error first).
    const recapture = () => (deliveredGeometries > 0 ?
      Promise.reject(new Error('engine worker load: the stream is not retained; ' +
        'the incremental build is the only build')) :
      Promise.resolve([]))
    return {modelID, recapture, summary: ifcAPI.summary}
  }

  return {ifcAPI, parse}
}


/**
 * The `open` source. Which kind a load sends is decided upstream, by the
 * Loader's header sniff (Loader.js#canOpenFromStore), not by the format
 * tag: a part-21 file conway can open from a store arrives as a File and
 * opens windowed, whatever its suffix says; anything else (not staged in
 * OPFS, not a format the store open takes) arrives as bytes.
 *
 * Bytes are TRANSFERRED as they are, not copied first (EngineSession.js
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
 * @param {object} msg a `failed` event
 * @return {Error} the message verbatim, so `isOutOfMemoryError` and the
 *   load report classify a worker's failure as they would a main-thread one
 */
function engineLoadError(msg) {
  const error = new Error(msg.message ?? `engine worker load failed (${msg.kind})`)
  if (msg.name) {
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


/**
 * Was this model parsed by a worker engine? For the few legacy consumers
 * that reach for a main-thread engine directly and must refuse clearly
 * rather than read nothing (the `?feature=bot` eval, engine-worker.md §8
 * item 7).
 *
 * @param {object|null|undefined} model
 * @return {boolean}
 */
export function isWorkerEngineModel(model) {
  return Boolean(model?.ifcManager?.ifcAPI?.engineSession)
}


/** What `?view=` says on a worker-engine model (CadView). */
export const LEGACY_VIEW_RULES_MESSAGE =
  'View rules (?view=) need the main-thread engine and are not available with ?feature=engineWorker'


/**
 * Does the URL ask for a legacy `?view=` rule set that ShareViewer knows
 * (`viewer/legacyViewRules.js`, anything but `default`)? An unknown name
 * already does nothing, with or without the flag, so it gets no message.
 *
 * @param {string} [search] `location.search`
 * @return {boolean}
 */
export function hasLegacyViewRules(search = globalThis.location?.search ?? '') {
  const view = new URLSearchParams(search).get('view')?.toLowerCase()
  return Boolean(view) && view !== 'default' && Object.hasOwn(viewRules, view)
}


/* eslint-disable no-magic-numbers */
const MIB = 1024 * 1024
const MS_PER_S = 1000
/* eslint-enable no-magic-numbers */


/**
 * The load report's line for where the engine's index came from (§7 step
 * 8): a persisted sidecar (no parse), or the parse, and whether that parse
 * saved one for the next open. Absent when the open could not use one (a
 * buffered source, no OPFS entry, the kill switch).
 *
 * @param {object|undefined} index the `done` packet's `index`
 * @return {string|undefined}
 */
export function indexLine(index) {
  if (!index) {
    return undefined
  }
  const size = `${(index.bytes / MIB).toFixed(1)} MB`
  if (index.source === 'sidecar') {
    return `Engine index: from sidecar (${size}), no parse`
  }
  const refused = index.source === 'sidecarRejected' ? 'sidecar refused, ' : ''
  const saved = index.saved ? `sidecar saved (${size})` : 'no sidecar saved'
  return `Engine index: ${refused}parsed; ${saved}`
}


/**
 * The load report's line for how the engine read its source (§7 step 4):
 * through an OPFS sync access handle, or the Blob store and why.
 *
 * @param {object|undefined} source the `done` packet's `source`
 * @return {string|undefined}
 */
export function sourceIoLine(source) {
  if (!source || source.kind === 'resident') {
    return undefined
  }
  const via = source.kind === 'syncHandle' ?
    'OPFS sync access handle' :
    `Blob store${source.fallbackReason ? ` (${source.fallbackReason})` : ''}`
  return `Engine source I/O: ${via}, ${source.reads} reads, ` +
    `${(source.bytes / MIB).toFixed(1)} MB, ${(source.ms / MS_PER_S).toFixed(2)}s`
}
