import {EffectComposer} from 'postprocessing'
import {Mesh} from 'three'
import {IfcContext} from 'web-ifc-viewer/dist/components'
import createComposer from './CustomPostProcessing'


/**
 *  Overrides the default render functionality in the viewer
 * and adds a postprocessing effect (outlining selected elements)
 */
export default class IfcHighlighter {
  highlightedMeshes = null
  _outlineEffect = null
  /**
   * constructs new class
   *
   * @param {IfcContext} context of the viewer
   */
  constructor(context) {
    // override the viewer rendering pipeline
    const renderer = context.getRenderer()
    const scene = context.getScene()
    const camera = context.getCamera()
    const {composer, outlineEffect} = createComposer(renderer, scene, camera)
    this._outlineEffect = outlineEffect
    context.renderer.update = newUpdateFunction(context, composer)
  }


  /**
   * Highlights and outlines meshes in scene
   *
   * @param {Mesh} geometry meshes
   */
  setHighlighted(meshes) {
    this._outlineEffect.setSelection(meshes ?? [])
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
