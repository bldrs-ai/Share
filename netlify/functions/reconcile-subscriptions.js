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
 *      whose Stripe customer is not entitled → 'freePendingReauth'. Before
 *      demoting, the user's other Stripe customers (same email) are checked:
 *      if one is entitled — a resubscribe under a new customer — the user
 *      keeps PRO and is RELINKED to it instead.
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
 * summary's `errors` and the sweep goes on. Netlify stops a scheduled
 * function at 30 s, cold start included, so the run keeps two deadlines:
 *   - at 20 s it stops STARTING work: both discovery lists (fetched
 *     concurrently) stop paging, and no queued item starts. Demote and
 *     promote items share ONE queue, alternating, so a long demote list
 *     can't starve promotion day after day;
 *   - at 26 s it stops WAITING: items still in flight (every upstream call
 *     has a 5 s timeout, but an item makes several) are counted in
 *     `inFlight` and the summary goes out anyway, rather than Netlify
 *     killing the run with no summary at all.
 * Items never started are counted in `skipped`; any cut-short run is marked
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
import * as Sentry from '@sentry/serverless'
import {patchUserAppMetadata} from './_lib/auth0.js'
import {
  CUSTOMER_ID_PATTERN,
  STRIPE_CLIENT_OPTIONS,
  customerIdsForEmail,
  entitlementAcross,
  findAuth0UserForCustomer,
  isEntitlingSubscription,
  isProInAuth0,
  linkFor,
  searchAuth0Users,
  writeAndConfirm,
} from './_lib/subscriptions.js'


Sentry.AWSLambda.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: process.env.NODE_ENV,
})

const HTTP_OK = 200
const HTTP_INTERNAL_ERROR = 500
const REQUIRED_ENV = ['STRIPE_SECRET_KEY', 'SHARE_PRO_PRICE_ID', 'AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET']
const STRIPE_PAGE_SIZE = 100
const PRO_USERS_QUERY = 'app_metadata.subscriptionStatus:(sharePro OR shareProPendingReauth)'
// The two deadlines in the header, from the start of the handler. A
// truncated run is a Sentry warning. Tomorrow's run starts from the top in
// the same order, so it does NOT pick up where this one stopped: a sweep
// truncated day after day has outgrown one invocation and needs a
// continuation point.
const START_BUDGET_MS = 20000
const WAIT_BUDGET_MS = 26000
const CONCURRENCY = 4
// A sweep item makes its calls in sequence and records its own failures, so
// no inline retries: tomorrow's run is the retry.
const NO_INLINE_RETRIES = []


/**
 * Every Stripe customer holding an entitling Share Pro subscription.
 *
 * @param {object} stripe
 * @param {string} proPriceId
 * @param {number} deadline epoch ms; no page is requested after it
 * @return {Promise<{customers: Array<string>, truncated: boolean}>} ids each once
 */
async function entitledCustomerIds(stripe, proPriceId, deadline) {
  const customers = new Set()
  let startingAfter
  for (;;) {
    if (Date.now() >= deadline) {
      return {customers: [...customers], truncated: true}
    }
    // No `status`: Stripe then lists every subscription but the canceled
    // ones, which covers all three entitling statuses without paging through
    // every subscription that ever ended.
    const params = {price: proPriceId, limit: STRIPE_PAGE_SIZE}
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
      return {customers: [...customers], truncated: false}
    }
    startingAfter = page.data[page.data.length - 1].id
  }
}


/**
 * `promise`'s outcome, or `{settled: false}` if `until` comes first. The
 * promise keeps running; this only stops waiting for it.
 *
 * @param {Promise} promise
 * @param {number} until epoch ms
 * @return {Promise<{settled: boolean, value: *}>} rejects if `promise` does
 *   in time
 */
async function settleBy(promise, until) {
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({settled: false, value: undefined}), Math.max(0, until - Date.now()))
  })
  try {
    return await Promise.race([promise.then((value) => ({settled: true, value})), timeout])
  } finally {
    clearTimeout(timer)
  }
}


/**
 * Run `fn` over `items`, `concurrency` at a time, starting none once
 * `startBy` has passed, and waiting for none past `waitUntil`.
 *
 * @param {Array} items
 * @param {number} concurrency
 * @param {number} startBy epoch ms
 * @param {number} waitUntil epoch ms
 * @param {Function} fn async, one item; must not throw
 * @return {Promise<{skipped: number, inFlight: number}>} items never started,
 *   and items still running when it stopped waiting
 */
async function runLimited(items, concurrency, startBy, waitUntil, fn) {
  let next = 0
  let skipped = 0
  let inFlight = 0
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++]
      if (Date.now() >= startBy) {
        skipped++
        continue
      }
      inFlight++
      try {
        await fn(item)
      } finally {
        inFlight--
      }
    }
  }
  await settleBy(Promise.all(Array.from({length: Math.min(concurrency, items.length)}, worker)), waitUntil)
  // Anything the workers hadn't reached yet was never started either.
  return {skipped: skipped + (items.length - next), inFlight}
}


/**
 * `a` and `b` alternated, then the longer one's remainder.
 *
 * @param {Array} a
 * @param {Array} b
 * @return {Array}
 */
function interleave(a, b) {
  const out = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) {
      out.push(a[i])
    }
    if (i < b.length) {
      out.push(b[i])
    }
  }
  return out
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
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY, STRIPE_CLIENT_OPTIONS)
  // `demote` / `promote` / `relink` list what the sweep found (and, in
  // apply mode, attempted); a write that failed is ALSO in `errors`.
  // `scanned` separates "nothing to do" from "the queries matched nothing".
  const summary = {
    mode: apply ? 'apply' : 'report', demote: [], promote: [], relink: [], unverifiable: [], errors: [],
    scanned: {proUsers: 0, entitledCustomers: 0}, truncated: false, skipped: 0, inFlight: 0,
  }
  const startedAt = Date.now()
  const startBy = startedAt + START_BUDGET_MS
  const waitUntil = startedAt + WAIT_BUDGET_MS

  try {
    // Discovery, concurrently, so neither list waits out the budget on the
    // other.
    const discovery = await settleBy(Promise.all([
      searchAuth0Users(PRO_USERS_QUERY, startBy),
      entitledCustomerIds(stripe, proPriceId, startBy),
    ]), waitUntil)
    if (!discovery.settled) {
      throw new Error('discovery did not finish within the time budget')
    }
    const [proSearch, entitled] = discovery.value
    const proUsers = proSearch.users
    summary.scanned = {proUsers: proUsers.length, entitledCustomers: entitled.customers.length}
    summary.truncated = proSearch.truncated || entitled.truncated
    const proUserIds = new Set(proUsers.map((user) => user.user_id))
    const proCustomerIds = new Set(proUsers.map((user) => user.app_metadata && user.app_metadata.stripeCustomerId).filter(Boolean))

    // 1. DEMOTE: PRO in Auth0, not entitled in Stripe under any of the
    // user's customers.
    const demote = async (user) => {
      const linked = user.app_metadata && user.app_metadata.stripeCustomerId
      if (!linked) {
        summary.unverifiable.push({user: user.user_id, reason: 'pro_without_stripe_customer'})
        return
      }
      try {
        let reading = await entitlementAcross(stripe, [linked], proPriceId)
        let others = []
        if (!reading.entitled) {
          // Only for would-be demotions: one more Stripe call, and the one
          // that tells a lapsed user from one who resubscribed under a new
          // customer (who the promote pass would skip, being PRO).
          others = (await customerIdsForEmail(stripe, user.email)).filter((id) => id !== linked)
          reading = await entitlementAcross(stripe, others, proPriceId)
        }
        if (reading.entitled) {
          if (reading.customer !== linked) {
            summary.relink.push({user: user.user_id, from: linked, to: reading.customer})
            if (apply) {
              await patchUserAppMetadata(user.user_id, {stripeCustomerId: reading.customer})
            }
          }
          return
        }
        summary.demote.push({user: user.user_id, customer: linked})
        if (apply) {
          await writeAndConfirm({
            userId: user.user_id,
            reading,
            read: () => entitlementAcross(stripe, [linked, ...others], proPriceId),
            link: (r) => linkFor(r, linked, linked),
            retryDelaysMs: NO_INLINE_RETRIES,
          })
        }
      } catch (err) {
        summary.errors.push({user: user.user_id, customer: linked, error: describeError(err)})
      }
    }

    // 2. PROMOTE: entitled in Stripe, not PRO in Auth0.
    const promote = async (customerId) => {
      if (!CUSTOMER_ID_PATTERN.test(customerId)) {
        summary.unverifiable.push({customer: String(customerId), reason: 'unexpected_customer_id'})
        return
      }
      try {
        const {user} = await findAuth0UserForCustomer(stripe, customerId)
        if (!user) {
          summary.unverifiable.push({customer: customerId, reason: 'no_auth0_user'})
          return
        }
        const appMetadata = user.app_metadata || {}
        if (proUserIds.has(user.user_id) || isProInAuth0(appMetadata.subscriptionStatus)) {
          return
        }
        const linked = appMetadata.stripeCustomerId || null
        summary.promote.push({user: user.user_id, customer: customerId})
        if (apply) {
          await writeAndConfirm({
            userId: user.user_id,
            reading: {entitled: true, customer: customerId},
            read: () => entitlementAcross(stripe, [customerId, linked], proPriceId),
            link: (r) => linkFor(r, linked, customerId),
            retryDelaysMs: NO_INLINE_RETRIES,
          })
        }
      } catch (err) {
        summary.errors.push({customer: customerId, error: describeError(err)})
      }
    }

    // Customers already linked to a PRO user are settled by their demote
    // item: no promote lookup needed. The two passes share one queue,
    // alternating, so when the budget runs out both have made progress and
    // `skipped` counts every discovered item that wasn't started. A promote
    // item never writes to a user the PRO search returned, so the two kinds
    // don't race each other.
    const tasks = interleave(
      proUsers.map((user) => () => demote(user)),
      entitled.customers.filter((customerId) => !proCustomerIds.has(customerId)).map((customerId) => () => promote(customerId)),
    )
    const run = await runLimited(tasks, CONCURRENCY, startBy, waitUntil, (task) => task())
    summary.skipped = run.skipped
    summary.inFlight = run.inFlight
    if (run.skipped > 0 || run.inFlight > 0) {
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
