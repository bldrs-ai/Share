import {assertDefined} from '../utils/assert.js'
import debug from '../utils/debug.js'
import {AmbientLight, AxesHelper, Scene} from 'three'


/**
 * @param {object} sceneContext IfcViewerAPI.IFC.context
 */
export function addSceneLayer(sceneContext) {
  assertDefined(sceneContext)
  const ifcRenderer = sceneContext.getRenderer()
  const scene = sceneContext.getScene()
  const camera = sceneContext.getCamera()
  debug().log('sceneContext parts: ', sceneContext, ifcRenderer, scene, camera)
  const sceneLayer = new Scene()

  // Demo: add scene object
  sceneLayer.add(new AmbientLight())
  const axes = new AxesHelper()
  const axesScale = 100
  axes.scale.multiplyScalar(axesScale)
  sceneLayer.add(axes)

  // Demo: optional animation
  // anim = () => {...}
  // TODO(pablo): These no longer work; reference only.
  // sceneContext.ifcCamera.targetItem(axes.position)
  // camera.lookAt(axes.position)

  /**
   * This is a custom render pass that allows both IFC.js's scene
   * and a new Three.js scene to be rendered on the same canvas.
   *
   * See:
   * https://discourse.threejs.org/t/rendering-multiple-scenes-with-renderpass/24648/2
   * https://stackoverflow.com/questions/30272190/threejs-rendering-multiple-scenes-in-a-single-webgl-renderer
   */
  const renderPatch = () => {
    if (sceneContext.isThisBeingDisposed) {
      return
    }
    if (sceneContext.stats) {
      sceneContext.stats.begin()
    }
    // ifcRenderer.autoClear = true
    sceneContext.updateAllComponents()
    // ifcRenderer.autoClear = false
    // ifcRenderer.clearDepth()
    // TODO(pablo): Maybe also? ifcRenderer.clearDepth();

    // Demo: optional animation
    // if (anim) {
    //   anim()
    // }

    ifcRenderer.render(sceneLayer, camera)
    if (sceneContext.stats) {
      sceneContext.stats.end()
    }
    requestAnimationFrame(sceneContext.render)
  }

  // We're replacing the web-ifc-viewer renderer with a locally
  // patched version.
  sceneContext.render = renderPatch
}
