/*
 * Netlify Function: stripe-webhook.js
 * -----------------------------------
 * Mirrors Stripe subscription lifecycle into Auth0 `app_metadata`.
 *
 *   POST /.netlify/functions/stripe-webhook
 *   Headers: Stripe-Signature: t=…,v1=…
 *   Body:    the raw Stripe event JSON (signature is over these exact bytes)
 *
 * On `customer.subscription.created`, `.updated` and `.deleted`, the handler
 * never trusts the event payload for entitlement. It lists the customer's
 * subscriptions as they are NOW and asks the shared rule in
 * `_lib/subscriptions.js` whether the customer is entitled to Share Pro (a
 * Pro-price subscription that is active / trialing / past_due). Auth0 is
 * written only when that changes the user's tier: FREE→PRO writes
 * 'shareProPendingReauth', PRO→FREE writes 'freePendingReauth', anything
 * else writes nothing (besides linking `stripeCustomerId`). So:
 *  - a `created` retried after its subscription's `deleted`, or delivered
 *    out of order, writes the same, latest truth;
 *  - a renewal (`updated`) for a paying user writes nothing, rather than
 *    re-triggering the reauth modal;
 *  - an `incomplete` Pro subscription (first payment pending or failed) is
 *    not Pro, and its later expiry arrives as `updated`, which is handled.
 *
 * Deliveries can also overlap: a `created` invocation reads `active`, the
 * `deleted` invocation reads `canceled` and demotes (or finds nothing to
 * demote yet), then the `created` one writes its stale PRO last. So after a
 * tier-changing write the handler re-reads the customer's subscriptions and,
 * if entitlement moved on, writes the correction — retried inline with a
 * short backoff before falling back to Stripe's redelivery (bldrs-ai/ops#34).
 * One correction suffices: an ended subscription never becomes active again,
 * and whichever invocation writes last re-reads after the cancellation.
 * Whatever still slips through (Stripe and Auth0 down for Stripe's whole
 * retry window) is caught by the daily `reconcile-subscriptions` sweep.
 *
 * Response codes are chosen for what Stripe does with them, since Stripe
 * retries any non-2xx with backoff for up to three days
 * (https://docs.stripe.com/webhooks#retries):
 *   - 200 once the update is written (or none is needed), and also for
 *     PERMANENT conditions a retry can't fix — no email on the customer, no
 *     Auth0 user for that email, an event type we don't handle, or an
 *     upstream answering 400/404/410/422. Those go to Sentry.
 *   - 500 for TRANSIENT failures — a network error, 408/409/429, 5xx, and
 *     401/403 (a revoked key is a config fault someone will fix within
 *     Stripe's retry window).
 *   - A Stripe error's `Stripe-Should-Retry` header decides over its status
 *     either way, as it does in stripe-node's own retries.
 *   - 400 for a missing or bad signature, 500 when unconfigured.
 *
 * The Stripe client is built per request rather than at module scope:
 * `Stripe(undefined)` throws, so a module-scope client made the function
 * crash on cold start in any deploy context without STRIPE_SECRET_KEY — the
 * same failure class as bldrs-ai/ops#33.
 *
 * Tests: netlify/functions/_tests/stripe-webhook.test.js (behaviour, mocked),
 * netlify/functions/_tests/replay/stripe-webhook/ (fixtures replayed against
 * the source and against the deployed bundle). Contract summary:
 * design/new/netlify-functions-testing.md §"stripe-webhook's response contract".
 */

import Stripe from 'stripe'
import axios from 'axios'
import * as Sentry from '@sentry/serverless'
import {getManagementApiToken, patchUserAppMetadata} from './_lib/auth0.js'
import {
  FREE_PENDING_STATUS,
  PRO_PENDING_STATUS,
  isCustomerEntitled,
  isPermanentFailure,
  retryTransient,
  statusTransition,
  upstreamStatus,
} from './_lib/subscriptions.js'


Sentry.AWSLambda.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: process.env.NODE_ENV,
})

const HTTP_OK = 200
const HTTP_BAD_REQUEST = 400
const HTTP_INTERNAL_ERROR = 500

const REQUIRED_ENV = [
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'SHARE_PRO_PRICE_ID',
  'AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET',
]
const HANDLED_EVENT_TYPES = new Set([
  'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
])
// Inline retries for the read-after-write correction (ops#34): short, so a
// blip is absorbed within the delivery instead of leaving a stale PRO in
// place until Stripe's next redelivery, hours later.
const CORRECTION_RETRY_DELAYS_MS = [250, 1000] // eslint-disable-line no-magic-numbers


/**
 * @param {string} email
 * @return {Promise<?object>} the first Auth0 user with that email, or null
 */
async function findAuth0UserByEmail(email) {
  const mgmtToken = await getManagementApiToken()
  const resp = await axios.get(
    `https://${process.env.AUTH0_DOMAIN}/api/v2/users-by-email?email=${encodeURIComponent(email)}`,
    {headers: {Authorization: `Bearer ${mgmtToken}`}},
  )
  const users = resp.data
  // Assume the first returned user is correct.
  return Array.isArray(users) && users.length > 0 ? users[0] : null
}


/**
 * Bring the Auth0 user for this Stripe customer to the tier the customer's
 * subscriptions entitle them to NOW, then re-read and correct if an
 * overlapping delivery moved entitlement meanwhile (see the header).
 *
 * Throws on upstream failures; the handler decides from the error whether
 * Stripe should retry. Returns `{permanent: reason}` for conditions a retry
 * won't change.
 *
 * @param {object} stripe Stripe client
 * @param {string} stripeCustomerId
 * @return {Promise<object>} `{auth0UserId, written}` or `{permanent: reason}`
 */
async function syncCustomer(stripe, stripeCustomerId) {
  const proPriceId = process.env.SHARE_PRO_PRICE_ID
  const entitled = await isCustomerEntitled(stripe, stripeCustomerId, proPriceId)

  const customer = await stripe.customers.retrieve(stripeCustomerId)
  // A deleted customer comes back as {id, deleted: true} with no email.
  const customerEmail = customer && customer.email
  if (!customerEmail) {
    return {permanent: `No email found on Stripe customer ${stripeCustomerId}`}
  }
  const user = await findAuth0UserByEmail(customerEmail)
  if (!user) {
    return {permanent: `No Auth0 user found for Stripe customer ${stripeCustomerId}`}
  }
  const appMetadata = user.app_metadata || {}
  const subscriptionStatus = statusTransition(entitled, appMetadata.subscriptionStatus)

  if (subscriptionStatus === null) {
    // Tier already right. Still link the customer: create-portal-session
    // reads stripeCustomerId, and a lost earlier delivery may never have
    // written it.
    if (appMetadata.stripeCustomerId !== stripeCustomerId) {
      await patchUserAppMetadata(user.user_id, {stripeCustomerId})
    }
    return {auth0UserId: user.user_id, written: null}
  }

  await patchUserAppMetadata(user.user_id, {subscriptionStatus, stripeCustomerId})

  // Read-after-write, retried inline so a transient failure here doesn't
  // leave a stale PRO standing until Stripe's next redelivery.
  const settled = await retryTransient(
    () => isCustomerEntitled(stripe, stripeCustomerId, proPriceId), CORRECTION_RETRY_DELAYS_MS)
  if (settled === entitled) {
    return {auth0UserId: user.user_id, written: subscriptionStatus}
  }
  const correction = settled ? PRO_PENDING_STATUS : FREE_PENDING_STATUS
  await retryTransient(
    () => patchUserAppMetadata(user.user_id, {subscriptionStatus: correction, stripeCustomerId}),
    CORRECTION_RETRY_DELAYS_MS)
  return {auth0UserId: user.user_id, written: correction}
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

  // 3. Bring Auth0 to what the customer's subscriptions entitle them to now.
  // The customer id is the one field of the payload that is trusted: it
  // never changes for a subscription.
  const label = `${stripeEvent.type} ${stripeEvent.id}`
  try {
    const result = await syncCustomer(stripe, stripeEvent.data.object.customer)
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
    if (isPermanentFailure(err)) {
      console.error(`stripe-webhook: ${label} not applied${upstream}, not retryable: ${err.message}`)
      return {statusCode: HTTP_OK, body: 'Acknowledged; not applied'}
    }
    console.error(`stripe-webhook: ${label} failed${upstream}: ${err.message}`)
    return {statusCode: HTTP_INTERNAL_ERROR, body: 'Subscription update failed; Stripe will retry'}
  }

  return {statusCode: HTTP_OK, body: 'Success'}
})
