/*
 * Tests for the stripe-webhook Netlify Function — the one path by which a
 * Stripe subscription reaches Auth0 `app_metadata.subscriptionStatus`.
 *
 * The end-to-end conversations (real Stripe signatures, recorded payloads,
 * against source and bundle) are replay scenarios in
 * `replay/stripe-webhook/`. This suite mocks the Stripe SDK and axios to pin
 * the branches those don't reach: a failure at each step, the retry
 * contract (which upstream statuses get a 5xx so Stripe redelivers), status
 * taken from the subscription's current state rather than the payload,
 * deleted customers, raw-body handling, and what reaches Sentry.
 *
 * In `_tests/` rather than beside its subject: Netlify bundles every
 * top-level `.js` under `netlify/functions/` AS a function.
 */

import axios from 'axios'
import * as Sentry from '@sentry/serverless'
import Stripe from 'stripe'
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
}))
const mockStripeClient = {
  webhooks: {constructEvent: jest.fn()},
  subscriptions: {retrieve: jest.fn()},
  customers: {retrieve: jest.fn()},
}
jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn(() => mockStripeClient),
}))

const ENV = {
  STRIPE_SECRET_KEY: 'sk_test_unit',
  STRIPE_WEBHOOK_SECRET: 'whsec_unit',
  AUTH0_DOMAIN: 'bldrs.test.auth0.com',
  AUTH0_CLIENT_ID: 'client-id',
  AUTH0_CLIENT_SECRET: 'client-secret-value',
  SHARE_PRO_PRICE_ID: 'price_pro',
}
const CUSTOMER_ID = 'cus_unit'
const SUBSCRIPTION_ID = 'sub_unit'
const USER_ID = 'google-oauth2|42'
const USER_URL = `https://${ENV.AUTH0_DOMAIN}/api/v2/users/google-oauth2%7C42`
const RAW_BODY = '{"id":"evt_unit"}'


/**
 * @param {object} [overrides]
 * @return {object} a Stripe subscription
 */
function subscription(overrides = {}) {
  return {id: SUBSCRIPTION_ID, customer: CUSTOMER_ID, status: 'active', items: {data: []}, ...overrides}
}


/**
 * The event's payload is deliberately a stale, Pro, active copy: the
 * handler must decide from `subscriptions.retrieve` (the current state),
 * so a test that passes only because the payload agreed can't exist.
 *
 * @param {string} type
 * @return {object} what constructEvent returns
 */
function stripeEvent(type) {
  return {
    id: 'evt_unit',
    type,
    data: {object: subscription({items: {data: [{price: {id: ENV.SHARE_PRO_PRICE_ID}}]}})},
  }
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
 * Wire the happy path through Stripe and Auth0.
 *
 * @param {object} [current] the subscription's current state in Stripe
 */
function mockUpstreams(current = subscription()) {
  mockStripeClient.subscriptions.retrieve.mockResolvedValue(current)
  mockStripeClient.customers.retrieve.mockResolvedValue({id: CUSTOMER_ID, email: 'ada@example.com'})
  axios.post.mockResolvedValue({data: {access_token: 'mgmt-token'}})
  axios.get.mockResolvedValue({data: [{user_id: USER_ID}]})
  axios.patch.mockResolvedValue({data: {}})
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
 * @return {Error} shaped like a Stripe SDK error
 */
function stripeError(statusCode) {
  return Object.assign(new Error(`Stripe answered ${statusCode}`), {type: 'StripeInvalidRequestError', statusCode})
}


describe('stripe-webhook function', () => {
  const savedEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = {...savedEnv, ...ENV}
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = savedEnv
    console.error.mockRestore()
  })

  describe('configuration', () => {
    it.each(Object.keys(ENV).filter((name) => name !== 'SHARE_PRO_PRICE_ID'))(
      'answers 500 "not configured" without %s, naming it but no secret value', async (name) => {
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

  describe('status written to Auth0', () => {
    it('marks Share Pro when the Pro price is any of the current subscription\'s items', async () => {
      mockUpstreams(subscription({items: {data: [{price: {id: 'price_addon'}}, {price: {id: ENV.SHARE_PRO_PRICE_ID}}]}}))
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.created'))

      const res = await handler(webhookEvent())

      expect(res.statusCode).toBe(200)
      expect(mockStripeClient.subscriptions.retrieve).toHaveBeenCalledWith(SUBSCRIPTION_ID)
      expect(axios.patch).toHaveBeenCalledWith(
        USER_URL,
        {app_metadata: {subscriptionStatus: 'shareProPendingReauth', stripeCustomerId: CUSTOMER_ID}},
        {headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer mgmt-token'}},
      )
    })

    it('writes Stripe\'s own status for a non-Pro subscription, and tolerates missing items', async () => {
      mockUpstreams(subscription({status: 'trialing', items: undefined}))
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.created'))

      await handler(webhookEvent())

      expect(axios.patch.mock.calls[0][1].app_metadata.subscriptionStatus).toBe('trialing')
    })

    // Delivery order isn't guaranteed and failed deliveries are retried
    // later, so the payload of a `created` may describe a subscription that
    // has since been cancelled. The current state wins.
    it.each(['canceled', 'incomplete_expired'])(
      'writes freePendingReauth for a `created` whose subscription is now %s, whatever its payload says', async (status) => {
        mockUpstreams(subscription({status, items: {data: [{price: {id: ENV.SHARE_PRO_PRICE_ID}}]}}))
        mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.created'))

        await handler(webhookEvent())

        expect(axios.patch.mock.calls[0][1].app_metadata.subscriptionStatus).toBe('freePendingReauth')
      })

    it('looks the user up by the customer\'s email, URL-encoded', async () => {
      mockUpstreams(subscription({status: 'canceled'}))
      mockStripeClient.customers.retrieve.mockResolvedValue({id: CUSTOMER_ID, email: 'ada+pro@example.com'})
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.deleted'))

      await handler(webhookEvent())

      expect(axios.get).toHaveBeenCalledWith(
        `https://${ENV.AUTH0_DOMAIN}/api/v2/users-by-email?email=ada%2Bpro%40example.com`,
        {headers: {Authorization: 'Bearer mgmt-token'}},
      )
      expect(axios.patch.mock.calls[0][1].app_metadata.subscriptionStatus).toBe('freePendingReauth')
    })
  })

  // Stripe redelivers any non-2xx for up to three days; a 200 ends it. So a
  // failure Stripe can't fix by retrying must be 200, and one it can, 5xx.
  describe('retry contract', () => {
    it.each([
      ['the subscription lookup fails at the network', () => mockStripeClient.subscriptions.retrieve.mockRejectedValue(
        Object.assign(new Error('socket hang up'), {type: 'StripeConnectionError'}))],
      ['the customer lookup answers 500', () => mockStripeClient.customers.retrieve.mockRejectedValue(stripeError(500))],
      ['Stripe rejects the API key (401, a config fault)',
        () => mockStripeClient.subscriptions.retrieve.mockRejectedValue(stripeError(401))],
      ['the Management API token answers 503', () => axios.post.mockRejectedValue(upstreamError(503))],
      ['Auth0 rejects the client secret (403, a config fault)', () => axios.post.mockRejectedValue(upstreamError(403))],
      ['the user search is rate-limited (429)', () => axios.get.mockRejectedValue(upstreamError(429))],
      ['the app_metadata write answers 502', () => axios.patch.mockRejectedValue(upstreamError(502))],
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
      ['Stripe has no such subscription (404)', () => mockStripeClient.subscriptions.retrieve.mockRejectedValue(stripeError(404))],
      ['Stripe has no such customer (404)', () => mockStripeClient.customers.retrieve.mockRejectedValue(stripeError(404))],
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
      expect(mockStripeClient.subscriptions.retrieve).not.toHaveBeenCalled()
      const [message] = Sentry.captureMessage.mock.calls[0]
      expect(message).toContain('invoice.paid')
      expect(message).toContain('evt_invoice')
      expect(message).not.toContain('ada@example.com')
    })
  })
})
