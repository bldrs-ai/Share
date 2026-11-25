/*
 * Netlify Function (v2): account-usage-stats
 * -------------------------------------------
 * The reader of the per-account usage store (_lib/accountUsage.js,
 * design/new/account-usage.md), for Bldrs' private admin dashboard: how much
 * each account uses Bldrs, how loads perform for them, and how many accounts
 * hit each limit. Modelled on ai-ledger-stats (#2254): same caller, same
 * secret, same reasons for living on this site.
 *
 *   GET    /.netlify/functions/account-usage-stats[?period=YYYY-MM]
 *          → 200 {v, now, period, periods, opens, performance, outcomes, limits, rollups}
 *   GET    /.netlify/functions/account-usage-stats?sub=<Auth0 sub>
 *          → 200 {v, now, account, optedOut, periods: {YYYY-MM: {loads, limits, first}}}
 *   DELETE /.netlify/functions/account-usage-stats?sub=<Auth0 sub>
 *          → 200 {v, account, deleted}   an account deletion request, by hand:
 *                                         Share has no account-deletion path
 *   Authorization: Bearer <ADMIN_STATS_SECRET>
 *   → 400 {error: {code: 'invalid_period'}}
 *   → 401 {error: {code: 'admin_stats_unauthorized'}}
 *   → 500 {error: {code: 'admin_stats_not_configured'}}
 *   → 500 {error: {code: 'account_usage_not_configured'}} no ACCOUNT_USAGE_KEY_SECRET
 *                                                         (a lookup or DELETE can't name the account)
 *   → 503 {error: {code: 'account_usage_unavailable'}}   the store couldn't be read
 *
 * What it returns: counts, distributions and, for one account looked up by
 * its sub, that account's own records, which hold only enums, numbers and
 * times (src/privacy/accountUsageReport.js). Never a sub (the store holds
 * only its hash, `account`), never an email, a file name or a URL: none of
 * them is ever stored. The aggregate answer names no account at all.
 *
 * Cost: the aggregate reads every load report of one period (to take the
 * percentiles), and lists every key (for the trend). Fine at today's volume;
 * a precomputed daily rollup is the follow-up when a period's reports reach
 * the tens of thousands (design doc §"Follow-ups").
 */
import {getStore} from '@netlify/blobs'
import {
  ACCOUNT_USAGE_STORE,
  accountKey,
  accountKeySecret,
  deleteAccountRecords,
  listAccountKeys,
  isUsagePeriod,
  listKeys,
  parseEventKey,
  usagePeriod,
  usageReportsAllowed,
} from './_lib/accountUsage.js'
import {MIN_SECRET_LENGTH, bearerMatches} from './_lib/adminStatsAuth.js'


const STATS_VERSION = 1
/** The timings the dashboard shows percentiles of; the stats_* names without the prefix. */
export const PERFORMANCE_METRICS = Object.freeze(['loadTime', 'firstMeshMs', 'openMs'])
// eslint-disable-next-line no-magic-numbers -- the percentiles are the data
export const PERCENTILES = Object.freeze([50, 90, 99])
const PERCENT = 100
const TENTHS = 10
/** Opens-per-account buckets, each `[largest count in it, label]`. */
// eslint-disable-next-line no-magic-numbers -- the bucket edges are the data
const OPENS_BUCKETS = Object.freeze([[1, '1'], [3, '2-3'], [9, '4-9'], [29, '10-29'], [Infinity, '30+']])
/** Longest sub accepted, for the lookup: Auth0's are well under this. */
const MAX_SUB_LENGTH = 256

const HTTP_OK = 200
const HTTP_BAD_REQUEST = 400
const HTTP_UNAUTHORIZED = 401
const HTTP_METHOD_NOT_ALLOWED = 405
const HTTP_INTERNAL_ERROR = 500
const HTTP_SERVICE_UNAVAILABLE = 503


/**
 * @param {Request} req
 * @return {Promise<Response>}
 */
export default async function handler(req) {
  const secret = process.env.ADMIN_STATS_SECRET
  // Config first, so the deployed smoke probe's strict mode sees an unset secret.
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) {
    return json(HTTP_INTERNAL_ERROR, {error: {code: 'admin_stats_not_configured'}})
  }
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    return json(HTTP_METHOD_NOT_ALLOWED, {error: {code: 'method_not_allowed'}})
  }
  if (!bearerMatches(req.headers.get('authorization'), secret)) {
    return json(HTTP_UNAUTHORIZED, {error: {code: 'admin_stats_unauthorized'}})
  }
  const params = new URL(req.url).searchParams
  const sub = params.get('sub')
  const validSub = typeof sub === 'string' && sub.length > 0 && sub.length <= MAX_SUB_LENGTH
  if (req.method === 'DELETE' && !validSub) {
    return json(HTTP_BAD_REQUEST, {error: {code: 'missing_sub'}})
  }
  const nowMs = Date.now()
  const period = params.get('period') ?? usagePeriod(nowMs)
  if (!isUsagePeriod(period)) {
    return json(HTTP_BAD_REQUEST, {error: {code: 'invalid_period'}})
  }
  const keySecret = accountKeySecret(process.env)
  if (validSub && !keySecret) {
    return json(HTTP_INTERNAL_ERROR, {error: {code: 'account_usage_not_configured'}})
  }
  try {
    const store = getStore({name: ACCOUNT_USAGE_STORE, consistency: 'strong'})
    if (req.method === 'DELETE') {
      const account = accountKey(sub, keySecret)
      return json(HTTP_OK, {v: STATS_VERSION, account, deleted: await deleteAccountRecords(store, account, nowMs)})
    }
    if (validSub) {
      return json(HTTP_OK, await accountStats(store, sub, keySecret, nowMs))
    }
    return json(HTTP_OK, await aggregateStats(store, period, nowMs))
  } catch (err) {
    console.warn(`account-usage-stats: store unavailable: ${err?.name ?? 'error'}`)
    return json(HTTP_SERVICE_UNAVAILABLE, {error: {code: 'account_usage_unavailable'}})
  }
}


/**
 * The dashboard's aggregate: no account named anywhere.
 *
 * @param {object} store
 * @param {string} period `YYYY-MM`, the one the percentiles are over
 * @param {number} nowMs
 * @return {Promise<object>}
 */
export async function aggregateStats(store, period, nowMs) {
  // The trend lists every load key (keys only, no reads); the period's own
  // reports and hits are listed under the period's prefix and read with
  // bounded concurrency.
  const [loadKeys, periodLimitKeys, firstKeys, rollupKeys] = await Promise.all(
    ['load/', `limit/${period}/`, `first/${period}/`, 'rollup/'].map((prefix) => listKeys(store, prefix)))
  const loads = loadKeys.map(parseEventKey).filter(Boolean)
  const periodLoadKeys = loadKeys.filter((key) => parseEventKey(key)?.period === period)
  const reports = await readAll(store, periodLoadKeys)
  const hits = await readAll(store, periodLimitKeys)
  const rollups = await readAll(store, rollupKeys)
  return {
    v: STATS_VERSION,
    now: new Date(nowMs).toISOString(),
    period,
    periods: periodTrend(loads),
    opens: opensPerAccount(loads.filter((parts) => parts.period === period)),
    performance: performanceStats(reports),
    outcomes: countBy(reports, ['load_outcome', 'content_type', 'source', 'tier', 'cache_hit', 'form_factor']),
    limits: limitStats(hits, firstKeys.map(parseEventKey).filter(Boolean)),
    rollups: rollups.sort((a, b) => String(a.period).localeCompare(String(b.period))),
  }
}


/**
 * Opens and active accounts per period, from the keys alone.
 *
 * @param {Array<object>} loads parseEventKey of every load key
 * @return {object} {YYYY-MM: {opens, accounts}}
 */
export function periodTrend(loads) {
  const byPeriod = {}
  for (const {period, account} of loads) {
    byPeriod[period] ??= {opens: 0, accounts: new Set()}
    const entry = byPeriod[period]
    entry.opens++
    entry.accounts.add(account)
  }
  return Object.fromEntries(Object.keys(byPeriod).sort().map((p) =>
    [p, {opens: byPeriod[p].opens, accounts: byPeriod[p].accounts.size}]))
}


/**
 * How many opens each account made in the period, as a distribution.
 *
 * @param {Array<object>} loads parseEventKey of the period's load keys
 * @return {object} {accounts, total, mean, p50, p90, p99, max, histogram}
 */
export function opensPerAccount(loads) {
  const counts = {}
  for (const {account} of loads) {
    counts[account] = (counts[account] ?? 0) + 1
  }
  const values = Object.values(counts).sort((a, b) => a - b)
  const total = values.reduce((a, b) => a + b, 0)
  return {
    accounts: values.length,
    total,
    mean: values.length ? Math.round((total / values.length) * TENTHS) / TENTHS : 0,
    ...percentiles(values),
    max: values.length ? values[values.length - 1] : 0,
    histogram: histogram(values),
  }
}


/**
 * Buckets of opens per account: 1, 2–3, 4–9, 10–29, 30+.
 *
 * @param {Array<number>} values
 * @return {object}
 */
function histogram(values) {
  const buckets = Object.fromEntries(OPENS_BUCKETS.map(([, label]) => [label, 0]))
  for (const v of values) {
    buckets[OPENS_BUCKETS.find(([upTo]) => v <= upTo)[1]]++
  }
  return buckets
}


/**
 * Percentiles of each timing, overall and per format.
 *
 * @param {Array<object>} reports
 * @return {object}
 */
export function performanceStats(reports) {
  const summarize = (rows) => Object.fromEntries(PERFORMANCE_METRICS.map((metric) => {
    const values = rows.map((r) => r[metric]).filter(Number.isFinite).sort((a, b) => a - b)
    return [metric, {n: values.length, ...percentiles(values)}]
  }))
  const byFormat = {}
  for (const report of reports) {
    (byFormat[report.content_type] ??= []).push(report)
  }
  const errorLoads = reports.filter((r) => (r.engineErrorTotal ?? 0) > 0 || (r.pageErrorCount ?? 0) > 0).length
  return {
    loads: reports.length,
    withErrors: errorLoads,
    overall: summarize(reports),
    byFormat: Object.fromEntries(Object.keys(byFormat).sort().map((f) => [f, summarize(byFormat[f])])),
  }
}


/**
 * Nearest-rank percentiles of sorted values.
 *
 * @param {Array<number>} sorted ascending
 * @return {object} {p50, p90, p99}, null when there are no values
 */
export function percentiles(sorted) {
  return Object.fromEntries(PERCENTILES.map((p) => {
    if (sorted.length === 0) {
      return [`p${p}`, null]
    }
    const rank = Math.max(1, Math.ceil((p / PERCENT) * sorted.length))
    return [`p${p}`, sorted[rank - 1]]
  }))
}


/**
 * @param {Array<object>} rows
 * @param {Array<string>} fields
 * @return {object} {field: {value: count}}
 */
export function countBy(rows, fields) {
  return Object.fromEntries(fields.map((field) => {
    const counts = {}
    for (const row of rows) {
      const value = row[field] ?? 'unknown'
      counts[value] = (counts[value] ?? 0) + 1
    }
    return [field, counts]
  }))
}


/**
 * Limit hits of the period by kind and gate, and how many accounts reached
 * each kind (from the first-hit markers, one per account and kind).
 *
 * @param {Array<object>} hits the period's limit records
 * @param {Array<object>} firsts parseEventKey of the period's first/ keys
 * @return {object} {kind: {hits, blocked, soft, accounts, byDecider}}
 */
export function limitStats(hits, firsts) {
  const out = {}
  const entry = (kind) => {
    out[kind] ??= {hits: 0, blocked: 0, soft: 0, accounts: 0, byDecider: {}}
    return out[kind]
  }
  for (const hit of hits) {
    const e = entry(hit.limit)
    e.hits++
    if (hit.gate === 'soft') {
      e.soft++
    } else {
      e.blocked++
    }
    e.byDecider[hit.decided_by] = (e.byDecider[hit.decided_by] ?? 0) + 1
  }
  for (const {rest: kind} of firsts) {
    entry(kind).accounts++
  }
  return out
}


/**
 * One account's records, every period, for the per-account lookup.
 *
 * @param {object} store
 * @param {string} sub
 * @param {string} keySecret ACCOUNT_USAGE_KEY_SECRET
 * @param {number} nowMs
 * @return {Promise<object>}
 */
export async function accountStats(store, sub, keySecret, nowMs) {
  const account = accountKey(sub, keySecret)
  const keys = await listAccountKeys(store, account, ['load', 'limit', 'first'], nowMs)
  const mine = keys.map((key) => ({key, parts: parseEventKey(key)})).filter(({parts}) => parts?.account === account)
  const periods = {}
  await Promise.all(mine.map(async ({key, parts}) => {
    periods[parts.period] ??= {loads: [], limits: [], first: []}
    const entry = periods[parts.period]
    if (parts.type === 'first') {
      entry.first.push(parts.rest)
      return
    }
    const record = await store.get(key, {type: 'json'})
    if (record) {
      entry[parts.type === 'load' ? 'loads' : 'limits'].push(record)
    }
  }))
  for (const entry of Object.values(periods)) {
    entry.loads.sort(byTime)
    entry.limits.sort(byTime)
    entry.first.sort()
    entry.opens = entry.loads.length
  }
  return {
    v: STATS_VERSION,
    now: new Date(nowMs).toISOString(),
    account,
    optedOut: !await usageReportsAllowed(store, account),
    periods: Object.fromEntries(Object.keys(periods).sort().map((p) => [p, periods[p]])),
  }
}


/** How many blobs a reader fetches at once. */
export const READ_CONCURRENCY = 25


/**
 * Read blobs as JSON, READ_CONCURRENCY at a time.
 *
 * @param {object} store
 * @param {Array<string>} keys
 * @param {object} [options]
 * @param {boolean} [options.keepMissing] keep a missing blob as null, so the
 *   answer lines up with `keys`; by default it is skipped
 * @return {Promise<Array>} in key order
 */
export async function readAll(store, keys, {keepMissing = false} = {}) {
  const out = []
  for (let i = 0; i < keys.length; i += READ_CONCURRENCY) {
    const batch = await Promise.all(keys.slice(i, i + READ_CONCURRENCY).map((key) => store.get(key, {type: 'json'})))
    out.push(...(keepMissing ? batch : batch.filter(Boolean)))
  }
  return out
}


/**
 * @param {object} a
 * @param {object} b
 * @return {number}
 */
function byTime(a, b) {
  return String(a.at).localeCompare(String(b.at))
}


/**
 * @param {number} status
 * @param {object} body
 * @return {Response}
 */
function json(status, body) {
  return new Response(JSON.stringify(body), {status, headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  }})
}
