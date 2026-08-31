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
// Why a class instead of more hot-patching: the parse method needs
// `ifcAPI`, the scene, `addIfcModel`, and `items.ifcModels`. Pre-5d.1
// those were fields on the fork's IFCManager because parse was
// attached to it. Now we own the loader so we hold direct refs.

import {Mesh} from 'three'
import {APPLIED_COORDINATION_KEY, validAppliedCoordination} from './appliedCoordination'
import {assembleBatchedModel, buildBatchedConwayModel} from './buildBatchedConwayModel'
import {IncrementalBatchedBuilder} from './incrementalBatchedBuilder'
import {buildConwayIfcModel} from './buildConwayIfcModel'
import {conwayDirectError, conwayDirectInfo, conwayDirectWarn} from './conwayDirectLog'
import {decorateConwayDirectIfcModel, parseIfcWithConway} from './conwayDirectIfcLoader'
import {flatMeshToBufferGeometry} from './flatMeshToBufferGeometry'
import {flatMeshToInstancedModel} from './flatMeshToInstancedModel'
import {payloadToPreviewMesh} from './parsePreviewMesh'
import {isOutOfMemoryError, markIfOutOfMemory} from '../../utils/oom'
import {hasParams} from '../../utils/location'
import {HASH_PREFIX_CAMERA} from '../../Components/Camera/hashState'
import {isFeatureEnabled} from '../../FeatureFlags'
import {reportGeometryStats} from '../../loader/loadProgress'
import {runIfcItemsMapParityCheck} from './ifcItemsMapParity'
import ProgressiveLoadSession from '../ProgressiveLoadSession'
import ShareIfcManager from './ShareIfcManager'
import debug, {DEBUG, WARN, isLogEnabled} from '../../utils/debug'


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
 * @param {object} ifcAPI Conway IfcAPI bound to the model
 * @param {number} modelID
 * @param {Function} getCaptured async thunk returning the parse's whole
 *   FlatMesh stream. A thunk rather than the array because on the streaming
 *   path (conway#638) producing it costs a whole-model re-extraction, and
 *   that must not be paid by the loads this gate turns away; async because
 *   on a windowed source that re-extraction pages the window through
 *   conway#660's `StreamAllMeshesAsync` (see `makeRecapture`).
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
 * @typedef {object} ConwayIfcAPI Conway-compatible IfcAPI handle.
 * @property {Function} OpenModel Open an IFC model from a Uint8Array.
 * @property {Function} StreamAllMeshes Stream FlatMeshes for a modelID.
 * @property {Function} [StreamAllMeshesAsync] conway#660: the async twin,
 *   and the only whole-model ask a windowed deferred model can answer.
 *   Absent on pins predating it — feature-detect, never assume.
 * @property {Function} GetCoordinationMatrix Get the coord matrix.
 * @property {Function} [GetAppliedCoordinationMatrix] conway#702: the frame
 *   the engine ACTUALLY composed into the placements it emitted. Absent on
 *   pins predating it and on stock web-ifc — feature-detect, never assume
 *   (conway's own doc comment says so).
 * @property {Function} getStatistics Per-load load statistics.
 * @property {Function} getConwayVersion Conway engine version string.
 * @property {object} properties Conway properties namespace.
 */


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
 * lives in `./appliedCoordination`.** Read that module before changing
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
 * @param {ConwayIfcAPI} ifcAPI
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


/**
 * IFC loader for ShareViewer. Single entry point: `parse(buffer)`.
 *
 * Holds a `ShareIfcManager` (`this.ifcManager`) — consumer code
 * reads `viewer.IFC.loader.ifcManager.X` to reach IFC accessors.
 */
export default class ShareIfcLoader {
  /**
   * @param {object} args
   * @param {ConwayIfcAPI} args.ifcAPI Conway IfcAPI.
   * @param {object} args.ifc The IFC namespace (`viewer.IFC`) — used
   *   to reach `context.items.ifcModels` (model registry) +
   *   `addIfcModel(model)` (scene-graph install) + the context's
   *   `getScene()` / `fitToFrame()` from inside `parse(...)`.
   */
  constructor({ifcAPI, ifc}) {
    if (!ifcAPI) {
      throw new Error('ShareIfcLoader: ifcAPI is required')
    }
    if (!ifc) {
      throw new Error('ShareIfcLoader: ifc namespace is required')
    }
    this._ifc = ifc
    this.ifcManager = new ShareIfcManager(ifcAPI)
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
   * Conway-direct IFC parse. The whole flow — OpenModel +
   * StreamAllMeshes via `parseIfcWithConway`, geometry assembly via
   * `buildConwayIfcModel`, model decoration via
   * `decorateConwayDirectIfcModel`, coord matrix + stats — lives here.
   *
   * Called by `Loader.js#readModel` as `loader.parse(buffer, onProgress)`
   * when the file extension is `.ifc` / `.ifczip` / `.stp`.
   *
   * @param {ArrayBuffer|Uint8Array} buffer
   * @param {Function} [onProgress] progress callback (string message arg)
   * @param {Function} [onError] error callback. Errors are also stored
   *   on `this.ifcLastError` for ShareViewer to surface as an alert.
   * @return {Promise<object|null>} the loaded IfcModel, or null on
   *   handled error (re-throws on OOM so the caller can show a
   *   tailored UX message).
   */
  async parse(buffer, onProgress, onError) {
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
    })

    let builder = null

    try {
      session.report('Opening model...')
      const ifcAPI = this.ifcManager.ifcAPI
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
      // `byExpressID` is the replace key for spatial imposters: conway's
      // store path emits each spatial node early and again at parse end
      // (conway#519), and the second emission must refine the first plate
      // rather than stack a second one on top of it.
      const aabbRing = {meshes: [], byExpressID: new Map(), cap: AABB_IMPOSTER_CAP}

      const onPreviewMesh = !usePreview ? undefined : (payload) => {
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
          debug(WARN).warn('parse preview mesh skipped:', e)
        }
      }

      // Slice B1: pump deltas assemble the DURABLE BatchedMesh model
      // incrementally — the on-screen group IS the final model, so
      // there is no monolithic end-of-load build and no swap. Falls
      // back to the render-only preview mesh (and the end-of-load
      // builds below) on any builder failure.
      const onMeshBatch = !usePreview ? undefined : (batch, batchModelID, progress) => {
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
          debug(WARN).warn('incremental batch append failed; preview fallback:', e)
          try {
            const assembled =
              flatMeshToBufferGeometry(batch, ifcAPI, batchModelID, {coordination})
            session.addPreviewMesh(new Mesh(assembled.geometry, assembled.materials))
          } catch (previewError) {
            debug(WARN).warn('demand preview batch skipped:', previewError)
          }
        }
      }

      // `recapture()`, not `captured`, is what the degraded builds below
      // read. On the streaming path the parse keeps no copy of the FlatMesh
      // stream — `onMeshBatch` above already assembled each batch into the
      // durable model — so the fallbacks re-extract at the moment of
      // failure rather than the parse holding 475 MB against the chance of
      // one (conway#638). It is the identity where the stream was retained,
      // which after conway#660 is only "no onMeshBatch" plus a windowed open
      // on an engine pin without `StreamAllMeshesAsync`.
      //
      // ALWAYS AWAIT IT. The accessor returns a Promise on every path
      // (`makeRecapture` explains why it is uniform rather than a union):
      // on a windowed source the re-extraction pages the byte window, so it
      // cannot be synchronous, and a missed `await` would feed a Promise to
      // a builder that iterates placements — an empty model, silently.
      const {modelID, recapture} =
        await parseIfcWithConway(buffer, ifcAPI, undefined, onProgress, onMeshBatch, onPreviewMesh)

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
            incremental.batches, ifcAPI, modelID, {scene, root: builder.root})
          buildStats = incremental.stats
        } catch (e) {
          debug(WARN).warn('incremental assembly failed; end-of-load fallback:', e)
          try {
            scene.remove(builder.root)
          } catch {
            // best-effort
          }
          ifcModel = undefined
        }
      }

      // BatchedMesh render path (`?feature=batchedMesh`, §3b.iv): render the
      // deduped geometry as a THREE.BatchedMesh. Falls back to the merged
      // path on any construction error so the flag can never break a load.
      if (ifcModel === undefined && isFeatureEnabled('batchedMesh')) {
        try {
          const batched =
            buildBatchedConwayModel(await recapture(), ifcAPI, modelID, {scene, coordination})
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
        decorateConwayDirectIfcModel(ifcModel, ifcAPI, modelID, {scene})
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

      // `getStatistics` / `getConwayVersion` are Conway-adapter extensions
      // (Logger-backed); stock web-ifc (the USE_WEBIFC_SHIM=false engine)
      // doesn't expose them. The model mesh is already built + added above,
      // so per-load stats are best-effort diagnostics — skip them when the
      // engine lacks the API rather than letting a missing method throw and
      // discard a successful load. `CadView` already guards on
      // `loadedModel.loadStats` before reading it.
      if (typeof ifcAPI.getStatistics === 'function') {
        const statsApi = ifcAPI.getStatistics(modelID)
        const geometryMemory = statsApi.getGeometryMemory()
        const totalTime = statsApi.getTotalTime()
        const errorCount = statsApi.getErrorCount?.()
        const warningCount = statsApi.getWarningCount?.()
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
          // These aliases are the cross-format GA names consumed by bizdev.
          // For IFC/STEP they must describe Conway itself, rather than the
          // browser-wide heap and console tee used as other-format fallbacks.
          memoryUsed: geometryMemory,
          loadTime: totalTime,
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
      if (isFeatureEnabled('ifcItemsMapParity')) {
        runIfcItemsMapParityCheck(ifcAPI, ifcModel, await recapture())
      }
      // Instanced-rendering analysis: groups the captured stream by shared
      // `geometryExpressID` and reports the GPU-instancing draw-call +
      // vertex-memory delta. Logged under verbose normally; forced to info
      // level when `?feature=batchedMesh` is on so the eval shows the
      // numbers alongside what just rendered as a BatchedMesh. Passed as a
      // thunk so the recapture happens only if the gate inside actually
      // opens.
      await logInstancedModelStats(ifcAPI, modelID, recapture, isFeatureEnabled('batchedMesh'))
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

      return ifcModel
    } catch (err) {
      session.abort()
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
    }
  }
}
