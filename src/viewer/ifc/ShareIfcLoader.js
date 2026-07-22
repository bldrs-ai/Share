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

import {Box3, Group, MathUtils, Mesh, Sphere} from 'three'
import {buildBatchedConwayModel} from './buildBatchedConwayModel'
import {buildConwayIfcModel} from './buildConwayIfcModel'
import {decorateConwayDirectIfcModel, parseIfcWithConway} from './conwayDirectIfcLoader'
import {flatMeshToBufferGeometry} from './flatMeshToBufferGeometry'
import {flatMeshToInstancedModel} from './flatMeshToInstancedModel'
import {payloadToPreviewMesh} from './parsePreviewMesh'
import {isOutOfMemoryError} from '../../utils/oom'
import {isFeatureEnabled} from '../../FeatureFlags'
import {runIfcItemsMapParityCheck} from './ifcItemsMapParity'
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
 * @param {Array} captured FlatMeshes captured during the parse
 * @param {boolean} [force] log at info level regardless of verbosity
 */
function logInstancedModelStats(ifcAPI, modelID, captured, force = false) {
  if (!force && !isLogEnabled(DEBUG)) {
    return
  }
  try {
    const {stats} = flatMeshToInstancedModel(captured, ifcAPI, modelID)
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
 * @property {Function} GetCoordinationMatrix Get the coord matrix.
 * @property {Function} getStatistics Per-load load statistics.
 * @property {Function} getConwayVersion Conway engine version string.
 * @property {object} properties Conway properties namespace.
 */


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
    if (ifc.context.items.ifcModels.length !== 0) {
      throw new Error('Model cannot be loaded.  A model is already present')
    }
    // Camera follow for the demand preview. Does NOT go through
    // ifc.context.fitToFrame(): that frames scene.children[last]
    // (#1561), which is only accidentally the preview group — when it
    // isn't, every "fit" targets something else (geometry grows
    // offscreen and the camera never visibly moves). The follower
    // frames the preview group EXPLICITLY with camera-controls
    // fitToSphere: the first fit is instant (get eyes on the first
    // geometry immediately), later fits tween, and the cadence grows
    // exponentially from 250ms to 1s so the early burst tracks tightly
    // without churning all load long. Stops forever the moment the
    // user takes the camera (never fight input) or the load finishes.
    const CAMERA_FOLLOW_MIN_MS = 250
    const CAMERA_FOLLOW_MAX_MS = 1000
    const CAMERA_FOLLOW_GROWTH = 1.5
    const FRAMING_MARGIN = 1.5
    let cameraFollowTarget = null
    let previewGeometryDirty = false
    let cameraFollowStopped = false
    let cameraFollowTimer = null
    let cameraFollowDelayMs = CAMERA_FOLLOW_MIN_MS
    let followedControls = null
    const stopCameraFollow = () => {
      cameraFollowStopped = true
      if (cameraFollowTimer !== null) {
        clearTimeout(cameraFollowTimer)
        cameraFollowTimer = null
      }
      try {
        followedControls?.removeEventListener?.('controlstart', stopCameraFollow)
      } catch {
        // best-effort
      }
      followedControls = null
    }
    const fitPreviewToFrame = (withTransition) => {
      const controls = ifc.context?.ifcCamera?.cameraControls
      const camera = ifc.context?.ifcCamera?.perspectiveCamera
      if (!controls || !camera || cameraFollowTarget === null) {
        return
      }
      const box = new Box3().setFromObject(cameraFollowTarget)
      if (box.isEmpty()) {
        return
      }
      const sphere = new Sphere()
      box.getBoundingSphere(sphere)
      if (!(sphere.radius > 0) || !Number.isFinite(sphere.radius)) {
        return
      }
      sphere.radius *= FRAMING_MARGIN
      // Keep the whole zoom range inside the frustum as the model
      // grows, but only push the planes OUT (monotonic) so successive
      // refits never pop the projection.
      const HALF = 0.5
      const vFov = MathUtils.degToRad(camera.fov)
      const hFov = Math.atan(Math.tan(vFov * HALF) * camera.aspect) * 2
      const limitingFov = camera.aspect > 1 ? vFov : hFov
      const fitDistance = sphere.radius / Math.sin(limitingFov * HALF)
      const wantFar = (fitDistance + sphere.radius) * 4
      if (camera.far < wantFar) {
        camera.far = wantFar
        camera.updateProjectionMatrix()
      }
      controls.fitToSphere(sphere, withTransition)
    }
    const followTick = () => {
      cameraFollowTimer = null
      if (cameraFollowStopped) {
        return
      }
      if (previewGeometryDirty) {
        previewGeometryDirty = false
        try {
          fitPreviewToFrame(true)
        } catch (e) {
          debug(WARN).warn('camera follow refit failed:', e)
        }
      }
      cameraFollowDelayMs =
        Math.min(cameraFollowDelayMs * CAMERA_FOLLOW_GROWTH, CAMERA_FOLLOW_MAX_MS)
      cameraFollowTimer = setTimeout(followTick, cameraFollowDelayMs)
    }
    const startCameraFollow = (target) => {
      if (cameraFollowStopped || cameraFollowTimer !== null) {
        return
      }
      cameraFollowTarget = target
      try {
        followedControls = ifc.context?.ifcCamera?.cameraControls ?? null
        followedControls?.addEventListener?.('controlstart', stopCameraFollow)
      } catch {
        followedControls = null
      }
      // Immediate first frame (no tween — get eyes on it), then the
      // exponentially growing tweened follow-ups.
      try {
        fitPreviewToFrame(false)
      } catch (e) {
        debug(WARN).warn('camera follow initial fit failed:', e)
      }
      cameraFollowDelayMs = CAMERA_FOLLOW_MIN_MS
      cameraFollowTimer = setTimeout(followTick, cameraFollowDelayMs)
    }

    try {
      if (onProgress) {
        onProgress('Parsing model geometry...')
      }
      const ifcAPI = this.ifcManager.ifcAPI
      // onProgress is threaded into conway's ON_PROGRESS extension so the
      // opaque gap between 'Parsing model geometry...' and 'Building
      // model...' carries real per-phase counts (headerParse / dataParse /
      // geometry — conway #301). Engines without the extension just keep
      // the coarse strings.
      const scene = typeof ifc.context?.getScene === 'function' ?
        ifc.context.getScene() : null

      // Demand/tiled rendering slice A (#1613): while the batch pump
      // runs, stream each batch into a render-only preview group so
      // first pixels arrive right after the parse. The final model is
      // then built exactly as before (full picking/decoration) and the
      // preview is swapped out — identical end state, progressive
      // arrival. Every preview step is best-effort: a preview failure
      // must never break the load (mirrors the batchedMesh guard).
      const demandPreview = scene !== null && isFeatureEnabled('demandGeometry') ?
        new Group() : null
      let previewInstalled = false

      // Slice A2 (parse-time preview channel): conway emits
      // self-contained preview payloads WHILE THE PARSE RUNS — preview
      // quality (openings/materials can be missing), replaced wholesale
      // by the durable batches below. Same group, same frame (payload
      // transforms carry the pinned coordination), best-effort like
      // every other preview step.
      const previewGeometryCache = new Map()
      const previewMaterialCache = new Map()
      let parsePreviewCount = 0

      const onPreviewMesh = demandPreview === null ? undefined : (payload) => {
        try {
          const mesh = payloadToPreviewMesh(payload, previewGeometryCache, previewMaterialCache)
          if (mesh === null) {
            return
          }
          demandPreview.add(mesh)
          previewGeometryDirty = true
          if (!previewInstalled) {
            previewInstalled = true
            scene.add(demandPreview)
          }
          // Frame the very first geometry immediately (inside
          // startCameraFollow), then let the follower keep it framed
          // as the preview grows.
          if (++parsePreviewCount === 1) {
            startCameraFollow(demandPreview)
          }
        } catch (e) {
          debug(WARN).warn('parse preview mesh skipped:', e)
        }
      }

      const onMeshBatch = demandPreview === null ? undefined : (batch, batchModelID) => {
        try {
          const assembled = flatMeshToBufferGeometry(batch, ifcAPI, batchModelID)
          demandPreview.add(new Mesh(assembled.geometry, assembled.materials))
          previewGeometryDirty = true
          if (!previewInstalled) {
            previewInstalled = true
            scene.add(demandPreview)
            // Placed transforms are already coordinated; stamp the
            // model-level coordination like the final build does, then
            // frame the first batch so the user sees geometry
            // immediately. Async + best-effort by design.
            // eslint-disable-next-line new-cap
            Promise.resolve(ifcAPI.GetCoordinationMatrix(batchModelID))
              .then((matrixArr) => {
                if (demandPreview.matrix &&
                    typeof demandPreview.matrix.fromArray === 'function') {
                  demandPreview.matrix.fromArray(matrixArr)
                  demandPreview.matrixAutoUpdate = false
                }
                startCameraFollow(demandPreview)
              })
              .catch((e) => debug(WARN).warn('demand preview coordination failed:', e))
          }
        } catch (e) {
          debug(WARN).warn('demand preview batch skipped:', e)
        }
      }

      const {modelID, captured} =
        await parseIfcWithConway(buffer, ifcAPI, undefined, onProgress, onMeshBatch, onPreviewMesh)

      if (onProgress) {
        onProgress('Building model...')
      }

      // BatchedMesh render path (`?feature=batchedMesh`, §3b.iv): render the
      // deduped geometry as a THREE.BatchedMesh. Falls back to the merged
      // path on any construction error so the flag can never break a load.
      let ifcModel
      let buildStats
      if (isFeatureEnabled('batchedMesh')) {
        try {
          const batched = buildBatchedConwayModel(captured, ifcAPI, modelID, {scene})
          ifcModel = batched.model
          buildStats = batched.stats
        } catch (e) {
          debug(WARN).warn('batchedMesh build failed; falling back to merged path:', e)
        }
      }
      if (ifcModel === undefined) {
        const merged = buildConwayIfcModel(captured, ifcAPI, modelID)
        ifcModel = merged.mesh
        buildStats = merged.stats
        decorateConwayDirectIfcModel(ifcModel, ifcAPI, modelID, {scene})
      }

      stopCameraFollow()

      // Swap the preview out before the real model installs — dispose
      // per-batch geometry/materials so the preview leaves no residue.
      if (demandPreview !== null && previewInstalled) {
        try {
          scene.remove(demandPreview)
          for (const child of demandPreview.children) {
            child.geometry?.dispose?.()
            const materials = Array.isArray(child.material) ? child.material : [child.material]
            for (const material of materials) {
              material?.dispose?.()
            }
          }
        } catch (e) {
          debug(WARN).warn('demand preview teardown failed:', e)
        }
      }

      ifc.addIfcModel(ifcModel)

      if (onProgress) {
        onProgress('Setting up coordinate system...')
      }
      // eslint-disable-next-line new-cap
      const matrixArr = await ifcAPI.GetCoordinationMatrix(modelID)
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

      if (onProgress) {
        onProgress('Fitting model to frame...')
      }
      ifc.context.fitToFrame()

      if (onProgress) {
        onProgress('Gathering model statistics...')
      }
      // `getStatistics` / `getConwayVersion` are Conway-adapter extensions
      // (Logger-backed); stock web-ifc (the USE_WEBIFC_SHIM=false engine)
      // doesn't expose them. The model mesh is already built + added above,
      // so per-load stats are best-effort diagnostics — skip them when the
      // engine lacks the API rather than letting a missing method throw and
      // discard a successful load. `CadView` already guards on
      // `loadedModel.loadStats` before reading it.
      if (typeof ifcAPI.getStatistics === 'function') {
        const statsApi = ifcAPI.getStatistics(modelID)
        ifcModel.name = statsApi.projectName ?? undefined
        ifcModel.loadStats = {
          loaderVersion: ifcAPI.getConwayVersion?.(),
          geometryMemory: statsApi.getGeometryMemory(),
          geometryTime: statsApi.getGeometryTime(),
          ifcVersion: statsApi.getVersion(),
          loadStatus: statsApi.getLoadStatus(),
          originatingSystem: statsApi.getOriginatingSystem(),
          preprocessorVersion: statsApi.getPreprocessorVersion(),
          parseTime: statsApi.getParseTime(),
          totalTime: statsApi.getTotalTime(),
        }
      }

      if (onProgress) {
        onProgress('Model loaded successfully!')
      }

      // Parallel-run the new IfcItemsMap populators against the live
      // model and log the diff. Diagnostic only — no behavior change.
      // Toggle via `?feature=ifcItemsMapParity`. See
      // design/new/viewer-replacement.md §3b.ii for the per-vertex-vs-
      // per-instance story this check exposes.
      if (isFeatureEnabled('ifcItemsMapParity')) {
        runIfcItemsMapParityCheck(ifcAPI, ifcModel, captured)
      }
      // Instanced-rendering analysis: groups the captured stream by shared
      // `geometryExpressID` and reports the GPU-instancing draw-call +
      // vertex-memory delta. Logged under verbose normally; forced to info
      // level when `?feature=batchedMesh` is on so the eval shows the
      // numbers alongside what just rendered as a BatchedMesh.
      logInstancedModelStats(ifcAPI, modelID, captured, isFeatureEnabled('batchedMesh'))
      // Always-on integration-boundary log. `conwayDirect.spec.ts`
      // (and the deploy-preview smoke checks) gate on `[conwayDirect]
      // parsed modelID=…` firing — it's the single observable signal
      // that the Conway-direct parse + assembly path completed
      // successfully on a real model. Kept at info level (not gated
      // on glbVerbose) so the signal is visible in production logs
      // without the user opting in to the verbose channel.
      // eslint-disable-next-line no-console
      console.info(
        `[conwayDirect] parsed modelID=${modelID} — ` +
        `vertices=${buildStats.vertexCount} triangles=${buildStats.triangleCount} ` +
        `instances=${buildStats.instanceCount} parents=${buildStats.parentCount} ` +
        `materials=${buildStats.materialCount} ` +
        `skippedFlatMeshes=${buildStats.skippedFlatMeshes} ` +
        `skippedPlaced=${buildStats.skippedPlacedGeometries}`)

      return ifcModel
    } catch (err) {
      stopCameraFollow()
      this.ifcLastError = err
      this._ifc.ifcLastError = err
      // Rethrow OOM so callers can present a tailored UX message.
      if (isOutOfMemoryError(err)) {
        err.isOutOfMemory = true // tag for convenience
        throw err
      }
      console.error(err)
      if (onError) {
        onError(err)
      }
      return null
    }
  }
}
