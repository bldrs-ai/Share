import {BlendFunction, EffectComposer} from 'postprocessing'
import {Mesh} from 'three'
import {withPerf} from '../../utils/PerfMonitor'
import CustomPostProcessor from './CustomPostProcessor'
import ThreeContext from './ThreeContext'
import {requestPaint, runPaint} from './renderDemand'


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
    // Wrap with the perf monitor.  When the `?feature=perf` flag is off
    // `withPerf` returns the function unchanged — the render closure has
    // no perf code, no branch, no closure overhead.  See DESIGN.md
    // "Render loop & perf monitor".
    context.setRenderUpdate(withPerf(newUpdateFunction(context, postProcessor.getComposer)))
  }


  /**
   * Highlights and outlines meshes in scene
   *
   * @param {Mesh[]} meshes
   */
  setHighlighted(meshes) {
    this._selectionOutlineEffect.setSelection(meshes ?? [])
    // The outline's selection is layers on the meshes, which no hook sees
    // (renderDemandHooks.js): ask, for a viewer painting on demand.
    requestPaint()
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
      requestPaint()
    }
  }

  /**
   * Remove a previously-added preselection mesh from the OutlineEffect's
   * selection set. Counterpart to `addToHighlighting` for callers that
   * track their own preselection slot and need to prune stale entries
   * before adding the next one (otherwise the set grows unboundedly
   * across hovers). The Conway-direct hover path uses this — its
   * per-Mesh subsets are freshly built each hover, so we can't rely on
   * `setHighlighted`'s wholesale replacement without clobbering the
   * coexisting selection-level highlights.
   *
   * @param {Mesh} mesh
   */
  removeFromHighlighting(mesh) {
    if (!mesh) {
      return
    }
    const currentSelection = this._selectionOutlineEffect.getSelection()
    if (currentSelection.indexOf(mesh) !== -1) {
      currentSelection.delete(mesh)
      requestPaint()
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
 * @return {Function} the new render function, which returns whether it
 *   painted (`withPerf` counts only the frames that did)
 */
export function newUpdateFunction(context, composer) {
  const rendererWrapper = context.getLegacyRendererWrapper()
  // Read once: one RenderDemand lives for the whole context.
  const demand = context.getRenderDemand?.() ?? null
  return function newUpdateFn() {
    if (rendererWrapper.blocked || !context) {
      return false
    }
    // While a model streams in, and for the whole session under
    // `?feature=renderOnDemand`, paint only when something asked
    // (renderDemand.js); every frame otherwise.
    if (demand !== null && !demand.shouldRender()) {
      return false
    }
    const startMs = performance.now()
    // runPaint: what three mutates while drawing (BatchedMesh's indirect
    // texture) must not count as a change that asks for the next paint.
    runPaint(() => composer.render())
    demand?.rendered(performance.now() - startMs)
    return true
  }
}
