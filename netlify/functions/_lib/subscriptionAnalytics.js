/*
 * netlify/functions/_lib/subscriptionAnalytics.js
 * -----------------------------------------------
 * The funnel's "Subscribed" step, sent from the server: `subscription_started`
 * and `subscription_ended` go to GA4 through the Measurement Protocol from
 * stripe-webhook. Before this, only the browser sent them (on the
 * pendingReauth token, src/privacy/subscriptionTracking.js), so a subscription
 * that started or ended while the app wasn't open — or by a user who never
 * came back — was never counted. design/new/quotas.md §"Server-side
 * subscription events" is the design.
 *
 * WHEN: once per SUBSCRIPTION status transition, read off the Stripe event
 * itself (`subscriptionTransitionOf`). Not off the Auth0 tier write: one
 * checkout sends `customer.subscription.created` and `.updated` seconds
 * apart, both deliveries can read FREE and both write PRO, and GA4 never
 * dedupes (Codex P1 on #1983; owner's call, 2026-10-28). Stripe describes
 * each status change in exactly one event: `created` already entitling, or
 * `updated` whose `previous_attributes.status` crossed the entitling line;
 * `deleted` (or an `updated` out of entitling) for the end. Sent only when
 * the webhook answers 200, since a non-2xx is redelivered and the
 * redelivery sends it.
 *
 * WHO. The Measurement Protocol `client_id` is the paying browser's GA client
 * id, which the app passes through checkout as the pricing table's
 * `client-reference-id` (src/privacy/gaClientReference.js says why that field
 * and how it's encoded). The webhook finds it on the Checkout Sessions of the
 * event's customer. With none — consent withheld, GA blocked, a subscription
 * made outside the pricing table, or a key without Checkout Session read
 * access — the client id is a stable hash of the Stripe customer id, and the
 * event says so (`cid_source: 'fallback'`) and carries no `open_cid`, so it
 * can't be joined to a browser it doesn't belong to.
 *
 * NEVER BREAKS THE WEBHOOK. Stripe redelivers on any non-2xx (the
 * webhook's contract: netlify-functions-testing.md §"stripe-webhook's
 * response contract"), and the redelivery would report the event again. So
 * nothing here throws: GA is best-effort, each upstream call
 * has a short timeout of its own, and every failure is logged and swallowed.
 * It is awaited, not fired and forgotten, because Lambda freezes the process
 * when the handler returns.
 *
 * What goes to GA: event name, `tier`, `source: 'server'`, `interval` and
 * `plan` when the price says, `cid_source`, and `open_cid` (the same `cid.`
 * join key the app's funnel events carry). Never an email, a name, or a Stripe
 * id: the fallback client id is a one-way hash, and nothing else is copied
 * from the event.
 */

import {createHash} from 'node:crypto'
import {decodeGaClientReference} from '../../../src/privacy/gaClientReference.js'
import {SUBSCRIPTION_EVENT_NAMES} from '../../../src/privacy/subscriptionEventNames.js'
import {ENTITLING_STRIPE_STATUSES, isEntitlingSubscription} from './subscriptions.js'


export const MP_COLLECT_URL = 'https://www.google-analytics.com/mp/collect'
// Each GA step gets its own short budget: the webhook runs under Netlify's
// 10 s limit, and `settleUser` may already have spent much of it.
export const GA_LOOKUP_TIMEOUT_MS = 1500
export const GA_SEND_TIMEOUT_MS = 1500
// Those caps alone don't keep the webhook inside its budget: a delivery that
// reaches the report late (a slow settle loop) could still be cut off by the
// platform mid-POST, which Stripe sees as a failure and redelivers (Codex on
// #1983). So the whole report runs against the handler's deadline: skipped
// outright with less than GA_MIN_REMAINING_MS left, and each step's timeout
// cut down so the report ends GA_RESERVE_MS before the deadline, leaving the
// handler time to return.
export const GA_MIN_REMAINING_MS = 3000
export const GA_RESERVE_MS = 1000
// Newest first; a customer with more checkouts than this is not a real one.
const CHECKOUT_SESSIONS_PER_CUSTOMER = 10
// privacy/analytics.js#OPEN_CID_PREFIX, restated: that module is browser-only.
// The value must not parse as a number, or GA4 types it numeric and the
// text dimension stays empty (see the comment there).
const OPEN_CID_PREFIX = 'cid.'
// Namespaces the hash, so the fallback id can't collide with a hash some
// other system made of the same customer id.
const FALLBACK_HASH_NAMESPACE = 'bldrs-share:stripe-customer:'
const UINT32_BYTES = 4

export const CID_SOURCES = Object.freeze({CHECKOUT: 'checkout', FALLBACK: 'fallback'})
export const TRANSITIONS = Object.freeze({STARTED: 'started', ENDED: 'ended'})
const EVENT_FOR_TRANSITION = {
  [TRANSITIONS.STARTED]: SUBSCRIPTION_EVENT_NAMES.STARTED,
  [TRANSITIONS.ENDED]: SUBSCRIPTION_EVENT_NAMES.ENDED,
}


/**
 * Whether this Stripe event is the one that moves its own Share Pro
 * subscription into, or out of, an entitling status
 * (`_lib/subscriptions.js#ENTITLING_STRIPE_STATUSES`). Each such change is
 * described by exactly one event, so a burst of events for one checkout
 * yields one 'started', however their deliveries overlap:
 *
 *   started  `created` already entitling (a card checkout, a trial), or
 *            `updated` entitling now whose `previous_attributes.status` was
 *            not (incomplete → active after 3-D Secure; unpaid → active)
 *   ended    `updated` not entitling now whose previous status was
 *            (past_due → unpaid, → paused), or `deleted` — unless the user
 *            was already FREE when it arrived (`wasPro === false`): a
 *            deleted event carries no previous status, and a subscription
 *            canceled after going unpaid already ended at `unpaid`
 *
 * Anything else — a renewal, a plan or metadata change, past_due → active
 * (entitling throughout), a price that isn't Share Pro — is null.
 *
 * @param {object} stripeEvent the verified Stripe event
 * @param {?string} proPriceId SHARE_PRO_PRICE_ID
 * @param {?boolean} [wasPro] the user's Auth0 tier before this delivery;
 *   null when no user was found
 * @return {?string} one of TRANSITIONS, or null
 */
export function subscriptionTransitionOf(stripeEvent, proPriceId, wasPro = null) {
  const subscription = stripeEvent && stripeEvent.data && stripeEvent.data.object
  const isPro = isEntitlingSubscription(subscription && {...subscription, status: 'active'}, proPriceId)
  if (!isPro) {
    return null
  }
  const entitlingNow = ENTITLING_STRIPE_STATUSES.has(subscription.status)
  const previous = stripeEvent.data.previous_attributes
  const statusChanged = Boolean(previous) && Object.prototype.hasOwnProperty.call(previous, 'status')
  const wasEntitling = statusChanged && ENTITLING_STRIPE_STATUSES.has(previous.status)
  switch (stripeEvent.type) {
    case 'customer.subscription.created':
      return entitlingNow ? TRANSITIONS.STARTED : null
    case 'customer.subscription.updated':
      if (!statusChanged || wasEntitling === entitlingNow) {
        return null
      }
      return entitlingNow ? TRANSITIONS.STARTED : TRANSITIONS.ENDED
    case 'customer.subscription.deleted':
      return wasPro === false ? null : TRANSITIONS.ENDED
    default:
      return null
  }
}


/**
 * @param {object} env process.env
 * @return {?{measurementId: string, apiSecret: string}} null unless both are set
 */
export function gaMeasurementConfig(env) {
  const measurementId = env.GA4_MEASUREMENT_ID
  const apiSecret = env.GA4_API_SECRET
  return measurementId && apiSecret ? {measurementId, apiSecret} : null
}


/**
 * A stable GA client id for a Stripe customer, for when checkout carried none:
 * the same customer always maps to the same GA "user", so their start and end
 * pair up, and the customer id itself never reaches GA.
 *
 * @param {string} customerId
 * @return {string} GA-shaped, `<uint32>.<uint32>`
 */
export function fallbackClientId(customerId) {
  const digest = createHash('sha256').update(`${FALLBACK_HASH_NAMESPACE}${customerId}`).digest()
  return `${digest.readUInt32BE(0)}.${digest.readUInt32BE(UINT32_BYTES)}`
}


/**
 * The GA client id to attribute a customer's transition to: from the
 * `client_reference_id` of their Checkout Sessions — the one that created
 * this subscription first, then the newest completed one (a resubscribe
 * through the billing portal has no session of its own, but the original
 * checkout's browser is the best guess), then the newest of any — else the
 * fallback.
 *
 * @param {object} stripe Stripe client
 * @param {string} customerId the event's customer
 * @param {?string} subscriptionId the event's subscription
 * @param {number} [timeoutMs] at most GA_LOOKUP_TIMEOUT_MS
 * @return {Promise<{clientId: string, source: string}>} source is a CID_SOURCES value
 */
export async function resolveGaClientId(stripe, customerId, subscriptionId, timeoutMs = GA_LOOKUP_TIMEOUT_MS) {
  try {
    const page = await stripe.checkout.sessions.list(
      {customer: customerId, limit: CHECKOUT_SESSIONS_PER_CUSTOMER},
      // No retry: a slow Stripe costs the attribution, never the delivery.
      {timeout: timeoutMs, maxNetworkRetries: 0},
    )
    const carrying = page.data.filter((session) => decodeGaClientReference(session.client_reference_id))
    const session = carrying.find((candidate) => subscriptionId && candidate.subscription === subscriptionId) ||
      carrying.find((candidate) => candidate.status === 'complete') ||
      carrying[0]
    if (session) {
      return {clientId: decodeGaClientReference(session.client_reference_id), source: CID_SOURCES.CHECKOUT}
    }
  } catch (err) {
    // A restricted key without "Checkout Sessions: Read" lands here (403),
    // as does a timeout. The event still goes out, flagged.
    console.warn(`stripe-webhook: GA client id lookup failed, using the fallback: ${err.message}`)
  }
  return {clientId: fallbackClientId(customerId), source: CID_SOURCES.FALLBACK}
}


/**
 * @param {?object} subscription the event's Stripe subscription
 * @param {?string} proPriceId SHARE_PRO_PRICE_ID
 * @param {{clientId: string, source: string}} attribution
 * @return {object} GA event params
 */
export function subscriptionEventParams(subscription, proPriceId, attribution) {
  const params = {tier: 'pro', source: 'server', cid_source: attribution.source}
  if (attribution.source === CID_SOURCES.CHECKOUT) {
    params.open_cid = `${OPEN_CID_PREFIX}${attribution.clientId}`
  }
  const items = (subscription && subscription.items && subscription.items.data) || []
  const price = (items.find((item) => item.price && item.price.id === proPriceId) || {}).price
  const interval = price && price.recurring && price.recurring.interval
  if (typeof interval === 'string') {
    params.interval = interval
  }
  // The merchant's own key for the price, when one is set — never the price id.
  if (price && typeof price.lookup_key === 'string' && price.lookup_key.length > 0) {
    params.plan = price.lookup_key
  }
  return params
}


/**
 * POST one event to the Measurement Protocol. Throws on a network failure,
 * a timeout or a non-2xx; the caller swallows it. GA answers 2xx even for a
 * malformed event or a wrong secret, so success here means "delivered", not
 * "counted" — the debug endpoint (/debug/mp/collect) is the way to validate.
 *
 * @param {object} args
 * @param {{measurementId: string, apiSecret: string}} args.config
 * @param {string} args.clientId
 * @param {string} args.name
 * @param {object} args.params
 * @param {number} [args.timeoutMs]
 * @return {Promise<void>}
 */
export async function sendMeasurementProtocolEvent({config, clientId, name, params, timeoutMs = GA_SEND_TIMEOUT_MS}) {
  const url = `${MP_COLLECT_URL}?measurement_id=${encodeURIComponent(config.measurementId)}` +
    `&api_secret=${encodeURIComponent(config.apiSecret)}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({client_id: clientId, events: [{name, params}]}),
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`Measurement Protocol answered ${response.status}`)
    }
  } finally {
    clearTimeout(timer)
  }
}


/**
 * An expected outcome (sent, or skipped by configuration) is INFO in the
 * function log, not a warning: Netlify labels each line by its console method.
 *
 * @param {string} message
 */
function logInfo(message) {
  // eslint-disable-next-line no-console -- an expected outcome is INFO, not a warning
  console.log(message)
}


/**
 * Send the GA event for the subscription transition this Stripe event
 * describes, if any. Call it only when the webhook is answering 200. Never
 * throws (see the header).
 *
 * @param {object} args
 * @param {object} args.stripe Stripe client
 * @param {object} args.stripeEvent the verified Stripe event
 * @param {?boolean} [args.wasPro] the user's Auth0 tier before this delivery,
 *   null when unknown (see subscriptionTransitionOf)
 * @param {object} [args.env] process.env
 * @param {number} [args.deadline] epoch ms by which the handler must have
 *   returned; the report skips, or shortens its timeouts, to stay clear of it
 * @return {Promise<string>} what happened: 'no_transition', 'unconfigured',
 *   'test_mode', 'no_time', 'sent' or 'failed' (for the log and the tests)
 */
export async function reportSubscriptionTransition({stripe, stripeEvent, wasPro = null, env = process.env, deadline = Infinity}) {
  let label = 'subscription event'
  let config = null
  try {
    const transition = subscriptionTransitionOf(stripeEvent, env.SHARE_PRO_PRICE_ID, wasPro)
    if (!transition) {
      return 'no_transition'
    }
    const name = EVENT_FOR_TRANSITION[transition]
    label = `${name} for ${stripeEvent.type} ${stripeEvent.id}`
    config = gaMeasurementConfig(env)
    if (!config) {
      // Names only: a missing variable is the expected state in every deploy
      // context but production, so this is a log line, not a Sentry event.
      logInfo(`stripe-webhook: ${label} not sent to GA: GA4_MEASUREMENT_ID and GA4_API_SECRET are not both set`)
      return 'unconfigured'
    }
    if (stripeEvent.livemode !== true) {
      // A test-mode payment is not a subscriber, whichever endpoint it reached.
      logInfo(`stripe-webhook: ${label} not sent to GA: test-mode event`)
      return 'test_mode'
    }
    // Time left for the report itself, keeping GA_RESERVE_MS for the
    // handler to return. Too little, and the transition goes unreported:
    // a missed event is the cheaper failure, a timed-out delivery is
    // redelivered by Stripe — and would send it again.
    const budget = () => deadline - GA_RESERVE_MS - Date.now()
    if (deadline - Date.now() < GA_MIN_REMAINING_MS) {
      console.warn(`stripe-webhook: ${label} not sent to GA: ${Math.max(0, deadline - Date.now())} ms left of the function's budget`)
      return 'no_time'
    }
    const subscription = stripeEvent.data.object
    // Half the budget at most for the lookup, so the POST always has the
    // rest (it falls back to the hashed id when the lookup times out).
    const lookupMs = Math.floor(Math.min(GA_LOOKUP_TIMEOUT_MS, budget() / 2))
    const attribution = await resolveGaClientId(stripe, subscription.customer, subscription.id || null, lookupMs)
    const sendMs = Math.floor(Math.min(GA_SEND_TIMEOUT_MS, budget()))
    if (sendMs <= 0) {
      throw new Error('no time left for the Measurement Protocol request')
    }
    await sendMeasurementProtocolEvent({
      config,
      clientId: attribution.clientId,
      name,
      params: subscriptionEventParams(subscription, env.SHARE_PRO_PRICE_ID, attribution),
      timeoutMs: sendMs,
    })
    logInfo(`stripe-webhook: ${label} sent to GA (client id from ${attribution.source})`)
    return 'sent'
  } catch (err) {
    // The request URL carries the API secret; keep it out of the log even if
    // some runtime puts the URL in an error message.
    const raw = String(err && err.message)
    const message = config ? raw.split(config.apiSecret).join('[GA4_API_SECRET]') : raw
    console.warn(`stripe-webhook: ${label} not sent to GA: ${message}`)
    return 'failed'
  }
}
