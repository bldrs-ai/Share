/*
 * Tests for the record-load Netlify Function — the authoritative gate for
 * usage-quota counting (design/new/quotas.md).
 *
 * The first test is the one that would have caught the deploy break: the
 * function was written as CommonJS inside `netlify/`, whose package.json
 * declares `"type": "module"`, so Netlify's bundler refused it. Jest can't
 * see that itself (babel-jest happily transforms either syntax), so the
 * real-Node check lives in esmLoad.test.js; this file covers the handler's
 * request paths and the quota decisions once it is loaded.
 *
 * In `_tests/` rather than beside its subject: Netlify bundles every
 * top-level `.js` under `netlify/functions/` AS a function, so a test file
 * there deploys as a junk endpoint. See design/new/glb-export-premium.md §4.2.
 */

import axios from 'axios'
import {handler} from '../record-load.js'


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

const SUB = 'google-oauth2|1234567890'
const KEY = '/share/v/g/abc123'
const FREE_LIMIT = 4


/**
 * @param {object} [bodyOverrides]
 * @param {object} [eventOverrides]
 * @return {object} a Netlify Functions event
 */
function getEvent(bodyOverrides = {}, eventOverrides = {}) {
  return {
    httpMethod: 'POST',
    headers: {authorization: 'Bearer user-token'},
    body: JSON.stringify({key: KEY, ...bodyOverrides}),
    ...eventOverrides,
  }
}


/**
 * Wire axios so /userinfo resolves to SUB, the Management token call
 * succeeds, and the user record carries `appMetadata`.
 *
 * @param {object} appMetadata
 */
function mockAuth0(appMetadata) {
  axios.get.mockImplementation((url) => {
    if (url.includes('/userinfo')) {
      return Promise.resolve({data: {sub: SUB}})
    }
    return Promise.resolve({data: {app_metadata: appMetadata}})
  })
  axios.post.mockResolvedValue({data: {access_token: 'mgmt-token', expires_in: 86400}})
  axios.patch.mockResolvedValue({data: {}})
}


/**
 * @param {number} n
 * @return {Array} n loads inside the rolling window, keyed `/share/v/g/old-i`
 */
function recentLoads(n) {
  const loadedAt = new Date().toISOString()
  return Array.from({length: n}, (_, i) => ({key: `/share/v/g/old-${i}`, loadedAt}))
}


describe('record-load function', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.AUTH0_DOMAIN = 'bldrs.us.auth0.com.test'
  })

  it('exports a handler function', () => {
    expect(handler).toEqual(expect.any(Function))
  })

  it('rejects non-POST with 405', async () => {
    const res = await handler(getEvent({}, {httpMethod: 'GET'}))
    expect(res.statusCode).toBe(405)
  })

  it('rejects a missing Authorization header with 401, before touching Auth0', async () => {
    const res = await handler(getEvent({}, {headers: {}}))
    expect(res.statusCode).toBe(401)
    expect(axios.get).not.toHaveBeenCalled()
  })

  it('rejects a body with no key with 400', async () => {
    const res = await handler(getEvent({key: undefined}))
    expect(res.statusCode).toBe(400)
  })

  it('records a quotable load for a free user, patching only usageQuota', async () => {
    mockAuth0({})

    const res = await handler(getEvent())

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toMatchObject({allowed: true, used: 1, limit: FREE_LIMIT, tier: 'free'})
    expect(axios.patch).toHaveBeenCalledTimes(1)
    const {app_metadata: patched} = axios.patch.mock.calls[0][1]
    expect(Object.keys(patched)).toEqual(['usageQuota'])
    expect(patched.usageQuota.loads).toEqual([{key: KEY, loadedAt: expect.any(String)}])
  })

  it('returns 403 once a free user is at the limit', async () => {
    mockAuth0({usageQuota: {loads: recentLoads(FREE_LIMIT)}})

    const res = await handler(getEvent())

    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body)).toMatchObject({allowed: false, used: FREE_LIMIT})
    expect(axios.patch).not.toHaveBeenCalled()
  })

  it('does not gate or record for a Pro subscriber', async () => {
    mockAuth0({subscriptionStatus: 'sharePro', usageQuota: {loads: recentLoads(FREE_LIMIT)}})

    const res = await handler(getEvent())

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toMatchObject({allowed: true, limit: null, tier: 'paid'})
    expect(axios.patch).not.toHaveBeenCalled()
  })
})
