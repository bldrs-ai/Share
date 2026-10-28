/*
 * Tests for the stripe-webhook Netlify Function — the one path by which a
 * Stripe subscription reaches Auth0 `app_metadata.subscriptionStatus`.
 *
 * The end-to-end conversations (real Stripe signatures, recorded payloads,
 * against source and bundle) are replay scenarios in
 * `replay/stripe-webhook/`. This suite mocks the Stripe SDK and axios to pin
 * what those don't enumerate: every Stripe status against the entitlement
 * rule, every Auth0 tier against the write-only-on-tier-change rule
 * (bldrs-ai/ops#34), the user lookup (linked customer, then email), the
 * entitlement read across the event's and the linked customer, the
 * write-and-confirm loop and its inline retry,
 * the retry contract (which failures get a 5xx so Stripe redelivers), raw-body
 * handling, what reaches Sentry, and the GA4 Measurement Protocol report of
 * each tier transition (`_lib/subscriptionAnalytics.js`): one event per
 * transition, none on redelivery, and never a changed response code.
 *
 * In `_tests/` rather than beside its subject: Netlify bundles every
 * top-level `.js` under `netlify/functions/` AS a function.
 */

import axios from 'axios'
import * as Sentry from '@sentry/serverless'
import Stripe from 'stripe'
import {resetManagementApiTokenCache} from '../_lib/auth0.js'
import {handler} from '../stripe-webhook.js'


/* eslint-disable no-magic-numbers */
jest.mock('axios')
jest.mock('@sentry/serverless', () => ({
  AWSLambda: {
    init: jest.fn(),
    wrapHandler: (fn) => fn,
  },
  captureMessage: jest.fn(),
  captureException: jest.fn(),
  setUser: jest.fn(),
}))
const mockStripeClient = {
  webhooks: {constructEvent: jest.fn()},
  subscriptions: {list: jest.fn()},
  customers: {retrieve: jest.fn()},
  checkout: {sessions: {list: jest.fn()}},
}
jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn(() => mockStripeClient),
}))

const ENV = {
  STRIPE_SECRET_KEY: 'sk_test_unit',
  STRIPE_WEBHOOK_SECRET: 'whsec_unit',
  SHARE_PRO_PRICE_ID: 'price_pro',
  AUTH0_DOMAIN: 'bldrs.test.auth0.com',
  AUTH0_CLIENT_ID: 'client-id',
  AUTH0_CLIENT_SECRET: 'client-secret-value',
}
const CUSTOMER_ID = 'cus_unit'
const USER_ID = 'google-oauth2|42'
const USER_URL = `https://${ENV.AUTH0_DOMAIN}/api/v2/users/google-oauth2%7C42`
const RAW_BODY = '{"id":"evt_unit"}'
// The correction's inline retries wait 250 ms then 1 s.
const CORRECTION_RETRY_TIMEOUT_MS = 10000


/**
 * @param {object} [overrides]
 * @return {object} a Stripe subscription carrying the Pro price
 */
function proSubscription(overrides = {}) {
  return {id: 'sub_unit', customer: CUSTOMER_ID, status: 'active', items: {data: [{price: {id: ENV.SHARE_PRO_PRICE_ID}}]}, ...overrides}
}


/**
 * @param {Array<object>} subscriptions
 * @return {object} a Stripe list page
 */
function page(subscriptions) {
  return {object: 'list', data: subscriptions, has_more: false}
}


/**
 * The payload is deliberately a stale, Pro, active copy: the handler must
 * decide from `subscriptions.list` (the customer's subscriptions now), so a
 * test that passes only because the payload agreed can't exist.
 *
 * @param {string} type
 * @return {object} what constructEvent returns
 */
function stripeEvent(type) {
  return {id: 'evt_unit', type, data: {object: proSubscription()}}
}


/**
 * @param {object} [overrides]
 * @return {object} a Netlify Functions event carrying a signature
 */
function webhookEvent(overrides = {}) {
  return {
    httpMethod: 'POST',
    headers: {'stripe-signature': 't=1,v1=sig'},
    body: RAW_BODY,
    isBase64Encoded: false,
    ...overrides,
  }
}


/**
 * Wire Stripe and Auth0. `subscriptions` is what the event's customer holds
 * now; `otherCustomers` maps any other customer id to its subscriptions.
 * `appMetadata` is the Auth0 user's: the search by stripeCustomerId finds
 * the user only when it's linked to the event's customer, as Auth0 would;
 * users-by-email always does. `GET /users/{id}` answers what Auth0 would
 * store: `appMetadata` with every PATCH sent so far merged over it.
 *
 * @param {object} [options]
 * @param {Array<object>} [options.subscriptions]
 * @param {object} [options.otherCustomers]
 * @param {object} [options.appMetadata]
 */
function mockUpstreams({subscriptions = [proSubscription()], otherCustomers = {}, appMetadata = {}} = {}) {
  mockStripeClient.subscriptions.list.mockImplementation(({customer}) =>
    Promise.resolve(page(customer === CUSTOMER_ID ? subscriptions : (otherCustomers[customer] || []))))
  mockStripeClient.customers.retrieve.mockResolvedValue({id: CUSTOMER_ID, email: 'ada@example.com'})
  axios.post.mockResolvedValue({data: {access_token: 'mgmt-token', expires_in: 86400}})
  const user = {user_id: USER_ID, app_metadata: appMetadata}
  axios.get.mockImplementation((url) => {
    if (url.startsWith(USER_URL)) {
      return Promise.resolve({data: {user_id: USER_ID, app_metadata: storedAppMetadata(appMetadata)}})
    }
    return Promise.resolve({
      data: url.includes('/users-by-email') || appMetadata.stripeCustomerId === CUSTOMER_ID ? [user] : [],
    })
  })
  axios.patch.mockResolvedValue({data: {}})
}


/**
 * @param {object} initial the user's app_metadata before this delivery
 * @return {object} initial with every PATCH so far merged over it, as
 *   Auth0's shallow merge would store it
 */
function storedAppMetadata(initial) {
  return axios.patch.mock.calls.reduce((stored, [, body]) => ({...stored, ...body.app_metadata}), {...initial})
}


/**
 * Make the event customer's list answer these, one per call, then the last
 * one forever.
 *
 * @param {...object} pages list results, or Errors to reject with
 */
function listSequence(...pages) {
  let call = 0
  mockStripeClient.subscriptions.list.mockImplementation(() => {
    const next = pages[Math.min(call++, pages.length - 1)]
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next)
  })
}


/** @return {Array<object>} the app_metadata of every Auth0 PATCH, in order */
function patches() {
  return axios.patch.mock.calls.map((call) => call[1].app_metadata)
}


/**
 * @param {number} status
 * @return {Error} shaped like an axios error from a failed upstream
 */
function upstreamError(status) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {response: {status, data: {}}})
}


/**
 * @param {number} statusCode
 * @param {object} [headers]
 * @return {Error} shaped like a Stripe SDK error
 */
function stripeError(statusCode, headers) {
  return Object.assign(new Error(`Stripe answered ${statusCode}`), {type: 'StripeInvalidRequestError', statusCode, headers})
}


describe('stripe-webhook function', () => {
  const savedEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    resetManagementApiTokenCache()
    process.env = {...savedEnv, ...ENV}
    jest.spyOn(console, 'error').mockImplementation(() => {})
    // The GA report logs every transition, sent or skipped (no GA env here
    // unless a test adds it).
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = savedEnv
    console.error.mockRestore()
    console.log.mockRestore() // eslint-disable-line no-console
    console.warn.mockRestore()
  })

  describe('configuration', () => {
    it.each(Object.keys(ENV))('answers 500 "not configured" without %s, naming it but no secret value', async (name) => {
      delete process.env[name]

      const res = await handler(webhookEvent())

      expect(res).toEqual({statusCode: 500, body: 'Stripe webhook not configured'})
      expect(Stripe).not.toHaveBeenCalled()
      const logged = console.error.mock.calls.flat().join(' ')
      expect(logged).toContain(name)
      for (const value of Object.values(ENV)) {
        expect(logged).not.toContain(value)
      }
    })
  })

  describe('signature', () => {
    it('answers 400 with no Stripe-Signature header, and tells Sentry nothing', async () => {
      const res = await handler(webhookEvent({headers: {}}))

      expect(res.statusCode).toBe(400)
      expect(mockStripeClient.webhooks.constructEvent).not.toHaveBeenCalled()
      expect(Sentry.captureException).not.toHaveBeenCalled()
      expect(Sentry.captureMessage).not.toHaveBeenCalled()
    })

    it('accepts the header in its canonical capitalization', async () => {
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('invoice.paid'))

      const res = await handler(webhookEvent({headers: {'Stripe-Signature': 't=2,v1=sig'}}))

      expect(res.statusCode).toBe(200)
      expect(mockStripeClient.webhooks.constructEvent).toHaveBeenCalledWith(RAW_BODY, 't=2,v1=sig', ENV.STRIPE_WEBHOOK_SECRET)
    })

    it('verifies the decoded bytes when Netlify delivers the body base64-encoded', async () => {
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('invoice.paid'))

      await handler(webhookEvent({body: Buffer.from(RAW_BODY).toString('base64'), isBase64Encoded: true}))

      const [verified] = mockStripeClient.webhooks.constructEvent.mock.calls[0]
      expect(Buffer.isBuffer(verified)).toBe(true)
      expect(verified.toString('utf8')).toBe(RAW_BODY)
    })

    it('answers 400 and reports a signature that does not verify', async () => {
      mockStripeClient.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature for payload')
      })

      const res = await handler(webhookEvent())

      expect(res.statusCode).toBe(400)
      expect(res.body).toContain('No signatures found')
      expect(Sentry.captureException).toHaveBeenCalledTimes(1)
      expect(axios.post).not.toHaveBeenCalled()
    })
  })

  describe('entitlement comes from the customer\'s subscriptions now', () => {
    it.each(['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'])(
      'handles %s by listing all of the customer\'s subscriptions', async (type) => {
        mockUpstreams()
        mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent(type))

        const res = await handler(webhookEvent())

        expect(res.statusCode).toBe(200)
        expect(mockStripeClient.subscriptions.list).toHaveBeenCalledWith({customer: CUSTOMER_ID, status: 'all', limit: 100})
      })

    it.each(['active', 'trialing', 'past_due'])('treats a Pro subscription that is %s as entitling', async (status) => {
      mockUpstreams({subscriptions: [proSubscription({status})]})
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.updated'))

      await handler(webhookEvent())

      expect(patches()[0]).toEqual({subscriptionStatus: 'shareProPendingReauth', stripeCustomerId: CUSTOMER_ID})
    })

    // ops#34: `incomplete` (first payment pending or failed) used to map to
    // shareProPendingReauth like any non-ended Pro subscription.
    it.each(['incomplete', 'incomplete_expired', 'unpaid', 'paused', 'canceled'])(
      'does not treat a Pro subscription that is %s as entitling', async (status) => {
        mockUpstreams({
          subscriptions: [proSubscription({status})],
          appMetadata: {subscriptionStatus: 'sharePro', stripeCustomerId: CUSTOMER_ID},
        })
        mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.updated'))

        await handler(webhookEvent())

        // Already linked to this customer: only the tier goes in the patch.
        expect(patches()[0]).toEqual({subscriptionStatus: 'freePendingReauth'})
      })

    it('finds the Pro price on any item, and on any of several subscriptions', async () => {
      mockUpstreams({subscriptions: [
        proSubscription({status: 'canceled'}),
        proSubscription({id: 'sub_two', items: {data: [{price: {id: 'price_addon'}}, {price: {id: ENV.SHARE_PRO_PRICE_ID}}]}}),
      ], appMetadata: {subscriptionStatus: 'sharePro', stripeCustomerId: CUSTOMER_ID}})
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.deleted'))

      await handler(webhookEvent())

      expect(axios.patch).not.toHaveBeenCalled()
    })

    it('does not treat another price as entitling', async () => {
      mockUpstreams({subscriptions: [proSubscription({items: {data: [{price: {id: 'price_other'}}]}})]})
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.created'))

      await handler(webhookEvent())

      expect(patches()).toEqual([{stripeCustomerId: CUSTOMER_ID}])
    })

    it('looks the user up by the customer\'s email, URL-encoded', async () => {
      mockUpstreams()
      mockStripeClient.customers.retrieve.mockResolvedValue({id: CUSTOMER_ID, email: 'ada+pro@example.com'})
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.created'))

      await handler(webhookEvent())

      expect(axios.get).toHaveBeenCalledWith(
        `https://${ENV.AUTH0_DOMAIN}/api/v2/users-by-email?email=ada%2Bpro%40example.com`,
        expect.objectContaining({headers: {Authorization: 'Bearer mgmt-token'}}),
      )
      expect(axios.patch.mock.calls[0][0]).toBe(USER_URL)
    })

    it('builds the Stripe client with a timeout and one network retry, not the SDK\'s 80 s and two', async () => {
      mockUpstreams()
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.created'))

      await handler(webhookEvent())

      expect(Stripe).toHaveBeenCalledWith(ENV.STRIPE_SECRET_KEY, {timeout: 5000, maxNetworkRetries: 1})
    })
  })

  // ops#34 review: the email-only lookup missed deleted customers (no email
  // left) and let a late event for an old customer demote a user paying
  // under a new one.
  describe('finding the user, and which customers speak for them', () => {
    it('finds a linked user by stripeCustomerId, without asking Stripe for the customer', async () => {
      mockUpstreams({
        subscriptions: [proSubscription({status: 'canceled'})],
        appMetadata: {subscriptionStatus: 'sharePro', stripeCustomerId: CUSTOMER_ID},
      })
      mockStripeClient.customers.retrieve.mockResolvedValue({id: CUSTOMER_ID, deleted: true})
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.deleted'))

      const res = await handler(webhookEvent())

      expect(res).toEqual({statusCode: 200, body: 'Success'})
      expect(axios.get.mock.calls[0][0]).toBe(
        `https://${ENV.AUTH0_DOMAIN}/api/v2/users?q=app_metadata.stripeCustomerId%3A%22cus_unit%22&search_engine=v3&per_page=50&page=0`)
      expect(mockStripeClient.customers.retrieve).not.toHaveBeenCalled()
      expect(patches()[0]).toEqual({subscriptionStatus: 'freePendingReauth'})
    })

    it('among users sharing the email, picks the one linked to this customer (search index not caught up)', async () => {
      mockUpstreams()
      const linkedMetadata = {subscriptionStatus: 'sharePro', stripeCustomerId: CUSTOMER_ID}
      axios.get.mockImplementation((url) => {
        if (url.startsWith(USER_URL)) {
          return Promise.resolve({data: {user_id: USER_ID, app_metadata: storedAppMetadata(linkedMetadata)}})
        }
        return Promise.resolve({data: url.includes('/users-by-email') ?
          [{user_id: 'github|7', app_metadata: {}}, {user_id: USER_ID, app_metadata: linkedMetadata}] : []})
      })
      mockStripeClient.subscriptions.list.mockResolvedValue(page([proSubscription({status: 'canceled'})]))
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.deleted'))

      await handler(webhookEvent())

      expect(axios.patch.mock.calls.map((call) => call[0])).toEqual([USER_URL])
    })

    it('does not demote on an old customer\'s event while the linked customer is entitled', async () => {
      mockUpstreams({
        subscriptions: [proSubscription({status: 'canceled'})],
        otherCustomers: {cus_new: [proSubscription({customer: 'cus_new'})]},
        appMetadata: {subscriptionStatus: 'sharePro', stripeCustomerId: 'cus_new'},
      })
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.deleted'))

      const res = await handler(webhookEvent())

      expect(res).toEqual({statusCode: 200, body: 'Success'})
      expect(mockStripeClient.subscriptions.list).toHaveBeenCalledWith({customer: 'cus_new', status: 'all', limit: 100})
      expect(axios.patch).not.toHaveBeenCalled()
    })

    it('moves the link to the event\'s customer when that is the entitled one', async () => {
      mockUpstreams({
        otherCustomers: {cus_old: [proSubscription({customer: 'cus_old', status: 'canceled'})]},
        appMetadata: {subscriptionStatus: 'sharePro', stripeCustomerId: 'cus_old'},
      })
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.created'))

      await handler(webhookEvent())

      expect(patches()).toEqual([{stripeCustomerId: CUSTOMER_ID}])
    })

    it('keeps the link on the linked customer while it is entitled, so two live customers can\'t flip-flop it', async () => {
      mockUpstreams({
        otherCustomers: {cus_linked: [proSubscription({customer: 'cus_linked'})]},
        appMetadata: {subscriptionStatus: 'sharePro', stripeCustomerId: 'cus_linked'},
      })
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.created'))

      await handler(webhookEvent())

      expect(axios.patch).not.toHaveBeenCalled()
    })

    // Codex round 3 on #1891: this delivery relinks to the new customer, and
    // an overlapping cancellation for the old one then writes FREE with the
    // OLD link (Auth0's PATCH is last-write-wins). Reading the stored value
    // back — link included — is what repairs it.
    it('confirms a relink too, and repairs a concurrent write that clobbered it', async () => {
      mockUpstreams({
        otherCustomers: {cus_old: [proSubscription({customer: 'cus_old', status: 'canceled'})]},
        appMetadata: {subscriptionStatus: 'sharePro', stripeCustomerId: 'cus_old'},
      })
      let userReads = 0
      const route = axios.get.getMockImplementation()
      const clobbered = {subscriptionStatus: 'freePendingReauth', stripeCustomerId: 'cus_old'}
      // Read 1 is the lookup's (by email: not linked to cus_unit yet), so the
      // first GET /users/{id} is the confirming read after the relink.
      axios.get.mockImplementation((url) => (url.startsWith(USER_URL) && ++userReads === 1 ?
        Promise.resolve({data: {user_id: USER_ID, app_metadata: clobbered}}) : route(url)))
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.created'))

      const res = await handler(webhookEvent())

      expect(res).toEqual({statusCode: 200, body: 'Success'})
      expect(patches()).toEqual([
        {stripeCustomerId: CUSTOMER_ID},
        {subscriptionStatus: 'shareProPendingReauth', stripeCustomerId: CUSTOMER_ID},
      ])
    })

    // Codex on #1891 (ready-for-review pass): a tier patch that re-sent this
    // invocation's unchanged, stale link would clobber an overlapping
    // delivery's relink when it lands last. Left out, the relink survives
    // Auth0's shallow merge and the confirming read sees the paying customer.
    it('leaves an unchanged link out of a tier write, so a concurrent relink survives and is honoured', async () => {
      mockUpstreams({
        subscriptions: [proSubscription({status: 'canceled'})],
        otherCustomers: {cus_new: [proSubscription({customer: 'cus_new'})]},
        appMetadata: {subscriptionStatus: 'sharePro', stripeCustomerId: CUSTOMER_ID},
      })
      // An overlapping activation relinked the user to cus_new just before
      // this delivery's demotion landed: Auth0 holds that relink with this
      // delivery's patches merged over it.
      const relinked = {subscriptionStatus: 'sharePro', stripeCustomerId: 'cus_new'}
      const route = axios.get.getMockImplementation()
      let userReads = 0
      axios.get.mockImplementation((url) => {
        if (url.startsWith(USER_URL) && ++userReads > 1) {
          return Promise.resolve({data: {user_id: USER_ID, app_metadata: storedAppMetadata(relinked)}})
        }
        return route(url)
      })
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.deleted'))

      const res = await handler(webhookEvent())

      expect(res).toEqual({statusCode: 200, body: 'Success'})
      expect(patches()[0]).toEqual({subscriptionStatus: 'freePendingReauth'})
      expect(storedAppMetadata(relinked)).toEqual({subscriptionStatus: 'shareProPendingReauth', stripeCustomerId: 'cus_new'})
    })

    it('keeps the link on the old customer when neither is entitled', async () => {
      mockUpstreams({
        subscriptions: [proSubscription({status: 'incomplete'})],
        otherCustomers: {cus_old: [proSubscription({customer: 'cus_old', status: 'canceled'})]},
        appMetadata: {subscriptionStatus: 'freePendingReauth', stripeCustomerId: 'cus_old'},
      })
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.created'))

      await handler(webhookEvent())

      expect(axios.patch).not.toHaveBeenCalled()
    })
  })

  // Auth0 is written only when the tier changes (ops#34): a renewal must not
  // bounce a paying user back through the reauth modal.
  describe('writes only on a tier change', () => {
    it.each([
      ['a free user becomes entitled', true, {}, [{subscriptionStatus: 'shareProPendingReauth', stripeCustomerId: CUSTOMER_ID}]],
      ['a freePendingReauth user becomes entitled', true, {subscriptionStatus: 'freePendingReauth', stripeCustomerId: CUSTOMER_ID},
        [{subscriptionStatus: 'shareProPendingReauth'}]],
      ['a sharePro user stays entitled', true, {subscriptionStatus: 'sharePro', stripeCustomerId: CUSTOMER_ID}, []],
      ['a shareProPendingReauth user stays entitled', true,
        {subscriptionStatus: 'shareProPendingReauth', stripeCustomerId: CUSTOMER_ID}, []],
      ['a sharePro user loses entitlement', false, {subscriptionStatus: 'sharePro', stripeCustomerId: CUSTOMER_ID},
        [{subscriptionStatus: 'freePendingReauth'}]],
      ['a linked free user stays free', false, {subscriptionStatus: 'freePendingReauth', stripeCustomerId: CUSTOMER_ID}, []],
      ['an unlinked free user stays free (only the customer is linked)', false, {}, [{stripeCustomerId: CUSTOMER_ID}]],
    ])('when %s', async (label, entitled, appMetadata, expected) => {
      mockUpstreams({subscriptions: [proSubscription({status: entitled ? 'active' : 'canceled'})], appMetadata})
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.updated'))

      const res = await handler(webhookEvent())

      expect(res).toEqual({statusCode: 200, body: 'Success'})
      expect(patches()).toEqual(expected)
    })
  })

  describe('read-after-write correction', () => {
    it('corrects a promotion the subscription outran (cancelled mid-flight)', async () => {
      mockUpstreams()
      listSequence(page([proSubscription()]), page([proSubscription({status: 'canceled'})]))
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.created'))

      const res = await handler(webhookEvent())

      expect(res.statusCode).toBe(200)
      expect(patches().map((m) => m.subscriptionStatus)).toEqual(['shareProPendingReauth', 'freePendingReauth'])
    })

    it('re-reads only after a tier-changing write', async () => {
      mockUpstreams({appMetadata: {subscriptionStatus: 'sharePro', stripeCustomerId: CUSTOMER_ID}})
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.updated'))

      await handler(webhookEvent())

      expect(mockStripeClient.subscriptions.list).toHaveBeenCalledTimes(1)
    })

    it('retries a transiently failing correction inline', async () => {
      mockUpstreams()
      listSequence(page([proSubscription()]), page([proSubscription({status: 'canceled'})]))
      axios.patch
        .mockResolvedValueOnce({data: {}})
        .mockRejectedValueOnce(upstreamError(503))
        .mockResolvedValueOnce({data: {}})
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.created'))

      const res = await handler(webhookEvent())

      expect(res.statusCode).toBe(200)
      expect(patches().map((m) => m.subscriptionStatus))
        .toEqual(['shareProPendingReauth', 'freePendingReauth', 'freePendingReauth'])
    }, CORRECTION_RETRY_TIMEOUT_MS)

    it('retries a transiently failing re-read inline', async () => {
      mockUpstreams()
      listSequence(page([proSubscription()]), stripeError(503), page([proSubscription({status: 'canceled'})]))
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.created'))

      const res = await handler(webhookEvent())

      expect(res.statusCode).toBe(200)
      expect(patches().map((m) => m.subscriptionStatus)).toEqual(['shareProPendingReauth', 'freePendingReauth'])
    }, CORRECTION_RETRY_TIMEOUT_MS)

    it('asks Stripe to retry once the correction\'s inline retries run out', async () => {
      mockUpstreams()
      listSequence(page([proSubscription()]), page([proSubscription({status: 'canceled'})]))
      axios.patch.mockResolvedValueOnce({data: {}}).mockRejectedValue(upstreamError(503))
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.created'))

      const res = await handler(webhookEvent())

      expect(res.statusCode).toBe(500)
      // One promotion, then the correction tried three times.
      expect(axios.patch).toHaveBeenCalledTimes(4)
    }, CORRECTION_RETRY_TIMEOUT_MS)

    // Entitlement is not monotone (unpaid → active, a resubscribe), so one
    // correction can itself go stale: the loop runs until a read after its
    // latest write agrees with it.
    it('keeps confirming while entitlement flips, until a read agrees with the last write', async () => {
      mockUpstreams()
      listSequence(
        page([proSubscription()]), page([proSubscription({status: 'canceled'})]), page([proSubscription()]))
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.created'))

      const res = await handler(webhookEvent())

      expect(res).toEqual({statusCode: 200, body: 'Success'})
      expect(patches().map((m) => m.subscriptionStatus))
        .toEqual(['shareProPendingReauth', 'freePendingReauth', 'shareProPendingReauth'])
      expect(mockStripeClient.subscriptions.list).toHaveBeenCalledTimes(4)
    })

    it('gives up after three corrections and asks Stripe to retry', async () => {
      mockUpstreams()
      let call = 0
      mockStripeClient.subscriptions.list.mockImplementation(() =>
        Promise.resolve(page([proSubscription({status: call++ % 2 === 0 ? 'active' : 'canceled'})])))
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.created'))

      const res = await handler(webhookEvent())

      expect(res.statusCode).toBe(500)
      // The write, then three corrections, none confirmed.
      expect(axios.patch).toHaveBeenCalledTimes(4)
    })

    // Before any write a permanent failure is acknowledged; after one, the
    // write may be stale and is unconfirmed, so Stripe must redeliver.
    it.each([
      ['Stripe refuses the re-read with Stripe-Should-Retry: false', () =>
        listSequence(page([proSubscription()]), stripeError(500, {'stripe-should-retry': 'false'}))],
      ['Stripe answers the re-read 404', () => listSequence(page([proSubscription()]), stripeError(404))],
      ['Auth0 rejects the correction as malformed (400)', () => {
        listSequence(page([proSubscription()]), page([proSubscription({status: 'canceled'})]))
        axios.patch.mockResolvedValueOnce({data: {}}).mockRejectedValue(upstreamError(400))
      }],
    ])('answers 500 after a tier write when %s', async (label, arrange) => {
      mockUpstreams()
      arrange()
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.created'))

      const res = await handler(webhookEvent())

      expect(res.statusCode).toBe(500)
      expect(patches()[0].subscriptionStatus).toBe('shareProPendingReauth')
    })

    // Codex on #1891 (round 2): an invocation whose Stripe re-read matches
    // its OWN last write can still be wrong — another invocation's write may
    // have landed in between. Only Auth0's stored value shows that.
    it('keeps going while Auth0\'s stored value disagrees, even when Stripe matches this invocation\'s own write', async () => {
      mockUpstreams({appMetadata: {subscriptionStatus: 'sharePro', stripeCustomerId: CUSTOMER_ID}})
      mockStripeClient.subscriptions.list.mockResolvedValue(page([proSubscription({status: 'canceled'})]))
      // Right after this invocation demotes, an overlapping one's PRO lands:
      // read 1 is the lookup's, read 2 the first confirming read.
      let userReads = 0
      const route = axios.get.getMockImplementation()
      const theirs = {subscriptionStatus: 'shareProPendingReauth', stripeCustomerId: CUSTOMER_ID}
      axios.get.mockImplementation((url) => (url.startsWith(USER_URL) && ++userReads === 2 ?
        Promise.resolve({data: {user_id: USER_ID, app_metadata: theirs}}) : route(url)))
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.deleted'))

      const res = await handler(webhookEvent())

      expect(res).toEqual({statusCode: 200, body: 'Success'})
      expect(patches().map((m) => m.subscriptionStatus)).toEqual(['freePendingReauth', 'freePendingReauth'])
    })

    it('decides from Auth0\'s primary store, not the search index\'s lagging copy', async () => {
      mockUpstreams({appMetadata: {subscriptionStatus: 'freePendingReauth', stripeCustomerId: CUSTOMER_ID}})
      const route = axios.get.getMockImplementation()
      // The index still says FREE; the user was promoted seconds ago.
      axios.get.mockImplementation((url) => (url.startsWith(USER_URL) ?
        Promise.resolve({data: {user_id: USER_ID, app_metadata: {subscriptionStatus: 'sharePro', stripeCustomerId: CUSTOMER_ID}}}) :
        route(url)))
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.updated'))

      await handler(webhookEvent())

      // Entitled and already PRO: nothing to write, no reauth modal.
      expect(axios.patch).not.toHaveBeenCalled()
    })

    it('acknowledges a correction that finds the Auth0 user gone (404): no retry can fix it', async () => {
      mockUpstreams()
      listSequence(page([proSubscription()]), page([proSubscription({status: 'canceled'})]))
      axios.patch.mockResolvedValueOnce({data: {}}).mockRejectedValue(upstreamError(404))
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.created'))

      const res = await handler(webhookEvent())

      expect(res).toEqual({statusCode: 200, body: 'Acknowledged; not applied'})
    })
  })

  // Stripe redelivers any non-2xx for up to three days; a 200 ends it. So a
  // failure Stripe can't fix by retrying must be 200, and one it can, 5xx.
  describe('retry contract', () => {
    it.each([
      ['the subscription list fails at the network', () => mockStripeClient.subscriptions.list.mockRejectedValue(
        Object.assign(new Error('socket hang up'), {type: 'StripeConnectionError'}))],
      ['the customer lookup answers 500', () => mockStripeClient.customers.retrieve.mockRejectedValue(stripeError(500))],
      ['Stripe rejects the API key (401, a config fault)', () => mockStripeClient.subscriptions.list.mockRejectedValue(stripeError(401))],
      ['the Management API token answers 503', () => axios.post.mockRejectedValue(upstreamError(503))],
      ['Auth0 rejects the client secret (403, a config fault)', () => axios.post.mockRejectedValue(upstreamError(403))],
      ['the user search is rate-limited (429)', () => axios.get.mockRejectedValue(upstreamError(429))],
      ['the app_metadata write answers 502', () => axios.patch.mockRejectedValue(upstreamError(502))],
      ['Stripe answers 400 with Stripe-Should-Retry: true', () => mockStripeClient.customers.retrieve.mockRejectedValue(
        stripeError(400, {'stripe-should-retry': 'true'}))],
    ])('answers 500 so Stripe retries when %s', async (step, breakIt) => {
      mockUpstreams()
      breakIt()
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.created'))

      const res = await handler(webhookEvent())

      expect(res.statusCode).toBe(500)
      expect(Sentry.captureException).toHaveBeenCalledTimes(1)
      // Enough in the function log to match a failed delivery to its cause.
      expect(console.error.mock.calls.flat().join(' ')).toContain('customer.subscription.created evt_unit failed')
    })

    it.each([
      ['Stripe has no such customer (404)', () => mockStripeClient.customers.retrieve.mockRejectedValue(stripeError(404))],
      ['Stripe answers 500 with Stripe-Should-Retry: false', () => mockStripeClient.customers.retrieve.mockRejectedValue(
        stripeError(500, {'stripe-should-retry': 'false'}))],
      ['Stripe answers 409 with Stripe-Should-Retry: false', () => mockStripeClient.subscriptions.list.mockRejectedValue(
        stripeError(409, {'stripe-should-retry': 'false'}))],
      ['Auth0 rejects the user search as malformed (400)', () => axios.get.mockRejectedValue(upstreamError(400))],
      ['Auth0 no longer has the user (404 on the write)', () => axios.patch.mockRejectedValue(upstreamError(404))],
      ['the customer has no email', () => mockStripeClient.customers.retrieve.mockResolvedValue({id: CUSTOMER_ID, email: null})],
      ['the customer was deleted', () => mockStripeClient.customers.retrieve.mockResolvedValue({id: CUSTOMER_ID, deleted: true})],
      ['no Auth0 user has that email', () => axios.get.mockResolvedValue({data: []})],
    ])('acknowledges with 200 and reports when %s', async (condition, arrange) => {
      mockUpstreams()
      arrange()
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.deleted'))

      const res = await handler(webhookEvent())

      expect(res).toEqual({statusCode: 200, body: 'Acknowledged; not applied'})
      expect(Sentry.captureException).toHaveBeenCalledTimes(1)
    })

    it('acknowledges an unhandled event type, reporting its type and id but not its contents', async () => {
      mockStripeClient.webhooks.constructEvent.mockReturnValue({
        id: 'evt_invoice', type: 'invoice.paid', data: {object: {customer_email: 'ada@example.com'}},
      })

      const res = await handler(webhookEvent())

      expect(res.statusCode).toBe(200)
      expect(mockStripeClient.subscriptions.list).not.toHaveBeenCalled()
      const [message] = Sentry.captureMessage.mock.calls[0]
      expect(message).toContain('invoice.paid')
      expect(message).toContain('evt_invoice')
      expect(message).not.toContain('ada@example.com')
    })
  })

  describe('GA4 subscription events (Measurement Protocol)', () => {
    const GA_ENV = {GA4_MEASUREMENT_ID: 'G-UNIT0001', GA4_API_SECRET: 'mp-secret-unit'}
    const CLIENT_ID = '1871520000.1754700000'
    const MP_TIMEOUT_TEST_MS = 10000

    /**
     * A live-mode event whose payload names the Pro price with its interval
     * — the only thing the GA params take from the payload.
     *
     * @param {string} type
     * @return {object} what constructEvent returns
     */
    function liveEvent(type) {
      return {
        id: 'evt_unit',
        type,
        livemode: true,
        data: {object: proSubscription({
          items: {data: [{price: {id: ENV.SHARE_PRO_PRICE_ID, lookup_key: 'share_pro_monthly', recurring: {interval: 'month'}}}]},
        })},
      }
    }

    /**
     * @param {Array<object>} sessions the customer's Checkout Sessions, newest first
     */
    function mockCheckoutSessions(sessions) {
      mockStripeClient.checkout.sessions.list.mockResolvedValue(page(sessions))
    }

    /** @return {Array<{url: string, body: object}>} every Measurement Protocol POST */
    function mpPosts() {
      return global.fetch.mock.calls.map(([url, init]) => ({url, body: JSON.parse(init.body)}))
    }

    beforeEach(() => {
      Object.assign(process.env, GA_ENV)
      mockCheckoutSessions([
        {id: 'cs_unit', client_reference_id: 'gacid_1871520000_1754700000', subscription: 'sub_unit', status: 'complete'},
      ])
      jest.spyOn(global, 'fetch').mockResolvedValue({ok: true, status: 204})
    })

    afterEach(() => {
      global.fetch.mockRestore()
    })

    it('sends exactly one subscription_started, to the paying browser\'s GA client, when a user becomes Pro', async () => {
      mockUpstreams()
      mockStripeClient.webhooks.constructEvent.mockReturnValue(liveEvent('customer.subscription.created'))

      const res = await handler(webhookEvent())

      expect(res).toEqual({statusCode: 200, body: 'Success'})
      expect(mpPosts()).toEqual([{
        url: 'https://www.google-analytics.com/mp/collect?measurement_id=G-UNIT0001&api_secret=mp-secret-unit',
        body: {
          client_id: CLIENT_ID,
          events: [{
            name: 'subscription_started',
            params: {
              tier: 'pro', source: 'server', cid_source: 'checkout', open_cid: `cid.${CLIENT_ID}`,
              interval: 'month', plan: 'share_pro_monthly',
            },
          }],
        },
      }])
      expect(mockStripeClient.checkout.sessions.list).toHaveBeenCalledWith(
        {customer: CUSTOMER_ID, limit: 10}, {timeout: 1500, maxNetworkRetries: 0})
    })

    it('sends exactly one subscription_ended when a Pro user loses entitlement', async () => {
      mockUpstreams({
        subscriptions: [proSubscription({status: 'canceled'})],
        appMetadata: {subscriptionStatus: 'sharePro', stripeCustomerId: CUSTOMER_ID},
      })
      mockStripeClient.webhooks.constructEvent.mockReturnValue(liveEvent('customer.subscription.deleted'))

      const res = await handler(webhookEvent())

      expect(res.statusCode).toBe(200)
      expect(mpPosts().map((post) => post.body.events[0].name)).toEqual(['subscription_ended'])
    })

    // The transition rule is settleUser's: a redelivery, a renewal, or a
    // duplicate finds the tier already right, writes nothing, sends nothing.
    it.each([
      ['a redelivered created for a user already Pro', 'customer.subscription.created', true,
        {subscriptionStatus: 'shareProPendingReauth', stripeCustomerId: CUSTOMER_ID}],
      ['a renewal for a sharePro user', 'customer.subscription.updated', true,
        {subscriptionStatus: 'sharePro', stripeCustomerId: CUSTOMER_ID}],
      ['a redelivered deleted for a user already demoted', 'customer.subscription.deleted', false,
        {subscriptionStatus: 'freePendingReauth', stripeCustomerId: CUSTOMER_ID}],
      ['a relink with no tier change', 'customer.subscription.updated', false, {}],
    ])('sends nothing for %s', async (label, type, entitled, appMetadata) => {
      mockUpstreams({subscriptions: [proSubscription({status: entitled ? 'active' : 'canceled'})], appMetadata})
      mockStripeClient.webhooks.constructEvent.mockReturnValue(liveEvent(type))

      const res = await handler(webhookEvent())

      expect(res).toEqual({statusCode: 200, body: 'Success'})
      expect(global.fetch).not.toHaveBeenCalled()
      expect(mockStripeClient.checkout.sessions.list).not.toHaveBeenCalled()
    })

    it('counts a first delivery and not its redelivery', async () => {
      mockUpstreams()
      mockStripeClient.webhooks.constructEvent.mockReturnValue(liveEvent('customer.subscription.created'))
      await handler(webhookEvent())
      // Auth0 now stores what the first delivery wrote.
      mockUpstreams({appMetadata: storedAppMetadata({})})

      const res = await handler(webhookEvent())

      expect(res.statusCode).toBe(200)
      expect(mpPosts()).toHaveLength(1)
    })

    it('sends nothing for a promotion corrected straight back in the same delivery', async () => {
      mockUpstreams()
      listSequence(page([proSubscription()]), page([proSubscription({status: 'canceled'})]))
      mockStripeClient.webhooks.constructEvent.mockReturnValue(liveEvent('customer.subscription.created'))

      const res = await handler(webhookEvent())

      expect(res.statusCode).toBe(200)
      expect(patches().map((m) => m.subscriptionStatus)).toEqual(['shareProPendingReauth', 'freePendingReauth'])
      expect(global.fetch).not.toHaveBeenCalled()
    })

    // The redelivery a 500 asks for finds the tier written and sends nothing,
    // so a transition written before the failure is reported now or never.
    it('reports a tier written before a failure that asks Stripe to retry, once', async () => {
      mockUpstreams()
      axios.get.mockImplementation((url) => url.startsWith(USER_URL) ?
        Promise.reject(upstreamError(503)) :
        Promise.resolve({data: url.includes('/users-by-email') ? [{user_id: USER_ID, app_metadata: {}}] : []}))
      mockStripeClient.webhooks.constructEvent.mockReturnValue(liveEvent('customer.subscription.created'))

      const res = await handler(webhookEvent())

      expect(res.statusCode).toBe(500)
      expect(mpPosts().map((post) => post.body.events[0].name)).toEqual(['subscription_started'])
    }, CORRECTION_RETRY_TIMEOUT_MS)

    describe('never changes the response', () => {
      it.each([
        ['the network fails', () => global.fetch.mockRejectedValue(new TypeError('fetch failed'))],
        ['GA answers 500', () => global.fetch.mockResolvedValue({ok: false, status: 500})],
      ])('answers 200 when %s, logging without the API secret', async (label, breakIt) => {
        mockUpstreams()
        breakIt()
        mockStripeClient.webhooks.constructEvent.mockReturnValue(liveEvent('customer.subscription.created'))

        const res = await handler(webhookEvent())

        expect(res).toEqual({statusCode: 200, body: 'Success'})
        expect(global.fetch).toHaveBeenCalledTimes(1)
        const warned = console.warn.mock.calls.flat().join(' ')
        expect(warned).toContain('subscription_started for customer.subscription.created evt_unit not sent to GA')
        expect(warned).not.toContain(GA_ENV.GA4_API_SECRET)
        expect(Sentry.captureException).not.toHaveBeenCalled()
      })

      it('answers 200 when GA hangs, abandoning the request at its timeout', async () => {
        mockUpstreams()
        let signal = null
        global.fetch.mockImplementation((url, init) => {
          signal = init.signal
          return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))))
        })
        mockStripeClient.webhooks.constructEvent.mockReturnValue(liveEvent('customer.subscription.created'))

        const res = await handler(webhookEvent())

        expect(res).toEqual({statusCode: 200, body: 'Success'})
        expect(signal.aborted).toBe(true)
      }, MP_TIMEOUT_TEST_MS)

      it('answers 200 when an error escapes the client id lookup', async () => {
        mockUpstreams()
        mockStripeClient.checkout.sessions.list.mockImplementation(() => {
          throw new Error('synchronous SDK failure')
        })
        global.fetch.mockRejectedValue(new TypeError('fetch failed'))
        mockStripeClient.webhooks.constructEvent.mockReturnValue(liveEvent('customer.subscription.created'))

        const res = await handler(webhookEvent())

        expect(res).toEqual({statusCode: 200, body: 'Success'})
      })
    })

    describe('which GA client', () => {
      it('prefers the session that created this subscription over a newer checkout', async () => {
        mockCheckoutSessions([
          {client_reference_id: 'gacid_9_9', subscription: null, status: 'expired'},
          {client_reference_id: 'gacid_8_8', subscription: 'sub_other', status: 'complete'},
          {client_reference_id: 'gacid_7_7', subscription: 'sub_unit', status: 'complete'},
        ])
        mockUpstreams()
        mockStripeClient.webhooks.constructEvent.mockReturnValue(liveEvent('customer.subscription.created'))

        await handler(webhookEvent())

        expect(mpPosts()[0].body.client_id).toBe('7.7')
      })

      // Entitlement is read across the linked customer and the event's, so
      // the customer that decided a transition need not be the event's
      // (Codex on #1983). Its checkout is the paying browser; the event's
      // payload belongs to another customer, so nothing is taken from it.
      describe('the customer that decided the transition, not the event\'s', () => {
        const LINKED = 'cus_linked'

        beforeEach(() => {
          mockStripeClient.checkout.sessions.list.mockImplementation(({customer}) => Promise.resolve(page(customer === LINKED ?
            [{client_reference_id: 'gacid_5_5', subscription: 'sub_linked', status: 'complete'}] :
            [{client_reference_id: 'gacid_1871520000_1754700000', subscription: 'sub_unit', status: 'complete'}])))
        })

        it('a late event for an old customer promotes a user paying under the linked one: their browser', async () => {
          mockUpstreams({
            subscriptions: [proSubscription({status: 'canceled'})],
            otherCustomers: {[LINKED]: [proSubscription({id: 'sub_linked', customer: LINKED})]},
            appMetadata: {subscriptionStatus: 'freePendingReauth', stripeCustomerId: LINKED},
          })
          mockStripeClient.webhooks.constructEvent.mockReturnValue(liveEvent('customer.subscription.deleted'))

          const res = await handler(webhookEvent())

          expect(res.statusCode).toBe(200)
          expect(patches()).toEqual([{subscriptionStatus: 'shareProPendingReauth'}])
          const [{body}] = mpPosts()
          expect(body.client_id).toBe('5.5')
          expect(body.events[0]).toEqual({
            name: 'subscription_started',
            params: {tier: 'pro', source: 'server', cid_source: 'checkout', open_cid: 'cid.5.5'},
          })
          expect(mockStripeClient.checkout.sessions.list).toHaveBeenCalledWith(
            {customer: LINKED, limit: 10}, {timeout: 1500, maxNetworkRetries: 0})
        })

        it('a demotion is the linked customer\'s lapse, whichever customer\'s event found it', async () => {
          mockUpstreams({
            subscriptions: [proSubscription({status: 'canceled'})],
            otherCustomers: {[LINKED]: [proSubscription({id: 'sub_linked', customer: LINKED, status: 'canceled'})]},
            appMetadata: {subscriptionStatus: 'sharePro', stripeCustomerId: LINKED},
          })
          mockStripeClient.webhooks.constructEvent.mockReturnValue(liveEvent('customer.subscription.updated'))

          await handler(webhookEvent())

          const [{body}] = mpPosts()
          expect(body.events[0].name).toBe('subscription_ended')
          expect(body.client_id).toBe('5.5')
        })
      })

      it.each([
        ['no session carries a reference',
          () => mockCheckoutSessions([{client_reference_id: null, subscription: 'sub_unit', status: 'complete'}])],
        ['the key may not read Checkout Sessions (403)', () => mockStripeClient.checkout.sessions.list.mockRejectedValue(stripeError(403))],
      ])('falls back to a hash of the customer, flagged, when %s', async (label, arrange) => {
        arrange()
        mockUpstreams()
        mockStripeClient.webhooks.constructEvent.mockReturnValue(liveEvent('customer.subscription.created'))

        const res = await handler(webhookEvent())

        expect(res.statusCode).toBe(200)
        const [{body}] = mpPosts()
        expect(body.client_id).toMatch(/^\d+\.\d+$/)
        expect(body.events[0].params)
          .toEqual({tier: 'pro', source: 'server', cid_source: 'fallback', interval: 'month', plan: 'share_pro_monthly'})
        // Never a Stripe id, an email or a name, anywhere in what GA gets.
        const sent = JSON.stringify(body)
        expect(sent).not.toMatch(/cus_|sub_|price_|evt_|@/)
      })

      it('gives the same customer the same fallback client id on every event', async () => {
        mockCheckoutSessions([])
        mockUpstreams()
        mockStripeClient.webhooks.constructEvent.mockReturnValue(liveEvent('customer.subscription.created'))
        await handler(webhookEvent())
        mockUpstreams({subscriptions: [proSubscription({status: 'canceled'})], appMetadata: storedAppMetadata({})})
        mockStripeClient.webhooks.constructEvent.mockReturnValue(liveEvent('customer.subscription.deleted'))

        await handler(webhookEvent())

        const [started, ended] = mpPosts()
        expect(ended.body.events[0].name).toBe('subscription_ended')
        expect(ended.body.client_id).toBe(started.body.client_id)
      })
    })

    describe('configuration', () => {
      it.each(Object.keys(GA_ENV))('skips sending without %s, with a log line naming it', async (name) => {
        delete process.env[name]
        mockUpstreams()
        mockStripeClient.webhooks.constructEvent.mockReturnValue(liveEvent('customer.subscription.created'))

        const res = await handler(webhookEvent())

        expect(res).toEqual({statusCode: 200, body: 'Success'})
        expect(global.fetch).not.toHaveBeenCalled()
        expect(mockStripeClient.checkout.sessions.list).not.toHaveBeenCalled()
        expect(console.log.mock.calls.flat().join(' ')).toContain(name) // eslint-disable-line no-console
        expect(Sentry.captureMessage).not.toHaveBeenCalled()
      })

      it('skips a test-mode event, whichever endpoint it reached', async () => {
        mockUpstreams()
        mockStripeClient.webhooks.constructEvent.mockReturnValue({...liveEvent('customer.subscription.created'), livemode: false})

        const res = await handler(webhookEvent())

        expect(res.statusCode).toBe(200)
        expect(patches()).toHaveLength(1)
        expect(global.fetch).not.toHaveBeenCalled()
      })
    })
  })
})
