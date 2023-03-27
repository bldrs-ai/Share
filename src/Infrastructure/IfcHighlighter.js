import {EffectComposer, BlendFunction} from 'postprocessing'
import {Mesh} from 'three'
import {IfcContext} from 'web-ifc-viewer/dist/components'
import CustomPostProcessor from './CustomPostProcessor'

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
   * @param {IfcContext} context of the viewer
   * @param {CustomPostProcessor} the post-processor
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
    context.renderer.update = newUpdateFunction(context, postProcessor.getComposer)
  }


  /**
   * Highlights and outlines meshes in scene
   *
   * @param {Mesh[]} geometry meshes
   */
  setHighlighted(meshes) {
    this._selectionOutlineEffect.setSelection(meshes ?? [])
  }
}


/**
 * Returns a new update function that uses
 * the effectComposer rendering pipeline
 *
 * @param {IfcContext} context
 * @param {EffectComposer} composer
 * @return {Function} the new render function
 */
function newUpdateFunction(context, composer) {
  /**
   * Overrides the default update function in the context renderer
   *
   * @param {number} _delta
   */
  function newUpdateFn(_delta) {
    // eslint-disable-next-line no-invalid-this
    if (this.blocked || !context) {
      return
    }
    composer.render()
  }
  return newUpdateFn.bind(context.renderer)
}
