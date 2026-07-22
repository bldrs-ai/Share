import {Box3, Group, MathUtils, Sphere, Vector3} from 'three'
import {setLoadSummary} from '../loader/loadProgress'
import debug, {WARN} from '../utils/debug'


/** Session lifecycle states (see class doc). */
export const SessionState = Object.freeze({
  IDLE: 'idle',
  PREVIEWING: 'previewing',
  ASSEMBLING: 'assembling',
  FINISHED: 'finished',
  ABORTED: 'aborted',
})


/** Bounding-sphere margin applied when framing the preview. */
const FRAMING_MARGIN = 1.5
/** Minimum gap between two follow refits (also the starting cadence). */
const CAMERA_FOLLOW_MIN_MS = 250
/** The cadence cap the exponential growth converges to. */
const CAMERA_FOLLOW_MAX_MS = 1000
/** Per-refit cadence growth factor. */
const CAMERA_FOLLOW_GROWTH = 1.5
const HALF = 0.5
const FAR_PLANE_SLACK = 4
/** Box corner count for the sphere-containment test. */
const BOX_CORNERS = 8


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
 *  - the camera follow: a STRICT fit of everything shown so far. A
 *    running union box tracks the preview's true extents, and a refit
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
   * @param {Function} [args.onProgress] stage-label reporter.
   */
  constructor({scene = null, getControls, getCamera, onProgress}) {
    this.state = SessionState.IDLE
    this.scene = scene
    this.getControls = getControls ?? (() => null)
    this.getCamera = getCamera ?? (() => null)
    this.onProgress = onProgress ?? null
    this.previewGroup = scene !== null ? new Group() : null
    this.previewInstalled = false
    // Camera follow state.
    this.followStopped = false
    this.followTimer = null
    this.followedControls = null
    this.followDelayMs = CAMERA_FOLLOW_MIN_MS
    this.lastFitMs = 0
    this.unionBox = new Box3()
    this.fittedSphere = null
    this.overflowPending = false
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
      this.previewGroup.add(mesh)
      if (!this.previewInstalled) {
        this.previewInstalled = true
        this.scene.add(this.previewGroup)
      }
      if (this.state === SessionState.IDLE) {
        this.state = SessionState.PREVIEWING
      }
      this.growUnion_(mesh)
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
   * Grow the union box by one mesh's world bounds and flag an overflow
   * when it escapes the currently framed sphere.
   *
   * @param {object} mesh
   */
  growUnion_(mesh) {
    const box = this.meshWorldBox_(mesh)
    if (box === null) {
      return
    }
    this.unionBox.union(box)
    if (this.fittedSphere !== null && !this.sphereContainsBox_(this.fittedSphere, box)) {
      this.overflowPending = true
    }
  }


  /**
   * Recompute the union box from scratch (group transform changed).
   */
  rebuildUnion_() {
    this.unionBox.makeEmpty()
    if (this.previewGroup === null) {
      return
    }
    for (const child of this.previewGroup.children) {
      const box = this.meshWorldBox_(child)
      if (box !== null) {
        this.unionBox.union(box)
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


  /** Timer backstop for overflows that landed inside the refit gap. */
  followTick_() {
    this.followTimer = null
    if (this.followStopped) {
      return
    }
    if (this.overflowPending) {
      try {
        this.fitUnionToFrame_(true)
      } catch (e) {
        debug(WARN).warn('camera follow refit failed:', e)
      }
    }
    this.followTimer = setTimeout(() => this.followTick_(), this.followDelayMs)
  }


  /**
   * Strictly frame the union of everything shown so far: fit the
   * camera to the union box's bounding sphere (with margin), pushing
   * the far plane out monotonically so successive refits never pop the
   * projection.
   *
   * @param {boolean} withTransition tween the move (false = instant)
   */
  fitUnionToFrame_(withTransition) {
    const controls = this.getControls()
    const camera = this.getCamera()
    if (!controls || !camera || this.unionBox.isEmpty()) {
      return
    }
    const sphere = new Sphere()
    this.unionBox.getBoundingSphere(sphere)
    if (!(sphere.radius > 0) || !Number.isFinite(sphere.radius)) {
      return
    }
    sphere.radius *= FRAMING_MARGIN
    const vFov = MathUtils.degToRad(camera.fov)
    const hFov = Math.atan(Math.tan(vFov * HALF) * camera.aspect) * 2
    const limitingFov = camera.aspect > 1 ? vFov : hFov
    const fitDistance = sphere.radius / Math.sin(limitingFov * HALF)
    const wantFar = (fitDistance + sphere.radius) * FAR_PLANE_SLACK
    if (camera.far < wantFar) {
      camera.far = wantFar
      camera.updateProjectionMatrix()
    }
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
    if (this.previewGroup === null || !this.previewInstalled) {
      return
    }
    try {
      this.scene.remove(this.previewGroup)
      for (const child of this.previewGroup.children) {
        child.geometry?.dispose?.()
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        for (const material of materials) {
          material?.dispose?.()
        }
      }
    } catch (e) {
      debug(WARN).warn('demand preview teardown failed:', e)
    }
    this.previewInstalled = false
  }
}
