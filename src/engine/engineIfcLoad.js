// An IFC load whose engine runs in its own worker (design/new/engine-worker.md
// §7 step 3, `?feature=engineWorker`). The page side of a streamed open:
// what `parseIfcWithConway` does for a main-thread engine, re-expressed over
// an EngineSession so `ShareIfcLoader#parse` keeps one assembly path.
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
import {reportEngineLog, reportEngineVersion} from '../loader/loadProgress'
import {openModelFailure} from '../loader/unsupportedSchema'
import {conwayDirectInfo, conwayDirectWarn} from '../viewer/ifc/conwayDirectLog'
import {viewRules} from '../viewer/legacyViewRules'
import {Ev, Op} from './protocol'
import {spawnEngineSession} from './spawnEngine'


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
 * `decodePlacements`, plus the occurrence-path column.
 *
 * @param {object} placements `{parents, geometryIds, transforms, colors,
 *   pathOffsets?, pathIds?}`
 * @return {Array<object>}
 */
export function decodePlacements(placements) {
  const {parents, geometryIds, transforms, colors, pathOffsets, pathIds} = placements
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
    if (pathOffsets && pathOffsets[i + 1] > pathOffsets[i]) {
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
 * @param {function(): Promise<object>} [options.spawn] for tests
 * @return {{ifcAPI: object, parse: Function}}
 */
export function createEngineIfcLoad({spawn = spawnEngineSession} = {}) {
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
    //     hold between the index and the first batch (navTreeAtIndex.spec.ts).
    // Here the engine starts PAUSED when either is set, and is let go once
    // both have resolved: pausing after the index would race the worker's
    // first batch.
    const holdIndex = typeof globalThis.__bldrsTestHoldIndex === 'function' ?
      globalThis.__bldrsTestHoldIndex : null
    const holdPump = typeof globalThis.__bldrsTestHoldGeometryPump === 'function' ?
      globalThis.__bldrsTestHoldGeometryPump : null
    const startPaused = holdIndex !== null || holdPump !== null
    let opened
    try {
      opened = await session.open(sourceFor(buffer),
        {stream: {previews: Boolean(onPreviewMesh), startPaused}})
    } catch (e) {
      session.close()
      const failure = e.engineFailure
      if (failure) {
        throw await openModelFailure(failure.code, buffer, failure.refusedSchema, failure.openFailure)
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
      await session.pump('run')
    }
    try {
      ifcAPI.summary = await finished
    } catch (e) {
      session.close()
      throw e
    }
    // The integration-boundary line conwayDirectIfcLoader prints for the
    // main-thread pump (Share#1744), for a worker load. Named differently on
    // purpose: E2E specs tell the two engines apart by which line appears.
    const done = ifcAPI.summary
    conwayDirectInfo(`engine worker pump: batches=${done.batches} meshes=${done.meshes} ` +
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
 * @param {Blob|ArrayBuffer|Uint8Array} buffer
 * @return {object} the `open` source: a Blob/File as-is (windowed,
 *   cloned by reference); bytes as a copy, transferred — the caller's buffer
 *   stays intact for whatever reads it after the parse
 */
function sourceFor(buffer) {
  if (typeof buffer?.slice === 'function' && typeof buffer?.size === 'number') {
    return {file: buffer}
  }
  if (ArrayBuffer.isView(buffer)) {
    return {bytes: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)}
  }
  return {bytes: buffer.slice(0)}
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
