/**
 * The asks for a paint: what anything that changes the picture calls, from
 * any layer, without holding the viewer. Cut from `viewer/three/renderDemand.js`,
 * which answers them and re-exports these, so viewer callers import them from
 * there as before; the model and the loader import them from here, below the
 * scheduler (design/tracks/open-t200/layering.md §2.2). The module doc of
 * renderDemand.js says what each ask means while a load runs and between
 * loads.
 */


/**
 * The camera-controls event a camera UI sends when the user works it: see
 * `noteUserCamera`.
 */
export const USER_CAMERA_EVENT = 'bldrsusercamera'


// Every live RenderDemand, so `requestPaint` reaches the viewer without the
// caller holding it. One viewer at a time today; a disposed one leaves.
// Exported for RenderDemand alone, which joins it when constructed and leaves
// it on dispose; nothing else adds to it or clears it.
export const liveDemands = new Set()
// Above zero while a paint runs (`runPaint`): the hooks don't count what
// three mutates inside its own render as a change to paint.
let paintDepth = 0


/**
 * The picture changed: paint it on the next frame, in every live viewer.
 * Cheap enough to call from anywhere (a flag per viewer). For the sources
 * three can't see change: `visible`, a material's colour or opacity, an
 * outline selection, a light. During a load it paints at once like any user
 * action; work the load pipeline does itself asks with
 * `requestBackgroundPaint` instead, which the load's frame budget spaces.
 */
export function requestPaint() {
  for (const demand of liveDemands) {
    demand.invalidate()
  }
}


/**
 * Only the hover overlay changed: the hovered instance(s), not the scene
 * under them (hoverOverlay.js). Between loads, with nothing else asking and
 * the probe still, the next frame redraws just the overlay on the cached
 * frame; anything else that asks in the same frame makes it a full paint,
 * which draws the overlay too. During a load, or off a session, it is a
 * plain `requestPaint`. The only caller is the overlay itself, and
 * `renderOnDemandSources.test.js` holds it to that.
 */
export function requestOverlayPaint() {
  for (const demand of liveDemands) {
    demand.invalidateOverlay()
  }
}


/**
 * The scene changed as part of ongoing work: paint when the budget allows
 * during a load, on the next frame otherwise. What the three hooks call
 * (renderDemandHooks.js). Ignored while a paint is running.
 */
export function requestBackgroundPaint() {
  if (paintDepth > 0) {
    return
  }
  for (const demand of liveDemands) {
    demand.invalidateBackground()
  }
}


/**
 * Run a draw, so that what three mutates inside it isn't taken for a change
 * (module doc). The render closure and the screenshot path draw through it.
 *
 * @param {Function} draw
 * @return {*} what `draw` returns
 */
export function runPaint(draw) {
  paintDepth++
  try {
    return draw()
  } finally {
    paintDepth--
  }
}
