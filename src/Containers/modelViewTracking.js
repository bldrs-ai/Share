import {MODEL_ACTIONS, MODEL_GATES, modelRouteSource, trackModelAction} from '../privacy/analytics'
import useStore from '../store/useStore'
import {AUTH_SETTLE_RETRY_MS, waitForAuthSettled} from './authLoadGate'


/**
 * Send model_view for a real open (CadView, beside real_model_open) once
 * auth has SETTLED, with the auth state of that moment — design/new/quotas.md
 * §"Analytics: normalized tier events".
 *
 * Why not at the load's end: CadView starts a non-GitHub load (local, Drive,
 * `/v/p/`, generic URL) without waiting for auth, so the load can finish
 * while Auth0 is still restoring the session. The load's closure then holds
 * the pre-auth `isAuthenticated === false`, and the reload the auth change
 * would trigger is deduped, so a signed-in user's view would land as `anon`
 * (codex review on Share#1976).
 *
 * BaseRoutes sets appMetadata (processAccessToken) before it flips
 * `isAuthResolved`, so the tier reads the user's real claims. The wait is
 * capped at AUTH_SETTLE_RETRY_MS, like CadView's authed retry, so a stuck
 * token exchange still sends the view, with the best tier known by then.
 * Always `gate: 'none'`: a view a soft gate let through over the limit is
 * still an ungated view; the over-limit fact is model_share {gate: 'soft'}.
 *
 * @param {object} routeResult the opened route (routes.ts#handleRoute);
 *   read now, so a later navigation can't relabel this view
 * @param {Function} getIsAuthenticated returns the LATEST auth state when
 *   called (CadView passes a ref reader)
 * @return {Promise<void>} resolves once the event is sent; callers needn't await
 */
export function trackModelViewWhenAuthSettled(routeResult, getIsAuthenticated) {
  const source = modelRouteSource(routeResult)
  return waitForAuthSettled(AUTH_SETTLE_RETRY_MS).then(() => {
    trackModelAction(MODEL_ACTIONS.VIEW, {
      gate: MODEL_GATES.NONE,
      ...source,
      isAuthenticated: getIsAuthenticated(),
      appMetadata: useStore.getState().appMetadata,
    })
  })
}
