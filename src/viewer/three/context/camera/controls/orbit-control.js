// OrbitControl — vendored from
// `web-ifc-viewer/dist/components/context/camera/controls/orbit-control.js`
// in slice 5d.3.

import {Box3, MathUtils, Sphere, Vector3} from 'three'
import {IfcComponent, NavigationModes} from '../../base-types'
import {LiteEvent} from '../../LiteEvent'


// Leave ~1/3 of the canvas as whitespace (≈1/6 per side): inflate the
// framed sphere so the model fills ~2/3 of the viewport rather than
// sitting edge-to-edge.
const FRAMING_MARGIN = 1.5
/** Zoom-in limit as a fraction of the fit distance. */
const MIN_DISTANCE_FACTOR = 0.01
/** Zoom-out headroom over the fit distance. */
const MAX_DISTANCE_HEADROOM = 10
/** Far plane must clear the whole zoom-out range plus the model. */
const FAR_PLANE_SLACK = 1.5
/** Floor for the near plane, in scene units. */
const MIN_NEAR = 0.1
const HALF = 0.5


export class OrbitControl extends IfcComponent {
  constructor(context, ifcCamera) {
    super(context)
    this.context = context
    this.ifcCamera = ifcCamera
    this.enabled = true
    this.mode = NavigationModes.Orbit
    this.onChange = new LiteEvent()
    this.onUnlock = new LiteEvent()
    this.onChangeProjection = new LiteEvent()
    this.activateOrbitControls()
  }
  /**
   * @deprecated Use cameraControls.getTarget.
   */
  get target() {
    const target = new Vector3()
    this.ifcCamera.cameraControls.getTarget(target)
    return target
  }
  toggle(active) {
    this.enabled = active
    if (active) {
      this.activateOrbitControls()
    }
  }

  /**
   * Size the dolly range and the camera's near/far clip planes to
   * `object`'s bounds. Does NOT move the camera — the caller decides
   * whether to also frame the model.
   *
   * Split out of `fitModelToFrame` for the permalink path (#1652): a URL
   * carrying a `#c:` camera hash pins the pose and skips the fit, which
   * used to be the only place these limits stopped being the IfcCamera
   * constructor defaults (minDistance 1 / maxDistance 300, near 1 /
   * far 2000). On any model larger than a few hundred scene units that
   * left the far plane slicing the model in half, and the first user
   * input clamped the restored dolly distance down to 300 — the camera
   * popped in close to the model and couldn't be pushed back out.
   *
   * Uncached loads masked the bug: ProgressiveLoadSession's camera
   * follow grows the same two limits while geometry streams in, so only
   * a GLB cache hit (which has no progressive session) showed it.
   *
   * @param {object} [object] framing target; defaults to the last scene
   *   child, matching fitModelToFrame's target
   * @return {Sphere|null} the inflated framing sphere, or null when the
   *   bounds are unusable (no target, empty or degenerate box)
   */
  fitCameraLimitsToModel(object = null) {
    const scene = this.context.getScene()
    // TODO(#1561): frame the loader's named primary-model object, not the
    // last scene child. Lights/helpers/isolation subsets appended after the
    // model can otherwise become the framing target.
    const framed = object ?? scene.children[scene.children.length - 1]
    if (!framed) {
      return null
    }
    const box = new Box3().setFromObject(framed)
    if (box.isEmpty()) {
      return null
    }

    // True enclosing sphere of the model (half the box diagonal). The old
    // `max(x,y,z) * 0.5` used half the longest *edge*, which under-sizes the
    // sphere for any non-slab model — fitToSphere then parked the camera too
    // close and the model overflowed the frame.
    const sphere = new Sphere()
    box.getBoundingSphere(sphere)
    if (!(sphere.radius > 0) || !Number.isFinite(sphere.radius)) {
      return null
    }
    sphere.radius *= FRAMING_MARGIN

    // Distance camera-controls will dolly to for `sphere`, mirroring its
    // getDistanceToFitSphere (radius / sin(½·limitingFOV); the limiting FOV is
    // the narrower of the two axes). Computed here so the zoom limits below
    // scale with the model instead of the old hardcoded cap.
    const camera = this.ifcCamera.perspectiveCamera
    const vFov = MathUtils.degToRad(camera.fov)
    const hFov = Math.atan(Math.tan(vFov * HALF) * camera.aspect) * 2
    const limitingFov = camera.aspect > 1 ? vFov : hFov
    const fitDistance = sphere.radius / Math.sin(limitingFov * HALF)

    const controls = this.ifcCamera.cameraControls
    // Allow zooming out to 10x the fit distance (model shrinks to ~1/10 of the
    // canvas) and well in. Replaces the hardcoded maxDistance = 300 that
    // clamped fitToSphere on large models — pinning the camera too close and
    // capping zoom-out before the whole model was visible.
    controls.minDistance = fitDistance * MIN_DISTANCE_FACTOR
    // Never pull the range in under where the camera already sits —
    // `setPosition` doesn't clamp, but the first dolly afterwards does,
    // so a shrinking range would snap the camera inwards on the user's
    // first drag. This reads the *settled* radius, so it covers a
    // setCameraFromParams on an already-dollied-out camera (issue-card
    // navigation); it can't see the pending radius of a still-
    // transitioning setPosition, which camera-controls keeps in the
    // protected `_sphericalEnd`. The initial permalink load is covered
    // by the 10x headroom instead — the same bound the link's own
    // maxDistance had when the link was created.
    const currentDistance = Number.isFinite(controls.distance) ? controls.distance : 0
    controls.maxDistance = Math.max(fitDistance * MAX_DISTANCE_HEADROOM, currentDistance)

    // Keep the model between the near/far planes across the whole zoom range:
    // far must clear the pulled-back camera (maxDistance + model radius), near
    // must stay inside the closest dolly. Without this, zooming out on a large
    // model would clip it against the old far = 2000 plane.
    camera.near = Math.max(controls.minDistance * HALF, MIN_NEAR)
    camera.far = (controls.maxDistance + sphere.radius) * FAR_PLANE_SLACK
    camera.updateProjectionMatrix()

    return sphere
  }

  /**
   * Size the camera limits to `object` and frame it.
   *
   * @param {object} [object] framing target; defaults to the last scene
   *   child. Pass it explicitly where the caller knows the model —
   *   the fallback picks up whatever was added last (see #1561).
   */
  async fitModelToFrame(object = null) {
    if (!this.enabled) {
      return
    }
    const sphere = this.fitCameraLimitsToModel(object)
    if (sphere === null) {
      return
    }
    await this.ifcCamera.cameraControls.fitToSphere(sphere, true)
  }
  activateOrbitControls() {
    const controls = this.ifcCamera.cameraControls
    controls.minDistance = 1
    controls.maxDistance = 300
    this.ifcCamera.cameraControls.truckSpeed = 2
  }
}
// # sourceMappingURL=orbit-control.js.map
