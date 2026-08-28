import {Box3, Group, Sphere, Vector3} from 'three'
import {setLoadSummary} from '../loader/loadProgress'
import debug, {WARN} from '../utils/debug'
import {FRAMING_MARGIN, applyCameraLimits, cameraLimitsForSphere} from './three/cameraLimits'
import {ElementBoxes, robustBoundsFromElements} from './three/robustBounds'


/** Session lifecycle states (see class doc). */
export const SessionState = Object.freeze({
  IDLE: 'idle',
  PREVIEWING: 'previewing',
  ASSEMBLING: 'assembling',
  FINISHED: 'finished',
  ABORTED: 'aborted',
})


/** Minimum gap between two follow refits (also the starting cadence). */
const CAMERA_FOLLOW_MIN_MS = 250
/** The cadence cap the exponential growth converges to. */
const CAMERA_FOLLOW_MAX_MS = 1000
/** Per-refit cadence growth factor. */
const CAMERA_FOLLOW_GROWTH = 1.5
/** Box corner count for the sphere-containment test. */
const BOX_CORNERS = 8
/**
 * Refits whose framing sphere barely differs from the one already fitted
 * are skipped — see maybeRefit_. Fraction of the fitted radius.
 */
const REFIT_EPSILON_FRACTION = 0.01
/**
 * How much larger than necessary the framed volume must be before the
 * timer reclaims it. See isOverframed_ — this exists to recover from a
 * stray that inflated the frame, not to track ordinary growth.
 */
const OVERFRAME_FACTOR = 4
/**
 * Preview placements this many times the accumulated preview radius away
 * from its centre are dropped. See isPreviewOutlier_ — this defends the
 * camera follow against a preview channel that mis-places geometry, and
 * the multiple is enormous so that only a broken placement trips it.
 */
const PREVIEW_OUTLIER_FACTOR = 100
/** Accepted previews required before the test has anything to measure. */
const PREVIEW_OUTLIER_WARMUP = 32


/**
 * Format-neutral progressive-load session — the single owner of the
 * "what the user sees and reads while a model loads" instrumentation,
 * shared by every schema the conway loader speaks (IFC and STEP today).
 * The format loaders convert their stream (parse-time preview payloads,
 * durable pump batches) into three.js meshes and TRIGGER this session;
 * the session owns:
 *
 *  - the demand-preview group's scene lifecycle (install on first mesh,
 *    dispose + remove at finish/abort),
 *  - the camera follow: a STRICT fit of everything shown so far, minus
 *    extreme strays. Per-element world boxes accumulate as geometry
 *    streams in, and the fit frames their robust bounds
 *    (`three/robustBounds.js` — the same criterion the end-of-load fit
 *    uses, so the follow and the final frame never disagree). A refit
 *    fires when (and only when) new geometry lands OUTSIDE the volume
 *    the camera currently frames — so existing geometry is never pushed
 *    offscreen between timer beats. The first fit is instant; follow-up
 *    fits tween on a cadence that grows 250ms → 1s; the follow stops
 *    forever the moment the user takes the camera.
 *  - progress reporting: stage labels pass through to the load
 *    reporter, and the model summary lands on the report's Total line.
 *
 * States: idle → previewing (first mesh) → assembling (final build
 * running, follow still live) → finished (preview swapped out) or
 * aborted (load failed; same teardown, error stays with the caller).
 */
export default class ProgressiveLoadSession {
  /**
   * @param {object} args
   * @param {object|null} args.scene three.js scene for the preview
   *   group; null disables the preview/fitting side entirely (reporting
   *   still works).
   * @param {Function} [args.getControls] () => camera-controls instance
   *   (resolved lazily — controls may not exist at construction).
   * @param {Function} [args.getCamera] () => perspective camera.
   * @param {boolean} [args.frameCamera] whether the load-time camera
   *   follow may move the camera. Default true. Pass false when a `#c:`
   *   permalink pins the camera to an exact pose: the preview still
   *   renders, but the follow leaves the camera where the permalink put
   *   it instead of framing the streaming geometry.
   * @param {Function} [args.onProgress] stage-label reporter.
   */
  constructor({scene = null, getControls, getCamera, frameCamera = true, onProgress}) {
    this.state = SessionState.IDLE
    this.scene = scene
    this.getControls = getControls ?? (() => null)
    this.getCamera = getCamera ?? (() => null)
    this.frameCamera = frameCamera
    this.onProgress = onProgress ?? null
    this.previewGroup = scene !== null ? new Group() : null
    this.previewInstalled = false
    // Camera follow state.
    this.followStopped = false
    this.followTimer = null
    this.followedControls = null
    this.followDelayMs = CAMERA_FOLLOW_MIN_MS
    this.lastFitMs = 0
    // Per-element world boxes — what the follow frames (see
    // fitUnionToFrame_). Two stores because they have different
    // lifetimes: the preview group's boxes are rebuilt when its
    // coordination transform is stamped, the streamed ones only append.
    this.previewBoxes = new ElementBoxes()
    this.streamedBoxes = new ElementBoxes()
    this.fittedSphere = null
    this.overflowPending = false
    // Accepted-preview count: the outlier guard's warm-up gate.
    this.previewMeshCount = 0
    this.previewOutliers = 0
    // Bounds-change revision, and the revision the overframe check last
    // ran against: isOverframed_ costs a full robust-bounds pass, so the
    // timer only re-evaluates it after new bounds arrived — not on
    // every quiet 250ms-1s tick of a long parse.
    this.boundsRevision_ = 0
    this.overframeCheckedRevision_ = 0
    // Running union of ACCEPTED preview boxes, for the outlier test.
    // Cheap to maintain (one box expand per mesh) unlike re-deriving
    // robust bounds, which is why the test lives here and not in the fit.
    this.previewUnion = new Box3()
    this.onControlStart = () => this.stopFollow_()
  }


  /**
   * Report a load stage label to the progress reporter.
   *
   * @param {string} label
   */
  report(label) {
    if (this.onProgress) {
      this.onProgress(label)
    }
  }


  /**
   * Put the model summary onto the report's Total line.
   *
   * @param {Array<string>} parts e.g. ['vertices=12', 'units=m']
   */
  setSummary(parts) {
    try {
      if (parts.length > 0) {
        setLoadSummary(parts.join(' '))
      }
    } catch (e) {
      debug(WARN).warn('load summary skipped:', e)
    }
  }


  /**
   * Add one preview mesh (matrix already stamped by the caller). First
   * mesh installs the group and frames it instantly; later meshes refit
   * only when they extend outside the currently framed volume. Never
   * throws — a preview failure must not break the load.
   *
   * @param {object} mesh three.js Mesh
   */
  addPreviewMesh(mesh) {
    if (this.previewGroup === null || this.state === SessionState.FINISHED ||
        this.state === SessionState.ABORTED) {
      return
    }
    try {
      // Computed once here and threaded through growUnion_ — the box
      // derivation (computeBoundingBox + matrix applies) is per-mesh
      // hot-path work a large model repeats thousands of times.
      const box = this.meshWorldBox_(mesh)
      if (this.isPreviewOutlier_(box)) {
        this.previewOutliers++
        if (this.previewOutliers === 1) {
          const centre = box.getCenter(new Vector3())
          console.warn(
            '[progressive] dropping mis-placed preview geometry at ' +
            `(${centre.x.toFixed(1)}, ${centre.y.toFixed(1)}, ${centre.z.toFixed(1)}) — ` +
            'the durable model does not place geometry there')
        }
        return
      }
      this.previewGroup.add(mesh)
      this.previewMeshCount++
      if (!this.previewInstalled) {
        this.previewInstalled = true
        this.scene.add(this.previewGroup)
      }
      if (this.state === SessionState.IDLE) {
        this.state = SessionState.PREVIEWING
      }
      this.growUnion_(box)
      if (this.fittedSphere === null) {
        this.startFollow_()
      } else {
        this.maybeRefit_()
      }
    } catch (e) {
      debug(WARN).warn('preview mesh skipped:', e)
    }
  }


  /**
   * Track world-space bounds for geometry the caller renders OUTSIDE
   * the preview group (slice B1: the incremental durable batches).
   * Same strict-fit semantics as addPreviewMesh — grow the union,
   * refit on overflow — without the group membership.
   *
   * @param {Box3} box world-space bounds of the appended geometry
   */
  notifyBounds(box) {
    if (this.state === SessionState.FINISHED || this.state === SessionState.ABORTED ||
        !box || box.isEmpty()) {
      return
    }
    try {
      // Copies the six bounds out: the incremental builder hands over a
      // scratch box it reuses for the next instance.
      this.streamedBoxes.push(box)
      this.boundsRevision_++
      if (this.state === SessionState.IDLE) {
        this.state = SessionState.PREVIEWING
      }
      if (this.fittedSphere !== null && !this.sphereContainsBox_(this.fittedSphere, box)) {
        this.overflowPending = true
      }
      if (this.fittedSphere === null) {
        this.startFollow_()
      } else {
        this.maybeRefit_()
      }
    } catch (e) {
      debug(WARN).warn('bounds notify skipped:', e)
    }
  }


  /**
   * Stamp the preview group's model-level transform (the deferred-open
   * coordination contract makes this identity in practice, but the
   * batch path stamps it for exactness — mirroring the final build).
   * Rebuilds the union box under the new transform and refits.
   *
   * @param {Array<number>} matrixArr 16-element column-major matrix
   */
  stampCoordination(matrixArr) {
    const group = this.previewGroup
    if (group === null || !group.matrix || typeof group.matrix.fromArray !== 'function') {
      return
    }
    try {
      group.matrix.fromArray(matrixArr)
      group.matrixAutoUpdate = false
      this.rebuildUnion_()
      this.overflowPending = true
      this.maybeRefit_()
    } catch (e) {
      debug(WARN).warn('preview coordination stamp failed:', e)
    }
  }


  /** Final model build begins — label only; the follow keeps running. */
  beginAssembly() {
    if (this.state === SessionState.PREVIEWING || this.state === SessionState.IDLE) {
      this.state = SessionState.ASSEMBLING
    }
    this.report('Assembling render mesh...')
  }


  /**
   * The final model is (about to be) installed: stop the camera follow
   * and swap the preview out, disposing per-mesh geometry/materials so
   * the preview leaves no residue.
   */
  finish() {
    this.stopFollow_()
    this.teardownPreview_()
    this.state = SessionState.FINISHED
  }


  /** The load failed: same teardown as finish, terminal state aborted. */
  abort() {
    this.stopFollow_()
    this.teardownPreview_()
    this.state = SessionState.ABORTED
  }


  /**
   * Is this preview placed somewhere the model plainly is not?
   *
   * conway's parse-time preview channel can emit a placement with the
   * origin-coordination transform applied to geometry that is already
   * local, so the site offset is subtracted twice instead of cancelling.
   * On Snowdon (site at 417622, 78714, 238) that put 88 previews ~425km
   * out while the durable stream placed none of them there. The camera
   * follow frames the union, so it chased them and rendered the building
   * as a speck for the whole load.
   *
   * The stray filter in robustBounds cannot help: it is tuned for
   * "model + a few strays" and gives up past MAX_EXCLUDED_FRACTION (2%),
   * which 88 displaced elements exceed — that is why it reported
   * excluded=0 while framing a 318km sphere.
   *
   * Deliberately crude. Real geometry is never 100x the model's own
   * radius from its centre, so this cannot fire on a legitimate outlying
   * wing, crane or antenna; it only catches a placement that is wrong.
   * Durable bounds are never tested — that stream is authoritative.
   *
   * @param {Box3|null} box the candidate's world bounds
   * @return {boolean}
   */
  isPreviewOutlier_(box) {
    if (box === null || this.previewMeshCount < PREVIEW_OUTLIER_WARMUP ||
        this.previewUnion.isEmpty()) {
      return false
    }
    const sphere = new Sphere()
    this.previewUnion.getBoundingSphere(sphere)
    if (!(sphere.radius > 0) || !Number.isFinite(sphere.radius)) {
      return false
    }
    return box.getCenter(new Vector3()).distanceTo(sphere.center) >
      sphere.radius * PREVIEW_OUTLIER_FACTOR
  }


  /**
   * Record one preview mesh's world bounds and flag an overflow when it
   * escapes the currently framed sphere.
   *
   * @param {Box3|null} box the mesh's world bounds, computed by the
   *   caller (addPreviewMesh already derives it for the outlier test —
   *   deriving it twice doubled the hot path's bounds work)
   */
  growUnion_(box) {
    if (box === null) {
      return
    }
    this.previewUnion.union(box)
    this.boundsRevision_++
    this.previewBoxes.push(box)
    if (this.fittedSphere !== null && !this.sphereContainsBox_(this.fittedSphere, box)) {
      this.overflowPending = true
    }
  }


  /**
   * Recompute the preview group's boxes from scratch (its transform
   * changed). Only these move with it; the streamed instance boxes
   * arrived in scene space already.
   */
  rebuildUnion_() {
    this.previewBoxes.clear()
    // The outlier test measures against the same transform the boxes are
    // in, so this has to be rebuilt with them or a coordination stamp
    // would leave it comparing across frames.
    this.previewUnion.makeEmpty()
    this.boundsRevision_++
    if (this.previewGroup === null) {
      return
    }
    for (const child of this.previewGroup.children) {
      const box = this.meshWorldBox_(child)
      if (box !== null) {
        this.previewBoxes.push(box)
        this.previewUnion.union(box)
      }
    }
  }


  /**
   * A mesh's bounds in scene space (its own matrix composed with the
   * preview group's stamped transform).
   *
   * @param {object} mesh
   * @return {Box3|null}
   */
  meshWorldBox_(mesh) {
    const geometry = mesh.geometry
    if (!geometry || typeof geometry.computeBoundingBox !== 'function') {
      return null
    }
    if (geometry.boundingBox === null || geometry.boundingBox === undefined) {
      geometry.computeBoundingBox()
    }
    const bounds = geometry.boundingBox
    if (!bounds || bounds.isEmpty()) {
      return null
    }
    const box = bounds.clone()
    if (mesh.matrix) {
      box.applyMatrix4(mesh.matrix)
    }
    if (this.previewGroup !== null && this.previewGroup.matrixAutoUpdate === false) {
      box.applyMatrix4(this.previewGroup.matrix)
    }
    return box
  }


  /**
   * Is `sphere` within a hair of the one already fitted? Guards the
   * no-op refits an excluded stray would otherwise cause.
   *
   * @param {Sphere} sphere
   * @return {boolean} false when nothing has been fitted yet
   */
  sphereMatchesFitted_(sphere) {
    const fitted = this.fittedSphere
    if (fitted === null) {
      return false
    }
    const epsilon = fitted.radius * REFIT_EPSILON_FRACTION
    return Math.abs(sphere.radius - fitted.radius) <= epsilon &&
      sphere.center.distanceTo(fitted.center) <= epsilon
  }


  /**
   * Does the fitted sphere contain the whole box?
   *
   * @param {Sphere} sphere
   * @param {Box3} box
   * @return {boolean}
   */
  sphereContainsBox_(sphere, box) {
    const corner = new Vector3()
    for (let index = 0; index < BOX_CORNERS; ++index) {
      corner.set(
        (index & 1) === 0 ? box.min.x : box.max.x,
        (index & 2) === 0 ? box.min.y : box.max.y,
        (index & 4) === 0 ? box.min.z : box.max.z)
      /* eslint-enable no-bitwise */
      if (!sphere.containsPoint(corner)) {
        return false
      }
    }
    return true
  }


  /** Start the follow: instant first fit + the timer backstop chain. */
  startFollow_() {
    // A permalink pinned the camera: render the preview but never move the
    // camera. Latching followStopped keeps maybeRefit_/followTick_ inert too.
    if (!this.frameCamera) {
      this.followStopped = true
      return
    }
    if (this.followStopped || this.followTimer !== null) {
      return
    }
    try {
      this.followedControls = this.getControls() ?? null
      this.followedControls?.addEventListener?.('controlstart', this.onControlStart)
    } catch {
      this.followedControls = null
    }
    try {
      this.fitUnionToFrame_(false)
    } catch (e) {
      debug(WARN).warn('camera follow initial fit failed:', e)
    }
    this.followDelayMs = CAMERA_FOLLOW_MIN_MS
    this.followTimer = setTimeout(() => this.followTick_(), this.followDelayMs)
  }


  /**
   * Event-driven refit: called from the geometry events themselves (the
   * load pipeline's scheduler-priority yields starve setTimeout, so the
   * timer alone fires rarely). Refits only on overflow — a strict fit of
   * the union is a visual no-op while new geometry stays inside the
   * framed volume.
   */
  maybeRefit_() {
    if (this.followStopped || !this.overflowPending || this.fittedSphere === null) {
      return
    }
    const now = Date.now()
    if (now - this.lastFitMs < this.followDelayMs) {
      return
    }
    try {
      this.fitUnionToFrame_(true)
    } catch (e) {
      debug(WARN).warn('camera follow refit failed:', e)
    }
  }


  /**
   * Has the framed volume become far larger than the geometry needs?
   *
   * Refits fire on OVERFLOW only, which is one-directional: the frame can
   * grow but never come back. One stray that inflates the framing sphere
   * is therefore permanent for the rest of the load — every later mesh
   * lands inside the inflated sphere, so nothing ever overflows and no
   * refit is requested. Observed on Snowdon: a fit jumped to radius
   * 318751 at 503 preview meshes, and the following 650 meshes produced
   * no fit at all while the model sat on screen as a sub-pixel speck.
   *
   * The factor is deliberately coarse. Normal growth is already handled
   * by overflow, so this only has to catch the pathological case, and a
   * tight threshold would re-fit on ordinary variation — which is the
   * camera thrash the strict-fit design exists to avoid.
   *
   * @return {boolean}
   */
  isOverframed_() {
    if (this.fittedSphere === null) {
      return false
    }
    const bounds = robustBoundsFromElements([this.previewBoxes, this.streamedBoxes])
    if (bounds === null || bounds.box.isEmpty()) {
      return false
    }
    const sphere = new Sphere()
    bounds.box.getBoundingSphere(sphere)
    if (!(sphere.radius > 0) || !Number.isFinite(sphere.radius)) {
      return false
    }
    // fittedSphere already carries FRAMING_MARGIN; apply it to the raw
    // radius so the comparison is like-for-like.
    return this.fittedSphere.radius > sphere.radius * FRAMING_MARGIN * OVERFRAME_FACTOR
  }


  /** Timer backstop for overflows that landed inside the refit gap. */
  followTick_() {
    this.followTimer = null
    if (this.followStopped) {
      return
    }
    const staleFrameSuspect = this.boundsRevision_ !== this.overframeCheckedRevision_
    if (staleFrameSuspect) {
      this.overframeCheckedRevision_ = this.boundsRevision_
    }
    if (this.overflowPending || (staleFrameSuspect && this.isOverframed_())) {
      try {
        this.fitUnionToFrame_(true)
      } catch (e) {
        debug(WARN).warn('camera follow refit failed:', e)
      }
    }
    this.followTimer = setTimeout(() => this.followTick_(), this.followDelayMs)
  }


  /**
   * Strictly frame everything shown so far, minus extreme strays: fit
   * the camera to the robust bounding sphere (with margin), pushing the
   * far plane out monotonically so successive refits never pop the
   * projection.
   *
   * The follow uses the same robust criterion as the end-of-load fit
   * (`three/robustBounds.js`) rather than the raw union. Framing the raw
   * union meant one stray instance landing mid-stream (the
   * test-models-private#26 catenaries) zoomed the camera out to a
   * kilometre-scale box for the rest of the load, so the model
   * materialized as a speck and only snapped back at the end. Sharing
   * the criterion also means the follow and the final frame agree —
   * there is no correction to watch when the load settles.
   *
   * @param {boolean} withTransition tween the move (false = instant)
   */
  fitUnionToFrame_(withTransition) {
    const controls = this.getControls()
    const camera = this.getCamera()
    if (!controls || !camera) {
      return
    }
    const bounds = robustBoundsFromElements([this.previewBoxes, this.streamedBoxes])
    if (bounds === null || bounds.box.isEmpty()) {
      return
    }
    const sphere = new Sphere()
    bounds.box.getBoundingSphere(sphere)
    if (!(sphere.radius > 0) || !Number.isFinite(sphere.radius)) {
      return
    }
    sphere.radius *= FRAMING_MARGIN
    // Nothing to do when the pose already frames this sphere — refits
    // fire on any overflow, and geometry excluded as a stray leaves the
    // framing unchanged, which would otherwise tween the camera to where
    // it already is once per stray. Stamp lastFitMs anyway: evaluating
    // this cost a full robust-bounds pass, so it has to sit behind the
    // same cadence gate as a real fit or every arriving stray pays for
    // one.
    if (this.sphereMatchesFitted_(sphere)) {
      this.overflowPending = false
      this.lastFitMs = Date.now()
      return
    }
    // camera-controls clamps every dolly to [minDistance, maxDistance],
    // and the OrbitControl activation defaults are minDistance 1 /
    // maxDistance 300 with near 1. Both ends bite, in opposite
    // directions and at opposite scales:
    //
    //  - large model: fit distance exceeds maxDistance 300, so
    //    fitToSphere parks at the clamp and the model overflows;
    //  - sub-metre model: fit distance is under minDistance 1, so
    //    fitToSphere parks *too far out* and the model is a speck, while
    //    near = 1 sits beyond it entirely and clips it in half.
    //
    // The follow used to grow only maxDistance and far, so the second
    // case went unhandled until the end-of-load fit corrected it — read
    // as the model "resizing during load". Derive the whole set from the
    // same place the final fit does; growOnly keeps the outward range
    // monotonic (the union only grows, and a shrinking range would pop
    // the projection between refits) while letting minDistance and near
    // come down off the defaults.
    applyCameraLimits(camera, controls, cameraLimitsForSphere(camera, sphere), true)
    controls.fitToSphere(sphere, withTransition)
    this.fittedSphere = sphere
    this.overflowPending = false
    this.lastFitMs = Date.now()
    this.followDelayMs =
      Math.min(this.followDelayMs * CAMERA_FOLLOW_GROWTH, CAMERA_FOLLOW_MAX_MS)
  }


  /** Stop the camera follow forever (user input, finish, or error). */
  stopFollow_() {
    this.followStopped = true
    if (this.followTimer !== null) {
      clearTimeout(this.followTimer)
      this.followTimer = null
    }
    try {
      this.followedControls?.removeEventListener?.('controlstart', this.onControlStart)
    } catch {
      // best-effort
    }
    this.followedControls = null
  }


  /** Remove the preview group and dispose its meshes' GPU resources. */
  teardownPreview_() {
    // Preview geometry and materials are SHARED across meshes by design:
    // parsePreviewMesh pools materials by rgba, keys payload geometry by
    // geometryExpressID for mapped reuse, and every aabb imposter
    // instances one unit cube. So disposal collects UNIQUE resources
    // from every preview object and frees each once — the pre-imposter
    // per-child dispose would hit shared ones repeatedly, and dropping
    // disposal outright (this PR's interim state) retained up to the
    // preview byte cap of uploaded WebGL buffers per load until page
    // refresh (Codex review on #1753). The caches themselves are
    // per-load Maps in ShareIfcLoader.parse, so nothing re-uses these
    // instances after finish/abort.
    const geometries = new Set()
    const materials = new Set()
    const retire = (obj) => {
      if (obj.geometry !== undefined && obj.geometry !== null) {
        geometries.add(obj.geometry)
      }
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const material of mats) {
        if (material !== undefined && material !== null) {
          materials.add(material)
        }
      }
    }
    // Imposters must not survive the durable model. Pull any aabb
    // wire cubes off the scene first — they can leave the preview
    // group (outlier eviction) and would otherwise stay after finish.
    if (this.scene !== null && typeof this.scene.traverse === 'function') {
      const strays = []
      this.scene.traverse((obj) => {
        if (obj.userData && obj.userData.aabbImposter) {
          strays.push(obj)
        }
      })
      for (const obj of strays) {
        retire(obj)
        obj.removeFromParent?.()
      }
    }
    if (this.previewGroup !== null && this.previewInstalled) {
      try {
        const group = this.previewGroup
        while (group.children.length > 0) {
          const child = group.children[0]
          retire(child)
          group.remove(child)
        }
        this.scene.remove(group)
      } catch (e) {
        debug(WARN).warn('demand preview teardown failed:', e)
      }
      this.previewInstalled = false
    }
    for (const geometry of geometries) {
      geometry.dispose?.()
    }
    for (const material of materials) {
      material.dispose?.()
    }
  }
}
