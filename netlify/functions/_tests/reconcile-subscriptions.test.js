/*
 * Tests for reconcile-subscriptions' time budget: Netlify stops a scheduled
 * function at 30 s, so the sweep must stop starting work before that and
 * say so (`truncated`, `skipped`), rather than be cut off mid-write with no
 * summary. The sweep's behaviour end to end is in the replay scenarios
 * (`replay/reconcile-subscriptions/`), against source and bundle.
 */

import axios from 'axios'
import * as Sentry from '@sentry/serverless'
import {resetManagementApiTokenCache} from '../_lib/auth0.js'
import {handler} from '../reconcile-subscriptions.js'


/* eslint-disable no-magic-numbers */
jest.mock('axios')
jest.mock('@sentry/serverless', () => ({
  AWSLambda: {init: jest.fn(), wrapHandler: (fn) => fn},
  captureMessage: jest.fn(),
  captureException: jest.fn(),
  setUser: jest.fn(),
}))
const mockStripeClient = {subscriptions: {list: jest.fn()}, customers: {retrieve: jest.fn()}}
jest.mock('stripe', () => ({__esModule: true, default: jest.fn(() => mockStripeClient)}))

const ENV = {
  STRIPE_SECRET_KEY: 'sk_test_unit',
  SHARE_PRO_PRICE_ID: 'price_pro',
  AUTH0_DOMAIN: 'bldrs.test.auth0.com',
  AUTH0_CLIENT_ID: 'client-id',
  AUTH0_CLIENT_SECRET: 'client-secret-value',
  RECONCILE_MODE: 'apply',
}


describe('reconcile-subscriptions time budget', () => {
  const savedEnv = process.env
  let now

  beforeEach(() => {
    jest.clearAllMocks()
    resetManagementApiTokenCache()
    process.env = {...savedEnv, ...ENV}
    jest.spyOn(console, 'error').mockImplementation(() => {})
    now = 1_000_000
    jest.spyOn(Date, 'now').mockImplementation(() => now)
    axios.post.mockResolvedValue({data: {access_token: 'mgmt-token', expires_in: 86400}})
    // Ten PRO users, none entitled: without a budget, all ten get demoted.
    const proUsers = Array.from({length: 10}, (_, i) => ({
      user_id: `auth0|u${i}`,
      app_metadata: {subscriptionStatus: 'sharePro', stripeCustomerId: `cus_${i}`},
    }))
    axios.get.mockResolvedValue({data: proUsers})
    axios.patch.mockResolvedValue({data: {}})
    mockStripeClient.subscriptions.list.mockImplementation(() => {
      // Every Stripe call takes 10 s of the budget.
      now += 10_000
      return Promise.resolve({object: 'list', data: [], has_more: false})
    })
  })

  afterEach(() => {
    process.env = savedEnv
    jest.restoreAllMocks()
  })

  it('stops starting items at the budget, and reports the run as truncated', async () => {
    const res = await handler({})

    expect(res.statusCode).toBe(200)
    const summary = JSON.parse(res.body)
    expect(summary.truncated).toBe(true)
    expect(summary.skipped).toBeGreaterThan(0)
    // Nothing started after the deadline, so fewer than all ten were handled.
    expect(summary.demote.length + summary.skipped).toBe(10)
    expect(summary.demote.length).toBeLessThan(10)
    expect(Sentry.captureMessage).toHaveBeenCalledWith(expect.stringContaining('"truncated":true'), 'warning')
  })

  it('finishes and is not truncated when the work fits the budget', async () => {
    mockStripeClient.subscriptions.list.mockResolvedValue({object: 'list', data: [], has_more: false})

    const res = await handler({})

    const summary = JSON.parse(res.body)
    expect(summary.truncated).toBe(false)
    expect(summary.skipped).toBe(0)
    expect(summary.demote).toHaveLength(10)
  })
})
