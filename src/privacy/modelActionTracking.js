import {AUTH_SETTLE_RETRY_MS, waitForAuthSettled} from '../Containers/authLoadGate'
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
 * What is NOT deferred: `source` and `routeKind` are values the caller
 * snapshots at the call, so a navigation while waiting can't relabel the
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
 * @param {string} [details.tier] an explicit quota tier (TIERS); skips the wait
 * @param {Function} [details.getIsAuthenticated] returns the LATEST auth
 *   state when called (callers pass a ref reader); unset reads as signed out
 * @return {Promise<void>} resolves once the event is sent; callers needn't await
 */
export function trackModelActionWhenAuthSettled(action, {gate, source, routeKind, tier, getIsAuthenticated} = {}) {
  if (tier) {
    trackModelAction(action, {gate, source, routeKind, tier})
    return Promise.resolve()
  }
  return waitForAuthSettled(AUTH_SETTLE_RETRY_MS).then(() => {
    trackModelAction(action, {
      gate,
      source,
      routeKind,
      isAuthenticated: getIsAuthenticated ? getIsAuthenticated() === true : false,
      appMetadata: useStore.getState().appMetadata,
    })
  })
}
