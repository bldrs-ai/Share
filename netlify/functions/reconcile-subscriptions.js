/*
 * Netlify Scheduled Function: reconcile-subscriptions.js
 * ------------------------------------------------------
 * Daily sweep that makes Auth0 `app_metadata.subscriptionStatus` agree with
 * Stripe, using the same entitlement rule as `stripe-webhook.js`
 * (`_lib/subscriptions.js`). Scheduled in netlify.toml.
 *
 * Why it exists (bldrs-ai/ops#34): the webhook is event-driven, and events
 * can be lost or applied stale. The webhook re-reads Stripe after writing
 * and retries its correction inline, but if Stripe or Auth0 stays
 * unavailable for Stripe's whole three-day redelivery window, a cancelled
 * customer can keep a PRO status with nothing left to correct it. Before
 * #1887 six functions, this webhook among them, failed on every request for
 * months (ops#33), so every update in that window was lost. This sweep
 * repairs both directions from Stripe's current state, whatever happened to
 * the events:
 *
 *   1. DEMOTE: Auth0 users marked PRO (`sharePro` / `shareProPendingReauth`)
 *      whose Stripe customer is not entitled → 'freePendingReauth'.
 *      A PRO user with no `stripeCustomerId` is reported as unverifiable and
 *      never demoted: that is how a manual (comped) grant looks, and
 *      revoking it silently would be worse than reporting it.
 *   2. PROMOTE: Stripe customers with an entitling Share Pro subscription
 *      whose Auth0 user is not PRO → 'shareProPendingReauth' (and the
 *      customer id linked). The user is found by `stripeCustomerId`, then by
 *      the customer's email — the fallback matters for exactly the customers
 *      whose first webhook was lost.
 *
 * Modes, from RECONCILE_MODE:
 *   - 'report' (default): computes and logs what it would change, writes
 *     nothing. A discrepancy goes to Sentry as a warning.
 *   - 'apply': also writes. Set it in the Netlify UI once a report run has
 *     been read and looks right.
 *
 * Every item is independent: one customer's failure is recorded in the
 * summary's `errors` and the sweep goes on. Items run a few at a time under
 * a 25 s budget (Netlify stops scheduled functions at 30 s); items not
 * started in time are counted in `skipped` and the run is marked
 * `truncated`. The summary names Auth0 user ids and Stripe customer ids,
 * never emails.
 *
 * NOT covered by the deployed smoke test (tools/netlify/smokeFunctions.mjs):
 * Netlify doesn't serve scheduled functions over HTTP in production, so
 * there is nothing to probe. The replay scenarios in
 * `_tests/replay/reconcile-subscriptions/` run it against the source and the
 * bundle instead, and each run reports to Sentry and the function log.
 */

import Stripe from 'stripe'
import axios from 'axios'
import * as Sentry from '@sentry/serverless'
import {getManagementApiToken, patchUserAppMetadata} from './_lib/auth0.js'
import {
  FREE_PENDING_STATUS,
  PRO_PENDING_STATUS,
  isCustomerEntitled,
  isEntitlingSubscription,
  isProInAuth0,
} from './_lib/subscriptions.js'


Sentry.AWSLambda.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: process.env.NODE_ENV,
})

const HTTP_OK = 200
const HTTP_INTERNAL_ERROR = 500
const REQUIRED_ENV = ['STRIPE_SECRET_KEY', 'SHARE_PRO_PRICE_ID', 'AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET']
const AUTH0_PAGE_SIZE = 50
// Auth0's user search returns at most 1000 results per query; far above
// Share's Pro user count, but a sweep that stops there must say so.
const AUTH0_SEARCH_LIMIT = 1000
const STRIPE_PAGE_SIZE = 100
const PRO_USERS_QUERY = 'app_metadata.subscriptionStatus:(sharePro OR shareProPendingReauth)'
// Stripe customer ids are interpolated into a Lucene query; anything else is
// refused rather than escaped.
const CUSTOMER_ID_PATTERN = /^cus_[A-Za-z0-9]+$/
// Netlify stops a scheduled function after 30 s. Items run a few at a time,
// and none starts after this budget: the rest are counted as skipped and the
// run is marked truncated (a Sentry warning) rather than cut off silently
// mid-sweep. Tomorrow's run starts over, so a persistently truncated sweep
// is the signal to page it.
const TIME_BUDGET_MS = 25000
const CONCURRENCY = 4


/**
 * Every Auth0 user matching a search query, page by page.
 *
 * @param {string} query Lucene query for search engine v3
 * @return {Promise<{users: Array<object>, truncated: boolean}>}
 */
async function searchAuth0Users(query) {
  const users = []
  for (let page = 0; page * AUTH0_PAGE_SIZE < AUTH0_SEARCH_LIMIT; page++) {
    const mgmtToken = await getManagementApiToken()
    const params = new URLSearchParams({q: query, search_engine: 'v3', per_page: String(AUTH0_PAGE_SIZE), page: String(page)})
    const resp = await axios.get(
      `https://${process.env.AUTH0_DOMAIN}/api/v2/users?${params}`,
      {headers: {Authorization: `Bearer ${mgmtToken}`}},
    )
    const batch = Array.isArray(resp.data) ? resp.data : []
    users.push(...batch)
    if (batch.length < AUTH0_PAGE_SIZE) {
      return {users, truncated: false}
    }
  }
  return {users, truncated: true}
}


/**
 * The Auth0 user for a Stripe customer: by linked `stripeCustomerId`, else
 * by the customer's email.
 *
 * @param {object} stripe
 * @param {string} customerId
 * @return {Promise<?object>}
 */
async function findUserForCustomer(stripe, customerId) {
  const {users: linked} = await searchAuth0Users(`app_metadata.stripeCustomerId:"${customerId}"`)
  if (linked.length > 0) {
    return linked[0]
  }
  const customer = await stripe.customers.retrieve(customerId)
  if (!customer || !customer.email) {
    return null
  }
  const mgmtToken = await getManagementApiToken()
  const resp = await axios.get(
    `https://${process.env.AUTH0_DOMAIN}/api/v2/users-by-email?email=${encodeURIComponent(customer.email)}`,
    {headers: {Authorization: `Bearer ${mgmtToken}`}},
  )
  return Array.isArray(resp.data) && resp.data.length > 0 ? resp.data[0] : null
}


/**
 * Every Stripe customer holding an entitling Share Pro subscription.
 *
 * @param {object} stripe
 * @param {string} proPriceId
 * @return {Promise<Array<string>>} customer ids, each once
 */
async function entitledCustomerIds(stripe, proPriceId) {
  const customers = new Set()
  let startingAfter
  for (;;) {
    const params = {price: proPriceId, status: 'all', limit: STRIPE_PAGE_SIZE}
    if (startingAfter) {
      params.starting_after = startingAfter
    }
    const page = await stripe.subscriptions.list(params)
    for (const subscription of page.data) {
      if (isEntitlingSubscription(subscription, proPriceId)) {
        customers.add(subscription.customer)
      }
    }
    if (!page.has_more || page.data.length === 0) {
      return [...customers]
    }
    startingAfter = page.data[page.data.length - 1].id
  }
}


/**
 * Write a tier change, then re-read Stripe and undo it if the customer's
 * entitlement moved meanwhile — the sweep can race a live webhook delivery
 * (the customer resubscribes between this sweep's read and its write), and
 * the same read-after-write the webhook uses keeps the later truth.
 *
 * @param {object} stripe
 * @param {string} proPriceId
 * @param {string} userId
 * @param {string} customerId
 * @param {boolean} entitled what the sweep read before writing
 * @return {Promise<void>}
 */
async function writeTier(stripe, proPriceId, userId, customerId, entitled) {
  const statusFor = (isEntitled) => (isEntitled ? PRO_PENDING_STATUS : FREE_PENDING_STATUS)
  await patchUserAppMetadata(userId, {subscriptionStatus: statusFor(entitled), stripeCustomerId: customerId})
  const settled = await isCustomerEntitled(stripe, customerId, proPriceId)
  if (settled !== entitled) {
    await patchUserAppMetadata(userId, {subscriptionStatus: statusFor(settled), stripeCustomerId: customerId})
  }
}


/**
 * Run `fn` over `items`, `concurrency` at a time, starting none once
 * `deadline` has passed.
 *
 * @param {Array} items
 * @param {number} concurrency
 * @param {number} deadline epoch ms
 * @param {Function} fn async, one item
 * @return {Promise<number>} how many items were skipped for time
 */
async function runLimited(items, concurrency, deadline, fn) {
  let next = 0
  let skipped = 0
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++]
      if (Date.now() >= deadline) {
        skipped++
        continue
      }
      await fn(item)
    }
  }
  await Promise.all(Array.from({length: Math.min(concurrency, items.length)}, worker))
  return skipped
}


/**
 * @param {Error} err
 * @return {string} a log-safe one-liner
 */
function describeError(err) {
  const status = (err.response && err.response.status) || err.statusCode || err.upstreamStatus
  return `${err.message}${status ? ` (upstream ${status})` : ''}`
}


export const handler = Sentry.AWSLambda.wrapHandler(async () => {
  const missingEnv = REQUIRED_ENV.filter((name) => !process.env[name])
  if (missingEnv.length > 0) {
    const message = `reconcile-subscriptions not configured: missing ${missingEnv.join(', ')}`
    console.error(message)
    Sentry.captureMessage(message, 'error')
    return {statusCode: HTTP_INTERNAL_ERROR, body: JSON.stringify({error: 'not_configured', missing: missingEnv})}
  }

  const apply = process.env.RECONCILE_MODE === 'apply'
  const proPriceId = process.env.SHARE_PRO_PRICE_ID
  // eslint-disable-next-line new-cap -- `stripe` SDK ships as a factory function
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY)
  const summary = {
    mode: apply ? 'apply' : 'report', demote: [], promote: [], unverifiable: [], errors: [], truncated: false, skipped: 0,
  }
  const deadline = Date.now() + TIME_BUDGET_MS

  try {
    const {users: proUsers, truncated} = await searchAuth0Users(PRO_USERS_QUERY)
    summary.truncated = truncated
    // Built before either pass runs, so step 2 can skip customers step 1 owns.
    const proUserIds = new Set(proUsers.map((user) => user.user_id))
    const proCustomerIds = new Set(proUsers.map((user) => user.app_metadata && user.app_metadata.stripeCustomerId).filter(Boolean))

    // 1. DEMOTE: PRO in Auth0, not entitled in Stripe.
    summary.skipped += await runLimited(proUsers, CONCURRENCY, deadline, async (user) => {
      const customerId = user.app_metadata && user.app_metadata.stripeCustomerId
      if (!customerId) {
        summary.unverifiable.push({user: user.user_id, reason: 'pro_without_stripe_customer'})
        return
      }
      try {
        if (await isCustomerEntitled(stripe, customerId, proPriceId)) {
          return
        }
        summary.demote.push({user: user.user_id, customer: customerId})
        if (apply) {
          await writeTier(stripe, proPriceId, user.user_id, customerId, false)
        }
      } catch (err) {
        summary.errors.push({user: user.user_id, customer: customerId, error: describeError(err)})
      }
    })

    // 2. PROMOTE: entitled in Stripe, not PRO in Auth0. Customers already
    // linked to a PRO user were settled by step 1: no lookup needed.
    const candidates = Date.now() >= deadline ? [] :
      (await entitledCustomerIds(stripe, proPriceId)).filter((customerId) => !proCustomerIds.has(customerId))
    summary.skipped += await runLimited(candidates, CONCURRENCY, deadline, async (customerId) => {
      if (!CUSTOMER_ID_PATTERN.test(customerId)) {
        summary.unverifiable.push({customer: String(customerId), reason: 'unexpected_customer_id'})
        return
      }
      try {
        const user = await findUserForCustomer(stripe, customerId)
        if (!user) {
          summary.unverifiable.push({customer: customerId, reason: 'no_auth0_user'})
          return
        }
        const appMetadata = user.app_metadata || {}
        if (proUserIds.has(user.user_id) || isProInAuth0(appMetadata.subscriptionStatus)) {
          return
        }
        summary.promote.push({user: user.user_id, customer: customerId})
        if (apply) {
          await writeTier(stripe, proPriceId, user.user_id, customerId, true)
        }
      } catch (err) {
        summary.errors.push({customer: customerId, error: describeError(err)})
      }
    })
    if (summary.skipped > 0 || Date.now() >= deadline) {
      summary.truncated = true
    }
  } catch (err) {
    // A failure outside any one item (the token, a search page, a Stripe
    // list page): the sweep is incomplete, so say so loudly.
    Sentry.captureException(err)
    console.error(`reconcile-subscriptions: sweep failed: ${describeError(err)}`)
    return {statusCode: HTTP_INTERNAL_ERROR, body: JSON.stringify({...summary, error: 'sweep_failed'})}
  }

  const line = JSON.stringify(summary)
  // The function log is the one channel every deploy context has.
  console.error(`reconcile-subscriptions: ${line}`)
  const discrepancies = summary.demote.length + summary.promote.length
  if (summary.errors.length > 0) {
    Sentry.captureMessage(`reconcile-subscriptions: ${summary.errors.length} item(s) failed: ${line}`, 'error')
  } else if (discrepancies > 0 || summary.unverifiable.length > 0 || summary.truncated) {
    Sentry.captureMessage(`reconcile-subscriptions (${summary.mode}): ${line}`, 'warning')
  }
  return {statusCode: HTTP_OK, headers: {'Content-Type': 'application/json'}, body: line}
})
