// Whether this viewer paints on demand for the whole session (story #2055,
// renderDemand.js#startSession), or every frame between loads as before.
// One decision, read by `IfcContext` (context/context.js) when the viewer is
// built: it installs the scene hooks and starts the session only when this
// says so. Everything else that behaves differently on demand reads the
// session's own state (`RenderDemand#isSession`), never the flags, so nothing
// can disagree with the viewer about which mode it is in.
//
// On by default since the flip that followed #2096. The switches mirror the
// engine worker's (engine/engineRoute.js, engine-worker.md §7.2):
//   - the ROLLBACK: `disableRenderOnDemand` set `isActive: true` in
//     FeatureFlags.js. That, not `renderOnDemand: false`, is the prod-wide
//     kill switch, because a static `true` here wins over every URL, while
//     `isFeatureEnabled` ORs a static `false` with the URL: flipping
//     `renderOnDemand` off would leave every link that still carries
//     `?feature=renderOnDemand` (a burn-in link, an older spec, a shared
//     preview URL) on demand. DESIGN.md §"Render loop & perf monitor" has
//     the procedure;
//   - `?feature=disableRenderOnDemand`, the per-session kill switch, for a
//     stale-frame report: reload with it and the loop paints every frame.
// Read from the URL when the viewer is built, like every other `?feature=`:
// a theme change re-creates the viewer and reads it again.
import {flags, isFeatureEnabled} from '../../FeatureFlags'


/** Why the viewer paints every frame between loads, by `paintEveryFrameReason`. */
export const PaintEveryFrameReason = Object.freeze({
  // `disableRenderOnDemand` is on in FeatureFlags.js: the prod-wide rollback,
  // which no `?feature=` in a URL can override.
  ROLLBACK: 'rollback',
  // `renderOnDemand` is off and the URL does not opt in (the pre-flip default).
  FLAG_OFF: 'flagOff',
  // `?feature=disableRenderOnDemand`, this session's kill switch.
  KILL_SWITCH: 'disableRenderOnDemand',
})


/**
 * Why this viewer must paint every frame between loads, or `null` when it
 * paints on demand. The prod rollback is checked first, since nothing may
 * override it.
 *
 * @return {string|null} a `PaintEveryFrameReason`, or null
 */
export function paintEveryFrameReason() {
  // First, and read from the static flag alone: the rollback has to beat a
  // `?feature=renderOnDemand` in the URL, which the isFeatureEnabled checks
  // below would honour.
  if (flags?.find((f) => f.name === 'disableRenderOnDemand')?.isActive) {
    return PaintEveryFrameReason.ROLLBACK
  }
  if (!isFeatureEnabled('renderOnDemand')) {
    return PaintEveryFrameReason.FLAG_OFF
  }
  if (isFeatureEnabled('disableRenderOnDemand')) {
    return PaintEveryFrameReason.KILL_SWITCH
  }
  return null
}


/**
 * @return {boolean} whether the viewer paints on demand for the whole session
 */
export function isRenderOnDemandOn() {
  return paintEveryFrameReason() === null
}
