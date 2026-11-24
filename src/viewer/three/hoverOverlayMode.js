// Whether the hover highlight is drawn as an overlay on a cached frame
// (hoverOverlay.js) instead of a recolour of the batch that repaints the whole
// model. One decision, read when the viewer is built (a theme change rebuilds
// it and reads it again): by IfcHighlighter, which builds the overlay; by
// IfcContext, which then leaves the canvas `pointermove` out of the settle
// window (renderDemandHooks.js#attachSessionNets, `pointerMoveSettles`); and,
// through the highlighter's `hoverOverlay`, by ShareViewer#highlightIfcItem.
//
// On by default since #2129. `disableHoverOverlay` is the off switch, the
// same inverted shape as `disableRenderOnDemand` and `disableInstanceBvh`:
// `?feature=disableHoverOverlay` for one session, `isActive: true` in
// FeatureFlags.js for prod (a static `true` wins over any URL, since
// `isFeatureEnabled` ORs the static value with the URL's).
//
// The overlay only pays while the viewer paints on demand: painting every
// frame, there is no "only the hover changed" frame to make cheap, and the
// cache copy each full paint makes would be pure cost. So with render on
// demand off (`?feature=disableRenderOnDemand`, the prod rollback) this says
// no and the hover recolours as before, whatever the URL asks.
import {isFeatureEnabled} from '../../FeatureFlags'
import {isRenderOnDemandOn} from './renderOnDemandMode'


/**
 * @return {boolean} whether this viewer draws hover as an overlay
 */
export function isHoverOverlayOn() {
  return !isFeatureEnabled('disableHoverOverlay') && isRenderOnDemandOn()
}
