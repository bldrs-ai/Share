/*
 * Tests for the stripe-webhook Netlify Function — the one path by which a
 * Stripe subscription reaches Auth0 `app_metadata.subscriptionStatus`.
 *
 * The end-to-end conversations (real Stripe signatures, recorded payloads,
 * against source and bundle) are replay scenarios in
 * `replay/stripe-webhook/`. This suite mocks the Stripe SDK and axios to pin
 * what those don't enumerate: every Stripe status against the entitlement
 * rule, every Auth0 tier against the write-only-on-tier-change rule
 * (bldrs-ai/ops#34), the read-after-write correction and its inline retry,
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
 * Wire Stripe and Auth0. `subscriptions` is what the customer holds now;
 * `appMetadata` is the Auth0 user's.
 *
 * @param {object} [options]
 * @param {Array<object>} [options.subscriptions]
 * @param {object} [options.appMetadata]
 */
function mockUpstreams({subscriptions = [proSubscription()], appMetadata = {}} = {}) {
  mockStripeClient.subscriptions.list.mockResolvedValue(page(subscriptions))
  mockStripeClient.customers.retrieve.mockResolvedValue({id: CUSTOMER_ID, email: 'ada@example.com'})
  axios.post.mockResolvedValue({data: {access_token: 'mgmt-token', expires_in: 86400}})
  axios.get.mockResolvedValue({data: [{user_id: USER_ID, app_metadata: appMetadata}]})
  axios.patch.mockResolvedValue({data: {}})
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
        {headers: {Authorization: 'Bearer mgmt-token'}},
      )
      expect(axios.patch.mock.calls[0][0]).toBe(USER_URL)
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
      mockStripeClient.subscriptions.list
        .mockResolvedValueOnce(page([proSubscription()]))
        .mockResolvedValueOnce(page([proSubscription({status: 'canceled'})]))
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
      mockStripeClient.subscriptions.list
        .mockResolvedValueOnce(page([proSubscription()]))
        .mockResolvedValueOnce(page([proSubscription({status: 'canceled'})]))
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
      mockStripeClient.subscriptions.list
        .mockResolvedValueOnce(page([proSubscription()]))
        .mockRejectedValueOnce(stripeError(503))
        .mockResolvedValueOnce(page([proSubscription({status: 'canceled'})]))
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.created'))

      const res = await handler(webhookEvent())

      expect(res.statusCode).toBe(200)
      expect(patches().map((m) => m.subscriptionStatus)).toEqual(['shareProPendingReauth', 'freePendingReauth'])
    }, CORRECTION_RETRY_TIMEOUT_MS)

    it('asks Stripe to retry once the correction\'s inline retries run out', async () => {
      mockUpstreams()
      mockStripeClient.subscriptions.list
        .mockResolvedValueOnce(page([proSubscription()]))
        .mockResolvedValueOnce(page([proSubscription({status: 'canceled'})]))
      axios.patch.mockResolvedValueOnce({data: {}}).mockRejectedValue(upstreamError(503))
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.created'))

      const res = await handler(webhookEvent())

      expect(res.statusCode).toBe(500)
      // One promotion, then the correction tried three times.
      expect(axios.patch).toHaveBeenCalledTimes(4)
    }, CORRECTION_RETRY_TIMEOUT_MS)
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
