// OrbitControl — vendored from
// `web-ifc-viewer/dist/components/context/camera/controls/orbit-control.js`
// in slice 5d.3.

import {Box3, Sphere, Vector3} from 'three'
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
    const box = new Box3().setFromObject(scene.children[scene.children.length - 1])
    const sceneSize = new Vector3()
    box.getSize(sceneSize)
    const sceneCenter = new Vector3()
    box.getCenter(sceneCenter)
    const nearFactor = 0.5
    const radius = Math.max(sceneSize.x, sceneSize.y, sceneSize.z) * nearFactor
    const sphere = new Sphere(sceneCenter, radius)
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
