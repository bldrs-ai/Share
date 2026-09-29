/*
 * Tests for the stripe-webhook Netlify Function — the one path by which a
 * Stripe subscription reaches Auth0 `app_metadata.subscriptionStatus`.
 *
 * The end-to-end conversations (real Stripe signatures, recorded payloads,
 * against source and bundle) are replay scenarios in
 * `replay/stripe-webhook/`. This suite mocks the Stripe SDK and axios to pin
 * the branches those don't reach: a failure at each Auth0 step, the retry
 * contract (5xx only for transient failures), deleted customers, raw-body
 * handling, and what does and doesn't reach Sentry.
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
const USER_ID = 'google-oauth2|42'
const USER_URL = `https://${ENV.AUTH0_DOMAIN}/api/v2/users/google-oauth2%7C42`
const RAW_BODY = '{"id":"evt_unit"}'


/**
 * @param {string} type
 * @param {object} [subscription]
 * @return {object} what constructEvent returns
 */
function stripeEvent(type, subscription = {}) {
  return {
    id: 'evt_unit',
    type,
    data: {object: {customer: CUSTOMER_ID, status: 'active', items: {data: []}, ...subscription}},
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


/** Wire the happy path through Stripe and Auth0. */
function mockUpstreams() {
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
    it('marks Share Pro when the Pro price is any of the subscription items', async () => {
      mockUpstreams()
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.created', {
        items: {data: [{price: {id: 'price_addon'}}, {price: {id: ENV.SHARE_PRO_PRICE_ID}}]},
      }))

      const res = await handler(webhookEvent())

      expect(res.statusCode).toBe(200)
      expect(axios.patch).toHaveBeenCalledWith(
        USER_URL,
        {app_metadata: {subscriptionStatus: 'shareProPendingReauth', stripeCustomerId: CUSTOMER_ID}},
        {headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer mgmt-token'}},
      )
    })

    it('writes Stripe\'s own status for a non-Pro subscription, and tolerates missing items', async () => {
      mockUpstreams()
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.created', {
        status: 'trialing', items: undefined,
      }))

      await handler(webhookEvent())

      expect(axios.patch.mock.calls[0][1].app_metadata.subscriptionStatus).toBe('trialing')
    })

    it('looks the user up by the customer\'s email, URL-encoded', async () => {
      mockUpstreams()
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
      ['the customer lookup', () => mockStripeClient.customers.retrieve.mockRejectedValue(upstreamError(500))],
      ['the Management API token', () => axios.post.mockRejectedValue(upstreamError(503))],
      ['the user search', () => axios.get.mockRejectedValue(upstreamError(429))],
      ['the app_metadata write', () => axios.patch.mockRejectedValue(upstreamError(502))],
    ])('answers 500 so Stripe retries when %s fails', async (step, breakIt) => {
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
      ['the customer has no email', () => mockStripeClient.customers.retrieve.mockResolvedValue({id: CUSTOMER_ID, email: null})],
      ['the customer was deleted', () => mockStripeClient.customers.retrieve.mockResolvedValue({id: CUSTOMER_ID, deleted: true})],
      ['no Auth0 user has that email', () => axios.get.mockResolvedValue({data: []})],
    ])('acknowledges with 200, writes nothing, and reports when %s', async (condition, arrange) => {
      mockUpstreams()
      arrange()
      mockStripeClient.webhooks.constructEvent.mockReturnValue(stripeEvent('customer.subscription.deleted'))

      const res = await handler(webhookEvent())

      expect(res.statusCode).toBe(200)
      expect(axios.patch).not.toHaveBeenCalled()
      expect(Sentry.captureException).toHaveBeenCalledTimes(1)
    })

    it('acknowledges an unhandled event type, reporting its type and id but not its contents', async () => {
      mockStripeClient.webhooks.constructEvent.mockReturnValue({
        id: 'evt_invoice', type: 'invoice.paid', data: {object: {customer_email: 'ada@example.com'}},
      })

      const res = await handler(webhookEvent())

      expect(res.statusCode).toBe(200)
      expect(mockStripeClient.customers.retrieve).not.toHaveBeenCalled()
      const [message] = Sentry.captureMessage.mock.calls[0]
      expect(message).toContain('invoice.paid')
      expect(message).toContain('evt_invoice')
      expect(message).not.toContain('ada@example.com')
    })
  })
})
