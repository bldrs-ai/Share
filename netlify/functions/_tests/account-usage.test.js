/*
 * Unit tests for the per-account usage store (_lib/accountUsage.js) and its
 * three functions: account-usage (the page's reports and the opt-out),
 * account-usage-stats (the reader) and account-usage-retention (the sweep).
 * The replays (_tests/replay/account-usage*) hold the wire-level behaviour;
 * these hold the branches and the arithmetic.
 */
import {getStore} from '@netlify/blobs'
import {patchUserAppMetadata, verifyAuth0Bearer} from '../_lib/auth0.js'
import {sendMeasurementProtocolEvent} from '../_lib/measurementProtocol.js'
import {
  ACCOUNT_USAGE_CLIENT_ID,
  accountKey,
  deleteAccountRecords,
  deleteLoadReports,
  isRecordingEnabled,
  oldestKeptPeriod,
  parseEventKey,
  recordLimitHit,
  recordServerLimitHit,
  usagePeriod,
  usageReportsAllowed,
  writeUsagePreference,
} from '../_lib/accountUsage.js'
import accountUsage from '../account-usage.js'
import {aggregateStats, accountStats, limitStats, opensPerAccount, percentiles} from '../account-usage-stats.js'
import {sweep} from '../account-usage-retention.js'
import {createMemoryBlobs} from './memoryBlobs.js'


jest.mock('@netlify/blobs', () => ({getStore: jest.fn(), connectLambda: jest.fn()}))
jest.mock('../_lib/auth0.js', () => ({verifyAuth0Bearer: jest.fn(), patchUserAppMetadata: jest.fn()}))
jest.mock('../_lib/measurementProtocol.js', () => ({
  ...jest.requireActual('../_lib/measurementProtocol.js'),
  sendMeasurementProtocolEvent: jest.fn(() => Promise.resolve()),
}))


/* eslint-disable no-magic-numbers, max-len */
const SUB = 'google-oauth2|103547991597142817347'
const KEY_SECRET = 'k'.repeat(40)
const ACCOUNT = '84a40528eaa5146ae8b4b4089614b29a'
const OTHER = 'ffffffffffffffffffffffffffffffff'
const NOW = Date.parse('2026-11-25T12:00:00.000Z')
const GA_ENV = {GA4_MEASUREMENT_ID: 'G-TEST', GA4_API_SECRET: 'secret', ACCOUNT_USAGE_KEY_SECRET: KEY_SECRET}
const REPORT = {
  content_type: 'ifc', size_bucket: '1-10mb', source: 'github', open_kind: 'page', form_factor: 'desktop',
  load_outcome: 'displayed', cache_hit: 'false', tier: 'free', loadTime: 2000,
}


/**
 * @param {object} body
 * @param {object} [headers]
 * @return {Request}
 */
function post(body, headers = {}) {
  return new Request('https://bldrs.ai/.netlify/functions/account-usage', {
    method: 'POST',
    headers: {'authorization': 'Bearer t', 'content-type': 'application/json', 'origin': 'https://bldrs.ai', ...headers},
    body: JSON.stringify(body),
  })
}


describe('_lib/accountUsage', () => {
  beforeEach(() => {
    sendMeasurementProtocolEvent.mockClear()
  })

  it('names an account by an HMAC of its sub under the key secret, never the sub', () => {
    expect(accountKey(SUB, KEY_SECRET)).toBe(ACCOUNT)
    expect(accountKey(SUB, KEY_SECRET)).not.toContain('103547991597142817347')
    expect(accountKey('github|1', KEY_SECRET)).not.toBe(ACCOUNT)
    // Keyed: without the secret, hashing candidate subs finds nothing.
    expect(accountKey(SUB, 'x'.repeat(40))).not.toBe(ACCOUNT)
    expect(() => accountKey(SUB, null)).toThrow()
  })

  it('reports by UTC calendar month, and keeps 13 whole months raw', () => {
    expect(usagePeriod(NOW)).toBe('2026-11')
    expect(usagePeriod(Date.parse('2026-12-31T23:59:59.999Z'))).toBe('2026-12')
    expect(oldestKeptPeriod(NOW)).toBe('2025-10')
    expect(oldestKeptPeriod(Date.parse('2027-01-01T00:00:00.000Z'))).toBe('2025-12')
  })

  it('records only where ACCOUNT_USAGE_RECORDING is on and the key secret is set', () => {
    expect(isRecordingEnabled({ACCOUNT_USAGE_RECORDING: 'on', ACCOUNT_USAGE_KEY_SECRET: KEY_SECRET})).toBe(true)
    expect(isRecordingEnabled({ACCOUNT_USAGE_RECORDING: 'on'})).toBe(false)
    expect(isRecordingEnabled({ACCOUNT_USAGE_RECORDING: 'on', ACCOUNT_USAGE_KEY_SECRET: 'short'})).toBe(false)
    expect(isRecordingEnabled({ACCOUNT_USAGE_RECORDING: 'true', ACCOUNT_USAGE_KEY_SECRET: KEY_SECRET})).toBe(false)
    expect(isRecordingEnabled({})).toBe(false)
  })

  it('parses only per-account event keys', () => {
    expect(parseEventKey(`load/2026-11/${ACCOUNT}/t-u`)).toEqual({type: 'load', period: '2026-11', account: ACCOUNT, rest: 't-u'})
    expect(parseEventKey(`pref/${ACCOUNT}`)).toBeNull()
    expect(parseEventKey('rollup/2025-09')).toBeNull()
  })

  it('an opt-out is a mirror record; opting back in removes it', async () => {
    const store = createMemoryBlobs()
    expect(await usageReportsAllowed(store, ACCOUNT)).toBe(true)
    await writeUsagePreference(store, ACCOUNT, false, NOW)
    expect(await usageReportsAllowed(store, ACCOUNT)).toBe(false)
    await writeUsagePreference(store, ACCOUNT, true, NOW)
    expect(await usageReportsAllowed(store, ACCOUNT)).toBe(true)
    expect(store.data.size).toBe(0)
  })

  it('a first hit of a limit in a period sends limit_first_reached once; later hits send only the hit', async () => {
    const store = createMemoryBlobs()
    const hit = {store, sub: SUB, limit: 'private_model', gate: 'blocked', tier: 'free', decidedBy: 'server', env: GA_ENV, nowMs: NOW}
    expect(await recordLimitHit(hit)).toEqual({recorded: true, first: true})
    expect(await recordLimitHit({...hit, nowMs: NOW + 1000})).toEqual({recorded: true, first: false})
    const names = sendMeasurementProtocolEvent.mock.calls.map(([args]) => args.name)
    expect(names).toEqual(['quota_limit_reached', 'limit_first_reached', 'quota_limit_reached'])
    for (const [args] of sendMeasurementProtocolEvent.mock.calls) {
      expect(args.clientId).toBe(ACCOUNT_USAGE_CLIENT_ID)
      expect(JSON.stringify(args.params)).not.toContain(SUB)
    }
    expect([...store.data.keys()].filter((k) => k.startsWith('limit/'))).toHaveLength(2)
    expect(store.data.has(`first/2026-11/${ACCOUNT}/private_model`)).toBe(true)
  })

  it('a new period is a new first hit', async () => {
    const store = createMemoryBlobs()
    const hit = {store, sub: SUB, limit: 'export_slot', gate: 'blocked', tier: 'free', decidedBy: 'server', env: GA_ENV}
    await recordLimitHit({...hit, nowMs: NOW})
    expect(await recordLimitHit({...hit, nowMs: Date.parse('2026-12-01T00:00:00.000Z')})).toEqual({recorded: true, first: true})
  })

  it('a soft hit is quota_soft_limit_exceeded; an export slot is feature export', async () => {
    const store = createMemoryBlobs()
    await recordLimitHit({store, sub: SUB, limit: 'private_model', gate: 'soft', tier: 'free', decidedBy: 'server', routeKind: 'github', env: GA_ENV, nowMs: NOW})
    await recordLimitHit({store, sub: SUB, limit: 'export_slot', gate: 'blocked', tier: 'free', decidedBy: 'server', env: GA_ENV, nowMs: NOW})
    const events = sendMeasurementProtocolEvent.mock.calls.map(([args]) => [args.name, args.params])
    expect(events).toContainEqual(['quota_soft_limit_exceeded', {tier: 'free', feature: 'private_load', source: 'server', route_kind: 'github'}])
    expect(events).toContainEqual(['quota_limit_reached', {tier: 'free', feature: 'export', source: 'server'}])
  })

  it('a store failure still sends the hit to GA, and never throws', async () => {
    const store = createMemoryBlobs()
    store.set.mockRejectedValue(new Error('down'))
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => null)
    expect(await recordLimitHit({store, sub: SUB, limit: 'private_model', gate: 'blocked', tier: 'free', decidedBy: 'client', env: GA_ENV, nowMs: NOW}))
      .toEqual({recorded: false, first: false})
    expect(sendMeasurementProtocolEvent).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('account-usage: limit hit not stored: Error')
    warn.mockRestore()
  })

  it('gives up waiting after its budget, so a slow store can\'t hold a refusal up', async () => {
    const store = createMemoryBlobs()
    store.set.mockImplementation(() => new Promise(() => null))
    const started = Date.now()
    await recordLimitHit({store, sub: SUB, limit: 'private_model', gate: 'blocked', tier: 'free', decidedBy: 'server', env: GA_ENV, nowMs: NOW, budgetMs: 20})
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('a server-decided hit records nothing where recording is off', async () => {
    // GA isn't configured in this test's env: the skip is logged, and asserted.
    const log = jest.spyOn(console, 'log').mockImplementation(() => null)
    const store = createMemoryBlobs()
    getStore.mockReturnValue(store)
    const saved = process.env.ACCOUNT_USAGE_RECORDING
    delete process.env.ACCOUNT_USAGE_RECORDING
    process.env.ACCOUNT_USAGE_KEY_SECRET = KEY_SECRET
    await recordServerLimitHit({}, {sub: SUB, limit: 'private_model', key: '/share/v/g/x'})
    expect(store.set).not.toHaveBeenCalled()
    process.env.ACCOUNT_USAGE_RECORDING = 'on'
    await recordServerLimitHit({}, {sub: SUB, limit: 'private_model', key: '/share/v/gh/acme/private/main/secret.ifc'})
    const written = [...store.data.entries()].find(([k]) => k.startsWith('limit/'))
    expect(JSON.parse(written[1])).toMatchObject({route_kind: 'github', gate: 'blocked', decided_by: 'server'})
    // The key itself is never stored: it can name a private repo's file.
    expect(written[1]).not.toContain('secret.ifc')
    expect(log).toHaveBeenCalledWith(expect.stringContaining('quota_limit_reached not sent to GA'))
    log.mockRestore()
    process.env.ACCOUNT_USAGE_RECORDING = saved
    if (saved === undefined) {
      delete process.env.ACCOUNT_USAGE_RECORDING
    }
    delete process.env.ACCOUNT_USAGE_KEY_SECRET
  })

  it('an opt-out deletes only that account\'s load reports; an account deletion takes everything of its own but the opt-out', async () => {
    const store = createMemoryBlobs({
      [`load/2026-11/${ACCOUNT}/a`]: REPORT,
      [`load/2026-10/${ACCOUNT}/b`]: REPORT,
      [`load/2026-11/${OTHER}/c`]: REPORT,
      [`limit/2026-11/${ACCOUNT}/d`]: {limit: 'private_model'},
      [`first/2026-11/${ACCOUNT}/private_model`]: {},
      [`pref/${ACCOUNT}`]: {usage_reports: false},
      'rollup/2025-01': {loads: {total: 1}},
    })
    expect(await deleteLoadReports(store, ACCOUNT, NOW)).toBe(2)
    expect(store.data.has(`limit/2026-11/${ACCOUNT}/d`)).toBe(true)
    expect(await deleteAccountRecords(store, ACCOUNT, NOW)).toBe(2)
    // The opt-out stays: deleting the records must not resume recording.
    expect([...store.data.keys()].sort()).toEqual([`load/2026-11/${OTHER}/c`, `pref/${ACCOUNT}`, 'rollup/2025-01'])
    // Listed per period and account, never the whole store.
    expect(store.list.mock.calls.every(([{prefix}]) => prefix.includes(ACCOUNT))).toBe(true)
  })
})


describe('account-usage', () => {
  let store
  beforeEach(() => {
    jest.clearAllMocks()
    store = createMemoryBlobs()
    getStore.mockReturnValue(store)
    verifyAuth0Bearer.mockResolvedValue({ok: true, sub: SUB})
    patchUserAppMetadata.mockResolvedValue(undefined)
    process.env.ACCOUNT_USAGE_RECORDING = 'on'
    process.env.ACCOUNT_USAGE_KEY_SECRET = KEY_SECRET
    jest.spyOn(console, 'log').mockImplementation(() => null)
  })
  afterEach(() => {
    delete process.env.ACCOUNT_USAGE_RECORDING
    delete process.env.ACCOUNT_USAGE_KEY_SECRET
    jest.restoreAllMocks()
  })

  it('stores a load report under the period and the hashed account', async () => {
    const res = await accountUsage(post({kind: 'load', report: REPORT}))
    expect(res.status).toBe(204)
    const [key, value] = [...store.data.entries()][0]
    expect(key).toMatch(new RegExp(`^load/\\d{4}-\\d{2}/${ACCOUNT}/`))
    expect(JSON.parse(value)).toMatchObject(REPORT)
  })

  it('a report from another site is refused before the token is checked', async () => {
    const res = await accountUsage(post({kind: 'load', report: REPORT}, {origin: 'https://evil.example'}))
    expect(res.status).toBe(403)
    expect(verifyAuth0Bearer).not.toHaveBeenCalled()
  })

  it('answers the auth helper\'s 401 as is', async () => {
    verifyAuth0Bearer.mockResolvedValue({ok: false, response: {statusCode: 401, body: '{"error":"invalid_auth0_token"}'}})
    const res = await accountUsage(post({kind: 'load', report: REPORT}))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({error: 'invalid_auth0_token'})
  })

  it('the unconfigured-dev bypass (no sub) has no account to record against: 500', async () => {
    verifyAuth0Bearer.mockResolvedValue({ok: true, sub: null})
    expect((await accountUsage(post({kind: 'load', report: REPORT}))).status).toBe(500)
  })

  it('a store write that fails is 502', async () => {
    store.set.mockRejectedValue(new Error('down'))
    jest.spyOn(console, 'warn').mockImplementation(() => null)
    const res = await accountUsage(post({kind: 'load', report: REPORT}))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({error: 'account_usage_store_failed'})
  })

  // A failure part-way errs towards not recording (setPreference).
  it('an opt-out Auth0 refuses still stops recording: the mirror and the deletion go first', async () => {
    patchUserAppMetadata.mockRejectedValue(new Error('mgmt'))
    jest.spyOn(console, 'warn').mockImplementation(() => null)
    store.data.set(`load/${usagePeriod(Date.now())}/${ACCOUNT}/a`, JSON.stringify(REPORT))
    const res = await accountUsage(post({kind: 'preference', usage_reports: false}))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({error: 'preference_write_failed'})
    expect(store.data.has(`pref/${ACCOUNT}`)).toBe(true)
    expect([...store.data.keys()].filter((k) => k.startsWith('load/'))).toEqual([])
  })

  it('an opt-out whose mirror can\'t be written is refused before Auth0 is touched', async () => {
    store.set.mockRejectedValue(new Error('down'))
    jest.spyOn(console, 'warn').mockImplementation(() => null)
    expect((await accountUsage(post({kind: 'preference', usage_reports: false}))).status).toBe(502)
    expect(patchUserAppMetadata).not.toHaveBeenCalled()
  })

  it('an opt-in Auth0 refuses leaves the account unrecorded', async () => {
    store.data.set(`pref/${ACCOUNT}`, JSON.stringify({usage_reports: false}))
    patchUserAppMetadata.mockRejectedValue(new Error('mgmt'))
    jest.spyOn(console, 'warn').mockImplementation(() => null)
    expect((await accountUsage(post({kind: 'preference', usage_reports: true}))).status).toBe(502)
    expect(store.data.has(`pref/${ACCOUNT}`)).toBe(true)
  })

  it('a load report racing an opt-out is withdrawn once the opt-out is seen', async () => {
    // The first read of the mirror finds nothing; the opt-out lands before
    // the second.
    const realGet = store.get.getMockImplementation()
    let reads = 0
    store.get.mockImplementation((key, opts) => {
      if (key === `pref/${ACCOUNT}` && ++reads === 2) {
        store.data.set(key, JSON.stringify({usage_reports: false}))
      }
      return realGet(key, opts)
    })
    expect((await accountUsage(post({kind: 'load', report: REPORT}))).status).toBe(204)
    expect([...store.data.keys()].filter((k) => k.startsWith('load/'))).toEqual([])
  })

  it('opting out stops load reports; a limit hit is still recorded and a funnel step still counted', async () => {
    Object.assign(process.env, {GA4_MEASUREMENT_ID: 'G-TEST', GA4_API_SECRET: 'secret'})
    await accountUsage(post({kind: 'preference', usage_reports: false}))
    expect(patchUserAppMetadata).toHaveBeenCalledWith(SUB, {usageReports: false})
    await accountUsage(post({kind: 'load', report: REPORT}))
    await accountUsage(post({kind: 'funnel', event: 'begin_checkout', params: {from: 'quota', destination: 'checkout'}}))
    await accountUsage(post({kind: 'limit', limit: 'private_model', gate: 'blocked'}))
    const keys = [...store.data.keys()]
    expect(keys.filter((k) => k.startsWith('load/'))).toEqual([])
    expect(keys.filter((k) => k.startsWith('limit/'))).toHaveLength(1)
    // Nothing of a funnel step is stored, and GA gets no account.
    expect(sendMeasurementProtocolEvent.mock.calls.map(([a]) => a.name)).toContain('begin_checkout')
    delete process.env.GA4_MEASUREMENT_ID
    delete process.env.GA4_API_SECRET
  })

  it('opting back in writes true to Auth0 and removes the mirror', async () => {
    store.data.set(`pref/${ACCOUNT}`, JSON.stringify({usage_reports: false}))
    const res = await accountUsage(post({kind: 'preference', usage_reports: true}))
    expect(await res.json()).toEqual({usage_reports: true})
    expect(patchUserAppMetadata).toHaveBeenCalledWith(SUB, {usageReports: true})
    expect(store.data.has(`pref/${ACCOUNT}`)).toBe(false)
  })

  it('a preference is honoured where recording is off, a report is not', async () => {
    delete process.env.ACCOUNT_USAGE_RECORDING
    expect((await accountUsage(post({kind: 'load', report: REPORT}))).status).toBe(204)
    expect(verifyAuth0Bearer).not.toHaveBeenCalled()
    expect((await accountUsage(post({kind: 'preference', usage_reports: false}))).status).toBe(200)
    expect(store.data.has(`pref/${ACCOUNT}`)).toBe(true)
  })

  it('refuses anything but POST', async () => {
    expect((await accountUsage(new Request('https://bldrs.ai/x', {method: 'GET'}))).status).toBe(405)
  })
})


describe('account-usage-stats', () => {
  it('takes nearest-rank percentiles', () => {
    expect(percentiles([])).toEqual({p50: null, p90: null, p99: null})
    expect(percentiles([5])).toEqual({p50: 5, p90: 5, p99: 5})
    expect(percentiles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toEqual({p50: 5, p90: 9, p99: 10})
  })

  it('distributes opens per account into a histogram', () => {
    const loads = [...Array(12)].map(() => ({account: 'a'})).concat([{account: 'b'}, {account: 'c'}, {account: 'c'}])
    expect(opensPerAccount(loads)).toMatchObject({
      accounts: 3, total: 15, mean: 5, p50: 2, max: 12,
      histogram: {'1': 1, '2-3': 1, '4-9': 0, '10-29': 1, '30+': 0},
    })
  })

  it('counts limit hits by gate and decider, and accounts from the first-hit markers', () => {
    const hits = [
      {limit: 'private_model', gate: 'blocked', decided_by: 'server'},
      {limit: 'private_model', gate: 'soft', decided_by: 'server'},
      {limit: 'private_model', gate: 'blocked', decided_by: 'client'},
      {limit: 'export_slot', gate: 'blocked', decided_by: 'server'},
    ]
    const firsts = [{rest: 'private_model'}, {rest: 'private_model'}, {rest: 'export_slot'}]
    expect(limitStats(hits, firsts)).toEqual({
      private_model: {hits: 3, blocked: 2, soft: 1, accounts: 2, byDecider: {server: 2, client: 1}},
      export_slot: {hits: 1, blocked: 1, soft: 0, accounts: 1, byDecider: {server: 1}},
    })
  })

  it('names no account in the aggregate, and only the looked-up one in a lookup', async () => {
    const store = createMemoryBlobs({
      [`load/2026-11/${ACCOUNT}/2026-11-20T00:00:00.000Z-a`]: {...REPORT, at: '2026-11-20T00:00:00.000Z'},
      [`load/2026-11/${OTHER}/2026-11-21T00:00:00.000Z-b`]: {...REPORT, content_type: 'step', at: '2026-11-21T00:00:00.000Z'},
      [`limit/2026-11/${ACCOUNT}/2026-11-22T00:00:00.000Z-c`]: {limit: 'private_model', gate: 'blocked', at: '2026-11-22T00:00:00.000Z'},
    })
    const aggregate = JSON.stringify(await aggregateStats(store, '2026-11', NOW))
    expect(aggregate).not.toContain(ACCOUNT)
    expect(aggregate).not.toContain(OTHER)
    const mine = await accountStats(store, SUB, KEY_SECRET, NOW)
    expect(mine.account).toBe(ACCOUNT)
    expect(mine.optedOut).toBe(false)
    expect(mine.periods['2026-11'].opens).toBe(1)
    expect(mine.periods['2026-11'].limits).toHaveLength(1)
    expect(JSON.stringify(mine)).not.toContain(OTHER)
  })
})


describe('account-usage-retention', () => {
  it('reduces the oldest period older than 13 whole months per run, to counts without accounts', async () => {
    const store = createMemoryBlobs({
      [`load/2025-08/${OTHER}/z`]: REPORT,
      [`load/2025-09/${ACCOUNT}/a`]: REPORT,
      [`load/2025-09/${OTHER}/b`]: {...REPORT, load_outcome: 'unusable'},
      [`first/2025-09/${ACCOUNT}/export_slot`]: {},
      [`limit/2025-09/${ACCOUNT}/c`]: {limit: 'export_slot', gate: 'blocked'},
      [`load/2025-10/${ACCOUNT}/d`]: REPORT,
    })
    const first = await sweep(store, NOW)
    expect(first.reduced).toEqual([{period: '2025-08', rollup: 'written', deleted: 1}])
    expect(first.pending).toBe(1)
    const second = await sweep(store, NOW)
    expect(second.reduced).toEqual([{period: '2025-09', rollup: 'written', deleted: 4}])
    expect(second.pending).toBe(0)
    const rollup = store.data.get('rollup/2025-09')
    expect(JSON.parse(rollup)).toMatchObject({
      loads: {total: 2, accounts: 2, byOutcome: {displayed: 1, unusable: 1}},
      limits: {export_slot: {hits: 1, blocked: 1, accounts: 1}},
    })
    expect(rollup).not.toContain(ACCOUNT)
    expect([...store.data.keys()].sort()).toEqual([`load/2025-10/${ACCOUNT}/d`, 'rollup/2025-08', 'rollup/2025-09'])
  })

  it('is a no-op with nothing expired', async () => {
    const store = createMemoryBlobs({[`load/2026-11/${ACCOUNT}/a`]: REPORT})
    expect((await sweep(store, NOW)).reduced).toEqual([])
    expect(store.delete).not.toHaveBeenCalled()
  })
})
