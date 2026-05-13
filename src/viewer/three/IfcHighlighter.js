import {BlendFunction, EffectComposer} from 'postprocessing'
import {Mesh} from 'three'
import CustomPostProcessor from './CustomPostProcessor'
import ThreeContext from './ThreeContext'


/**
 *  Overrides the default render functionality in the viewer
 * and adds a postprocessing effect (outlining selected elements)
 */
export default class IfcHighlighter {
  highlightedMeshes = null
  _selectionOutlineEffect = null

  /**
   * constructs new class
   *
   * @param {ThreeContext} context of the viewer
   * @param {CustomPostProcessor} postProcessor The post-processor
   */
  constructor(context, postProcessor) {
    this._selectionOutlineEffect = postProcessor.createOutlineEffect({
      blendFunction: BlendFunction.SCREEN,
      edgeStrength: 1.5,
      pulseSpeed: 0.0,
      visibleEdgeColor: 0xc7c7c7,
      hiddenEdgeColor: 0xff9b00,
      height: window.innerHeight,
      windth: window.innerWidth,
      blur: false,
      xRay: true,
      opacity: 1,
    })
    context.setRenderUpdate(newUpdateFunction(context, postProcessor.getComposer))
  }


  /**
   * Highlights and outlines meshes in scene
   *
   * @param {Mesh[]} meshes
   */
  setHighlighted(meshes) {
    this._selectionOutlineEffect.setSelection(meshes ?? [])
  }

  /**
   * Highlights and outlines meshes in scene
   *
   * @param {Mesh} mesh
   */
  addToHighlighting(mesh) {
    const currentSelection = this._selectionOutlineEffect.getSelection()
    if (mesh && currentSelection.indexOf(mesh) === -1) {
      currentSelection.add(mesh)
      // NOTE: the added mesh will be automatically be removed from the scene when the prepick changes
    }
  }
}


/**
 * Returns the per-frame render function used to drive the effect-composer
 * pipeline in place of the fork's default render path.
 *
 * Closes over the legacy renderer wrapper so the `blocked` flag (set by the
 * fork while taking an offscreen screenshot, see
 * `IfcRenderer.newScreenshot`) is consulted on every frame without relying
 * on the function's `this`. Keeping the closure private here means
 * `ThreeContext.setRenderUpdate` has no implicit binding contract.
 *
 * @param {ThreeContext} context
 * @param {EffectComposer} composer
 * @return {Function} the new render function
 */
function newUpdateFunction(context, composer) {
  const rendererWrapper = context.getLegacyRendererWrapper()
  return function newUpdateFn() {
    if (rendererWrapper.blocked || !context) {
      return
    }
    composer.render()
  }
}
