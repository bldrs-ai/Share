import {useEffect, useRef} from 'react'
import {FUNNEL_EVENTS, gtagFunnelEvent} from '../privacy/analytics'
import {withCrossTabLock} from '../privacy/crossTabLock'
import {useAuth0} from './Auth0Proxy'


/*
 * Funnel "Signed in" step: GA4's recommended `login` {method} event, once per
 * completed sign-in — never for a boot that merely restores a cached session
 * (cacheLocation is localstorage, so most authenticated page loads are that).
 *
 * The app has two sign-in shapes, and they finish in different places:
 *
 *   - Popup (ProfileControl's login, the reauth modal): the main window
 *     opens /popup-auth, the popup round-trips Auth0 to /popup-callback, sets
 *     `refreshAuth` in localStorage and closes; the main window's storage
 *     listener (ProfileControl) then fetches a token, which flips the SDK's
 *     isAuthenticated false → true in place. That in-page edge is the
 *     signal — the hook only arms on a *settled* signed-out state
 *     (!isLoading && !isAuthenticated), which a cached-session boot never
 *     passes through (the SDK's initial state is isLoading, then INITIALISED
 *     with the user).
 *   - Full-page redirect (QuotaLimitDialog's "Sign up free", OpenModelDialog):
 *     the page reloads onto Auth0's callback and comes up already
 *     authenticated, so there is no in-page edge. The SDK calls
 *     onRedirectCallback exactly once for it, before it dispatches the
 *     authenticated state; Auth0ProviderWithHistory forwards that here via
 *     markRedirectLogin.
 *
 * The popup window runs the same provider and also gets onRedirectCallback
 * (its redirect_uri is /popup-callback). It is deliberately not counted
 * there: it closes itself immediately after, which can drop the beacon, and
 * the opener counts the same sign-in from its in-page edge.
 *
 * Every *other* open tab hears that same `refreshAuth` storage event and
 * makes the same edge, so the first tab to report records `sub|auth_time` in
 * localStorage and the rest skip it — under a Web Lock, so "first" is
 * well-defined even when the tabs race (claimLogin). `auth_time` (when the user last
 * actually authenticated, carried unchanged through refresh-token grants)
 * identifies one sign-in; it is read from the ID token because the SDK's
 * `user` strips it. Where it is unavailable (the mock provider has no
 * getIdTokenClaims) there is no cross-tab dedupe and the in-page edge alone
 * decides.
 */


const LAST_LOGIN_KEY = 'bldrs.ga.lastReportedLogin'


// Set by Auth0ProviderWithHistory's onRedirectCallback, consumed by the hook.
// Module state rather than React state because the callback runs inside the
// provider itself, above any component that could hold it, and it is a
// once-per-page-load fact anyway.
let isRedirectLoginPending = false


/**
 * Record that this page load completed a redirect sign-in. Called from
 * onRedirectCallback; ignored in the login popup (see the module comment).
 *
 * @param {string} [pathname] parameterized for tests
 */
export function markRedirectLogin(pathname = window.location.pathname) {
  if (pathname.endsWith('/popup-callback')) {
    return
  }
  isRedirectLoginPending = true
}


/**
 * The `method` param of `login`, normalized from the Auth0 user id's
 * connection prefix (`google-oauth2|…`, `github|…`, `auth0|…` for the
 * username/password database) to a small fixed set, so the GA4 dimension
 * stays readable and doesn't grow with Auth0's naming.
 *
 * It names the account's *primary* identity, not necessarily the button
 * pressed: Auth0 keeps the primary `sub` for a linked account (ManageProfile)
 * whichever linked connection was used to sign in.
 *
 * @param {?string} sub Auth0 user id
 * @return {'google'|'github'|'email'|'unknown'}
 */
export function loginMethodFromSub(sub) {
  const connection = typeof sub === 'string' ? sub.split('|')[0] : ''
  switch (connection) {
    case 'google-oauth2': return 'google'
    case 'github': return 'github'
    case 'auth0': return 'email'
    default: return 'unknown'
  }
}


/**
 * Emit `login` on each completed sign-in. Mount once, inside the Auth0
 * provider and on every route (BaseRoutes).
 */
export default function useLoginTracking() {
  const {isLoading, isAuthenticated, user, getIdTokenClaims} = useAuth0()
  // True once this page has seen a settled signed-out state. A ref, so
  // StrictMode's double effect run and token refreshes (new `user` object,
  // same session) re-run the effect without re-arming or re-firing it.
  const sawSignedOutRef = useRef(false)

  useEffect(() => {
    if (isLoading) {
      return
    }
    if (!isAuthenticated) {
      sawSignedOutRef.current = true
      return
    }
    if (!user) {
      return
    }
    const isInPageLogin = sawSignedOutRef.current
    const isRedirectLogin = isRedirectLoginPending
    if (!isInPageLogin && !isRedirectLogin) {
      return
    }
    sawSignedOutRef.current = false
    isRedirectLoginPending = false
    const sub = user.sub
    const method = loginMethodFromSub(sub)
    readAuthTime(getIdTokenClaims).then((authTime) => claimLogin(sub, authTime, method))
  }, [isLoading, isAuthenticated, user, getIdTokenClaims])
}


/**
 * @param {Function} [getIdTokenClaims] Auth0 SDK; absent in the mock provider
 * @return {Promise<?number>} the ID token's auth_time, or null
 */
async function readAuthTime(getIdTokenClaims) {
  if (typeof getIdTokenClaims !== 'function') {
    return null
  }
  try {
    const claims = await getIdTokenClaims()
    return claims?.auth_time ?? null
  } catch {
    return null
  }
}


/**
 * Claim the right to report this sign-in across tabs, and report it if won.
 *
 * The read-compare-write of LAST_LOGIN_KEY and the emit run under a Web Lock
 * named for that key (privacy/crossTabLock.js): every tab hears the same
 * `refreshAuth` storage event at about the same moment, so without it two
 * tabs can both read the previous sign-in's id before either writes this
 * one, and both emit. Where `navigator.locks` is missing the claim runs
 * unlocked and synchronously, and that race remains. This tab's own
 * double-fire guard is not here but in the hook (sawSignedOutRef /
 * isRedirectLoginPending are cleared synchronously before this is reached).
 *
 * @param {?string} sub
 * @param {?number} authTime
 * @param {string} method `login` event param
 * @return {Promise<boolean>} false when another tab (or an earlier pass)
 *   already reported this sign-in
 */
function claimLogin(sub, authTime, method) {
  if (authTime === null) {
    // No auth_time, no identity for the sign-in: nothing to dedupe on.
    gtagFunnelEvent(FUNNEL_EVENTS.LOGIN, {method})
    return Promise.resolve(true)
  }
  const id = `${sub}|${authTime}`
  return withCrossTabLock(LAST_LOGIN_KEY, () => {
    try {
      if (localStorage.getItem(LAST_LOGIN_KEY) === id) {
        return false
      }
      localStorage.setItem(LAST_LOGIN_KEY, id)
    } catch {
      // Storage unavailable: no cross-tab dedupe, the in-page edge decides.
    }
    gtagFunnelEvent(FUNNEL_EVENTS.LOGIN, {method})
    return true
  })
}


/** Test-only reset of module state. */
export function _resetLoginTrackingForTests() {
  isRedirectLoginPending = false
}
