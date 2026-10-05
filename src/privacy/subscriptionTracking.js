import {jwtDecode} from 'jwt-decode'
import {APP_METADATA_CLAIM} from '../Auth0/appMetadata'
import {FUNNEL_EVENTS, gtagFunnelEvent} from './analytics'
import {withCrossTabLock} from './crossTabLock'


/*
 * The pendingReauth statuses the Stripe webhook / reconcile sweep write on a
 * tier change (netlify/functions/_lib/subscriptions.js): FREE→PRO writes
 * shareProPendingReauth, PRO→FREE writes freePendingReauth, and nothing is
 * written without a tier change. They are therefore the client's only
 * "they just paid" / "they just lapsed" moment — the next state, sharePro,
 * is reached through a reauth and also covers every renewal.
 */
const EVENT_FOR_STATUS = {
  shareProPendingReauth: FUNNEL_EVENTS.SUBSCRIPTION_STARTED,
  freePendingReauth: FUNNEL_EVENTS.SUBSCRIPTION_ENDED,
}

const MARKER_KEY_PREFIX = 'bldrs.ga.reportedSubscriptionStatus:'

// This page's own record of what it reported, checked synchronously before
// any lock is requested. It is the in-page guard while a lock request is
// pending (the cached and fresh passes can both be queued at once), and the
// stand-in for localStorage when that throws (private mode, blocked site
// data), so a page that can't persist the marker still reports at most once
// per load rather than once per token it processes.
const reportedThisPage = new Map()


/**
 * Report subscription_started / subscription_ended for a token carrying a
 * pendingReauth status, at most once per transition.
 *
 * "Per transition" is the hard part: one pendingReauth token is processed
 * many times before the reauth that clears it — BaseRoutes' cached-token
 * pass and its background fresh-claims pass on every page load, every
 * reload while the user ignores the reauth modal, and every open tab. So the
 * last status reported is remembered per user, in localStorage, and a
 * repeat of it is skipped. The server writes the two pending statuses
 * strictly alternately (a tier change each way), so a *different* pending
 * status is always a new transition.
 *
 * The same pending status can also be a new transition — subscribe, reauth
 * (→ sharePro), lapse (freePendingReauth), resubscribe — when this browser
 * never saw the freePendingReauth in between. So a settled status (sharePro,
 * or any free status, unset included: the server counts everything but the
 * two PRO values as FREE) clears the marker — but only when it comes from a
 * FRESH token (`isFresh`: one whose claims reflect app_metadata as of now —
 * BaseRoutes' cacheMode:'off' pass, and the token ProfileControl reads right
 * after a popup sign-in, which the popup has just minted; see
 * trackSubscriptionFromToken). Settled statuses on the cached token are
 * ignored: a stale cached token can still carry one after the fresh token
 * has gone pending, and clearing on it would double-count on every boot,
 * since every boot runs the cached pass before the fresh one lands.
 *
 * What the fresh-only reset buys: a lapse + resubscribe this browser never
 * observed is counted, provided the user completed the reauth in between
 * (and this browser then saw a fresh token showing it settled — the popup
 * that completes the reauth yields one, as does any later full page load).
 * Residual
 * gap: if the user never completes the reauth between two transitions, the
 * marker is never cleared and a repeat of the same pending status is still
 * suppressed. And the marker is per browser, so a user who sees the pending
 * state on two devices is counted on each.
 *
 * Across tabs the read-check-write runs under a Web Lock named for the
 * marker key (crossTabLock.js), so two tabs processing the same token can't
 * both read the old marker and both emit. The in-page guard is set
 * synchronously, before the lock is requested, so this page's own passes
 * can't double-fire while the request is pending.
 *
 * @param {?string} userId Auth0 `sub` of the token's user
 * @param {?string} status app_metadata.subscriptionStatus
 * @param {object} [opts]
 * @param {boolean} [opts.isFresh] the token's claims are current (the
 *   fresh-claims pass, or a just-completed popup sign-in), not possibly-stale
 *   SDK cache
 * @return {Promise<boolean>} true when an event was sent
 */
export function trackSubscriptionStatus(userId, status, {isFresh = false} = {}) {
  const key = `${MARKER_KEY_PREFIX}${userId || 'unknown'}`
  const eventName = EVENT_FOR_STATUS[status]
  if (!eventName) {
    if (!isFresh) {
      return Promise.resolve(false)
    }
    reportedThisPage.delete(key)
    return withCrossTabLock(key, () => {
      removeMarker(key)
      return false
    })
  }
  if (reportedThisPage.get(key) === status) {
    return Promise.resolve(false)
  }
  reportedThisPage.set(key, status)
  return withCrossTabLock(key, () => {
    if (readMarker(key) === status) {
      return false
    }
    writeMarker(key, status)
    gtagFunnelEvent(eventName)
    return true
  })
}


/**
 * trackSubscriptionStatus for an Auth0 access token: reads the user (`sub`)
 * and app_metadata.subscriptionStatus (APP_METADATA_CLAIM, the same claim
 * BaseRoutes reads) from the JWT. Shared by the two callers that hold a raw
 * token — BaseRoutes#processAccessToken and ProfileControl's post-popup
 * refresh — so they can't drift on which claim they read.
 *
 * A token that doesn't decode (the mock provider's, an opaque token from a
 * misconfigured audience) reports nothing: funnel analytics must never
 * break the auth path that called it.
 *
 * @param {string} token Auth0 access token
 * @param {object} [opts]
 * @param {boolean} [opts.isFresh] see trackSubscriptionStatus
 * @return {Promise<boolean>} true when an event was sent
 */
export function trackSubscriptionFromToken(token, {isFresh = false} = {}) {
  let claims
  try {
    claims = jwtDecode(token)
  } catch {
    return Promise.resolve(false)
  }
  return trackSubscriptionStatus(claims?.sub, claims?.[APP_METADATA_CLAIM]?.subscriptionStatus, {isFresh})
}


/**
 * @param {string} key
 * @return {?string}
 */
function readMarker(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}


/**
 * @param {string} key
 * @param {string} status
 */
function writeMarker(key, status) {
  try {
    localStorage.setItem(key, status)
  } catch {
    // reportedThisPage already holds it for this page.
  }
}


/** @param {string} key */
function removeMarker(key) {
  try {
    localStorage.removeItem(key)
  } catch {
    // Nothing persisted to clear; reportedThisPage is already cleared.
  }
}


/** Test-only: forget what this page has reported. */
export function _resetSubscriptionTrackingForTests() {
  reportedThisPage.clear()
}
