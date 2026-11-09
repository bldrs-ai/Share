// Reports which render mode this page session runs in (on demand, or every
// frame and why), so a stale-frame bug report or any Sentry exception shows
// the mode it happened in, and GA counts how many sessions run with the kill
// switch or the prod rollback. See DESIGN.md §"Render loop & perf monitor".
//
// The mode is constant for a page session, which is why a sticky Sentry scope
// tag is right (no event of its own). GA gets one event per page load; the
// module flag keeps an in-app viewer rebuild (model switch, theme change) from
// resending it, while re-setting the tag is harmless.
import {setTag} from '@sentry/react'
import {gtagEvent} from '../../privacy/analytics'
import {paintEveryFrameReason} from './renderOnDemandMode'


let sentGaEvent = false


/**
 * Tag Sentry with, and tell GA, the current render mode. Best-effort: each
 * sink is isolated, and nothing here may throw into viewer construction.
 */
export function reportRenderMode() {
  let mode
  try {
    const reason = paintEveryFrameReason()
    mode = reason === null ? 'on-demand' : `every-frame:${reason}`
  } catch (e) {
    return
  }
  try {
    setTag('render_mode', mode)
  } catch (e) {
    // Reporting is best-effort.
  }
  if (sentGaEvent) {
    return
  }
  try {
    // gtagEvent returns false when it dropped the event (gtag/js not loaded
    // yet or blocked, or no consent); stay unsent then, so a later viewer
    // rebuild, or an opt-in, still sends it (#2110, #2109). Inside the try:
    // isAllowed reads document.cookie, which throws in a sandboxed iframe, and
    // nothing here may throw into viewer construction.
    if (!gtagEvent('render_mode', {mode})) {
      return
    }
    sentGaEvent = true
  } catch (e) {
    // Reporting is best-effort.
  }
}


/** Test seam: forget that the GA event was sent. */
export function resetRenderModeReportForTest() {
  sentGaEvent = false
}
