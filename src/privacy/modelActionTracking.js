import {AUTH_SETTLE_RETRY_MS} from '../Containers/authLoadGate'
import useStore from '../store/useStore'
import {trackModelAction} from './analytics'


/**
 * Send one normalized model-action event (model_view / model_share /
 * model_export, analytics.js#MODEL_ACTION_EVENTS) with the tier of the user
 * once auth has SETTLED — design/new/quotas.md §"Analytics: normalized tier
 * events". Every normalized event goes through here; trackModelAction is
 * not called directly anywhere else (modelActionTracking.test.js pins that).
 *
 * Why wait: Share renders, loads models and opens dialogs without waiting
 * for Auth0 to restore a returning user's session. An action taken in that
 * window — a local model finishing its load, a click on Share, an export
 * gate's help opening — sees the pre-auth `isAuthenticated === false` and
 * empty claims, so a signed-in free or Pro user would land in the `anon`
 * cell. The callers' effects and handlers don't re-run when auth lands
 * (the load's reload is deduped; ShareDialog keeps auth out of its deps so
 * a sign-in doesn't count a second share), so the event is never corrected
 * (codex review on Share#1976, rounds 1 and 2). So the tier is read at EMIT
 * time, not at the call: `tier` means who the user is, `gate` what they saw.
 *
 * BaseRoutes sets appMetadata (processAccessToken) before it flips
 * `isAuthResolved`, so the tier reads the user's real claims. The wait is
 * capped at AUTH_SETTLE_RETRY_MS, like CadView's authed retry, so a stuck
 * token exchange still sends the event, with the best tier known by then.
 *
 * Settled means settled FOR the sign-in state the caller now reads, not
 * just `isAuthResolved` (codex review on Share#1976, round 3). A popup
 * sign-in starts in a page that already settled as signed out, so
 * isAuthResolved is true throughout; when the popup finishes, Auth0 flips
 * `isAuthenticated` to true while BaseRoutes is still fetching the new
 * session's token, and an event sent then read signed-in with no claims:
 * a Pro user's export or share counted as `free`. So this waits until the
 * store's `authResolvedFor` (the isAuthenticated BaseRoutes' last
 * settlement was for, store/RepositorySlice.js) equals the caller's live
 * isAuthenticated, i.e. the claims in the store belong to the state the
 * user is in. An action while the popup is still open needs no wait: the
 * user is signed out then, the signed-out settlement matches, and it is
 * `anon`. The rule, as design/new/quotas.md states it: the tier is that of
 * the sign-in state the user is in when the event is sent, read from that
 * state's own claims.
 *
 * What is NOT deferred: `source`, `routeKind` and `contentId` are values the
 * caller snapshots at the call, so a navigation while waiting can't relabel the
 * action. And a caller that passes an explicit `tier` — a gate's own
 * verdict (QuotaLimitDialog's prop, record-load's answer) or a refusal that
 * is free-tier by definition (useExport's no_slot) — sends at once: the
 * tier isn't read from auth, so there is nothing to wait for.
 *
 * @param {string} action 'view' | 'share' | 'export' (MODEL_ACTIONS)
 * @param {object} details
 * @param {string} details.gate one of MODEL_GATES
 * @param {string} [details.source] snapshotted by the caller
 * @param {string} [details.routeKind] snapshotted by the caller
 * @param {string} [details.contentId] analytics.js#modelContentId of the
 *   model acted on, snapshotted by the caller; omitted when unknown
 * @param {string} [details.tier] an explicit quota tier (TIERS); skips the wait
 * @param {Function} [details.getIsAuthenticated] returns the LATEST auth
 *   state when called (callers pass a ref reader); unset reads as signed out
 * @return {Promise<void>} resolves once the event is sent; callers needn't await
 */
export function trackModelActionWhenAuthSettled(action, {gate, source, routeKind, contentId, tier, getIsAuthenticated} = {}) {
  if (tier) {
    trackModelAction(action, {gate, source, routeKind, contentId, tier})
    return Promise.resolve()
  }
  const readIsAuthenticated = () => (getIsAuthenticated ? getIsAuthenticated() === true : false)
  return waitForSettledFor(readIsAuthenticated, AUTH_SETTLE_RETRY_MS).then(() => {
    trackModelAction(action, {
      gate,
      source,
      routeKind,
      contentId,
      isAuthenticated: readIsAuthenticated(),
      appMetadata: useStore.getState().appMetadata,
    })
  })
}


/**
 * Resolve once BaseRoutes has settled auth for the sign-in state
 * `readIsAuthenticated` returns, or after timeoutMs. authLoadGate's
 * waitForAuthSettled checks isAuthResolved alone, which is right for the
 * load gates (they need the token, not the claims' owner) and wrong here:
 * see the popup sign-in note above.
 *
 * Re-checked on every store change. The live isAuthenticated is a ref, not
 * store state, but it flips in the render that starts BaseRoutes' token
 * fetch, and the settlement that ends the wait is a store write after it.
 *
 * @param {Function} readIsAuthenticated returns the live sign-in state
 * @param {number} timeoutMs
 * @return {Promise<boolean>} true iff settled for that state within the window
 */
function waitForSettledFor(readIsAuthenticated, timeoutMs) {
  const isSettled = (state) => state.isAuthResolved && state.authResolvedFor === readIsAuthenticated()
  if (isSettled(useStore.getState())) {
    return Promise.resolve(true)
  }
  return new Promise((resolve) => {
    let timer = null
    const unsubscribe = useStore.subscribe((state) => {
      if (isSettled(state)) {
        clearTimeout(timer)
        unsubscribe()
        resolve(true)
      }
    })
    timer = setTimeout(() => {
      unsubscribe()
      resolve(false)
    }, timeoutMs)
  })
}
