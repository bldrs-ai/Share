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
import {FREE_PRIVATE_MODEL_LIMIT} from '../../../src/quota/limits.js'
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
const FREE_LIMIT = FREE_PRIVATE_MODEL_LIMIT
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
 * @param {number} days
 * @return {string} ISO time `days` days before now
 */
function daysAgo(days) {
  return new Date(Date.now() - (days * 24 * 60 * 60 * 1000)).toISOString()
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

  const LOCAL_KEYS = [
    ['/share/v/local-only/0b4c2f1e-8d6a-4c3b-9e2f-1a2b3c4d5e6f.ifc'],
    ['/Share/share/v/local-only/0b4c2f1e-8d6a-4c3b-9e2f-1a2b3c4d5e6f.ifc'],
    ['/share/v/new/0b4c2f1e-8d6a-4c3b-9e2f-1a2b3c4d5e6f.ifc'],
  ]

  // Share#1966: a local file is free and unmetered, under either route name
  // and install prefix — never counted, never refused, even at the limit.
  it.each(LOCAL_KEYS)('never counts a local file load (%s), even at the limit', async (key) => {
    mockAuth0({usageQuota: {loads: recentLoads(FREE_LIMIT)}})

    const res = await handler(getEvent({key}))

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toMatchObject({allowed: true, used: FREE_LIMIT, tier: 'free'})
    expect(axios.patch).not.toHaveBeenCalled()
  })

  // The abuse switch (design/new/quotas.md §"Metering local files again").
  describe('with METER_LOCAL_FILES=true', () => {
    beforeEach(() => {
      process.env.METER_LOCAL_FILES = 'true'
    })
    afterEach(() => {
      delete process.env.METER_LOCAL_FILES
    })

    it.each(LOCAL_KEYS)('counts a local file load (%s) for a free user', async (key) => {
      mockAuth0({})

      const res = await handler(getEvent({key}))

      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body)).toMatchObject({allowed: true, used: 1, tier: 'free'})
      expect(axios.patch.mock.calls[0][1].app_metadata.usageQuota.loads).toEqual([{key, loadedAt: expect.any(String)}])
    })

    it('denies a new local file load for a free user at the limit', async () => {
      mockAuth0({usageQuota: {loads: recentLoads(FREE_LIMIT)}})

      const res = await handler(getEvent({key: LOCAL_KEYS[0][0]}))

      expect(res.statusCode).toBe(403)
    })
  })

  it('denies a free user the 3rd distinct private model within 7 days', async () => {
    expect(FREE_LIMIT).toBe(2)
    // One just now, one 6 days ago: both inside the 7-day window.
    const loads = [
      {key: '/share/v/g/recent', loadedAt: daysAgo(0)},
      {key: '/share/v/g/six-days', loadedAt: daysAgo(6)},
    ]
    mockAuth0({usageQuota: {loads}})

    const res = await handler(getEvent({key: '/share/v/g/third-model'}))

    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body)).toMatchObject({allowed: false, used: 2, limit: 2})
    expect(axios.patch).not.toHaveBeenCalled()
  })

  // The window is 7 days (owner, 2026-10-26; was 30). A row older than that
  // is pruned before counting — which is also what happens to a ledger
  // written under the 30-day window at rollout — and the pruned list is what
  // gets written back with the new load.
  // Exclusive edge, the shared limits.js#loadsInsideRollingWindow: a row
  // exactly 7 days old has rolled off.
  it('does not count a private model opened exactly 7 days ago', async () => {
    const now = Date.parse('2026-10-26T12:00:00.000Z')
    jest.spyOn(Date, 'now').mockReturnValue(now)
    try {
      const loads = [
        {key: '/share/v/g/recent', loadedAt: new Date(now).toISOString()},
        {key: '/share/v/g/exactly-seven', loadedAt: new Date(now - (7 * 24 * 60 * 60 * 1000)).toISOString()},
      ]
      mockAuth0({usageQuota: {loads}})

      const res = await handler(getEvent({key: '/share/v/g/third-model'}))

      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body)).toMatchObject({allowed: true, used: 2})
    } finally {
      Date.now.mockRestore()
    }
  })

  it('does not count a private model opened 8 days ago', async () => {
    const loads = [
      {key: '/share/v/g/recent', loadedAt: daysAgo(0)},
      {key: '/share/v/g/eight-days', loadedAt: daysAgo(8)},
    ]
    mockAuth0({usageQuota: {loads}})

    const res = await handler(getEvent({key: '/share/v/g/third-model'}))

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toMatchObject({allowed: true, used: 2, limit: 2})
    expect(axios.patch.mock.calls[0][1].app_metadata.usageQuota.loads.map((l) => l.key))
      .toEqual(['/share/v/g/recent', '/share/v/g/third-model'])
  })

  /**
   * Answer api.github.com's repo lookup with `status`, Auth0 as mockAuth0 set.
   *
   * @param {number} status
   */
  function mockGithubRepoStatus(status) {
    const authGet = axios.get.getMockImplementation()
    axios.get.mockImplementation((url, config) => {
      if (url.startsWith('https://api.github.com/repos/')) {
        return Promise.resolve({status, data: {}})
      }
      return authGet(url, config)
    })
  }

  it('never counts a public GitHub model, even at the limit', async () => {
    mockAuth0({usageQuota: {loads: recentLoads(FREE_LIMIT)}})
    mockGithubRepoStatus(200)

    const res = await handler(getEvent({key: '/share/v/gh/someorg/public-models/main/tower.ifc'}))

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toMatchObject({allowed: true, used: FREE_LIMIT})
    expect(axios.get).toHaveBeenCalledWith('https://api.github.com/repos/someorg/public-models', expect.anything())
    expect(axios.patch).not.toHaveBeenCalled()
  })

  it('counts a private GitHub model', async () => {
    mockAuth0({})
    mockGithubRepoStatus(404)

    const res = await handler(getEvent({key: '/share/v/gh/someorg/private-models/main/tower.ifc'}))

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toMatchObject({allowed: true, used: 1})
    expect(axios.patch).toHaveBeenCalledTimes(1)
  })

  // The route is the FIRST `/v/` segment: a public GitHub file whose repo
  // path contains `v/local-only/` is a GitHub load, resolved by repo privacy,
  // not a local one (codex review on Share#1967).
  it('resolves a GitHub path containing /v/local-only/ by repo privacy, not as local', async () => {
    mockAuth0({usageQuota: {loads: recentLoads(FREE_LIMIT)}})
    const authGet = axios.get.getMockImplementation()
    axios.get.mockImplementation((url, config) => {
      if (url.startsWith('https://api.github.com/repos/')) {
        return Promise.resolve({status: 200, data: {}})
      }
      return authGet(url, config)
    })

    const res = await handler(getEvent({key: '/share/v/gh/pubowner/pubrepo/main/v/local-only/model.ifc'}))

    // Public repo: not quotable, so a free user AT the limit is let through
    // and nothing is written.
    expect(res.statusCode).toBe(200)
    expect(axios.get).toHaveBeenCalledWith('https://api.github.com/repos/pubowner/pubrepo', expect.anything())
    expect(axios.patch).not.toHaveBeenCalled()
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
