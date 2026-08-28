// OrbitControl — vendored from
// `web-ifc-viewer/dist/components/context/camera/controls/orbit-control.js`
// in slice 5d.3.

import {Sphere, Vector3} from 'three'
import {IfcComponent, NavigationModes} from '../../base-types'
import {LiteEvent} from '../../LiteEvent'
import {robustBoundsFor} from '../../../robustBounds'
import {FRAMING_MARGIN, applyCameraLimits, cameraLimitsForSphere} from '../../../cameraLimits'


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
    // Outlier-robust bounds: a handful of stray fragments flung far from
    // the model (test-models-private#26) must not drag the frame out to a
    // kilometre-scale box. Identical to Box3().setFromObject on clean
    // models — see robustBounds.js for the (deliberately extreme-only)
    // exclusion criterion.
    const box = robustBoundsFor(framed)?.box
    if (!box || box.isEmpty()) {
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

    const camera = this.ifcCamera.perspectiveCamera
    const controls = this.ifcCamera.cameraControls
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
    // Shared with the streaming camera follow — see cameraLimits.js for
    // why both fits must derive the whole set from one place.
    applyCameraLimits(
      camera, controls, cameraLimitsForSphere(camera, sphere, currentDistance))

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
