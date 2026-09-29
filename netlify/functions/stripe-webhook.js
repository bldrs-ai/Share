/*
 * Netlify Function: stripe-webhook.js
 * -----------------------------------
 * Mirrors Stripe subscription lifecycle into Auth0 `app_metadata`.
 *
 *   POST /.netlify/functions/stripe-webhook
 *   Headers: Stripe-Signature: t=…,v1=…
 *   Body:    the raw Stripe event JSON (signature is over these exact bytes)
 *
 * On `customer.subscription.created` and `.deleted`, the status written is
 * derived from the subscription's CURRENT state, fetched from Stripe, not
 * from the event payload:
 *   ended (canceled / incomplete_expired) → 'freePendingReauth'
 *   otherwise, Share Pro price             → 'shareProPendingReauth'
 *   otherwise                              → the Stripe status
 * Stripe doesn't guarantee delivery order, and a failed delivery is retried
 * later — so a `created` retried after its subscription's `deleted` would,
 * if it trusted its own payload, re-mark a cancelled user as Pro. Reading
 * the current state makes every delivery write the same, latest truth, in
 * whatever order they land.
 *
 * Response codes are chosen for what Stripe does with them, since Stripe
 * retries any non-2xx with backoff for up to three days
 * (https://docs.stripe.com/webhooks#retries):
 *   - 200 once the update is written, and also for PERMANENT conditions a
 *     retry can't fix — no email on the customer, no Auth0 user for that
 *     email, an event type we don't handle, or an upstream answering
 *     400/404/410/422 (e.g. Stripe's `resource_missing`). Those go to Sentry.
 *   - 500 for TRANSIENT failures — a network error, 429, 5xx, and also
 *     401/403: a revoked Stripe key or Auth0 client secret is a config fault
 *     that someone will fix, and Stripe's retries then deliver what was
 *     missed. This used to return 200 for every failure ("so Stripe doesn't
 *     retry indefinitely"), which turned each Auth0 blip into a silently
 *     lost subscription update.
 *   - 400 for a missing or bad signature, 500 when unconfigured.
 *
 * The Stripe client is built per request rather than at module scope:
 * `Stripe(undefined)` throws, so a module-scope client made the function
 * crash on cold start (a bare 502, before Sentry is up) in any deploy
 * context without STRIPE_SECRET_KEY — the same failure class as bldrs-ai/ops#33.
 *
 * Tests: netlify/functions/_tests/stripe-webhook.test.js (behaviour, mocked),
 * netlify/functions/_tests/replay/stripe-webhook/ (fixtures replayed against
 * the source and against the deployed bundle). Contract summary:
 * design/new/netlify-functions-testing.md §"stripe-webhook's response contract".
 */

import Stripe from 'stripe'
import axios from 'axios'
import * as Sentry from '@sentry/serverless'


Sentry.AWSLambda.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: process.env.NODE_ENV,
})

const HTTP_OK = 200
const HTTP_BAD_REQUEST = 400
const HTTP_NOT_FOUND = 404
const HTTP_GONE = 410
const HTTP_UNPROCESSABLE = 422
const HTTP_INTERNAL_ERROR = 500

const REQUIRED_ENV = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET']
const HANDLED_EVENT_TYPES = new Set(['customer.subscription.created', 'customer.subscription.deleted'])
// Stripe subscription statuses after which the subscription can never be
// active again.
const ENDED_SUBSCRIPTION_STATUSES = new Set(['canceled', 'incomplete_expired'])
// Upstream answers that mean "this request will never succeed". Everything
// else — no status at all (network), 401/403 (config), 408/409/429, 5xx —
// is worth Stripe's retry. See the header for why 401/403 are retried.
const PERMANENT_UPSTREAM_STATUSES = new Set([HTTP_BAD_REQUEST, HTTP_NOT_FOUND, HTTP_GONE, HTTP_UNPROCESSABLE])


/**
 * Fetch an Auth0 Management API token via Client Credentials flow.
 *
 * @return {Promise<string>} Short-lived Management API token
 */
async function getManagementApiToken() {
  const response = await axios.post(
    `https://${process.env.AUTH0_DOMAIN}/oauth/token`,
    {
      client_id: process.env.AUTH0_CLIENT_ID,
      client_secret: process.env.AUTH0_CLIENT_SECRET,
      audience: `https://${process.env.AUTH0_DOMAIN}/api/v2/`,
      grant_type: 'client_credentials',
    },
    {headers: {'Content-Type': 'application/json'}},
  )
  return response.data.access_token
}


/**
 * @param {object} subscription Stripe subscription object, as it is now
 * @return {string} the subscriptionStatus that state maps to
 */
function statusForSubscription(subscription) {
  if (ENDED_SUBSCRIPTION_STATUSES.has(subscription.status)) {
    return 'freePendingReauth'
  }
  const items = subscription.items && subscription.items.data
  const isPro = Array.isArray(items) &&
    items.some((item) => item.price && item.price.id === process.env.SHARE_PRO_PRICE_ID)
  return isPro ? 'shareProPendingReauth' : subscription.status
}


/**
 * The HTTP status an upstream failure carried: axios puts it on
 * `err.response.status`, the Stripe SDK on `err.statusCode`.
 *
 * @param {Error} err
 * @return {?number} null for a failure with no response (network, timeout)
 */
function upstreamStatus(err) {
  return (err && err.response && err.response.status) || (err && err.statusCode) || null
}


/**
 * Write the subscription's current status (and the customer id) onto the
 * Auth0 user whose email matches the Stripe customer's.
 *
 * Throws on upstream failures; the handler decides from the status whether
 * Stripe should retry. Returns `{permanent: reason}` for conditions a retry
 * won't change.
 *
 * @param {object} stripe Stripe client
 * @param {string} subscriptionId
 * @return {Promise<object>} `{updated: auth0UserId, subscriptionStatus}` or `{permanent: reason}`
 */
async function syncSubscription(stripe, subscriptionId) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const subscriptionStatus = statusForSubscription(subscription)
  const stripeCustomerId = subscription.customer

  const customer = await stripe.customers.retrieve(stripeCustomerId)
  // A deleted customer comes back as {id, deleted: true} with no email.
  const customerEmail = customer && customer.email
  if (!customerEmail) {
    return {permanent: `No email found on Stripe customer ${stripeCustomerId}`}
  }

  const mgmtToken = await getManagementApiToken()
  const auth0UserResp = await axios.get(
    `https://${process.env.AUTH0_DOMAIN}/api/v2/users-by-email?email=${encodeURIComponent(customerEmail)}`,
    {headers: {Authorization: `Bearer ${mgmtToken}`}},
  )
  const users = auth0UserResp.data
  if (!Array.isArray(users) || users.length === 0) {
    return {permanent: `No Auth0 user found for Stripe customer ${stripeCustomerId}`}
  }
  // Assume the first returned user is correct.
  const auth0UserId = users[0].user_id

  await axios.patch(
    `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(auth0UserId)}`,
    {app_metadata: {subscriptionStatus, stripeCustomerId}},
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mgmtToken}`,
      },
    },
  )
  return {updated: auth0UserId, subscriptionStatus}
}


export const handler = Sentry.AWSLambda.wrapHandler(async (event) => {
  const missingEnv = REQUIRED_ENV.filter((name) => !process.env[name])
  if (missingEnv.length > 0) {
    // Names only, never values. The function log is the one channel every
    // deploy context has; Sentry only exists where SENTRY_DSN is set.
    const message = `stripe-webhook not configured: missing ${missingEnv.join(', ')}`
    console.error(message)
    Sentry.captureMessage(message, 'error')
    return {statusCode: HTTP_INTERNAL_ERROR, body: 'Stripe webhook not configured'}
  }

  // 1. Verify the signature, over the raw bytes Stripe sent.
  const headers = event.headers || {}
  const sig = headers['stripe-signature'] || headers['Stripe-Signature']
  if (!sig) {
    // Not Stripe (a probe, a smoke test, a misrouted request): nothing for
    // Sentry, whose quota a scanner could otherwise burn.
    return {statusCode: HTTP_BAD_REQUEST, body: 'Webhook Error: missing Stripe-Signature header'}
  }
  const rawBody = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64') : (event.body || '')

  // eslint-disable-next-line new-cap -- `stripe` SDK ships as a factory function
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY)
  let stripeEvent
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    Sentry.captureException(err)
    return {statusCode: HTTP_BAD_REQUEST, body: `Webhook Error: ${err.message}`}
  }

  // 2. Acknowledge and ignore anything but the subscription lifecycle.
  if (!HANDLED_EVENT_TYPES.has(stripeEvent.type)) {
    // Type and id only: the full event carries the customer's email.
    Sentry.captureMessage(`stripe-webhook: unhandled event type ${stripeEvent.type} (${stripeEvent.id})`, 'info')
    return {statusCode: HTTP_OK, body: 'Ignored'}
  }

  // 3. Write the subscription's current state to Auth0.
  const label = `${stripeEvent.type} ${stripeEvent.id}`
  try {
    const result = await syncSubscription(stripe, stripeEvent.data.object.id)
    if (result.permanent) {
      Sentry.captureException(new Error(`${result.permanent} (${label})`))
      return {statusCode: HTTP_OK, body: 'Acknowledged; not applied'}
    }
  } catch (err) {
    // The status and id go to the function log so a failed delivery can be
    // matched to its cause without Sentry.
    const status = upstreamStatus(err)
    const upstream = status === null ? '' : ` (upstream ${status})`
    Sentry.captureException(err)
    if (PERMANENT_UPSTREAM_STATUSES.has(status)) {
      console.error(`stripe-webhook: ${label} not applied${upstream}, not retryable: ${err.message}`)
      return {statusCode: HTTP_OK, body: 'Acknowledged; not applied'}
    }
    console.error(`stripe-webhook: ${label} failed${upstream}: ${err.message}`)
    return {statusCode: HTTP_INTERNAL_ERROR, body: 'Subscription update failed; Stripe will retry'}
  }

  return {statusCode: HTTP_OK, body: 'Success'}
})
