// Says, on every Sentry event and on the GA events that count a load, whether
// the model was the page's first open or one switched to in-app, and which
// mode the page opens models in (open-205 step F, in-app-model-switch.md
// §4.8). With the in-app switch on for everyone, a bug that only shows on a
// second open in one document (state left over from the previous model, an
// engine not freed, a listener bound to a disposed viewer) is otherwise
// indistinguishable from the same failure on a fresh page.
//
// Closed values only, never anything about the model:
//   - `model_open`: `page` for the page's first open (the one a page load
//     makes, kill switch or not), `in_app` for every later open in the same
//     document. A theme or view-settings reload keeps its open's kind, since
//     it is the same open (routes/modelOpen.ts).
//   - `model_nav`: `in-app`, or `page-load:<reason>` with the kill switch or
//     the rollback on (utils/spaModelNavMode.js#modelNavMode).
// Sentry gets both as sticky scope tags, set at the start of each load, so a
// failed load's capture (CadView) and any later exception on that model carry
// them; no event of their own. GA gets `open_kind` as a param of the events
// that already count opens and failures (`real_model_open`, `load_failed`,
// `model_load_aborted`), so the failure rate splits by it without a new event.
import {setTag} from '@sentry/react'
import {modelOpenId} from '../routes/modelOpen'
import {modelNavMode} from './spaModelNavMode'


/** The `model_open` tag and `open_kind` param values. */
export const OpenKind = Object.freeze({
  PAGE: 'page',
  IN_APP: 'in_app',
})


// The page's first open, by its number (routes/modelOpen.ts). Numbers are
// handed out per route result as they are first asked for; the first load
// this page runs is its first open's, so the first number seen here is it.
let firstOpenId = null


/**
 * @param {object} routeResult the store's modelPath for the load
 * @return {string|undefined} an `OpenKind`, or undefined with no route
 */
export function modelOpenKind(routeResult) {
  const openId = modelOpenId(routeResult)
  if (openId === 0) {
    return undefined
  }
  if (firstOpenId === null) {
    firstOpenId = openId
  }
  return openId === firstOpenId ? OpenKind.PAGE : OpenKind.IN_APP
}


/**
 * Tag Sentry with this load's open kind and the page's nav mode.
 * Best-effort: nothing here may throw into a load.
 *
 * @param {object} routeResult the store's modelPath for the load
 * @return {string|undefined} the open kind, for the GA params
 */
export function tagModelOpen(routeResult) {
  let openKind
  try {
    openKind = modelOpenKind(routeResult)
    setTag('model_open', openKind)
    setTag('model_nav', modelNavMode())
  } catch (e) {
    // Reporting is best-effort.
  }
  return openKind
}


/** Test seam: forget the page's first open. */
export function resetModelOpenReportForTest() {
  firstOpenId = null
}
