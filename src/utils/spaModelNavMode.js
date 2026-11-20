// Whether opening a model is an in-app switch (react-router `navigate()`,
// open-205 #2011 Phase 1a), or the full page load it always was. One
// decision, read by everything that behaves differently for an in-app
// switch, so none of them can disagree about which mode a page is in:
//   - `navigateToModel` (utils/navigate.js), which picks the switch or the
//     page load;
//   - CadView's load ownership (`loadAbortRef`, `forgetLoadedModelState`,
//     the viewer-replaced reload; Containers/CadView.jsx, step A);
//   - `ShareIfc#dispose`, which aborts the engine loads still parsing into
//     the viewer it disposes (viewer/ifc/ShareIfc.js).
//
// On by default since step F (design/new/in-app-model-switch.md §4.8). The
// switches mirror the engine worker's (engine/engineRoute.js, engine-worker.md
// §7.2) and render-on-demand's (viewer/three/renderOnDemandMode.js):
//   - the ROLLBACK: `disableSpaModelNav` set `isActive: true` in
//     FeatureFlags.js. That, not `spaModelNav: false`, is the prod-wide kill
//     switch, because a static `true` here wins over every URL, while
//     `isFeatureEnabled` ORs a static `false` with the URL: flipping
//     `spaModelNav` off would leave every link that still carries
//     `?feature=spaModelNav` (a burn-in link, a spec, a shared preview URL)
//     switching in-app, and `withCurrentSearch` carries the query from one
//     open to the next, so such a session would never leave it;
//   - `?feature=disableSpaModelNav`, the per-session kill switch, for a bug
//     that looks like state left over from the previous model: reload with
//     it and every open is a page load again.
// Read from the URL at each call, like every other `?feature=`: the query
// rides from one open to the next (`withCurrentSearch`), so a page and the
// opens it makes agree.
import {flags, isFeatureEnabled} from '../FeatureFlags'


/** Why opening a model loads the page, by `modelPageLoadReason`. */
export const PageLoadReason = Object.freeze({
  // `disableSpaModelNav` is on in FeatureFlags.js: the prod-wide rollback,
  // which no `?feature=` in a URL can override.
  ROLLBACK: 'rollback',
  // `spaModelNav` is off and the URL does not opt in (the pre-flip default).
  FLAG_OFF: 'flagOff',
  // `?feature=disableSpaModelNav`, this session's kill switch.
  KILL_SWITCH: 'disableSpaModelNav',
})


/**
 * Why opening a model on this page must load the page, or `null` when it is
 * an in-app switch. The prod rollback is checked first, since nothing may
 * override it.
 *
 * @return {string|null} a `PageLoadReason`, or null
 */
export function modelPageLoadReason() {
  // First, and read from the static flag alone: the rollback has to beat a
  // `?feature=spaModelNav` in the URL, which the isFeatureEnabled checks
  // below would honour.
  if (flags?.find((f) => f.name === 'disableSpaModelNav')?.isActive) {
    return PageLoadReason.ROLLBACK
  }
  if (!isFeatureEnabled('spaModelNav')) {
    return PageLoadReason.FLAG_OFF
  }
  if (isFeatureEnabled('disableSpaModelNav')) {
    return PageLoadReason.KILL_SWITCH
  }
  return null
}


/**
 * @return {boolean} whether opening a model is an in-app switch on this page
 */
export function isSpaModelNavOn() {
  return modelPageLoadReason() === null
}


/**
 * The mode as one closed string, for a Sentry tag or a GA param: `in-app`,
 * or `page-load:<reason>`. Never anything about the model.
 *
 * @return {string}
 */
export function modelNavMode() {
  const reason = modelPageLoadReason()
  return reason === null ? 'in-app' : `page-load:${reason}`
}
