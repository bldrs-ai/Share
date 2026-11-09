import {gtagEvent} from '../privacy/analytics'
import debug from '../utils/debug'
import {reportRendererInfo} from './loadProgress'


/**
 * The report line for a batched model on a renderer without
 * `WEBGL_multi_draw`.
 */
export const NO_MULTI_DRAW_LINE =
  'Renderer: WEBGL_multi_draw unsupported; batched meshes draw one instance at a time'


/**
 * Say so, in the load report and once to GA, when a batched model has to
 * draw without `WEBGL_multi_draw` (Share#2094).
 *
 * A BatchedMesh draws all its instances in one multi-draw call where the
 * extension exists. Without it, three issues one draw per instance, which
 * leaves the load untouched but makes every frame slower on a large model.
 * Firefox 159 lacks the extension (PSB logs `THREE.WebGLRenderer:
 * WEBGL_multi_draw extension not supported.`). Until now only that console
 * warning said so, and a "navigation is slow" report had nothing to trace
 * it to. A model with no BatchedMesh draws the same either way, so it gets
 * no line.
 *
 * Diagnostic, not actionable for us (it is the browser's capability), so GA
 * only: `renderer_fallback {condition: 'no_multi_draw', format}` once per
 * load of a batched model, which counts the loads it affects (AGENTS.md,
 * "Reported Conditions"). Best-effort: nothing here may fail a load.
 *
 * @param {object} model the loaded model (Object3D)
 * @param {Function} getRenderer returns the THREE.WebGLRenderer, or anything
 *   without `extensions` (then nothing is said). Called inside the guard: a
 *   viewer that is not fully set up can throw from it, and that must not
 *   fail the load.
 * @param {string} [format] the model's format tag, for GA
 */
export function reportRendererLimits(model, getRenderer, format) {
  try {
    const extensions = getRenderer?.()?.extensions
    // The extension first: it is the rare case (Firefox), so on every other
    // renderer the model is never walked. `has` asks the context for the
    // extension, and three's own `get` is what warns; asking here adds no
    // console line.
    if (typeof extensions?.has !== 'function' || extensions.has('WEBGL_multi_draw')) {
      return
    }
    if (!hasBatchedMesh(model)) {
      return
    }
    reportRendererInfo(NO_MULTI_DRAW_LINE)
    gtagEvent('renderer_fallback', {condition: 'no_multi_draw', format: format ?? 'unknown'})
  } catch (e) {
    debug().log('reportRendererLimits: ', e)
  }
}


/**
 * Walked by hand rather than with `Object3D#traverse`, which can't stop: a
 * batched model's BatchedMesh is the root or one of its first children, so
 * this answers at once for exactly the models that get the line.
 *
 * @param {object} model
 * @return {boolean} whether the model draws through a BatchedMesh
 */
function hasBatchedMesh(model) {
  const pending = model ? [model] : []
  while (pending.length > 0) {
    const object = pending.pop()
    if (object.isBatchedMesh) {
      return true
    }
    if (Array.isArray(object.children)) {
      pending.push(...object.children)
    }
  }
  return false
}
