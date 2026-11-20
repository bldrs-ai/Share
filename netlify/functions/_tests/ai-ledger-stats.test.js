/*
 * ai-ledger-stats: the shared-secret gate, and the aggregates it answers
 * (what's counted, and that no secret value, env value or ledger key leaks).
 * The handler's store is a hand-built stand-in for the two calls it makes,
 * `get(key, {type: 'json'})` and `list({prefix})`; the replays
 * (replay/ai-ledger-stats) run the real @netlify/blobs client over HTTP.
 */
/* eslint-disable no-magic-numbers */
const mockStore = {current: null}
jest.mock('@netlify/blobs', () => ({getStore: () => {
  if (mockStore.current instanceof Error) {
    throw mockStore.current
  }
  return mockStore.current
}}))

import handler, {
  MIN_SECRET_LENGTH, bearerMatches, countReconcile, lastDays, ledgerStats, summarizeBreakerDay,
} from '../ai-ledger-stats.js'
import {HOLD_TTL_MS} from '../_lib/aiLedger.js'


const SECRET = 's'.repeat(MIN_SECRET_LENGTH)
const NOW = Date.parse('2026-11-20T12:00:00.000Z')
const TODAY = '2026-11-20'


/**
 * @param {object} records key → record
 * @param {Array<string>} [keys] what list() answers
 * @return {object} the stand-in store
 */
function fakeStore(records, keys = Object.keys(records)) {
  return {
    get: jest.fn((key) => Promise.resolve(records[key] ?? null)),
    list: jest.fn(({prefix}) => Promise.resolve({
      blobs: keys.filter((k) => k.startsWith(prefix)).map((key) => ({key, etag: 'e'})),
    })),
  }
}

const request = (headers = {}, method = 'GET') =>
  new Request('https://share.test/.netlify/functions/ai-ledger-stats', {method, headers})


describe('ai-ledger-stats', () => {
  const saved = {...process.env}
  beforeEach(() => {
    process.env = {...saved, ADMIN_STATS_SECRET: SECRET}
    mockStore.current = fakeStore({})
  })
  afterAll(() => {
    process.env = saved
  })

  it('is not configured without a secret, or with a short one', async () => {
    delete process.env.ADMIN_STATS_SECRET
    expect((await handler(request())).status).toBe(500)
    process.env.ADMIN_STATS_SECRET = 'short'
    const res = await handler(request({authorization: 'Bearer short'}))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({error: {code: 'admin_stats_not_configured'}})
  })

  it('refuses a missing or wrong bearer, and anything but GET', async () => {
    expect((await handler(request())).status).toBe(401)
    expect((await handler(request({authorization: `Bearer ${SECRET}x`}))).status).toBe(401)
    expect((await handler(request({authorization: SECRET}))).status).toBe(401)
    expect((await handler(request({authorization: `Bearer ${SECRET}`}, 'POST'))).status).toBe(405)
  })

  it('compares the bearer as a whole', () => {
    expect(bearerMatches(`Bearer ${SECRET}`, SECRET)).toBe(true)
    expect(bearerMatches(`Bearer ${SECRET.slice(1)}`, SECRET)).toBe(false)
    expect(bearerMatches(null, SECRET)).toBe(false)
  })

  it('answers the limits, settings and secrets set, never their values, and no CORS', async () => {
    process.env.AI_BREAKER_ANONYMOUS_DAILY_USD = '0.40'
    process.env.AI_BUDGET_IP_USD = 'oops'
    process.env.OPENROUTER_API_KEY = 'sk-or-secret-value'
    delete process.env.AI_TOKEN_SECRET
    const res = await handler(request({authorization: `Bearer ${SECRET}`}))
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    expect(res.headers.get('cache-control')).toBe('no-store')
    const text = await res.text()
    expect(text).not.toContain('sk-or-secret-value')
    expect(text).not.toContain(SECRET)
    expect(text).not.toContain('oops')
    const body = JSON.parse(text)
    expect(body.limits.breakers.anonymous).toBe(400000)
    expect(body.limits.breakersConfigured).toEqual({anonymous: true, free: false})
    expect(body.limits.ipBudget).toBe(100000) // malformed reads as unset
    expect(body.envSet.AI_BUDGET_IP_USD).toBe(true) // …but it is set, so the dashboard can say so
    expect(body.envSet.AI_BREAKER_FREE_DAILY_USD).toBe(false)
    expect(body.secrets).toEqual({OPENROUTER_API_KEY: true, AI_TOKEN_SECRET: false})
  })

  it('sums each breaker day, counting an expired hold as spend', async () => {
    const records = {
      [`ai/breaker/anonymous/${TODAY}`]: {v: 1, days: {[TODAY]: {spent: 1000, free: 0}},
        holds: {live: {micro: 50, at: NOW - 1000}, dead: {micro: 70, at: NOW - HOLD_TTL_MS - 1}}},
      'ai/breaker/anonymous/2026-11-18': {v: 1, days: {'2026-11-18': {spent: 300, free: 0}}, holds: {}},
      'ai/breaker/free/2026-11-01': {v: 1, days: {'2026-11-01': {spent: 999, free: 0}}, holds: {}},
    }
    const stats = await ledgerStats(fakeStore(records), {}, NOW)
    const anon = stats.breakers.anonymous
    expect(anon.map((d) => d.day)).toEqual(lastDays(NOW))
    expect(anon[6]).toEqual({day: TODAY, spent: 1070, held: 50, recorded: true})
    expect(anon[4]).toEqual({day: '2026-11-18', spent: 300, held: 0, recorded: true})
    expect(anon[0].recorded).toBe(false)
    expect(stats.breakers.free.every((d) => !d.recorded)).toBe(true) // 11-01 is outside the week
  })

  it('counts reconciliation records by day without returning a key', async () => {
    const keys = [`ai/reconcile/${TODAY}/a`, `ai/reconcile/${TODAY}/b`, 'ai/reconcile/2026-11-15/c',
      'ai/reconcile/2026-10-01/d', 'ai/user/auth0%7Csomeone']
    const stats = await ledgerStats(fakeStore({}, keys), {}, NOW)
    expect(stats.reconcile).toEqual(countReconcile(keys, NOW))
    expect(stats.reconcile.total).toBe(3)
    expect(stats.reconcile.older).toBe(1)
    expect(JSON.stringify(stats)).not.toContain('auth0')
    expect(JSON.stringify(stats)).not.toContain('reconcile/')
  })

  it('keeps the limits when the ledger fails', async () => {
    const store = fakeStore({})
    store.get.mockRejectedValue(new Error('blobs down'))
    const stats = await ledgerStats(store, {}, NOW)
    expect(stats.breakers).toEqual({error: 'ledger_unavailable'})
    expect(stats.reconcile.total).toBe(0)
    mockStore.current = new Error('no blobs context')
    const res = await handler(request({authorization: `Bearer ${SECRET}`}))
    const body = await res.json()
    expect(body.breakers).toEqual({error: 'ledger_unavailable'})
    expect(body.limits.budgets.anonymous).toBe(20000)
  })

  it('counts a request settled after midnight in the blob it reserved against (Codex on #2254)', () => {
    // reserved on 11-19, settled on 11-20: settle books it under 11-20 inside
    // the 11-19 blob, and its 1-day prune has dropped the 11-19 entry
    const record = {v: 1, days: {[TODAY]: {spent: 400, free: 0}}, holds: {}}
    expect(summarizeBreakerDay(record, '2026-11-19', NOW)).toEqual({day: '2026-11-19', spent: 400, held: 0, recorded: true})
    const both = {v: 1, days: {'2026-11-19': {spent: 100, free: 0}, [TODAY]: {spent: 400, free: 0}}, holds: {}}
    expect(summarizeBreakerDay(both, '2026-11-19', NOW).spent).toBe(500)
  })

  it('reads a malformed record as nothing recorded', () => {
    expect(summarizeBreakerDay(null, TODAY, NOW)).toEqual({day: TODAY, spent: 0, held: 0, recorded: false})
    expect(summarizeBreakerDay({holds: {x: {micro: 'a', at: 'b'}}}, TODAY, NOW))
      .toEqual({day: TODAY, spent: 0, held: 0, recorded: true})
  })
})
