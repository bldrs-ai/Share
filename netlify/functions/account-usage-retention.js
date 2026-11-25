/*
 * Netlify Function (v2, scheduled): account-usage-retention
 * ----------------------------------------------------------
 * Daily sweep of the per-account usage store (_lib/accountUsage.js,
 * design/new/account-usage.md §"Retention"). Raw per-account records — load
 * reports, limit hits, first-hit markers — are kept RETENTION_MONTHS (13)
 * whole months; a period older than that is reduced to counts with no
 * account attached, written as `rollup/<YYYY-MM>`, and its raw records are
 * deleted.
 *
 * One expired period per run, oldest first, so a run's work is bounded by
 * one month's records rather than by everything that has piled up; a backlog
 * clears a month a day. Periods are found from the store's directory listing
 * (`load/`, `limit/`, `first/` with `directories: true`), and a period's
 * records are listed under its own prefix.
 *
 * Idempotent and safe to cut short: a period's rollup is written
 * `onlyIfNew` BEFORE any of its records is deleted, so a run that dies
 * part-way leaves either nothing changed or a complete rollup and some raw
 * records, which the next run deletes without rebuilding the rollup from
 * what's left.
 *
 * Scheduled in netlify.toml. Netlify doesn't serve scheduled functions over
 * HTTP in production, so the smoke test leaves it unprobed
 * (smokeFunctions.mjs UNPROBED_FUNCTIONS); replays cover it.
 *
 * Answers 200 with a summary `{v, now, oldestKept, reduced: [{period, ...}]}`
 * (the function log keeps it), 500 when the store can't be opened.
 */
import {getStore} from '@netlify/blobs'
import {ACCOUNT_USAGE_STORE, listKeys, logInfo, oldestKeptPeriod, parseEventKey} from './_lib/accountUsage.js'
import {readAll} from './account-usage-stats.js'


const SUMMARY_VERSION = 1
const DELETE_CONCURRENCY = 25
const HTTP_OK = 200
const HTTP_INTERNAL_ERROR = 500


/**
 * @return {Promise<Response>}
 */
export default async function handler() {
  let store
  try {
    store = getStore({name: ACCOUNT_USAGE_STORE, consistency: 'strong'})
  } catch (err) {
    console.error(`account-usage-retention: not configured, blob store: ${err?.name ?? 'error'}`)
    return json(HTTP_INTERNAL_ERROR, {error: 'account_usage_not_configured'})
  }
  const summary = await sweep(store, Date.now())
  logInfo(`account-usage-retention: ${JSON.stringify(summary)}`)
  return json(HTTP_OK, summary)
}


/**
 * Reduce the oldest period older than the retention window, if any.
 *
 * @param {object} store
 * @param {number} nowMs
 * @return {Promise<object>} the summary
 */
export async function sweep(store, nowMs) {
  const oldestKept = oldestKeptPeriod(nowMs)
  const periods = new Set()
  await Promise.all(['load', 'limit', 'first'].map(async (type) => {
    const {directories} = await store.list({prefix: `${type}/`, directories: true})
    for (const dir of directories || []) {
      const match = /^(?:load|limit|first)\/(\d{4}-\d{2})\/?$/.exec(dir)
      if (match) {
        periods.add(match[1])
      }
    }
  }))
  const expired = [...periods].filter((p) => p < oldestKept).sort()
  const reduced = []
  if (expired.length > 0) {
    const period = expired[0]
    const keys = (await Promise.all(['load', 'limit', 'first'].map((type) => listKeys(store, `${type}/${period}/`)))).flat()
    const entries = keys.map((key) => ({key, parts: parseEventKey(key)})).filter(({parts}) => parts?.period === period)
    reduced.push(await reducePeriod(store, period, entries, nowMs))
  }
  return {v: SUMMARY_VERSION, now: new Date(nowMs).toISOString(), oldestKept, reduced, pending: Math.max(0, expired.length - 1)}
}


/**
 * @param {object} store
 * @param {string} period
 * @param {Array<{key: string, parts: object}>} entries the period's raw keys
 * @param {number} nowMs
 * @return {Promise<object>} {period, rollup: 'written' | 'kept', deleted}
 */
async function reducePeriod(store, period, entries, nowMs) {
  const rollupKey = `rollup/${period}`
  let rollupState = 'kept'
  if (!await store.get(rollupKey, {type: 'json'})) {
    const rollup = await buildRollup(store, period, entries, nowMs)
    const written = await store.set(rollupKey, JSON.stringify(rollup), {onlyIfNew: true})
    rollupState = written?.modified === false ? 'kept' : 'written'
  }
  for (let i = 0; i < entries.length; i += DELETE_CONCURRENCY) {
    await Promise.all(entries.slice(i, i + DELETE_CONCURRENCY).map(({key}) => store.delete(key)))
  }
  return {period, rollup: rollupState, deleted: entries.length}
}


/**
 * The counts a period keeps once its accounts are gone. Distinct-account
 * totals are counts too, and hold no account.
 *
 * @param {object} store
 * @param {string} period
 * @param {Array<{key: string, parts: object}>} entries
 * @param {number} nowMs
 * @return {Promise<object>}
 */
export async function buildRollup(store, period, entries, nowMs) {
  const loadAccounts = new Set()
  const loads = {total: 0, accounts: 0, byOutcome: {}, byFormat: {}, bySource: {}, byTier: {}}
  const limits = {}
  const limitEntry = (kind) => {
    limits[kind] ??= {hits: 0, blocked: 0, soft: 0, accounts: 0}
    return limits[kind]
  }
  for (const {parts} of entries.filter((e) => e.parts.type === 'first')) {
    limitEntry(parts.rest).accounts++
  }
  const rows = entries.filter((e) => e.parts.type !== 'first')
  const records = await readAll(store, rows.map((e) => e.key), {keepMissing: true})
  for (const [i, {parts}] of rows.entries()) {
    const record = records[i]
    if (!record) {
      continue
    }
    if (parts.type === 'load') {
      loadAccounts.add(parts.account)
      loads.total++
      bump(loads.byOutcome, record.load_outcome)
      bump(loads.byFormat, record.content_type)
      bump(loads.bySource, record.source)
      bump(loads.byTier, record.tier)
    } else {
      const e = limitEntry(record.limit ?? 'unknown')
      e.hits++
      e[record.gate === 'soft' ? 'soft' : 'blocked']++
    }
  }
  loads.accounts = loadAccounts.size
  return {v: SUMMARY_VERSION, period, reducedAt: new Date(nowMs).toISOString(), loads, limits}
}


/**
 * @param {object} counts
 * @param {*} value
 */
function bump(counts, value) {
  const k = value ?? 'unknown'
  counts[k] = (counts[k] ?? 0) + 1
}


/**
 * @param {number} status
 * @param {object} body
 * @return {Response}
 */
function json(status, body) {
  return new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}})
}
