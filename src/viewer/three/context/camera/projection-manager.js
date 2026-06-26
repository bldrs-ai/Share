// ProjectionManager — vendored from
// `web-ifc-viewer/dist/components/context/camera/projection-manager.js`
// in slice 5d.3.

import {Vector3} from 'three'
import CameraControls from 'camera-controls'
import {CameraProjections, NavigationModes} from '../base-types'


export class ProjectionManager {
  constructor(context, ifcCamera) {
    this.context = context
    this.previousDistance = -1
    this.cameras = ifcCamera
    this.currentCamera = ifcCamera.perspectiveCamera
    this.currentProjection = CameraProjections.Perspective
  }
  get activeCamera() {
    return this.currentCamera
  }
  get projection() {
    return this.currentProjection
  }
  set projection(projection) {
    if (this.projection === projection) {
      return
    }
    if (projection === CameraProjections.Orthographic) {
      this.setOrthoCamera()
    } else {
      this.setPerspectiveCamera()
    }
  }
  setOrthoCamera() {
    // Matching orthographic camera to perspective camera
    // Resource: https://stackoverflow.com/questions/48758959/what-is-required-to-convert-threejs-perspective-camera-to-orthographic
    if (this.cameras.currentNavMode.mode === NavigationModes.FirstPerson) {
      return
    }
    this.previousDistance = this.cameras.cameraControls.distance
    this.cameras.cameraControls.distance = 200
    const {width, height} = this.getDims()
    this.setupOrthoCamera(height, width)
    this.currentCamera = this.cameras.orthographicCamera
    this.currentProjection = CameraProjections.Orthographic
  }
  getDims() {
    const lineOfSight = new Vector3()
    this.cameras.perspectiveCamera.getWorldDirection(lineOfSight)
    const target = new Vector3()
    this.cameras.cameraControls.getTarget(target)
    const distance = target.clone().sub(this.cameras.perspectiveCamera.position)
    const depth = distance.dot(lineOfSight)
    const dims = this.context.getDimensions()
    const aspect = dims.x / dims.y
    const fov = this.cameras.perspectiveCamera.fov
    const height = depth * 2 * Math.atan((fov * (Math.PI / 180)) / 2)
    const width = height * aspect
    return {width, height}
  }
  setupOrthoCamera(height, width) {
    this.cameras.cameraControls.mouseButtons.wheel = CameraControls.ACTION.ZOOM
    this.cameras.orthographicCamera.zoom = 1
    this.cameras.orthographicCamera.left = width / -2
    this.cameras.orthographicCamera.right = width / 2
    this.cameras.orthographicCamera.top = height / 2
    this.cameras.orthographicCamera.bottom = height / -2
    this.cameras.orthographicCamera.updateProjectionMatrix()
    this.cameras.orthographicCamera.position.copy(this.cameras.perspectiveCamera.position)
    this.cameras.orthographicCamera.quaternion.copy(this.cameras.perspectiveCamera.quaternion)
    this.cameras.cameraControls.camera = this.cameras.orthographicCamera
  }
  setPerspectiveCamera() {
    this.cameras.cameraControls.mouseButtons.wheel = CameraControls.ACTION.DOLLY
    this.cameras.perspectiveCamera.position.copy(this.cameras.orthographicCamera.position)
    this.cameras.perspectiveCamera.quaternion.copy(this.cameras.orthographicCamera.quaternion)
    this.cameras.perspectiveCamera.updateProjectionMatrix()
    this.cameras.cameraControls.camera = this.cameras.perspectiveCamera
    this.cameras.cameraControls.mouseButtons.wheel = CameraControls.ACTION.DOLLY
    this.currentCamera = this.cameras.perspectiveCamera
    this.currentProjection = CameraProjections.Perspective
    this.cameras.cameraControls.distance = this.previousDistance
    this.cameras.cameraControls.zoomTo(1)
  }
}
// # sourceMappingURL=projection-manager.js.map
