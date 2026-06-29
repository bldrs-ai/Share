// OrbitControl — vendored from
// `web-ifc-viewer/dist/components/context/camera/controls/orbit-control.js`
// in slice 5d.3.

import {Box3, MathUtils, Sphere, Vector3} from 'three'
import {IfcComponent, NavigationModes} from '../../base-types'
import {LiteEvent} from '../../LiteEvent'


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
  async fitModelToFrame() {
    if (!this.enabled) {
      return
    }
    const scene = this.context.getScene()
    // TODO(#1561): frame the loader's named primary-model object, not the
    // last scene child. Lights/helpers/isolation subsets appended after the
    // model can otherwise become the framing target.
    const box = new Box3().setFromObject(scene.children[scene.children.length - 1])

    // True enclosing sphere of the model (half the box diagonal). The old
    // `max(x,y,z) * 0.5` used half the longest *edge*, which under-sizes the
    // sphere for any non-slab model — fitToSphere then parked the camera too
    // close and the model overflowed the frame.
    const sphere = new Sphere()
    box.getBoundingSphere(sphere)

    // Leave ~1/3 of the canvas as whitespace (≈1/6 per side): inflate the
    // framed sphere so the model fills ~2/3 of the viewport rather than
    // sitting edge-to-edge.
    const FRAMING_MARGIN = 1.5
    sphere.radius *= FRAMING_MARGIN

    // Distance camera-controls will dolly to for `sphere`, mirroring its
    // getDistanceToFitSphere (radius / sin(½·limitingFOV); the limiting FOV is
    // the narrower of the two axes). Computed here so the zoom limits below
    // scale with the model instead of the old hardcoded cap.
    const camera = this.ifcCamera.perspectiveCamera
    const vFov = MathUtils.degToRad(camera.fov)
    const hFov = Math.atan(Math.tan(vFov * 0.5) * camera.aspect) * 2
    const limitingFov = camera.aspect > 1 ? vFov : hFov
    const fitDistance = sphere.radius / Math.sin(limitingFov * 0.5)

    const controls = this.ifcCamera.cameraControls
    // Allow zooming out to 10x the fit distance (model shrinks to ~1/10 of the
    // canvas) and well in. Replaces the hardcoded maxDistance = 300 that
    // clamped fitToSphere on large models — pinning the camera too close and
    // capping zoom-out before the whole model was visible.
    controls.minDistance = fitDistance * 0.01
    controls.maxDistance = fitDistance * 10

    // Keep the model between the near/far planes across the whole zoom range:
    // far must clear the pulled-back camera (maxDistance + model radius), near
    // must stay inside the closest dolly. Without this, zooming out on a large
    // model would clip it against the old far = 2000 plane.
    camera.near = Math.max(controls.minDistance * 0.5, 0.1)
    camera.far = (controls.maxDistance + sphere.radius) * 1.5
    camera.updateProjectionMatrix()

    await controls.fitToSphere(sphere, true)
  }
  activateOrbitControls() {
    const controls = this.ifcCamera.cameraControls
    controls.minDistance = 1
    controls.maxDistance = 300
    this.ifcCamera.cameraControls.truckSpeed = 2
  }
}
// # sourceMappingURL=orbit-control.js.map
