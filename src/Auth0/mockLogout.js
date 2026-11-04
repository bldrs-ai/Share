/**
 * The Playwright build's stand-in for auth0-react's `logout`, reproducing how
 * the pinned SDKs treat its options (auth0-react 2.0.0 `logout`, auth0-spa-js
 * 2.0.2 `Auth0Client.logout` + `_buildLogoutUrl`) so a spec exercises the
 * app's real call shape (Share#1923). The previous mock ignored its arguments
 * and always signed out in place, so a sign-out that never reached /v2/logout
 * (or had its `returnTo` dropped) passed every spec.
 *
 * What the SDKs do, in order, and so what this does:
 *  1. Clear the local session (the SDK's token cache; here the mock's
 *     persisted connection), before anything else.
 *  2. Build `<domain>/v2/logout?client_id=…` plus every `logoutParams` entry
 *     except `federated`, which is appended as a bare `&federated`. A
 *     top-level `returnTo` is NOT read.
 *  3. `openUrl` a function: call it with that URL. `false`: skip navigation.
 *     Absent: `window.location.assign(url)`.
 *  4. Only when `openUrl` was given (either form) does auth0-react dispatch
 *     LOGOUT, flipping `isAuthenticated` in place. A navigating logout leaves
 *     the in-memory state alone; the next page load comes up signed out.
 *
 * Left out: the SDK's `auth0Client` telemetry query param, a per-call
 * `clientId` override, and the deprecated `onRedirect`. Nothing in the app
 * passes the last two. `mockLogout.test.js` pins this against the real
 * `Auth0Client`.
 *
 * @param {object} [options] auth0-react `LogoutOptions`; absent is `{}`, as in the SDK
 * @param {object} deps
 * @param {string} deps.domain AUTH0_DOMAIN, with or without a scheme
 * @param {string} deps.clientId OAUTH2_CLIENT_ID
 * @param {Function} deps.clearSession step 1
 * @param {Function} deps.dispatchLogout step 4, the in-place sign-out
 * @param {Function} [deps.assign] step 3's navigation, a seam for tests
 * @return {Promise<void>}
 */
export async function mockLogout(options, {
  domain,
  clientId,
  clearSession,
  dispatchLogout,
  assign = (url) => window.location.assign(url),
}) {
  const {openUrl, logoutParams} = options ?? {}
  clearSession()
  const url = mockLogoutUrl({domain, clientId, logoutParams})
  if (openUrl) {
    await openUrl(url)
  } else if (openUrl !== false) {
    assign(url)
  }
  if (openUrl || openUrl === false) {
    dispatchLogout()
  }
}


/**
 * The `/v2/logout` URL auth0-spa-js 2.0.2 builds, without its telemetry param.
 *
 * @param {object} args
 * @param {string} args.domain with or without a scheme, as the SDK accepts
 * @param {string} args.clientId
 * @param {object} [args.logoutParams]
 * @return {string}
 */
export function mockLogoutUrl({domain, clientId, logoutParams = {}}) {
  const base = /^https?:\/\//.test(domain) ? domain : `https://${domain}`
  const {federated, ...params} = logoutParams
  // The SDK's createQueryParams strips undefined values rather than sending
  // the string "undefined".
  const entries = Object.entries({client_id: clientId, ...params}).filter(([, v]) => v !== undefined)
  const query = new URLSearchParams(entries).toString()
  return `${base}/v2/logout?${query}${federated ? '&federated' : ''}`
}
