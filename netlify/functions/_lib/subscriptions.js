/*
 * netlify/functions/_lib/subscriptions.js
 * ---------------------------------------
 * The one definition of "is this Stripe customer entitled to Share Pro, and
 * what should Auth0 say about it", shared by `stripe-webhook.js` (per event)
 * and `reconcile-subscriptions.js` (daily sweep). bldrs-ai/ops#34 is why
 * these live in one place: a stale "Pro" in Auth0 for a customer whose
 * subscription had ended could come from either path, and the rules for
 * repairing it must be the same on both.
 *
 * Model:
 *  - A customer is ENTITLED when any of their subscriptions carries the Share
 *    Pro price in an entitling status: `active`, `trialing`, or `past_due`.
 *    `past_due` is Stripe's dunning window — a card retry is pending and
 *    Stripe moves the subscription to `canceled` / `unpaid` if it fails — so
 *    access holds through it rather than bouncing the user out and back in.
 *    `incomplete` (first payment never succeeded), `incomplete_expired`,
 *    `unpaid`, `paused` and `canceled` are not entitling.
 *  - Auth0 `app_metadata.subscriptionStatus` has two tiers: PRO
 *    (`sharePro`, `shareProPendingReauth`) and FREE (anything else, including
 *    unset). `shareProPendingReauth` / `freePendingReauth` make the client
 *    reauthenticate for the matching GitHub scope (src/BaseRoutes.jsx); what
 *    promotes `shareProPendingReauth` to `sharePro` afterwards is an Auth0
 *    Action outside this repo (ops#34).
 *  - A write happens only when the TIER changes: FREE→PRO writes
 *    `shareProPendingReauth`, PRO→FREE writes `freePendingReauth`. A renewal
 *    (`customer.subscription.updated`) for a `sharePro` user therefore
 *    writes nothing, instead of sending a paying user back through the
 *    reauth modal every billing period.
 *
 * Also here: the upstream-failure classification both callers use to decide
 * between "retry later" and "this will never succeed", and a small inline
 * retry for the webhook's corrective write.
 */

export const PRO_AUTH0_STATUSES = new Set(['sharePro', 'shareProPendingReauth'])
export const ENTITLING_STRIPE_STATUSES = new Set(['active', 'trialing', 'past_due'])
export const PRO_PENDING_STATUS = 'shareProPendingReauth'
export const FREE_PENDING_STATUS = 'freePendingReauth'

const HTTP_BAD_REQUEST = 400
const HTTP_NOT_FOUND = 404
const HTTP_GONE = 410
const HTTP_UNPROCESSABLE = 422
// Upstream answers that mean "this request will never succeed". Everything
// else — no status at all (network), 401/403 (a revoked key is a config
// fault someone will fix), 408/409/429, 5xx — is worth retrying.
const PERMANENT_UPSTREAM_STATUSES = new Set([HTTP_BAD_REQUEST, HTTP_NOT_FOUND, HTTP_GONE, HTTP_UNPROCESSABLE])
// A customer with more subscriptions than this is not a real Share customer;
// the list call asks for this many and ignores `has_more`.
const SUBSCRIPTIONS_PER_CUSTOMER = 100


/**
 * @param {object} subscription Stripe subscription object
 * @param {string} proPriceId SHARE_PRO_PRICE_ID
 * @return {boolean} whether this one subscription grants Share Pro
 */
export function isEntitlingSubscription(subscription, proPriceId) {
  if (!subscription || !ENTITLING_STRIPE_STATUSES.has(subscription.status)) {
    return false
  }
  const items = subscription.items && subscription.items.data
  return Array.isArray(items) && items.some((item) => item.price && item.price.id === proPriceId)
}


/**
 * Whether a Stripe customer is entitled now, from ALL of their subscriptions
 * (status `all`, so a canceled one and a live one side by side resolve to
 * entitled).
 *
 * @param {object} stripe Stripe client
 * @param {string} customerId
 * @param {string} proPriceId
 * @return {Promise<boolean>}
 */
export async function isCustomerEntitled(stripe, customerId, proPriceId) {
  const page = await stripe.subscriptions.list({customer: customerId, status: 'all', limit: SUBSCRIPTIONS_PER_CUSTOMER})
  return page.data.some((subscription) => isEntitlingSubscription(subscription, proPriceId))
}


/**
 * @param {string|undefined} auth0Status app_metadata.subscriptionStatus
 * @return {boolean} whether Auth0 currently marks the user Pro
 */
export function isProInAuth0(auth0Status) {
  return PRO_AUTH0_STATUSES.has(auth0Status)
}


/**
 * The subscriptionStatus to write, or null when the tier already matches.
 *
 * @param {boolean} entitled
 * @param {string|undefined} auth0Status current app_metadata.subscriptionStatus
 * @return {?string}
 */
export function statusTransition(entitled, auth0Status) {
  if (entitled === isProInAuth0(auth0Status)) {
    return null
  }
  return entitled ? PRO_PENDING_STATUS : FREE_PENDING_STATUS
}


/**
 * The HTTP status an upstream failure carried: axios puts it on
 * `err.response.status`, the Stripe SDK on `err.statusCode`, and
 * `_lib/auth0.js`'s ManagementApiError on `err.upstreamStatus`.
 *
 * @param {Error} err
 * @return {?number} null for a failure with no response (network, timeout)
 */
export function upstreamStatus(err) {
  if (!err) {
    return null
  }
  return (err.response && err.response.status) || err.statusCode || err.upstreamStatus || null
}


/**
 * Whether a failure can never succeed on retry.
 *
 * @param {Error} err
 * @return {boolean}
 */
export function isPermanentFailure(err) {
  // Stripe's explicit directive beats the status either way, as it does in
  // stripe-node's own retry logic (RequestSender._shouldRetry checks it
  // before the 409 and 5xx branches, and notes most Stripe 500s carry
  // `false`). The SDK keeps the response headers on the error.
  const directive = err && err.headers && err.headers['stripe-should-retry']
  if (directive === 'true') {
    return false
  }
  if (directive === 'false') {
    return true
  }
  return PERMANENT_UPSTREAM_STATUSES.has(upstreamStatus(err))
}


/**
 * Run `fn`, retrying transient failures after each delay in turn. A
 * permanent failure, or the last transient one, is rethrown.
 *
 * @param {Function} fn async, no arguments
 * @param {Array<number>} delaysMs one retry per entry
 * @return {Promise<*>} fn's result
 */
export async function retryTransient(fn, delaysMs) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt >= delaysMs.length || isPermanentFailure(err)) {
        throw err
      }
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]))
    }
  }
}
