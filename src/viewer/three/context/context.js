// IfcContext — vendored from
// `web-ifc-viewer/dist/components/context/context.js` in slice 5d.3.
// The `Clock` shim below replaces three's `Clock` (deprecated in r183)
// — previously applied by `tools/esbuild/plugins.js#shimClock`. Class
// is a constructor + `getDelta` only (all the IfcContext render loop
// reads). `THREE.Timer` is not a drop-in replacement.

import {Vector2, Vector3} from 'three'
import {IfcCamera} from './camera/camera'
import {IfcRaycaster} from './raycaster'
import {IfcRenderer} from './renderer/renderer'
import {IfcScene} from './scene'
import {Animator} from './animator'
import {IfcEvent, IfcEvents} from './ifcEvent'
import {NavigationModes} from './base-types'
import {IfcMouse} from './mouse'


/**
 * Drop-in shim for `THREE.Clock(true)` / `getDelta()`. Avoids the
 * r183 deprecation warning without rewiring the render loop.
 */
class Clock {
  constructor() {
    this._last = performance.now()
  }
  getDelta() {
    const now = performance.now()
    const d = (now - this._last) / 1000
    this._last = now
    return d
  }
}


export class IfcContext {
  constructor(options) {
    this.stats = null
    this.isThisBeingDisposed = false
    this.render = () => {
      if (this.isThisBeingDisposed) {
        return
      }
      if (this.stats) {
        this.stats.begin()
      }
      const isWebXR = this.options.webXR || false
      if (isWebXR) {
        this.renderForWebXR()
      } else {
        requestAnimationFrame(this.render)
      }
      this.updateAllComponents()
      if (this.stats) {
        this.stats.end()
      }
    }
    this.renderForWebXR = () => {
      const newAnimationLoop = () => {
        this.getRenderer().render(this.getScene(), this.getCamera())
      }
      this.getRenderer().setAnimationLoop(newAnimationLoop)
    }
    this.resize = () => {
      this.updateAspect()
    }
    if (!options.container) {
      throw new Error('Could not get container element!')
    }
    this.options = options
    this.events = new IfcEvents()
    this.items = this.newItems()
    this.scene = new IfcScene(this)
    this.renderer = new IfcRenderer(this)
    this.mouse = new IfcMouse(this.renderer.renderer.domElement)
    this.ifcCamera = new IfcCamera(this)
    this.events.publish(IfcEvent.onCameraReady)
    this.clippingPlanes = []
    this.ifcCaster = new IfcRaycaster(this)
    this.clock = new Clock(true)
    this.ifcAnimator = new Animator()
    this.setupWindowRescale()
    this.render()
  }
  dispose() {
    let _a; let _b; let _c
    this.isThisBeingDisposed = true;
    (_a = this.stats) === null || _a === void 0 ? void 0 : _a.dom.remove();
    (_b = this.options.preselectMaterial) === null || _b === void 0 ? void 0 : _b.dispose();
    (_c = this.options.selectMaterial) === null || _c === void 0 ? void 0 : _c.dispose()
    this.options = null
    this.items.components.length = 0
    this.items.ifcModels.forEach((model) => {
      model.removeFromParent()
      if (model.geometry.boundsTree) {
        model.geometry.disposeBoundsTree()
      }
      model.geometry.dispose()
      if (Array.isArray(model.material)) {
        model.material.forEach((mat) => mat.dispose())
      } else {
        model.material.dispose()
      }
    })
    this.items.ifcModels.length = 0
    this.items.pickableIfcModels.length = 0
    this.items = null
    this.ifcCamera.dispose()
    this.ifcCamera = null
    this.scene.dispose()
    this.scene = null
    this.renderer.dispose()
    this.mouse = null
    this.renderer = null
    this.events.dispose()
    this.events = null
    this.ifcCaster.dispose()
    this.ifcCaster = null
    this.ifcAnimator.dispose()
    this.ifcAnimator = null
    this.clock = null
    this.clippingPlanes.length = 0
    this.unsetWindowRescale()
  }
  getScene() {
    return this.scene.scene
  }
  getRenderer() {
    return this.renderer.renderer
  }
  getRenderer2D() {
    return this.renderer.renderer2D
  }
  getCamera() {
    return this.ifcCamera.activeCamera
  }
  getIfcCamera() {
    return this.ifcCamera
  }
  getDomElement() {
    return this.getRenderer().domElement
  }
  getDomElement2D() {
    return this.getRenderer2D().domElement
  }
  getContainerElement() {
    return this.options.container
  }
  getDimensions() {
    const element = this.getContainerElement()
    return new Vector2(element.clientWidth, element.clientHeight)
  }
  getClippingPlanes() {
    return this.clippingPlanes
  }
  getAnimator() {
    return this.ifcAnimator
  }
  getCenter(mesh) {
    mesh.geometry.computeBoundingBox()
    if (!mesh.geometry.index) {
      return new Vector3()
    }
    const indices = mesh.geometry.index.array
    const position = mesh.geometry.attributes.position
    const threshold = 20
    let xCoords = 0
    let yCoords = 0
    let zCoords = 0
    let counter = 0
    for (let i = 0; i < indices.length || i < threshold; i++) {
      xCoords += position.getX(indices[i])
      yCoords += position.getY(indices[i])
      zCoords += position.getZ(indices[i])
      counter++
    }
    return new Vector3(xCoords / counter + mesh.position.x, yCoords / counter + mesh.position.y, zCoords / counter + mesh.position.z)
  }

  addComponent(component) {
    this.items.components.push(component)
  }
  addClippingPlane(plane) {
    this.clippingPlanes.push(plane)
  }
  removeClippingPlane(plane) {
    const index = this.clippingPlanes.indexOf(plane)
    this.clippingPlanes.splice(index, 1)
  }
  castRay(items) {
    return this.ifcCaster.castRay(items)
  }
  castRayIfc() {
    return this.ifcCaster.castRayIfc()
  }
  fitToFrame() {
    this.ifcCamera.navMode[NavigationModes.Orbit].fitModelToFrame()
  }
  toggleCameraControls(active) {
    this.ifcCamera.toggleCameraControls(active)
  }
  updateAspect() {
    this.ifcCamera.updateAspect()
    this.renderer.adjustRendererSize()
  }
  updateAllComponents() {
    const delta = this.clock.getDelta()
    this.items.components.forEach((component) => component.update(delta))
  }
  setupWindowRescale() {
    window.addEventListener('resize', this.resize)
  }
  unsetWindowRescale() {
    window.removeEventListener('resize', this.resize)
  }
  newItems() {
    return {
      components: [],
      ifcModels: [],
      pickableIfcModels: [],
    }
  }
}
// # sourceMappingURL=context.js.map
