import {FUNNEL_EVENTS, gtagFunnelEvent} from './analytics'


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

// Stand-in for localStorage when it throws (private mode, blocked site data),
// so a page that can't persist the marker still reports at most once per
// load rather than once per token it processes.
const reportedThisPage = new Map()


/**
 * Report subscription_started / subscription_ended for a token carrying a
 * pendingReauth status, at most once per transition.
 *
 * "Per transition" is the hard part: one pendingReauth token is processed
 * many times before the reauth that clears it — BaseRoutes' cached-token
 * pass and its background fresh-claims pass on every page load, every
 * reload while the user ignores the reauth modal, and every open tab. So the
 * last status reported is remembered per user, in localStorage, and only a
 * different pending status reports again. Because the server writes the
 * two strictly alternately (a tier change each way), that is exactly one
 * event per real transition — the sharePro/free statuses in between are
 * deliberately not consulted, since a stale cached token can still carry
 * one after the fresh token has gone pending, and clearing on it would
 * double-count on every boot.
 *
 * Known gap: the marker is per browser, so a user who sees the pending state
 * on two devices is counted on each.
 *
 * @param {?string} userId Auth0 `sub` of the token's user
 * @param {?string} status app_metadata.subscriptionStatus
 * @return {boolean} true when an event was sent
 */
export function trackSubscriptionStatus(userId, status) {
  const eventName = EVENT_FOR_STATUS[status]
  if (!eventName) {
    return false
  }
  const key = `${MARKER_KEY_PREFIX}${userId || 'unknown'}`
  if (reportedThisPage.get(key) === status || readMarker(key) === status) {
    return false
  }
  reportedThisPage.set(key, status)
  writeMarker(key, status)
  gtagFunnelEvent(eventName)
  return true
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


/** Test-only: forget what this page has reported. */
export function _resetSubscriptionTrackingForTests() {
  reportedThisPage.clear()
}
