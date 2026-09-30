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
 * handling, and what reaches Sentry.
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
  })

  afterEach(() => {
    process.env = savedEnv
    console.error.mockRestore()
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

        expect(patches()[0]).toEqual({subscriptionStatus: 'freePendingReauth', stripeCustomerId: CUSTOMER_ID})
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
      expect(patches()[0]).toEqual({subscriptionStatus: 'freePendingReauth', stripeCustomerId: CUSTOMER_ID})
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
        [{subscriptionStatus: 'shareProPendingReauth', stripeCustomerId: CUSTOMER_ID}]],
      ['a sharePro user stays entitled', true, {subscriptionStatus: 'sharePro', stripeCustomerId: CUSTOMER_ID}, []],
      ['a shareProPendingReauth user stays entitled', true,
        {subscriptionStatus: 'shareProPendingReauth', stripeCustomerId: CUSTOMER_ID}, []],
      ['a sharePro user loses entitlement', false, {subscriptionStatus: 'sharePro', stripeCustomerId: CUSTOMER_ID},
        [{subscriptionStatus: 'freePendingReauth', stripeCustomerId: CUSTOMER_ID}]],
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
})
