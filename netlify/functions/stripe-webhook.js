/*
 * Netlify Function: stripe-webhook.js
 * -----------------------------------
 * Mirrors Stripe subscription lifecycle into Auth0 `app_metadata`.
 *
 *   POST /.netlify/functions/stripe-webhook
 *   Headers: Stripe-Signature: t=…,v1=…
 *   Body:    the raw Stripe event JSON (signature is over these exact bytes)
 *
 *   customer.subscription.created → subscriptionStatus = 'shareProPendingReauth'
 *                                   (Share Pro price) or the Stripe status
 *   customer.subscription.deleted → subscriptionStatus = 'freePendingReauth'
 *
 * Response codes are chosen for what Stripe does with them, since Stripe
 * retries any non-2xx with backoff for up to three days
 * (https://docs.stripe.com/webhooks#retries):
 *   - 200 once the update is written, and also for PERMANENT conditions a
 *     retry can't fix — no email on the customer, no Auth0 user for that
 *     email, an event type we don't handle. Those go to Sentry instead.
 *   - 500 for TRANSIENT failures — Stripe or Auth0 unreachable or erroring.
 *     This used to return 200 for those too ("so Stripe doesn't retry
 *     indefinitely"), which turned every Auth0 blip into a silently lost
 *     subscription update. The PATCH is idempotent, so a retry is safe.
 *   - 400 for a missing or bad signature, 500 when unconfigured.
 *
 * The Stripe client is built per request rather than at module scope:
 * `Stripe(undefined)` throws, so a module-scope client made the function
 * crash on cold start (a bare 502, before Sentry is up) in any deploy
 * context without STRIPE_SECRET_KEY — the same failure class as bldrs-ai/ops#33.
 *
 * Tests: netlify/functions/_tests/stripe-webhook.test.js (behaviour, mocked),
 * netlify/functions/_tests/replay/stripe-webhook/ (fixtures replayed against
 * the source and against the deployed bundle).
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
const HTTP_INTERNAL_ERROR = 500

const REQUIRED_ENV = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET']


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
 * @param {object} subscription Stripe subscription object
 * @return {string} the subscriptionStatus to write for a new subscription
 */
function statusForCreatedSubscription(subscription) {
  const items = subscription.items && subscription.items.data
  const isPro = Array.isArray(items) &&
    items.some((item) => item.price && item.price.id === process.env.SHARE_PRO_PRICE_ID)
  return isPro ? 'shareProPendingReauth' : subscription.status
}


/**
 * Write `subscriptionStatus` (and the customer id) onto the Auth0 user whose
 * email matches the Stripe customer's.
 *
 * Throws on transient failures (network, Stripe/Auth0 5xx) so the handler
 * can ask Stripe to retry. Returns `{permanent: reason}` for conditions a
 * retry won't change.
 *
 * @param {object} stripe Stripe client
 * @param {string} stripeCustomerId
 * @param {string} subscriptionStatus
 * @return {Promise<{updated: string}|{permanent: string}>}
 */
async function writeSubscriptionStatus(stripe, stripeCustomerId, subscriptionStatus) {
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
  return {updated: auth0UserId}
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

  // 2. Map the event to a status, or acknowledge and ignore it.
  const subscription = stripeEvent.data && stripeEvent.data.object
  let subscriptionStatus
  if (stripeEvent.type === 'customer.subscription.created') {
    subscriptionStatus = statusForCreatedSubscription(subscription)
  } else if (stripeEvent.type === 'customer.subscription.deleted') {
    subscriptionStatus = 'freePendingReauth'
  } else {
    // Type and id only: the full event carries the customer's email.
    Sentry.captureMessage(`stripe-webhook: unhandled event type ${stripeEvent.type} (${stripeEvent.id})`, 'info')
    return {statusCode: HTTP_OK, body: 'Ignored'}
  }

  // 3. Write it to Auth0.
  try {
    const result = await writeSubscriptionStatus(stripe, subscription.customer, subscriptionStatus)
    if (result.permanent) {
      Sentry.captureException(new Error(`${result.permanent} (${stripeEvent.type} ${stripeEvent.id})`))
      return {statusCode: HTTP_OK, body: 'Acknowledged; not applied'}
    }
  } catch (err) {
    // Transient: let Stripe retry. The status and id go to the function log
    // so a failed delivery can be matched to its cause without Sentry.
    const upstream = err.response ? ` (upstream ${err.response.status})` : ''
    console.error(`stripe-webhook: ${stripeEvent.type} ${stripeEvent.id} failed${upstream}: ${err.message}`)
    Sentry.captureException(err)
    return {statusCode: HTTP_INTERNAL_ERROR, body: 'Subscription update failed; Stripe will retry'}
  }

  return {statusCode: HTTP_OK, body: 'Success'}
})
