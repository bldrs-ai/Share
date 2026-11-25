// ShareIfcLoader — the IFC loader surface for ShareViewer. Owns the
// Conway-direct `parse(buffer, ...)` entry point that `Loader.js`'s
// `readModel` invokes, plus the `ifcManager` accessor that consumer
// code reads as `viewer.IFC.loader.ifcManager`.
//
// Slice 5d.1 of design/new/viewer-replacement.md Phase 5. Replaces
// the fork's `IFCLoader` (`web-ifc-three`) which used to live at
// `viewer.IFC.loader`. The hot-patched `loader.parse = …` body
// that lived in `Loader.js#newIfcLoader` moves here verbatim; the
// only change from that body is the `this` binding (now this loader)
// and reaching for the IFC manager via the captured `_ifc` ref
// instead of `this.context` / `this.addIfcModel` (which were
// previously fork.IFC properties).
//
// Why a class instead of more hot-patching: the parse method needs the
// viewer's engine, the scene, `addIfcModel`, and `items.ifcModels`. Pre-5d.1
// those were fields on the fork's IFCManager because parse was
// attached to it. Now we own the loader so we hold direct refs.
//
// One parse path for every engine (design/tracks/open-t200/layering.md §7
// "1a"): the load runs over an `Engine` (engine/Engine.js), a WorkerEngine by
// default or the viewer's ConwayEngine on the kill-switch route
// (engine/engineRoute.js), and the parse never asks which. Where the two can
// do different things it asks `engine.capabilities`.

import {Mesh} from 'three'
import {APPLIED_COORDINATION_KEY, validAppliedCoordination} from '../model/appliedCoordination'
import {assembleBatchedModel, buildBatchedConwayModel} from '../model/buildBatchedConwayModel'
import {IncrementalBatchedBuilder} from '../model/incrementalBatchedBuilder'
import {buildConwayIfcModel} from '../model/buildConwayIfcModel'
import {conwayDirectError, conwayDirectInfo, conwayDirectWarn} from '../engine/conwayDirectLog'
import {decorateConwayDirectIfcModel, makeIndexedModelHandle} from '../model/engineModelReads'
import {flatMeshToBufferGeometry} from '../model/flatMeshToBufferGeometry'
import {flatMeshToInstancedModel} from '../model/flatMeshToInstancedModel'
import {payloadToPreviewMesh} from '../model/parsePreviewMesh'
import {isOutOfMemoryError, markIfOutOfMemory} from '../utils/oom'
import {LoadAbortedError, isAborted, isLoadAbortedError, throwIfLoadAborted} from '../utils/loadAbort'
import {hasParams} from '../utils/location'
import {HASH_PREFIX_CAMERA} from '../Components/Camera/hashState'
import {isFeatureEnabled} from '../FeatureFlags'
import {createEngineModelLoad, engineFormatOf} from '../engine/engineModelLoad'
import {reportGeometryStats, reportSourceInfo} from './loadProgress'
import {MainThreadReason, mainThreadEngineNote, mainThreadEngineReason} from '../engine/engineRoute'
import {spawnWorkerEngine} from '../engine/spawnEngine'
import {runIfcItemsMapParityCheck} from '../model/ifcItemsMapParity'
import ProgressiveLoadSession from './ProgressiveLoadSession'
import {beginLoadSelection, endLoadSelection} from '../model/streamingBatchPick'
import debug, {DEBUG, WARN, isLogEnabled} from '../utils/debug'


/**
 * Group the captured FlatMesh stream by shared geometry and log the
 * instancing analysis (draw-call + vertex-memory delta vs. the merged
 * path).
 *
 * Normally the whole grouping is gated on `isLogEnabled(DEBUG)`, not just
 * the print: on a large model it walks every placement (tens of thousands)
 * and re-fetches each unique shape's size across the Conway boundary, so
 * building it on every default-level load — only to drop the result —
 * would be pure waste. There is no feature flag (the grouper is a
 * permanent diagnostic and the foundation the BatchedMesh render path,
 * §3b.iv, builds on); verbosity is the gate. `force` overrides the gate
 * and logs at info level — used when `?feature=batchedMesh` is on so the
 * operator running the eval sees the numbers without raising the log
 * level. Never throws into the load path: a probe failure must not
 * discard a successful parse.
 *
 * @param {object} ifcAPI the load's web-ifc-shaped alias of its engine
 * @param {number} modelID
 * @param {Function} getCaptured async thunk returning the parse's whole
 *   FlatMesh stream. A thunk rather than the array because on the streaming
 *   path (conway#638) producing it costs a whole-model re-extraction, and
 *   that must not be paid by the loads this gate turns away; async because
 *   on a windowed source that re-extraction pages the window through
 *   conway#660's `StreamAllMeshesAsync` (ConwayEngine#recapture).
 * @param {boolean} [force] log at info level regardless of verbosity
 * @return {Promise<void>} resolves once the probe has logged or been gated
 *   away — awaited by the caller only to keep the load log's line order
 *   deterministic, not because anything depends on the result
 */
async function logInstancedModelStats(ifcAPI, modelID, getCaptured, force = false) {
  if (!force && !isLogEnabled(DEBUG)) {
    return
  }
  try {
    const {stats} = flatMeshToInstancedModel(await getCaptured(), ifcAPI, modelID)
    const reduction = stats.vertexReductionRatio.toFixed(2)
    const line =
      `[instancedMeshes] modelID=${modelID} — ` +
      `instances=${stats.instanceCount} ` +
      `uniqueShapes=${stats.uniqueGeometryCount} ` +
      `(shared=${stats.sharedGeometryCount} singleton=${stats.singletonGeometryCount}) ` +
      `→ instancedDrawCalls=${stats.uniqueGeometryCount} (merged path = 1) | ` +
      `verts merged=${stats.mergedVertexCount} instanced=${stats.instancedVertexCount} ` +
      `(reductionRatio=${reduction}) bytesSaved=${stats.estimatedBytesSaved} | ` +
      `mostInstanced: geometry#${stats.topInstancedGeometryID} ×${stats.topInstancedCount}`
    if (force) {
      // eslint-disable-next-line no-console
      console.info(line)
    } else {
      debug(DEBUG).log(line)
    }
  } catch (err) {
    console.warn('[instancedMeshes] probe failed (non-fatal):', err)
  }
}


/**
 * Last-N wire boxes: enough to read as a growing mass, cheap enough
 * that the preview group stays fixed-mem.
 */
export const AABB_IMPOSTER_CAP = 100


/**
 * Whether parse-time spatial imposters (the storey/space AABB plates) are
 * rendered. Off: they are cosmetic, and the last unpolished corner of an
 * otherwise release-ready load path. The real prefix meshes still stream
 * during parse, so first pixels are unaffected.
 */
const SHOW_AABB_IMPOSTERS = false


/**
 * Add an AABB wire cube to the preview, keyed by expressID and
 * ring-tracked for eviction.
 *
 * Placement is NOT this function's business: conway emits imposter
 * `flatTransformation` in the same durable coordination frame as regular
 * preview meshes (metres, Y-up, COORDINATE_TO_ORIGIN-recentred), and
 * `payloadToPreviewMesh` has already applied the shared Share-side
 * `coordination` offset. This used to re-anchor every box by subtracting
 * the first accepted box's translation — an arbitrary anchor that pushed
 * the plates off the durable geometry by (first plate centre − durable
 * anchor), and on near-origin models (where conway's model-zero policy
 * recentres nothing) invented an offset that had not existed. See
 * conway#515's review-findings comment for the frame contract.
 *
 * REPLACE-BY-EXPRESSID (conway#519): the store preview channel emits each
 * spatial node TWICE by design — once early, from a prefix generation
 * seconds into the parse (possibly a coarse Z band with degenerate XY),
 * and again after the parse with full samples and the latched coordination
 * frame. A re-emitted `aabb` payload REPLACES the plate already drawn for
 * that expressID; it must not add a second one, and the replacement takes
 * the old plate's slot rather than consuming a fresh one. Vertex-carrying
 * payloads are unaffected — they are keyed by `geometryExpressID` and
 * never re-sent.
 *
 * The old mesh is only detached, never disposed: the unit-cube geometry
 * and the wire materials are pooled per load in
 * `payloadToPreviewMesh`'s caches, so the replacement is very likely
 * holding the same instances.
 *
 * `ProgressiveLoadSession`'s preview bounds union is grow-only, so a
 * replaced coarse plate's old bounds linger in the camera-fit union until
 * the next refit. Acceptable for preview scenery: it can only over-frame
 * for a moment, and the whole imposter set is torn down at load end.
 *
 * Ring-track only meshes that `addPreviewMesh` actually parented —
 * outlier rejects must not occupy a slot or evict a visible cube. That
 * also means a REJECTED replacement leaves the standing plate for its
 * expressID alone: a refused update must never delete visible scenery.
 *
 * @param {object} mesh three.js Mesh, matrix already stamped
 * @param {object} session ProgressiveLoadSession
 * @param {object} ring `{meshes, byExpressID, cap}`
 * @param {number} [expressID] the payload's expressID — the replace key
 */
export function applyAabbImposter(mesh, session, ring, expressID) {
  session.addPreviewMesh(mesh)
  if (mesh.parent !== session.previewGroup) {
    return
  }
  const keyed = expressID !== undefined && expressID !== null
  const prior = keyed ? ring.byExpressID.get(expressID) : undefined
  if (prior !== undefined) {
    detachImposter_(prior, session)
    // Eviction below deletes the map entry with the mesh, so a mapped
    // mesh is always still in the ring — but take the push fallback
    // rather than corrupting the ring on an index of -1.
    const at = ring.meshes.indexOf(prior)
    if (at === -1) {
      ring.meshes.push(mesh)
    } else {
      ring.meshes[at] = mesh
    }
    ring.byExpressID.set(expressID, mesh)
    return
  }
  if (ring.meshes.length >= ring.cap) {
    const old = ring.meshes.shift()
    if (old !== undefined) {
      detachImposter_(old, session)
      // Reverse lookup by scan: the ring is capped at AABB_IMPOSTER_CAP,
      // so this is a bounded walk on an eviction that only happens once
      // per accepted plate, and it keeps the ring to one map.
      for (const [id, tracked] of ring.byExpressID) {
        if (tracked === old) {
          ring.byExpressID.delete(id)
          break
        }
      }
    }
  }
  ring.meshes.push(mesh)
  if (keyed) {
    ring.byExpressID.set(expressID, mesh)
  }
}


/**
 * Detach one imposter from the preview group. Geometry/materials are
 * pooled per load, so nothing is disposed here.
 *
 * @param {object} mesh
 * @param {object} session ProgressiveLoadSession
 */
function detachImposter_(mesh, session) {
  if (session.previewGroup !== null && session.previewGroup !== undefined) {
    session.previewGroup.remove(mesh)
  }
}


/**
 * Detach every accepted AABB wire cube. Called at the end of the load
 * so none remain once the durable mesh is on screen.
 *
 * @param {object} ring `{meshes, byExpressID, cap}`
 * @param {object} session ProgressiveLoadSession
 */
export function clearAabbImposters(ring, session) {
  const group = session.previewGroup
  for (const mesh of ring.meshes) {
    if (group !== null && group !== undefined) {
      group.remove(mesh)
    }
    mesh.removeFromParent?.()
  }
  ring.meshes.length = 0
  // The replace key map holds a strong ref to every accepted plate —
  // clearing the list alone would keep the whole ring alive past teardown.
  ring.byExpressID.clear()
}


/**
 * Stamp the engine's applied coordination frame onto the model root as
 * `userData[APPLIED_COORDINATION_KEY]`, and hand it back.
 *
 * **The contract itself — what `A` is, how it inverts, how it composes with
 * `userData.coordinationOffset`, and the two clauses consumers get wrong —
 * lives in `../model/appliedCoordination`.** Read that module before changing
 * anything here. What is specific to this call site, and so documented here,
 * is only WHEN the frame may be read.
 *
 * ## Why the read happens at load completion
 *
 * conway's timing contract: a deferred open that adopted its parse-time
 * preview channel's frame reports that adopted frame from the moment the
 * model opens, and the durable walk — the authority — revalidates it against
 * its own first geometry, so **the value can change exactly once**, at the
 * first durable batch, if the adoption is rejected. Read any earlier (at open,
 * or from inside `onMeshBatch`) and the stamp could be the rejected frame.
 * By the time `parse` reaches this call every durable batch has landed, so the
 * value is final for the life of the model.
 *
 * It is also the one point every conway load path converges on — incremental,
 * `?feature=batchedMesh`, and the merged fallback all produce this same
 * `ifcModel` — so a single call covers them all.
 *
 * Best-effort throughout: a missing method, a malformed reply or a throw
 * leaves the model unstamped rather than discarding a successful parse.
 *
 * @param {object} ifcModel the assembled model root (`ifcModel.userData` is
 *   created if the object does not already have one — mocked three.js Mesh
 *   stand-ins in unit tests do not)
 * @param {object} ifcAPI the load's alias of its engine
 * @param {number} modelID
 * @return {?Array<number>} the stamped column-major mat4, or null when the
 *   engine could not answer
 */
export function stampAppliedCoordination(ifcModel, ifcAPI, modelID) {
  if (typeof ifcAPI?.GetAppliedCoordinationMatrix !== 'function') {
    return null
  }
  try {
    // eslint-disable-next-line new-cap
    const applied = ifcAPI.GetAppliedCoordinationMatrix(modelID)
    const frame = validAppliedCoordination(applied)
    if (frame === null) {
      // On the `[conwayDirect]` channel, not `debug()`: this is a designed
      // diagnostic for this pipeline, and warn is the level the load report
      // tees (see `decideCoordinationOffset`'s note on the same channel).
      // Share#1632's lesson was that silent coordination behaviour is what
      // costs the days — an engine answering with a non-frame is exactly that
      // class of problem and must not pass unremarked.
      conwayDirectWarn(
        `appliedCoordination: engine returned a non-mat4 frame ` +
        `(length=${applied?.length}); model left unstamped`)
      return null
    }
    ifcModel.userData = ifcModel.userData ?? {}
    ifcModel.userData[APPLIED_COORDINATION_KEY] = frame
    return frame
  } catch (e) {
    conwayDirectWarn(`appliedCoordination stamp skipped: ${e}`)
    return null
  }
}


const BYTES_PER_KIB = 1024
const BYTES_PER_MIB = BYTES_PER_KIB * BYTES_PER_KIB

/**
 * Does this parse run its engine in a worker (engine-worker.md §7 steps 3, 6
 * and 9)? Every format a Conway engine parses — IFC (and an unwrapped
 * `.ifczip`) and STEP/AP214 — through one worker load
 * (engine/engineModelLoad.js), and only on the streamed path that feeds the
 * incremental builder. Default on; `engine/engineRoute.js` says when a load
 * stays on the main-thread engine instead (the kill switch, the rollback).
 *
 * @param {string|undefined} loaderType `loader.type` (Loader.js#findLoader)
 * @param {object|null} scene
 * @return {boolean}
 */
export function isEngineWorkerLoad(loaderType, scene) {
  return isEngineWorkerCandidate(loaderType, scene) && mainThreadEngineReason() === null
}


/**
 * Could this parse run in a worker at all: a Conway format, streamed into a
 * scene? Only such a load gets an `Engine: main thread (…)` report line when
 * the route keeps it on the main thread; a mesh format or a non-streamed load
 * never had an engine worker to give up.
 *
 * @param {string|undefined} loaderType
 * @param {object|null} scene
 * @return {boolean}
 */
function isEngineWorkerCandidate(loaderType, scene) {
  return isFeatureEnabled('demandGeometry') &&
    scene !== null &&
    engineFormatOf(loaderType) !== null
}


/**
 * IFC loader for ShareViewer. Single entry point: `parse(buffer)`.
 */
export default class ShareIfcLoader {
  /**
   * @param {object} args
   * @param {object} args.engine the viewer's ConwayEngine (`viewer.IFC.engine`):
   *   the make of the engine a load runs on when the route keeps it off a
   *   worker (`forLoad`)
   * @param {object} args.ifc The IFC namespace (`viewer.IFC`) — used
   *   to reach `context.items.ifcModels` (model registry) +
   *   `addIfcModel(model)` (scene-graph install) + the context's
   *   `getScene()` / `fitToFrame()` from inside `parse(...)`.
   * @param {function(): Promise<object>} [args.spawnWorker] spawns a
   *   WorkerEngine for a load the route sends to a worker; for tests
   */
  constructor({engine, ifc, spawnWorker = spawnWorkerEngine}) {
    if (!engine) {
      throw new Error('ShareIfcLoader: engine is required')
    }
    if (!ifc) {
      throw new Error('ShareIfcLoader: ifc namespace is required')
    }
    this._ifc = ifc
    this.engine = engine
    this.spawnWorker = spawnWorker
    // The canonical `ifcLastError` slot lives on the IFC namespace
    // (`viewer.IFC.ifcLastError`) — pre-5d.1 callers read it from
    // there (`Loader.js:404`). We mirror via `_ifc.ifcLastError`
    // writes from within `parse(...)`. Local `this.ifcLastError` is
    // also maintained for callers that hold the loader directly.
    this.ifcLastError = null
    if (this._ifc && this._ifc.ifcLastError === undefined) {
      this._ifc.ifcLastError = null
    }
  }


  /**
   * Conway-direct IFC/STEP parse: the engine's open and pump
   * (engine/engineModelLoad.js), geometry assembly as the batches stream
   * (`IncrementalBatchedBuilder`) or at the end (`buildBatchedConwayModel`,
   * `buildConwayIfcModel`), model decoration, coord matrix + stats.
   *
   * Called by `Loader.js#readModel` as `loader.parse(buffer, onProgress)`
   * when the file extension is `.ifc` / `.ifczip` / `.stp`.
   *
   * @param {ArrayBuffer|Uint8Array} buffer
   * @param {Function} [onProgress] progress callback (string message arg)
   * @param {Function} [onError] error callback. Errors are also stored
   *   on `this.ifcLastError` for ShareViewer to surface as an alert.
   * @param {object} [options]
   * @param {Function} [options.onFirstMesh] open-205 #2043: `() => void`, once
   *   the load's first geometry is on screen (ProgressiveLoadSession). The
   *   caller lifts its loading overlay on it, if the load is still current.
   * @param {Function} [options.onIndexed] open-205 #2029: `async (handle)
   *   => void`, given the model at its index (`makeIndexedModelHandle`)
   *   once the open returns and before geometry streams, so the caller can
   *   bring up the tree, properties and search while the pump runs. Started
   *   beside the pump, not awaited (engineModelLoad.js#parse).
   * @param {AbortSignal} [options.signal] open-205 #2011 step A: the load's
   *   owner gave it up (an in-app switch under `?feature=spaModelNav`,
   *   utils/loadAbort.js). The load's engine is closed at once: a worker is
   *   terminated, and the page's engine stops at its pump's next batch (its
   *   open is one call into the wasm on this thread and cannot be
   *   interrupted). Either way nothing reaches the scene registry after it,
   *   and the parse rejects with a LoadAbortedError instead of returning null.
   * @return {Promise<object|null>} the loaded IfcModel, or null on
   *   handled error (re-throws on OOM so the caller can show a
   *   tailored UX message).
   */
  async parse(buffer, onProgress, onError, {onIndexed, onFirstMesh, signal} = {}) {
    const ifc = this._ifc
    // Clear any error stashed by a prior load on this shared IFC namespace.
    // readModel (Loader.js) reads `viewer.IFC.ifcLastError` to surface the
    // real engine failure when a parse returns falsy, so a stale value (and
    // its sticky `.isOutOfMemory` tag) from an earlier failed load must not
    // leak into this load's error path.
    this.ifcLastError = null
    ifc.ifcLastError = null
    if (ifc.context.items.ifcModels.length !== 0) {
      throw new Error('Model cannot be loaded.  A model is already present')
    }
    throwIfLoadAborted(signal)
    // The progressive-load session owns the format-neutral load
    // instrumentation — demand-preview lifecycle, strict-fit camera
    // follow, and progress/summary reporting. IFC and STEP both route
    // through this parse, so both trigger the same session; format
    // knowledge stays below (payload/batch → mesh conversion).
    const scene = typeof ifc.context?.getScene === 'function' ?
      ifc.context.getScene() : null
    // A `#c:` permalink pins the camera to an exact pose — the user asked
    // for THAT view, not an auto-frame. Suppress the load-time camera
    // follow so streaming geometry can't drag the camera off the pinned
    // pose (the follow's last portrait fit was overriding the permalink on
    // uncached mobile loads, where a desktop cache-hit — which runs no
    // progressive session — showed the permalink correctly). The preview
    // meshes still render; only the camera stays put.
    const frameCamera = !hasParams(HASH_PREFIX_CAMERA)
    const session = new ProgressiveLoadSession({
      scene: scene !== null && isFeatureEnabled('demandGeometry') ? scene : null,
      getControls: () => ifc.context?.ifcCamera?.cameraControls,
      getCamera: () => ifc.context?.ifcCamera?.perspectiveCamera,
      frameCamera,
      onProgress,
      // open-205 #2043: paint on demand while the model streams in, so the
      // render loop doesn't compete with the parse and the pump for the main
      // thread now that the canvas is live from the first preview mesh.
      // `ifc.context` is the legacy IfcContext, which owns the RenderDemand
      // (three/renderDemand.js).
      renderDemand: ifc.context?.renderDemand ?? null,
      onFirstMesh,
    })

    let builder = null
    // The first error the incremental builder hit on a batch, if any.
    let batchError = null
    // The load runs over one Engine of its own, and which is the route's
    // decision: a WorkerEngine (engine-worker.md §7 steps 3, 6 and 9: the
    // default), or a ConwayEngine of the viewer's make (`forLoad`) when the
    // route keeps the load on the main thread (the kill switch, the
    // rollback), or when there is no streamed build for a worker's batches
    // to feed (`demandGeometry` off, no scene). Its own, on either route,
    // because a failed or given-up load closes its engine, and the viewer's
    // must survive that for the next parse into it (an auth retry, CadView's
    // re-run after a failure; ConwayEngine.js says why close is terminal). Everything below is the same code for both: `ifcAPI` is the
    // load's web-ifc-shaped alias of the engine (engine/engineModelLoad.js),
    // and IFC and STEP alike, STEP's occurrence paths arriving on the same
    // placements the builder reads.
    const onWorker = isEngineWorkerLoad(this.type, scene)
    const viewerEngine = this.engine
    const engineLoad = createEngineModelLoad({
      format: engineFormatOf(this.type),
      spawn: onWorker ? this.spawnWorker : async () => {
        const engine = viewerEngine.forLoad()
        await engine.init()
        return engine
      },
    })
    // open-205 #2011 step A, the engine's close path for a load that never
    // registers: a model joins `ifcModels` (which ShareIfc#dispose closes)
    // only at the end of this parse, so an engine given up mid-parse was
    // never closed (#2031). Tracked on the viewer until the parse settles,
    // and closed on the owner's abort.
    const untrackEngineLoad = typeof ifc.trackEngineLoad === 'function' ? ifc.trackEngineLoad(engineLoad) : null
    const abortEngineLoad = signal ? () => engineLoad.abort() : null
    if (abortEngineLoad !== null) {
      signal.addEventListener('abort', abortEngineLoad, {once: true})
    }
    if (!onWorker && isEngineWorkerCandidate(this.type, scene)) {
      // Say in the report and the console why this load runs on the slower
      // main-thread engine, so a kill-switched or rolled-back session reads
      // as deliberate rather than as a lost worker.
      const reason = mainThreadEngineReason()
      if (reason !== MainThreadReason.FLAG_OFF) {
        const note = mainThreadEngineNote(reason)
        conwayDirectInfo(note)
        reportSourceInfo(note)
      }
    }

    // Selections made while this load streams are kept for its builder
    // (streamingBatchPick.js#LOAD_SELECTION_KEY), and dropped in the
    // `finally` below however the load ends.
    beginLoadSelection(scene)
    try {
      session.report('Opening model...')
      const ifcAPI = engineLoad.ifcAPI
      // onProgress is threaded into conway's ON_PROGRESS extension so the
      // opaque gap between 'Parsing model geometry...' and 'Building
      // model...' carries real per-phase counts (headerParse / dataParse /
      // geometry — conway #301). Engines without the extension just keep
      // the coarse strings.
      //
      // Demand/tiled rendering (#1613): the parse-time preview payloads
      // (slice A2) and the durable pump batches (slice A) both stream
      // into the session's preview group — format-specific here is only
      // the conversion to meshes; lifecycle, fitting, and reporting are
      // the session's. Every preview step is best-effort: a preview
      // failure must never break the load.
      const usePreview = session.previewGroup !== null
      const previewGeometryCache = new Map()
      const previewMaterialCache = new Map()
      // One origin-recenter frame for BOTH streaming paths, decided by
      // the durable builder alone; previews read it and render
      // unrecentred until the first durable batch lands. The preview
      // channel is the unreliable half (conway#465 emitted payloads
      // whose placement never resolved), so it must never decide where
      // the durable model renders.
      const coordination = {offset: undefined}
      // Preview units skipped by the two best-effort handlers below. Counted,
      // not reported here: Loader.js#load sends ONE GA event per load, and
      // only once the load succeeded (loader/reportLoadDiagnostics.js).
      let previewUnitsSkipped = 0
      // `byExpressID` is the replace key for spatial imposters: conway's
      // store path emits each spatial node early and again at parse end
      // (conway#519), and the second emission must refine the first plate
      // rather than stack a second one on top of it.
      const aabbRing = {meshes: [], byExpressID: new Map(), cap: AABB_IMPOSTER_CAP}

      const onPreviewMesh = !usePreview ? undefined : (payload) => {
        // A page engine's parse keeps delivering until its pump sees the abort.
        if (isAborted(signal)) {
          return
        }
        try {
          const mesh = payloadToPreviewMesh(
            payload, previewGeometryCache, previewMaterialCache, coordination)
          if (mesh === null) {
            return
          }
          if (payload.aabb) {
            // Spatial imposters are off for this release: the plates are
            // the least-settled part of the preview channel (rotation,
            // scale and banding each took a conway round to get right)
            // and they are cosmetic — the real prefix meshes below give
            // first pixels on their own. Dropping the payload rather
            // than asking conway not to emit it keeps the engine
            // contract unchanged, so flipping this back is one constant.
            if (!SHOW_AABB_IMPOSTERS) {
              return
            }
            applyAabbImposter(mesh, session, aabbRing, payload.expressID)
            return
          }
          session.addPreviewMesh(mesh)
        } catch (e) {
          previewUnitsSkipped++
          debug(WARN).warn('parse preview mesh skipped:', e)
        }
      }

      // Slice B1: pump deltas assemble the DURABLE BatchedMesh model
      // incrementally — the on-screen group IS the final model, so
      // there is no monolithic end-of-load build and no swap. Falls
      // back to the render-only preview mesh (and the end-of-load
      // builds below) on any builder failure.
      const onMeshBatch = !usePreview ? undefined : (batch, batchModelID, progress) => {
        if (isAborted(signal)) {
          return
        }
        try {
          if (builder === null) {
            builder = new IncrementalBatchedBuilder(ifcAPI, batchModelID, {
              onBounds: (box) => session.notifyBounds(box),
              coordination,
            })
            scene.add(builder.root)
          }
          // Before appendBatch: the builder sizes its BatchedMesh buffers
          // from how far through the model the pump is, and the batch
          // about to be appended is the one that may trigger that sizing
          // (Share#1809). Fed unguarded — `setPumpProgress` ignores
          // anything non-finite, which is what a pre-total first batch or
          // an engine without the pump hands over.
          builder.setPumpProgress(progress?.done, progress?.total)
          builder.appendBatch(batch)
        } catch (e) {
          // Kept for a worker load, which cannot rebuild without the
          // builder: if no batch ever got in, THIS is why (below).
          batchError = batchError ?? e
          debug(WARN).warn('incremental batch append failed; preview fallback:', e)
          try {
            const assembled =
              flatMeshToBufferGeometry(batch, ifcAPI, batchModelID, {coordination})
            session.addPreviewMesh(new Mesh(assembled.geometry, assembled.materials))
          } catch (previewError) {
            previewUnitsSkipped++
            debug(WARN).warn('demand preview batch skipped:', previewError)
          }
        }
      }

      // `recapture()` is what the degraded builds below read. On the
      // streaming path no engine keeps a copy of the FlatMesh stream —
      // `onMeshBatch` above already assembled each batch into the durable
      // model — so the page's engine re-extracts at the moment of failure
      // rather than the load holding 475 MB against the chance of one
      // (conway#638), and a worker, which cannot, refuses
      // (engineModelLoad.js#parse). `canRecapture` says which this load has.
      //
      // ALWAYS AWAIT IT. The accessor returns a Promise on every path
      // (ConwayEngine#recapture explains why it is uniform rather than a
      // union): on a windowed source the re-extraction pages the byte window,
      // so it cannot be synchronous, and a missed `await` would feed a Promise
      // to a builder that iterates placements — an empty model, silently.
      const onModelIndexed = onIndexed ?
        () => onIndexed(makeIndexedModelHandle(engineLoad.engine, ifcAPI)) :
        undefined
      const {modelID, recapture} =
        await engineLoad.parse(buffer, {onProgress, onMeshBatch, onPreviewMesh, onIndexed: onModelIndexed})
      const engine = engineLoad.engine
      const canRecapture = engine.capabilities?.recapture === true
      // A parse that resolved after its abort (the abort landed on its last
      // await) is dropped here, before anything is assembled or registered.
      throwIfLoadAborted(signal)

      session.beginAssembly()

      let ifcModel
      let buildStats

      // Slice B1: the incrementally assembled batches only need
      // decoration — the group already on screen becomes the durable
      // model. Fallback on any error: remove the partial group and run
      // the end-of-load builds below off `recapture()` as before.
      if (builder !== null && builder.hasContent()) {
        try {
          const incremental = builder.finalize()
          ifcModel = assembleBatchedModel(
            incremental.batches, ifcAPI, modelID, {scene, root: builder.root, engine})
          buildStats = incremental.stats
        } catch (e) {
          debug(WARN).warn('incremental assembly failed; end-of-load fallback:', e)
          try {
            scene.remove(builder.root)
          } catch {
            // best-effort
          }
          ifcModel = undefined
          if (!canRecapture) {
            // An engine that cannot recapture (a worker: it sent each shape
            // once and the builder held the only copy) leaves the fallbacks
            // below nothing to build: fail the load with THIS error, which
            // says what broke, rather than with recapture()'s (review on #2058).
            throw new Error(`engine worker load: incremental assembly failed: ${e?.message ?? e}`, {cause: e})
          }
        }
      }

      if (ifcModel === undefined && !canRecapture && batchError !== null) {
        // A load whose builder never got a batch in (its constructor,
        // scene.add or appendBatch failed every time) and whose engine cannot
        // recapture has nothing to rebuild from either: fail with that error,
        // not recapture()'s (review on #2058).
        throw new Error(`engine worker load: incremental build failed: ${batchError?.message ?? batchError}`,
          {cause: batchError})
      }

      // BatchedMesh render path (`?feature=batchedMesh`, §3b.iv): render the
      // deduped geometry as a THREE.BatchedMesh. Falls back to the merged
      // path on any construction error so the flag can never break a load.
      if (ifcModel === undefined && isFeatureEnabled('batchedMesh')) {
        try {
          const batched =
            buildBatchedConwayModel(await recapture(), ifcAPI, modelID, {scene, coordination, engine})
          ifcModel = batched.model
          buildStats = batched.stats
        } catch (e) {
          debug(WARN).warn('batchedMesh build failed; falling back to merged path:', e)
        }
      }
      if (ifcModel === undefined) {
        const merged =
          buildConwayIfcModel(await recapture(), ifcAPI, modelID, {coordination})
        ifcModel = merged.mesh
        buildStats = merged.stats
        decorateConwayDirectIfcModel(ifcModel, engine, ifcAPI, modelID, {scene})
      }

      // Drop parse-time imposters before the durable model installs.
      // finish() also scene-walks leftover aabb wire cubes.
      clearAabbImposters(aabbRing, session)
      session.finish()

      // The engine frame, stamped once for every conway load path (incremental
      // / batchedMesh / merged all converge on this `ifcModel`) and before the
      // model is installed, so nothing can observe a model without it. Read
      // here and not earlier: the value is only final once the durable walk
      // has run — see stampAppliedCoordination for the timing contract, the
      // inverse, and how it composes with `userData.coordinationOffset`.
      stampAppliedCoordination(ifcModel, ifcAPI, modelID)

      // The fallback builds above await a recapture.
      throwIfLoadAborted(signal)
      ifc.addIfcModel(ifcModel)

      // eslint-disable-next-line new-cap
      const matrixArr = await ifcAPI.GetCoordinationMatrix(modelID)
      // NOT the engine's applied frame — conway keeps this CLASSIC web-ifc
      // surface at identity precisely because consumers stamp it onto the
      // model transform, and a non-identity value would apply the recentre a
      // second time on top of placements that already carry it. The applied
      // frame is `userData.appliedCoordination`, stamped above.
      //
      // Apply the coordination matrix to the model directly. Wit-three's
      // `setupCoordinationMatrix` set this on the model + told the
      // IFCParser to re-apply on every subsequent mesh; with Conway-
      // direct there's no IFCParser, so a one-shot apply is enough
      // and the matrix can be stamped onto the Mesh's transform.
      //
      // Optional-chained for test resilience — `jest.mock('three')`
      // mocked Mesh instances don't have a real `Matrix4` for
      // `ifcModel.matrix`. Real three.js Mesh always does.
      if (ifcModel.matrix && typeof ifcModel.matrix.fromArray === 'function') {
        ifcModel.matrix.fromArray(matrixArr)
        ifcModel.matrixAutoUpdate = false
      }

      // Framing the freshly loaded model is the cross-format caller's job
      // (CadView, right after it adds the model to the scene): it applies a
      // `#c:` permalink pose when the URL carries one, and only auto-frames
      // otherwise. A loader-local `fitToFrame()` here fought that — it ran
      // unconditionally, so on the IFC/STEP path a permalink camera got
      // overwritten by the auto-fit (the mobile "camera way off" bug),
      // while other formats framed correctly through CadView alone. Keep
      // scene/camera management uniform across formats: no format-specific
      // fit lives in the loader.

      // `getStatistics` / `getConwayVersion` are Conway extensions to the
      // web-ifc-shaped API (Logger-backed), not part of web-ifc's own
      // surface, so the guard keeps an engine or mock without them from
      // failing the load. The model mesh is already built + added above,
      // so per-load stats are best-effort diagnostics — skip them when the
      // engine lacks the API rather than letting a missing method throw and
      // discard a successful load. `CadView` already guards on
      // `loadedModel.loadStats` before reading it.
      //
      // The counts that tell "the file has nothing to draw" from "the engine
      // failed" ride to the load reporter beside the vertex counts below
      // (classifyLoadOutcome, Share#1962), so they are collected here, where
      // the statistics object is already in hand, and stay empty when there
      // is none.
      let emptinessCounts = {}
      if (typeof ifcAPI.getStatistics === 'function') {
        const statsApi = ifcAPI.getStatistics(modelID)
        const geometryMemory = statsApi.getGeometryMemory()
        const totalTime = statsApi.getTotalTime()
        // On conway's Statistics from 1.1626.740 (conway#740); they flow to GA
        // as the unqualified stats_errorCount / stats_warningCount, beside the
        // page-wide tee's stats_pageErrorCount / stats_pageWarnCount
        // (loadProgress#finishReport). The optional chain stays for older
        // engines (pre-#740 conway) and the Jest mocks,
        // where `loadStats` simply omits them.
        const errorCount = statsApi.getErrorCount?.()
        const warningCount = statsApi.getWarningCount?.()
        // On the Statistics API of the pinned conway, but the Jest mocks of
        // it (Loader*.test.js) predate the call, hence the optional chain.
        const productCount = statsApi.getProductCount?.()
        // conway#740, same optional chain. Read here, after the build, because
        // the demand pump refreshes the products-with-geometry count as it
        // runs and it is final once the pump has drained. It goes to GA as
        // stats_productsWithGeometryCount (via `loadStats` below, beside
        // stats_productCount; GA derives the partial-load fraction), and with
        // the other counts to the load reporter for the diagnostics event and
        // the no-geometry verdict. `dataDefectCount` is reporter-only: the
        // reporter's own `dataDefectTotal` is what GA already carries. A count
        // the engine did not supply stays absent, because classifyLoadOutcome
        // reads absent as unknown.
        const productsWithGeometryCount = statsApi.getProductsWithGeometryCount?.()
        emptinessCounts = Object.fromEntries(Object.entries({
          productCount,
          productsWithGeometryCount,
          errorCount,
          dataDefectCount: statsApi.getDataDefectCount?.(),
        }).filter(([, count]) => count !== undefined))
        ifcModel.name = statsApi.projectName ?? undefined
        ifcModel.loadStats = {
          loaderVersion: ifcAPI.getConwayVersion?.(),
          geometryMemory,
          geometryTime: statsApi.getGeometryTime(),
          ifcVersion: statsApi.getVersion(),
          loadStatus: statsApi.getLoadStatus(),
          originatingSystem: statsApi.getOriginatingSystem(),
          preprocessorVersion: statsApi.getPreprocessorVersion(),
          parseTime: statsApi.getParseTime(),
          totalTime,
          // No `memoryUsed` here: that GA name is the reporter's end-of-load
          // JS heap in bytes for EVERY format (loadProgress#finishReport, the
          // Total line's "→ N MB heap"). Conway's figure rides alone as
          // `geometryMemory` (binary MB). Aliasing it onto `memoryUsed`, as
          // this block once did, gave one GA metric two units and two meanings,
          // and left the bizdev card guessing which writer ran.
          // Conway's own total is a parse timer, NOT the wall clock. With
          // demand geometry it covers open + parse + demand-prep and excludes
          // download, wasm init, the geometry pump, the batched build and the
          // scene add (ops#28 §4). It used to be published as `loadTime`,
          // overwriting the reporter's wall clock for IFC/STEP only, so the
          // GA metric mixed two definitions. It is `openMs` now, and
          // `loadTime` stays the reporter's (loadAnalytics#buildOutcomeParams).
          openMs: totalTime,
          ...(productCount === undefined ? {} : {productCount}),
          ...(productsWithGeometryCount === undefined ? {} : {productsWithGeometryCount}),
          ...(errorCount === undefined ? {} : {errorCount}),
          ...(warningCount === undefined ? {} : {warningCount}),
        }
      }

      // Model summary onto the report's Total line (replaces the old
      // per-stage stats/coordinate-system lines): mesh shape from the
      // build, units from the feature-detected scaling factor
      // (1 = m, 0.001 = mm).
      try {
        const parts = []
        if (buildStats) {
          parts.push(`vertices=${buildStats.vertexCount ?? buildStats.totalVerts ?? '?'}`)
          parts.push(`triangles=${buildStats.triangleCount ?? buildStats.totalTriangles ?? '?'}`)
          // Same two numbers, structured, for the Sentry diagnostics event's
          // severity: a build that emitted nothing is a model the user
          // cannot see, whatever the warning counts say (ops#27 T0 —
          // loadProgress#classifyLoadOutcome).
          reportGeometryStats({
            vertexCount: buildStats.vertexCount ?? buildStats.totalVerts,
            triangleCount: buildStats.triangleCount ?? buildStats.totalTriangles,
            ...emptinessCounts,
          })
        }
        if (typeof ifcAPI.GetLinearScalingFactor === 'function') {
          // eslint-disable-next-line new-cap
          const metresPerUnit = ifcAPI.GetLinearScalingFactor(modelID)
          const MM = 0.001
          const unitLabel = metresPerUnit === 1 ? 'm' :
            metresPerUnit === MM ? 'mm' : `${metresPerUnit} m`
          parts.push(`units=${unitLabel}`)
        }
        if (typeof ifcAPI.summary?.wasmBytes === 'number') {
          // The report's heap column is this page's JS heap
          // (performance.memory), which does not count the engine's wasm
          // heap, in a worker (engine-worker.md §2.4 G3) or on this page, so
          // say it on the Total line.
          parts.push(`engineWasmMb=${Math.round(ifcAPI.summary.wasmBytes / BYTES_PER_MIB)}`)
        }
        session.setSummary(parts)
      } catch (e) {
        debug(WARN).warn('load summary skipped:', e)
      }


      // Parallel-run the new IfcItemsMap populators against the live
      // model and log the diff. Diagnostic only — no behavior change.
      // Toggle via `?feature=ifcItemsMapParity`. See
      // design/new/viewer-replacement.md §3b.ii for the per-vertex-vs-
      // per-instance story this check exposes.
      //
      // Both this and the instancing analysis below read the WHOLE mesh
      // stream, which the streaming path no longer retains — so they go
      // through `recapture()`, and on a dropped stream that is a real extra
      // whole-model read. Deliberate: they are opt-in diagnostics, the cost
      // lands only on the session that asked for one, and the alternative
      // (reading the empty array) would report zeros that look like a
      // finding. Note that on a live model this second read is exactly the
      // conway-side double-count `IfcItemsMap.js` documents, so treat a
      // parity diff taken this way with that caveat.
      // Neither diagnostic runs on an engine that cannot recapture (a worker
      // sends each geometry once and the builder keeps the only copy), and
      // both are opt-in or verbose-only (engine-worker.md §2.1 rows 11, 12).
      if (isFeatureEnabled('ifcItemsMapParity') && canRecapture) {
        runIfcItemsMapParityCheck(ifcAPI, ifcModel, await recapture())
      }
      // Instanced-rendering analysis: groups the captured stream by shared
      // `geometryExpressID` and reports the GPU-instancing draw-call +
      // vertex-memory delta. Logged under verbose normally; forced to info
      // level when `?feature=batchedMesh` is on so the eval shows the
      // numbers alongside what just rendered as a BatchedMesh. Passed as a
      // thunk so the recapture happens only if the gate inside actually
      // opens.
      if (canRecapture) {
        await logInstancedModelStats(ifcAPI, modelID, recapture, isFeatureEnabled('batchedMesh'))
      }
      // Always-on integration-boundary log. `conwayDirect.spec.ts`
      // (and the deploy-preview smoke checks) gate on `[conwayDirect]
      // parsed modelID=…` firing — it's the single observable signal
      // that the Conway-direct parse + assembly path completed
      // successfully on a real model. Kept at info level (not gated
      // on glbVerbose) so the signal is visible in production logs
      // without the user opting in to the verbose channel. The
      // `[conwayDirect]` tag comes from the channel's console sink, so
      // the browser-visible line is unchanged; under jest the sink
      // buffers it and `Loader.test.js` asserts these counts.
      conwayDirectInfo(
        `parsed modelID=${modelID} — ` +
        `vertices=${buildStats.vertexCount} triangles=${buildStats.triangleCount} ` +
        `instances=${buildStats.instanceCount} parents=${buildStats.parentCount} ` +
        `materials=${buildStats.materialCount} ` +
        `skippedFlatMeshes=${buildStats.skippedFlatMeshes} ` +
        `skippedPlaced=${buildStats.skippedPlacedGeometries} ` +
        `skippedCoincident=${buildStats.skippedCoincidentPlacements ?? 0}`)

      // Read by Loader.js#load after the whole load succeeded.
      ifcModel.previewUnitsSkipped = previewUnitsSkipped
      // Registered above; an abort during the awaits since leaves it to the
      // viewer's dispose, which closes registered models' engines.
      throwIfLoadAborted(signal)
      return ifcModel
    } catch (err) {
      session.abort()
      // A failed load's engine has nothing left to serve: free it now rather
      // than when the viewer goes (Engine.js `close`).
      engineLoad.engine?.close()
      // A partially assembled incremental group must not survive a
      // failed load — remove it (its wasm-side twin is released by the
      // engine's own error paths).
      try {
        if (builder !== null && builder.root.parent) {
          builder.root.parent.remove(builder.root)
        }
      } catch {
        // best-effort
      }
      if (isAborted(signal) || engineLoad.aborted) {
        // Given up, not failed: whatever the abort made the parse throw (a
        // closed session's rejection, most often) is its consequence, not a
        // fault. No ifcLastError and no error line, which the caller would
        // otherwise report as the load's failure.
        throw isLoadAbortedError(err) ? err : new LoadAbortedError()
      }
      this.ifcLastError = err
      this._ifc.ifcLastError = err
      // Rethrow OOM so callers can present a tailored UX message.
      // markIfOutOfMemory tags in place but guards primitive throwables
      // (Emscripten abort() can throw a bare string, and assigning a
      // property to a primitive throws a TypeError in strict mode).
      if (isOutOfMemoryError(err)) {
        throw markIfOutOfMemory(err)
      }
      conwayDirectError(err)
      if (onError) {
        onError(err)
      }
      return null
    } finally {
      endLoadSelection(scene)
      if (abortEngineLoad !== null) {
        signal.removeEventListener('abort', abortEngineLoad)
      }
      untrackEngineLoad?.()
    }
  }
}
