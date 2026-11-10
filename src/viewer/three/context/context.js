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
import RenderDemand from '../renderDemand'
import {attachSessionNets, createSceneProbe, installSceneHooks} from '../renderDemandHooks'
import {isHoverOverlayOn} from '../hoverOverlayMode'
import {isRenderOnDemandOn} from '../renderOnDemandMode'
import {reportRenderMode} from '../reportRenderMode'


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
    // Whether a frame paints while a model streams in (open-205 #2043).
    // Consulted by the render closure ThreeContext#setRenderUpdate installs;
    // inert (every frame paints) outside a progressive load.
    this.renderDemand = new RenderDemand()
    // Render-on-demand (story #2055, on by default): on demand for the whole
    // session, so an idle viewer paints nothing. renderDemand.js's module
    // doc lists the layers that ask for a paint; these are its automatic ones.
    // renderOnDemandMode.js decides, so its kill switch and prod rollback are
    // the only ways this is skipped; nothing else reads the flags.
    this.endRenderSession = null
    // Tag Sentry and tell GA which mode this session runs in (best-effort).
    reportRenderMode()
    if (isRenderOnDemandOn()) {
      installSceneHooks()
      const stopSession = this.renderDemand.startSession({
        controls: this.ifcCamera.cameraControls,
        probe: createSceneProbe(this),
      })
      // With the hover overlay a canvas pointer move asks for its own paint
      // instead of opening a settle window (attachSessionNets has why).
      const detachNets = attachSessionNets(this.renderDemand, this.renderer.renderer.domElement,
        {pointerMoveSettles: !isHoverOverlayOn()})
      this.endRenderSession = () => {
        detachNets()
        stopSession()
      }
    }
    this.ifcAnimator = new Animator()
    this.setupWindowRescale()
    this.render()
  }
  dispose() {
    let _a; let _b; let _c
    this.endRenderSession?.()
    this.endRenderSession = null
    this.renderDemand?.dispose()
    this.isThisBeingDisposed = true;
    (_a = this.stats) === null || _a === void 0 ? void 0 : _a.dom.remove();
    (_b = this.options.preselectMaterial) === null || _b === void 0 ? void 0 : _b.dispose();
    (_c = this.options.selectMaterial) === null || _c === void 0 ? void 0 : _c.dispose()
    this.options = null
    this.items.components.length = 0
    this.items.ifcModels.forEach((model) => {
      model.removeFromParent()
      // Free any attached subset controller (batched isolation subsets + their
      // baked geometries; no-op on models without one).
      model.disposeSubsets?.()
      // Dispose by traversal so every model shape frees its GPU resources: a
      // plain Mesh (merged / wit-three), a BatchedMesh (Conway-direct
      // `?feature=batchedMesh`), or a Group of either (batched opaque+
      // transparent, or a GLB cache-hit). The old single-Mesh assumption threw
      // on a Group (no `.geometry` / `.material`), aborting disposal mid-loop
      // and leaking the remaining models.
      model.traverse((obj) => {
        if (obj.isBatchedMesh) {
          // Per-geometry BVH (patched onto the prototype in ShareIfc) + the
          // batch's internal matrix/color textures + packed geometry.
          obj.disposeBoundsTree?.()
          obj.dispose?.()
        } else if (obj.isMesh) {
          if (obj.geometry?.boundsTree) {
            obj.geometry.disposeBoundsTree()
          }
          obj.geometry?.dispose?.()
        }
        const material = obj.material
        if (Array.isArray(material)) {
          material.forEach((mat) => mat?.dispose?.())
        } else {
          material?.dispose?.()
        }
      })
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
    if (this.renderDemand?.isSession !== true) {
      this.items.components.forEach((component) => component.update(delta))
      return
    }
    // On demand (`?feature=renderOnDemand`): move the camera before the
    // paint, not after it. Components update in registration order, and the
    // renderer registers before the camera, so in that order a frame paints
    // the pose camera-controls had at the END of the previous frame: input
    // shows a frame late, and the frame an input's `controlstart` asks for
    // paints the old pose and is wasted. Flag off keeps the vendored order
    // (story #2055 has the before/after input latency).
    const renderer = this.renderer
    this.items.components.forEach((component) => {
      if (component !== renderer) {
        component.update(delta)
      }
    })
    renderer.update(delta)
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
