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
 *  - Entitlement is decided across the customers that can speak for a user:
 *    the one an event or sweep item is about, plus the one the user is
 *    linked to (`app_metadata.stripeCustomerId`), plus — in the sweep, before
 *    demoting — any other customer with the user's email. A user who
 *    resubscribed under a new Stripe customer is not demoted by a late event
 *    for the old one, and the link moves only to an entitled customer
 *    (`linkFor`), so "Manage subscription" never opens an empty portal.
 *  - Every tier write is confirmed (`writeAndConfirm`): read Auth0's actual
 *    value, then Stripe, and write again until the two agree. Entitlement is
 *    not monotone — `unpaid`, `paused` and `incomplete` can all return to
 *    `active`, and a customer can resubscribe — and several invocations can
 *    write the same user, so neither a single correction nor a comparison
 *    with this invocation's own last write is enough; see
 *    design/new/netlify-functions-testing.md §"Retries and ordering".
 *
 * Also here: the upstream-failure classification both callers use to decide
 * between "retry later" and "this will never succeed", and a small inline
 * retry for the confirming reads and writes.
 */

import {getUserAppMetadata, getUsersByEmail, patchUserAppMetadata, searchUsers} from './auth0.js'


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
// Stripe customer ids are interpolated into a Lucene query; anything else is
// refused rather than escaped.
export const CUSTOMER_ID_PATTERN = /^cus_[A-Za-z0-9]+$/
// Both callers run against a deadline (Netlify's 10 s for the webhook, the
// sweep's own budget). stripe-node's defaults — an 80 s timeout and two
// network retries — would outlive either, so a hung call is cut off here and
// the caller's own failure handling decides what happens next.
export const STRIPE_CLIENT_OPTIONS = {timeout: 5000, maxNetworkRetries: 1}
// Rounds of re-read-and-correct before giving up on a moving entitlement
// and asking for a later retry. Each round needs a real state change in
// Stripe inside a second or two to be spent, so three is generous.
const MAX_CONFIRM_ROUNDS = 3
const AUTH0_SEARCH_PAGE_SIZE = 50
// Auth0's user search returns at most 1000 results per query.
const AUTH0_SEARCH_LIMIT = 1000
const STRIPE_CUSTOMERS_PER_EMAIL = 10


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


/**
 * Whether any of these customers is entitled, and which one.
 *
 * @param {object} stripe
 * @param {Array<string>} customerIds in order of preference; duplicates ok
 * @param {string} proPriceId
 * @return {Promise<{entitled: boolean, customer: ?string}>} `customer` is the
 *   first entitled one, null when none is
 */
export async function entitlementAcross(stripe, customerIds, proPriceId) {
  for (const customerId of new Set(customerIds.filter(Boolean))) {
    if (await isCustomerEntitled(stripe, customerId, proPriceId)) {
      return {entitled: true, customer: customerId}
    }
  }
  return {entitled: false, customer: null}
}


/**
 * The `stripeCustomerId` a user should be linked to after a reading: the
 * entitled customer if there is one, else whatever the user is already
 * linked to, else the customer this event or item is about. The link never
 * moves to a customer with no Pro subscription while it points at one.
 *
 * @param {{customer: ?string}} reading from `entitlementAcross`
 * @param {?string} linked the user's current stripeCustomerId
 * @param {string} subject the customer the event or item is about
 * @return {string}
 */
export function linkFor(reading, linked, subject) {
  return reading.customer || linked || subject
}


/**
 * Every Auth0 user matching a search query, page by page.
 *
 * @param {string} query Lucene query for search engine v3
 * @param {number} [deadline] epoch ms; no page is requested after it
 * @return {Promise<{users: Array<object>, truncated: boolean}>} truncated
 *   when the deadline or Auth0's 1000-result cap stopped the paging
 */
export async function searchAuth0Users(query, deadline = Infinity) {
  const users = []
  for (let page = 0; page * AUTH0_SEARCH_PAGE_SIZE < AUTH0_SEARCH_LIMIT; page++) {
    if (Date.now() >= deadline) {
      return {users, truncated: true}
    }
    const batch = await searchUsers(query, page, AUTH0_SEARCH_PAGE_SIZE)
    users.push(...batch)
    if (batch.length < AUTH0_SEARCH_PAGE_SIZE) {
      return {users, truncated: false}
    }
  }
  return {users, truncated: true}
}


/**
 * The Auth0 user a Stripe customer belongs to.
 *
 * By linked `stripeCustomerId` first: that survives the customer changing
 * their email in the billing portal, and a deleted customer (which has no
 * email left). Then by the customer's email, for a customer never linked —
 * exactly the ones whose first webhook was lost — or linked too recently for
 * the search index. Among several users with that email (identities that
 * were never linked), the one already linked to this customer wins; else the
 * first, as before (Auth0 doesn't document the order).
 *
 * @param {object} stripe
 * @param {string} customerId
 * @return {Promise<{user: ?object, reason: ?string}>} `reason` says why no
 *   user was found
 */
export async function findAuth0UserForCustomer(stripe, customerId) {
  if (CUSTOMER_ID_PATTERN.test(customerId)) {
    const linked = await searchUsers(`app_metadata.stripeCustomerId:"${customerId}"`, 0, AUTH0_SEARCH_PAGE_SIZE)
    if (linked.length > 0) {
      // The search index lags writes, so its app_metadata can predate
      // another invocation's tier write; decide from the primary store.
      const appMetadata = await getUserAppMetadata(linked[0].user_id)
      return {user: {...linked[0], app_metadata: appMetadata}, reason: null}
    }
  }
  const customer = await stripe.customers.retrieve(customerId)
  // A deleted customer comes back as {id, deleted: true} with no email.
  if (!customer || customer.deleted || !customer.email) {
    return {user: null, reason: `No linked Auth0 user and no email on Stripe customer ${customerId}`}
  }
  const users = await getUsersByEmail(customer.email)
  const user = users.find((candidate) => candidate.app_metadata && candidate.app_metadata.stripeCustomerId === customerId) ||
    users[0] || null
  return {user, reason: user ? null : `No Auth0 user found for Stripe customer ${customerId}`}
}


/**
 * Whether a Stripe customer is linked to some Auth0 user other than this
 * one. Before relinking a user to a customer found only by email: two
 * identities that share an email but were never linked must not take each
 * other's customer — `create-portal-session` opens whatever customer
 * `stripeCustomerId` names.
 *
 * @param {string} customerId
 * @param {string} userId
 * @return {Promise<boolean>} true also for an id that can't be queried safely
 */
export async function isLinkedElsewhere(customerId, userId) {
  if (!CUSTOMER_ID_PATTERN.test(customerId)) {
    return true
  }
  const linked = await searchUsers(`app_metadata.stripeCustomerId:"${customerId}"`, 0, AUTH0_SEARCH_PAGE_SIZE)
  return linked.some((user) => user.user_id !== userId)
}


/**
 * Every Stripe customer id with this email (Stripe's match is exact).
 *
 * @param {object} stripe
 * @param {?string} email
 * @return {Promise<Array<string>>}
 */
export async function customerIdsForEmail(stripe, email) {
  if (!email) {
    return []
  }
  const page = await stripe.customers.list({email, limit: STRIPE_CUSTOMERS_PER_EMAIL})
  return page.data.map((customer) => customer.id)
}


/**
 * @param {boolean} entitled
 * @return {string} the pending status for that tier
 */
function pendingStatusFor(entitled) {
  return entitled ? PRO_PENDING_STATUS : FREE_PENDING_STATUS
}


/**
 * Write the tier a reading calls for, then confirm it: read the user's
 * ACTUAL `subscriptionStatus` from Auth0, then Stripe, and while their tiers
 * disagree, write what Stripe now says. Ends once they agree.
 *
 * Comparing Auth0 itself, not this invocation's own last write, is what
 * makes overlapping invocations safe: another invocation's write can land
 * between this one's write and its reads, and only the stored value shows
 * it (Codex on #1891). Auth0 is read before Stripe, so when they agree, any
 * later change to either is someone else's to confirm: another invocation's
 * write is followed by its own confirming reads, and a Stripe change sends
 * a new event (and is swept daily).
 *
 * Failure after the first write can leave a stale tier in Auth0, so every
 * such failure is marked `retryRequired` — the webhook answers 500 whatever
 * the upstream status — except a 404 on the Auth0 user, which a retry can't
 * fix.
 *
 * @param {object} args
 * @param {string} args.userId Auth0 user_id
 * @param {{entitled: boolean, customer: ?string}} args.reading what was read
 * @param {Function} args.read async, returns a fresh reading
 * @param {Function} args.link reading → stripeCustomerId to write
 * @param {Array<number>} args.retryDelaysMs inline retries per read / write
 * @return {Promise<string>} the subscriptionStatus Auth0 holds once confirmed
 */
export async function writeAndConfirm({userId, reading, read, link, retryDelaysMs}) {
  const write = (r) => patchUserAppMetadata(userId, {subscriptionStatus: pendingStatusFor(r.entitled), stripeCustomerId: link(r)})
  await write(reading)
  try {
    for (let round = 0; round < MAX_CONFIRM_ROUNDS; round++) {
      const stored = await retryTransient(() => getUserAppMetadata(userId), retryDelaysMs)
      const fresh = await retryTransient(read, retryDelaysMs)
      if (isProInAuth0(stored.subscriptionStatus) === fresh.entitled) {
        return stored.subscriptionStatus
      }
      await retryTransient(() => write(fresh), retryDelaysMs)
    }
  } catch (err) {
    const userGone = (err.step === 'user_patch' || err.step === 'user_lookup') && err.upstreamStatus === HTTP_NOT_FOUND
    if (!userGone) {
      err.retryRequired = true
    }
    throw err
  }
  const err = new Error(`Entitlement for ${userId} still changing after ${MAX_CONFIRM_ROUNDS} corrections`)
  err.retryRequired = true
  throw err
}
