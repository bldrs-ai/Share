/*
 * Tests for reconcile-subscriptions, mocked. The sweep's conversations end
 * to end are the replay scenarios (`replay/reconcile-subscriptions/`),
 * against source and bundle; this suite pins what those can't enumerate
 * cheaply:
 *  - the time budget: Netlify stops a scheduled function at 30 s, so the
 *    sweep stops STARTING work at 20 s and stops WAITING at 26 s, and says
 *    so (`truncated`, `skipped`, `inFlight`) instead of being cut off with no
 *    summary — and a slow demote list doesn't starve promotion;
 *  - paging on both sides (Stripe `has_more`, Auth0 pages and its
 *    1000-result cap);
 *  - the per-item rules: relink rather than demote a user paying under
 *    another customer, the promote skip for users already PRO, customer ids
 *    that can't go into a Lucene query, a correction when Stripe moved
 *    between read and write, and item failures reaching Sentry as errors.
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
const mockStripeClient = {subscriptions: {list: jest.fn()}, customers: {retrieve: jest.fn(), list: jest.fn()}}
jest.mock('stripe', () => ({__esModule: true, default: jest.fn(() => mockStripeClient)}))

const ENV = {
  STRIPE_SECRET_KEY: 'sk_test_unit',
  SHARE_PRO_PRICE_ID: 'price_pro',
  AUTH0_DOMAIN: 'bldrs.test.auth0.com',
  AUTH0_CLIENT_ID: 'client-id',
  AUTH0_CLIENT_SECRET: 'client-secret-value',
  RECONCILE_MODE: 'apply',
}


/**
 * @param {string} customer
 * @param {string} [status]
 * @return {object} a Pro subscription
 */
function proSub(customer, status = 'active') {
  return {id: `sub_${customer}_${status}`, customer, status, items: {data: [{price: {id: ENV.SHARE_PRO_PRICE_ID}}]}}
}


/**
 * @param {number} i
 * @return {object} an Auth0 user marked Pro and linked to cus_<i>
 */
function proUser(i) {
  return {user_id: `auth0|u${i}`, email: `u${i}@example.com`, app_metadata: {subscriptionStatus: 'sharePro', stripeCustomerId: `cus_${i}`}}
}


/**
 * Wire the upstreams.
 *
 * @param {object} world
 * @param {Array<object>} [world.proUsers] what the Pro search returns, paged by 50
 * @param {Array<Array<object>>} [world.pricePages] pages of the Pro-price subscription list
 * @param {object} [world.subsByCustomer] customer id → its subscriptions (default none)
 * @param {object} [world.usersByEmail] email → Auth0 users
 * @param {object} [world.linkedUsers] customer id → the Auth0 user linked to it
 * @param {object} [world.customersByEmail] email → Stripe customer ids
 */
function mockWorld({
  proUsers = [], pricePages = [[]], subsByCustomer = {}, usersByEmail = {}, linkedUsers = {}, customersByEmail = {},
} = {}) {
  axios.post.mockResolvedValue({data: {access_token: 'mgmt-token', expires_in: 86400}})
  axios.patch.mockResolvedValue({data: {}})
  const initialMetadata = {}
  for (const user of [...proUsers, ...Object.values(usersByEmail).flat(), ...Object.values(linkedUsers)]) {
    initialMetadata[user.user_id] = user.app_metadata || {}
  }
  axios.get.mockImplementation((url) => {
    const parsed = new URL(url)
    const userPath = parsed.pathname.match(/\/api\/v2\/users\/(.+)$/)
    if (userPath) {
      // What Auth0 would store: the user's app_metadata with every PATCH to
      // it so far merged over it.
      const userId = decodeURIComponent(userPath[1])
      const stored = axios.patch.mock.calls
        .filter(([patchUrl]) => patchUrl === url)
        .reduce((metadata, [, body]) => ({...metadata, ...body.app_metadata}), {...initialMetadata[userId]})
      return Promise.resolve({data: {user_id: userId, app_metadata: stored}})
    }
    if (parsed.pathname.endsWith('/users-by-email')) {
      return Promise.resolve({data: usersByEmail[parsed.searchParams.get('email')] || []})
    }
    const q = parsed.searchParams.get('q')
    const page = Number(parsed.searchParams.get('page'))
    if (q.startsWith('app_metadata.subscriptionStatus')) {
      return Promise.resolve({data: proUsers.slice(page * 50, (page + 1) * 50)})
    }
    const customer = q.match(/"(.*)"/)[1]
    return Promise.resolve({data: linkedUsers[customer] ? [linkedUsers[customer]] : []})
  })
  mockStripeClient.subscriptions.list.mockImplementation((params) => {
    if (params.price) {
      const index = params.starting_after ? pricePages.findIndex((p) => p.some((s) => s.id === params.starting_after)) + 1 : 0
      return Promise.resolve({object: 'list', data: pricePages[index], has_more: index < pricePages.length - 1})
    }
    return Promise.resolve({object: 'list', data: subsByCustomer[params.customer] || [], has_more: false})
  })
  mockStripeClient.customers.list.mockImplementation(({email}) =>
    Promise.resolve({object: 'list', data: (customersByEmail[email] || []).map((id) => ({id})), has_more: false}))
  mockStripeClient.customers.retrieve.mockImplementation((id) => Promise.resolve({id, email: `${id}@example.com`}))
}


/** @return {Array<Array>} [Auth0 user id, app_metadata] per PATCH */
function patches() {
  return axios.patch.mock.calls.map(([url, body]) => [decodeURIComponent(url.split('/users/')[1]), body.app_metadata])
}


/**
 * @param {object} [event]
 * @return {Promise<object>} the handler's response with its body parsed
 */
async function sweep(event = {}) {
  const res = await handler(event)
  return {...res, summary: JSON.parse(res.body)}
}


describe('reconcile-subscriptions', () => {
  const savedEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    resetManagementApiTokenCache()
    process.env = {...savedEnv, ...ENV}
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = savedEnv
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  describe('time budget', () => {
    let now

    beforeEach(() => {
      now = 1_000_000
      jest.spyOn(Date, 'now').mockImplementation(() => now)
    })

    /**
     * Every per-customer Stripe read costs `ms` of the clock.
     *
     * @param {number} ms
     */
    function slowCustomerReads(ms) {
      const inner = mockStripeClient.subscriptions.list.getMockImplementation()
      mockStripeClient.subscriptions.list.mockImplementation((params) => {
        if (params.customer) {
          now += ms
        }
        return inner(params)
      })
    }

    it('stops starting items at 20 s, and reports what it never started', async () => {
      // Ten lapsed Pro users: without a budget, all ten get demoted.
      mockWorld({proUsers: Array.from({length: 10}, (_, i) => proUser(i))})
      slowCustomerReads(5_000)

      const {statusCode, summary} = await sweep()

      expect(statusCode).toBe(200)
      expect(summary.truncated).toBe(true)
      expect(summary.skipped).toBeGreaterThan(0)
      expect(summary.demote.length).toBeLessThan(10)
      // Every discovered item is either handled or counted as skipped.
      expect(summary.demote.length + summary.skipped).toBe(10)
      expect(Sentry.captureMessage).toHaveBeenCalledWith(expect.stringContaining('"truncated":true'), 'warning')
    })

    it('finishes, untruncated, when the work fits', async () => {
      mockWorld({proUsers: Array.from({length: 10}, (_, i) => proUser(i))})

      const {summary} = await sweep()

      expect(summary).toMatchObject({truncated: false, skipped: 0, inFlight: 0})
      expect(summary.demote).toHaveLength(10)
    })

    // Codex P1 on #1891: the demote pass used to run first and take the whole
    // budget, every day, leaving lost-webhook payers unpromoted for good.
    it('does not let a slow demote list starve promotion', async () => {
      mockWorld({
        proUsers: Array.from({length: 10}, (_, i) => proUser(i)),
        pricePages: [[proSub('cus_payer')]],
        subsByCustomer: {cus_payer: [proSub('cus_payer')]},
        usersByEmail: {'cus_payer@example.com': [{user_id: 'auth0|payer', app_metadata: {}}]},
      })
      slowCustomerReads(5_000)

      const {summary} = await sweep()

      expect(summary.truncated).toBe(true)
      expect(summary.promote).toEqual([{user: 'auth0|payer', customer: 'cus_payer'}])
    })

    // Codex P2 on #1891: discovery paging ignored the deadline.
    it('stops paging the Pro-price list at the deadline', async () => {
      const pages = Array.from({length: 5}, (_, i) => [proSub(`cus_p${i}`, 'canceled')])
      mockWorld({pricePages: pages})
      const inner = mockStripeClient.subscriptions.list.getMockImplementation()
      mockStripeClient.subscriptions.list.mockImplementation((params) => {
        now += 8_000
        return inner(params)
      })

      const {summary} = await sweep()

      expect(summary.truncated).toBe(true)
      // Pages at 0, 8 and 16 s; none at 24 s.
      expect(mockStripeClient.subscriptions.list.mock.calls.filter(([params]) => params.price)).toHaveLength(3)
    })

    it('stops paging the Auth0 search at the deadline', async () => {
      mockWorld({proUsers: Array.from({length: 250}, (_, i) => proUser(i))})
      const inner = axios.get.getMockImplementation()
      axios.get.mockImplementation((url) => {
        now += 8_000
        return inner(url)
      })

      const {summary} = await sweep()

      expect(summary.truncated).toBe(true)
      expect(summary.scanned.proUsers).toBe(150)
    })
  })

  describe('hard stop', () => {
    it('sends the summary at 26 s even with items still in flight', async () => {
      jest.useFakeTimers()
      mockWorld({proUsers: [proUser(1), proUser(2)], subsByCustomer: {cus_2: [proSub('cus_2')]}})
      const inner = mockStripeClient.subscriptions.list.getMockImplementation()
      // cus_1's read never answers.
      mockStripeClient.subscriptions.list.mockImplementation((params) =>
        (params.customer === 'cus_1' ? new Promise(() => {}) : inner(params)))

      const pending = sweep()
      // Drain the promise chain so discovery runs and the items start (every
      // mocked upstream is promise-only; no timer is involved), then jump
      // past the wait deadline. This Jest predates advanceTimersByTimeAsync.
      for (let i = 0; i < 100; i++) {
        await Promise.resolve()
      }
      jest.advanceTimersByTime(26_000)
      const {statusCode, summary} = await pending

      expect(statusCode).toBe(200)
      expect(summary).toMatchObject({truncated: true, inFlight: 1, skipped: 0})
    })
  })

  describe('paging', () => {
    it('follows Stripe\'s has_more with starting_after across Pro-price pages', async () => {
      mockWorld({
        pricePages: [[proSub('cus_a')], [proSub('cus_b')]],
        usersByEmail: {'cus_b@example.com': [{user_id: 'auth0|b', app_metadata: {}}]},
      })

      const {summary} = await sweep()

      expect(mockStripeClient.subscriptions.list).toHaveBeenCalledWith({price: ENV.SHARE_PRO_PRICE_ID, limit: 100})
      expect(mockStripeClient.subscriptions.list).toHaveBeenCalledWith(
        {price: ENV.SHARE_PRO_PRICE_ID, limit: 100, starting_after: 'sub_cus_a_active'})
      expect(summary.scanned.entitledCustomers).toBe(2)
      expect(summary.promote).toEqual([{user: 'auth0|b', customer: 'cus_b'}])
    })

    it('pages the Auth0 search and marks the run truncated at Auth0\'s 1000-result cap', async () => {
      const comped = Array.from({length: 1000}, (_, i) => ({user_id: `auth0|c${i}`, app_metadata: {subscriptionStatus: 'sharePro'}}))
      mockWorld({proUsers: comped})

      const {summary} = await sweep()

      expect(summary.scanned.proUsers).toBe(1000)
      expect(summary.truncated).toBe(true)
      expect(summary.unverifiable).toHaveLength(1000)
    })

    it('reads one short Auth0 page as the end, untruncated', async () => {
      mockWorld({proUsers: Array.from({length: 51}, (_, i) => ({user_id: `auth0|c${i}`, app_metadata: {subscriptionStatus: 'sharePro'}}))})

      const {summary} = await sweep()

      expect(summary.scanned.proUsers).toBe(51)
      expect(summary.truncated).toBe(false)
    })
  })

  describe('items', () => {
    it('relinks, rather than demotes, a Pro user paying under another customer with their email', async () => {
      mockWorld({
        proUsers: [proUser(1)],
        customersByEmail: {'u1@example.com': ['cus_1', 'cus_new']},
        subsByCustomer: {cus_1: [proSub('cus_1', 'canceled')], cus_new: [proSub('cus_new')]},
      })

      const {summary} = await sweep()

      expect(summary.demote).toEqual([])
      expect(summary.relink).toEqual([{user: 'auth0|u1', from: 'cus_1', to: 'cus_new'}])
      expect(patches()).toEqual([['auth0|u1', {stripeCustomerId: 'cus_new'}]])
    })

    // Codex on #1891 (round 2): identities sharing an email but never linked
    // must not take each other's customer (and its billing portal).
    it('does not relink to a same-email customer already linked to another user, and demotes', async () => {
      mockWorld({
        proUsers: [proUser(1)],
        customersByEmail: {'u1@example.com': ['cus_1', 'cus_theirs']},
        subsByCustomer: {cus_theirs: [proSub('cus_theirs')]},
        linkedUsers: {
          cus_theirs: {user_id: 'github|other', app_metadata: {subscriptionStatus: 'sharePro', stripeCustomerId: 'cus_theirs'}},
        },
      })

      const {summary} = await sweep()

      expect(summary.relink).toEqual([])
      expect(summary.demote).toEqual([{user: 'auth0|u1', customer: 'cus_1'}])
      expect(patches().every(([, metadata]) => metadata.stripeCustomerId !== 'cus_theirs')).toBe(true)
    })

    it('demotes after all when the relinked customer lapsed before the confirming read', async () => {
      mockWorld({proUsers: [proUser(1)], customersByEmail: {'u1@example.com': ['cus_new']}})
      let newReads = 0
      const inner = mockStripeClient.subscriptions.list.getMockImplementation()
      mockStripeClient.subscriptions.list.mockImplementation((params) => {
        if (params.customer === 'cus_new') {
          return Promise.resolve({object: 'list', data: ++newReads === 1 ? [proSub('cus_new')] : [], has_more: false})
        }
        return inner(params)
      })

      const {summary} = await sweep()

      expect(summary.relink).toEqual([{user: 'auth0|u1', from: 'cus_1', to: 'cus_new'}])
      expect(summary.demote).toEqual([{user: 'auth0|u1', customer: 'cus_1'}])
      expect(patches().map(([, metadata]) => metadata)).toEqual([
        {stripeCustomerId: 'cus_new'},
        {subscriptionStatus: 'freePendingReauth', stripeCustomerId: 'cus_1'},
      ])
    })

    it('reports a relink without writing it in report mode', async () => {
      process.env.RECONCILE_MODE = 'report'
      mockWorld({
        proUsers: [proUser(1)],
        customersByEmail: {'u1@example.com': ['cus_new']},
        subsByCustomer: {cus_new: [proSub('cus_new')]},
      })

      const {summary} = await sweep()

      expect(summary.relink).toHaveLength(1)
      expect(axios.patch).not.toHaveBeenCalled()
    })

    it('corrects a demotion when the confirming read shows the customer entitled again', async () => {
      mockWorld({proUsers: [proUser(1)]})
      let reads = 0
      const inner = mockStripeClient.subscriptions.list.getMockImplementation()
      mockStripeClient.subscriptions.list.mockImplementation((params) => {
        if (params.customer === 'cus_1') {
          reads++
          return Promise.resolve({object: 'list', data: reads === 1 ? [] : [proSub('cus_1')], has_more: false})
        }
        return inner(params)
      })

      const {summary} = await sweep()

      expect(summary.errors).toEqual([])
      expect(patches().map(([, metadata]) => metadata.subscriptionStatus)).toEqual(['freePendingReauth', 'shareProPendingReauth'])
    })

    it('skips promoting a customer whose user the Pro search already returned', async () => {
      const user = proUser(1)
      mockWorld({
        proUsers: [user],
        pricePages: [[proSub('cus_1'), proSub('cus_2')]],
        subsByCustomer: {cus_1: [proSub('cus_1')], cus_2: [proSub('cus_2')]},
        // cus_2's email belongs to the same, already-Pro user.
        usersByEmail: {'cus_2@example.com': [user]},
      })

      const {summary} = await sweep()

      expect(summary.promote).toEqual([])
      expect(axios.patch).not.toHaveBeenCalled()
    })

    it('refuses a customer id that could not be put into a Lucene query safely', async () => {
      mockWorld({pricePages: [[proSub('cus_x" OR email:*')]]})

      const {summary} = await sweep()

      expect(summary.unverifiable).toEqual([{customer: 'cus_x" OR email:*', reason: 'unexpected_customer_id'}])
      expect(axios.get.mock.calls.some(([url]) => url.includes('stripeCustomerId'))).toBe(false)
    })

    it('records an item\'s failure, carries on, and reports it to Sentry as an error', async () => {
      mockWorld({proUsers: [proUser(1), proUser(2)]})
      const inner = mockStripeClient.subscriptions.list.getMockImplementation()
      mockStripeClient.subscriptions.list.mockImplementation((params) => (params.customer === 'cus_1' ?
        Promise.reject(Object.assign(new Error('Stripe answered 500'), {statusCode: 500})) : inner(params)))

      const {statusCode, summary} = await sweep()

      expect(statusCode).toBe(200)
      expect(summary.errors).toEqual([{user: 'auth0|u1', customer: 'cus_1', error: 'Stripe answered 500 (upstream 500)'}])
      expect(summary.demote).toEqual([{user: 'auth0|u2', customer: 'cus_2'}])
      expect(Sentry.captureMessage).toHaveBeenCalledWith(expect.stringContaining('1 item(s) failed'), 'error')
    })

    it('sends nothing to Sentry for a clean run, and counts what it scanned', async () => {
      mockWorld({proUsers: [proUser(1)], subsByCustomer: {cus_1: [proSub('cus_1')]}, pricePages: [[proSub('cus_1')]]})

      const {summary} = await sweep()

      expect(summary.scanned).toEqual({proUsers: 1, entitledCustomers: 1})
      expect(Sentry.captureMessage).not.toHaveBeenCalled()
    })
  })
})
