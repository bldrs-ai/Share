/*
 * Tests for the meter Netlify Function: a signed-out visitor's remote model
 * loads, 2 per 30-day period on a metering token, with a day-salted IP cap,
 * the last-free notice and the sign-in gate, the link at sign-in and the
 * one-per-stage funnel events (design/new/quotas.md §"Anonymous metering").
 * The real @netlify/blobs client talks to fakeBlobs.js, so every
 * compare-and-swap goes over the wire as in production. In `_tests/`, not
 * beside the function: every top-level `.js` there is deployed.
 */
import axios from 'axios'
import * as Sentry from '@sentry/serverless'
import handler, {
  METER_CLIENT_ID,
  METER_TOKEN_HEADER,
  ipDailyLimit,
  mergeAnonymousCarry,
  parseMeterRequest,
  resetReportedConditions,
} from '../meter.js'
import {resetManagementApiTokenCache} from '../_lib/auth0.js'
import {mintMeteringToken, verifyMeteringToken} from '../_lib/meteringToken.js'
import {mintAnonToken} from '../_lib/aiToken.js'
import {ANONYMOUS_IP_DAILY_REMOTE_LOADS} from '../../../src/quota/limits.js'
import {PERIOD_MS} from '../../../src/quota/period.js'
import {SAMPLE_MODELS} from '../../../src/Components/Open/sampleModelRoster.js'
import {createFakeBlobs} from './fakeBlobs.js'


/* eslint-disable no-magic-numbers */
const mockStore = {current: null}
jest.mock('@netlify/blobs', () => {
  const actual = jest.requireActual('@netlify/blobs')
  return {...actual, getStore: (options) => {
    if (options.fetch) {
      return actual.getStore(options)
    }
    if (mockStore.current instanceof Error) {
      throw mockStore.current
    }
    return mockStore.current
  }}
})
jest.mock('axios')
jest.mock('@sentry/serverless', () => {
  const scope = {setFingerprint: jest.fn(), setTag: jest.fn(), setUser: jest.fn()}
  return {
    init: jest.fn(),
    withScope: jest.fn((cb) => cb(scope)),
    captureMessage: jest.fn(),
    captureException: jest.fn(),
    setUser: jest.fn(),
    flush: jest.fn(() => Promise.resolve(true)),
  }
})

const SECRET = 'test-metering-secret'
const IP = '203.0.113.9'
const ENV = {METERING_TOKEN_SECRET: SECRET, GA4_MEASUREMENT_ID: 'G-TEST', GA4_API_SECRET: 'ga-secret'}
const GH_A = '/share/v/gh/someone/public-models/main/a.ifc'
const GH_B = '/share/v/gh/someone/public-models/main/b.ifc'
const DRIVE_C = '/share/v/g/drive-file-c'
const URL_D = `/share/v/u/sha256-${'d'.repeat(64)}`
const SAMPLE = SAMPLE_MODELS[0].path.split('#')[0]


/**
 * @param {object} body
 * @param {object} [opts]
 * @return {Request}
 */
function request(body, {token, origin = 'https://bldrs.ai', headers = {}, method = 'POST'} = {}) {
  return new Request('https://bldrs.ai/.netlify/functions/meter', {
    method,
    headers: {'content-type': 'application/json', ...(origin ? {origin} : {}),
      ...(token ? {[METER_TOKEN_HEADER]: token} : {}), ...headers},
    ...(method === 'POST' ? {body: typeof body === 'string' ? body : JSON.stringify(body)} : {}),
  })
}


/**
 * @param {string} key
 * @param {object} [opts]
 * @return {Promise<{status: number, body: object}>}
 */
async function load(key, opts = {}) {
  const res = await handler(request({action: 'remote_load', key}, opts), {ip: opts.ip ?? IP})
  return {status: res.status, body: await res.json()}
}


describe('meter', () => {
  let fake
  let fetchSpy
  const savedEnv = process.env

  beforeEach(() => {
    process.env = {...ENV}
    fake = createFakeBlobs({delayMs: 1, name: 'metering'})
    mockStore.current = fake.store
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(new Response(null, {status: 204})))
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    jest.mocked(Sentry.captureMessage).mockClear()
    resetReportedConditions()
    jest.mocked(axios.get).mockReset()
    jest.mocked(axios.post).mockReset()
    jest.mocked(axios.patch).mockReset()
    resetManagementApiTokenCache()
  })

  afterEach(() => {
    process.env = savedEnv
    jest.restoreAllMocks()
  })

  /** @return {Array<object>} the GA events sent, as `{name, params, clientId}` */
  const gaEvents = () => fetchSpy.mock.calls.map(([, init]) => {
    const body = JSON.parse(init.body)
    return {clientId: body.client_id, name: body.events[0].name, params: body.events[0].params}
  })

  /** @return {Array<string>} every value the ledger holds, as text */
  const ledgerText = () => [...fake.data.entries()].map(([path, value]) => `${path} ${value.body}`).join('\n')

  describe('requests it refuses before anything else', () => {
    it('answers {} (the smoke probe) 400 without the store or a secret', async () => {
      process.env = {}
      mockStore.current = new Error('must not be opened')
      const res = await handler(request({}))
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({error: 'invalid_meter_request'})
    })

    it('accepts exactly a remote_load with a key, or a link', () => {
      expect(parseMeterRequest(JSON.stringify({action: 'remote_load', key: GH_A}))).toEqual({action: 'remote_load', key: GH_A})
      expect(parseMeterRequest(JSON.stringify({action: 'link'}))).toEqual({action: 'link'})
      for (const bad of [{}, {action: 'remote_load'}, {action: 'remote_load', key: GH_A, extra: 1},
        {action: 'link', key: GH_A}, {action: 'remote_load', key: ''}, [], 'nope']) {
        expect(parseMeterRequest(JSON.stringify(bad))).toBeNull()
      }
      expect(parseMeterRequest('not json')).toBeNull()
    })

    it('refuses another site 403 and a GET 405, writing nothing', async () => {
      expect((await handler(request({action: 'remote_load', key: GH_A}, {origin: 'https://evil.example'}))).status)
        .toBe(403)
      expect((await handler(request(null, {method: 'GET'}))).status).toBe(405)
      expect(fake.data.size).toBe(0)
    })

    it('answers 500 not configured without a secret', async () => {
      process.env = {}
      const res = await handler(request({action: 'remote_load', key: GH_A}))
      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({error: 'meter_not_configured'})
    })

    it('falls back to AI_TOKEN_SECRET', async () => {
      process.env = {AI_TOKEN_SECRET: 'ai-secret'}
      expect((await load(GH_A)).status).toBe(200)
    })
  })

  describe('a signed-out visitor\'s remote loads', () => {
    it('counts the first, mints a token for the period, and sends no event', async () => {
      const first = await load(GH_A)
      expect(first.status).toBe(200)
      expect(first.body).toMatchObject({allowed: true, alreadyCounted: false, used: 1, limit: 2, notice: null})
      const verified = verifyMeteringToken(SECRET, first.body.token)
      expect(verified.ok).toBe(true)
      expect(Date.parse(first.body.periodEnd) - verified.period.start).toBe(PERIOD_MS)
      expect(gaEvents()).toEqual([])
    })

    it('says the 2nd is the last free one, gates the 3rd with sign-in, and reports each stage once', async () => {
      const {body: {token}} = await load(GH_A)
      const second = await load(DRIVE_C, {token})
      expect(second.status).toBe(200)
      expect(second.body).toMatchObject({allowed: true, used: 2, notice: 'last_free'})
      // A token already held is not re-sent.
      expect(second.body.token).toBeUndefined()

      const third = await load(URL_D, {token})
      expect(third.status).toBe(403)
      expect(third.body).toMatchObject({allowed: false, gate: 'sign_in', gatedBy: 'token', used: 2, limit: 2})
      // Again: still gated, and no second event.
      expect((await load(GH_B, {token})).status).toBe(403)

      expect(gaEvents()).toEqual([
        {clientId: METER_CLIENT_ID, name: 'anon_limit_stage', params: {stage: 'last_free', feature: 'remote_load'}},
        {clientId: METER_CLIENT_ID, name: 'anon_limit_stage',
          params: {stage: 'gated', feature: 'remote_load', gated_by: 'token'}},
      ])
    })

    it('lets a model already counted reopen, at the limit too, without counting it again', async () => {
      const {body: {token}} = await load(GH_A)
      await load(GH_B, {token})
      const reopen = await load(GH_A, {token})
      expect(reopen.status).toBe(200)
      expect(reopen.body).toMatchObject({allowed: true, alreadyCounted: true, used: 2, notice: null})
    })

    it('never counts a sample or a hosted model, and mints nothing for one', async () => {
      for (const key of [SAMPLE, '/share/v/p/index.ifc', '/share/v/local-only/x.ifc']) {
        const res = await load(key)
        expect(res.body).toEqual({allowed: true, metered: false})
      }
      expect(fake.data.size).toBe(0)
    })

    it('starts a new, unrelated token and period once the period has ended (never a renewal)', async () => {
      const old = mintMeteringToken(SECRET, Date.now() - PERIOD_MS - 1000)
      const res = await load(GH_A, {token: old.token})
      expect(res.body).toMatchObject({allowed: true, used: 1})
      const fresh = verifyMeteringToken(SECRET, res.body.token)
      expect(fresh.ok).toBe(true)
      expect(fresh.anonId).not.toBe(old.anonId)
    })

    it('does not take an AI relay token as a metering one', async () => {
      const res = await load(GH_A, {token: mintAnonToken(SECRET).token})
      expect(verifyMeteringToken(SECRET, res.body.token).ok).toBe(true)
    })

    it('keeps no key, path or URL, and no IP, in the ledger', async () => {
      const {body: {token}} = await load(GH_A)
      await load(DRIVE_C, {token})
      const text = ledgerText()
      for (const secretish of [GH_A, DRIVE_C, 'someone', 'drive-file-c', IP, token]) {
        expect(text).not.toContain(secretish)
      }
    })
  })

  describe('the day-salted IP cap', () => {
    it(`defaults to ${ANONYMOUS_IP_DAILY_REMOTE_LOADS} a day, and takes METER_ANON_IP_DAILY_REMOTE_LOADS`, () => {
      expect(ipDailyLimit({})).toBe(ANONYMOUS_IP_DAILY_REMOTE_LOADS)
      expect(ipDailyLimit({METER_ANON_IP_DAILY_REMOTE_LOADS: '5'})).toBe(5)
      expect(ipDailyLimit({METER_ANON_IP_DAILY_REMOTE_LOADS: 'lots'})).toBe(ANONYMOUS_IP_DAILY_REMOTE_LOADS)
    })

    it('gates a fresh token from a network past its day cap, without counting it', async () => {
      process.env.METER_ANON_IP_DAILY_REMOTE_LOADS = '3'
      const {body: {token: first}} = await load(GH_A)
      await load(GH_B, {token: first})
      // Storage cleared: a new token, the same network.
      const {body: {token: second}} = await load(DRIVE_C)
      const churned = await load(URL_D, {token: second})
      expect(churned.status).toBe(403)
      expect(churned.body).toMatchObject({gate: 'sign_in', gatedBy: 'ip', used: 1})
      // Another network is not held to this one's count.
      expect((await load(URL_D, {token: second, ip: '198.51.100.7'})).status).toBe(200)
      expect(gaEvents().map((event) => event.params)).toContainEqual(
        {stage: 'gated', feature: 'remote_load', gated_by: 'ip'})
    })

    it('does not count a reopen against the network', async () => {
      process.env.METER_ANON_IP_DAILY_REMOTE_LOADS = '1'
      const {body: {token}} = await load(GH_A)
      expect((await load(GH_A, {token})).body).toMatchObject({allowed: true, alreadyCounted: true})
    })
  })

  describe('when the ledger cannot be reached', () => {
    it('answers 503 (the page loads the model) and sends one Sentry warning per instance per day', async () => {
      const broken = createFakeBlobs({delayMs: 1, name: 'metering'})
      mockStore.current = {...broken.store,
        get: () => Promise.reject(new Error('blobs down')),
        getWithMetadata: () => Promise.reject(new Error('blobs down'))}
      expect((await load(GH_A)).status).toBe(503)
      expect((await load(GH_B)).status).toBe(503)
      expect(Sentry.captureMessage).toHaveBeenCalledTimes(1)
      expect(Sentry.captureMessage).toHaveBeenCalledWith('meter: ledger_unavailable', 'warning')
    })
  })

  describe('the link at sign-in', () => {
    const SUB = 'auth0|visitor'
    let appMetadata

    beforeEach(() => {
      process.env = {...ENV, AUTH0_DOMAIN: 'bldrs.test', AUTH0_CLIENT_ID: 'id', AUTH0_CLIENT_SECRET: 'secret'}
      appMetadata = {subscriptionStatus: 'free', usageQuota: {loads: [], note: 'kept'}}
      jest.mocked(axios.post).mockResolvedValue({data: {access_token: 'mgmt', expires_in: 3600}})
      jest.mocked(axios.get).mockImplementation((url) => {
        if (url.endsWith('/userinfo')) {
          return Promise.resolve({data: {sub: SUB}})
        }
        return Promise.resolve({data: {app_metadata: appMetadata}})
      })
      jest.mocked(axios.patch).mockImplementation((url, body) => {
        appMetadata = {...appMetadata, ...body.app_metadata}
        return Promise.resolve({data: {}})
      })
    })

    /**
     * @param {string} token
     * @return {Promise<{status: number, body: object}>}
     */
    async function linkWith(token) {
      const res = await handler(request({action: 'link'}, {token, headers: {authorization: 'Bearer auth0-access'}}),
        {ip: IP})
      return {status: res.status, body: await res.json()}
    }

    it('carries the period\'s counts and stage into the account, once, and counts the sign-in from a gate', async () => {
      const {body: {token}} = await load(GH_A)
      await load(GH_B, {token})
      await load(DRIVE_C, {token})
      fetchSpy.mockClear()

      const linked = await linkWith(token)
      expect(linked.body).toEqual({merged: true, carried: {remote_load: {count: 2, stage: 'gated'}}})
      expect(appMetadata.usageQuota).toMatchObject({note: 'kept', loads: [],
        anonymous: {features: {remote_load: {count: 2, stage: 'gated'}}}})
      expect(gaEvents()).toEqual([{clientId: METER_CLIENT_ID, name: 'anon_limit_signin',
        params: {from_stage: 'gated', feature: 'remote_load'}}])
      // The account write holds no id of the token.
      expect(JSON.stringify(appMetadata)).not.toContain(verifyMeteringToken(SECRET, token).anonId)

      // Only once: a second sign-in with the same token carries nothing more.
      expect((await linkWith(token)).body).toEqual({merged: false, reason: 'already_merged'})
      // ...and signing out keeps the token, still gated.
      expect((await load(URL_D, {token})).status).toBe(403)
    })

    it('carries nothing for a token whose period has ended', async () => {
      const old = mintMeteringToken(SECRET, Date.now() - PERIOD_MS - 1000)
      expect((await linkWith(old.token)).body).toEqual({merged: false, reason: 'no_token'})
      expect(axios.patch).not.toHaveBeenCalled()
    })

    it('refuses a link with no Auth0 bearer', async () => {
      const {body: {token}} = await load(GH_A)
      const res = await handler(request({action: 'link'}, {token}))
      expect(res.status).toBe(401)
    })

    it('answers 503 and reports when Auth0 can\'t be written, leaving the token unmerged for a retry', async () => {
      const {body: {token}} = await load(GH_A)
      jest.mocked(axios.patch).mockRejectedValueOnce(Object.assign(new Error('500'), {response: {status: 500}}))
      expect((await linkWith(token)).status).toBe(503)
      expect(Sentry.captureMessage).toHaveBeenCalledWith('meter: link_failed', 'warning')
      expect((await linkWith(token)).body).toMatchObject({merged: true})
    })
  })

  describe('mergeAnonymousCarry', () => {
    const NOW = Date.parse('2026-11-25T12:00:00.000Z')
    const tokenPeriod = {start: NOW - 1000, end: NOW - 1000 + PERIOD_MS}

    it('lives in the account\'s running period when there is one, else the token\'s', () => {
      const accountPeriod = {start: NOW - 5000, end: NOW - 5000 + PERIOD_MS}
      expect(mergeAnonymousCarry(undefined, {remote_load: {count: 1, stage: null}}, {accountPeriod, tokenPeriod, nowMs: NOW}))
        .toMatchObject({periodStart: new Date(accountPeriod.start).toISOString()})
      expect(mergeAnonymousCarry(undefined, {}, {accountPeriod: null, tokenPeriod, nowMs: NOW}))
        .toMatchObject({periodStart: new Date(tokenPeriod.start).toISOString()})
    })

    it('takes the larger count and the further stage, so a repeat changes nothing', () => {
      const first = mergeAnonymousCarry(undefined, {remote_load: {count: 2, stage: 'gated'}},
        {accountPeriod: null, tokenPeriod, nowMs: NOW})
      const again = mergeAnonymousCarry(first, {remote_load: {count: 1, stage: 'last_free'}},
        {accountPeriod: null, tokenPeriod, nowMs: NOW})
      expect(again.features).toEqual({remote_load: {count: 2, stage: 'gated'}})
    })

    it('replaces a carry from an ended period', () => {
      const ended = {periodStart: '2026-01-01T00:00:00.000Z', periodEnd: '2026-01-31T00:00:00.000Z',
        features: {remote_load: {count: 2, stage: 'gated'}}}
      expect(mergeAnonymousCarry(ended, {remote_load: {count: 1, stage: null}}, {accountPeriod: null, tokenPeriod, nowMs: NOW})
        .features).toEqual({remote_load: {count: 1, stage: null}})
    })
  })
})
