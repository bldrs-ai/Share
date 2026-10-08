/*
 * Tests for the record-load Netlify Function — the authoritative gate for
 * usage-quota counting (design/new/quotas.md).
 *
 * Covers the handler's request paths and quota decisions, with axios mocked.
 * Whether the function loads at all is checked elsewhere, because Jest can't
 * see it (babel-jest transforms either module syntax, and imports resolve
 * against the repo's `node_modules`): esmLoad.test.js imports the source
 * under real Node ESM, and tools/netlify/functionBundler.test.js loads the
 * bundle Netlify would ship.
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
const AUTH0_DOMAIN = 'bldrs.us.auth0.com.test'
// `sub` carries a `|`, so this also pins that it's URL-encoded into the path.
const USER_URL = `https://${AUTH0_DOMAIN}/api/v2/users/google-oauth2%7C1234567890`


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
    process.env.AUTH0_DOMAIN = AUTH0_DOMAIN
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
    // Read and written as the token's own user, with the Management token.
    expect(axios.get).toHaveBeenCalledWith(USER_URL, {headers: {Authorization: 'Bearer mgmt-token'}})
    expect(axios.patch).toHaveBeenCalledTimes(1)
    const [patchUrl, patchBody, patchConfig] = axios.patch.mock.calls[0]
    expect(patchUrl).toBe(USER_URL)
    expect(patchConfig.headers.Authorization).toBe('Bearer mgmt-token')
    const {app_metadata: patched} = patchBody
    expect(Object.keys(patched)).toEqual(['usageQuota'])
    expect(patched.usageQuota.loads).toEqual([{key: KEY, loadedAt: expect.any(String)}])
  })

  it('does not count a key twice, even at the limit', async () => {
    const loads = [...recentLoads(FREE_LIMIT - 1), {key: KEY, loadedAt: new Date().toISOString()}]
    mockAuth0({usageQuota: {loads}})

    const res = await handler(getEvent())

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toMatchObject({allowed: true, used: FREE_LIMIT, alreadyCounted: true})
    expect(axios.patch).not.toHaveBeenCalled()
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

  // Paid, waiting on a re-login for the GitHub scope: Pro for loads too, the
  // owner's §7.2 decision (src/quota/proStatus.js) — the same answer the
  // client's getTier gives, so the badge and this gate agree.
  it('does not gate or record for a pending-reauth subscriber either', async () => {
    mockAuth0({subscriptionStatus: 'shareProPendingReauth', usageQuota: {loads: recentLoads(FREE_LIMIT)}})

    const res = await handler(getEvent())

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toMatchObject({allowed: true, limit: null, tier: 'paid'})
    expect(axios.patch).not.toHaveBeenCalled()
  })
})
