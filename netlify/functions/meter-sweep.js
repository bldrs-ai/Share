/*
 * Netlify Function (v2, scheduled daily in netlify.toml): meter-sweep
 * ------------------------------------------------------------------
 * The anonymous metering ledger's retention (design/new/quotas.md
 * §"Anonymous ledger: retention and purpose"; `_lib/meterLedger.js`):
 *
 *  - a token's record is deleted once its period has been over for 30 days
 *    (RETENTION_AFTER_PERIOD_MS), and before it goes it is added to that
 *    month's ID-free aggregate, `meter/aggregate/<YYYY-MM>`: how many tokens
 *    there were, how many remote loads they counted, how many reached each
 *    stage, how many were carried into an account. Nothing of the record
 *    itself (no id, no digest) survives;
 *  - a network's day bucket (`meter/ip/<day>/<hash>`) is deleted once its
 *    day is over, the day after.
 *
 * Its records are found by listing alone: each key starts with the UTC day
 * its period (or bucket) began, so only the records it deletes are read.
 *
 * The aggregates are statistics about the limits themselves, the only ones
 * the purpose rule allows (`_lib/meterLedger.js` "Limit data stays limit
 * data"). This function never logs a key.
 *
 * Answers 200 {deleted: {tokens, ipBuckets}, aggregated} on a run, 500
 * {error: 'meter_not_configured'} when the store can't be opened. A record
 * that can't be read or deleted is left for the next run.
 */
import {getStore} from '@netlify/blobs'
import {PERIOD_MS} from '../../src/quota/period.js'
import {
  AGGREGATE_PREFIX,
  ANON_PREFIX,
  IP_PREFIX,
  METER_STORE,
  RETENTION_AFTER_PERIOD_MS,
  STAGES,
  fail,
  normalizeAnon,
  utcDay,
} from './_lib/meterLedger.js'
import {compareAndSwap} from './_lib/blobCas.js'


const MILLIS_PER_DAY = 86400000
const HTTP_OK = 200
const HTTP_INTERNAL_ERROR = 500
const DAY_KEY = /^(\d{4}-\d{2}-\d{2})\//


/**
 * @return {Promise<Response>}
 */
export default async function handler() {
  let store
  try {
    store = getStore({name: METER_STORE, consistency: 'strong'})
  } catch (err) {
    console.error(`meter-sweep: not configured, blob store: ${err.name}`)
    return json(HTTP_INTERNAL_ERROR, {error: 'meter_not_configured'})
  }
  const result = await sweep(store, Date.now())
  logInfo(`meter-sweep: deleted ${result.deleted.tokens} token records and ${result.deleted.ipBuckets} ` +
    `network buckets; ${result.failed} left for the next run`)
  return json(HTTP_OK, result)
}


/**
 * @param {object} store
 * @param {number} nowMs
 * @return {Promise<{deleted: {tokens: number, ipBuckets: number}, aggregated: Array<string>, failed: number}>}
 */
export async function sweep(store, nowMs) {
  const result = {deleted: {tokens: 0, ipBuckets: 0}, aggregated: [], failed: 0}
  const byMonth = new Map()

  const tokenKeys = await listKeys(store, ANON_PREFIX)
  for (const key of tokenKeys) {
    const day = dayOf(key, ANON_PREFIX)
    // The period began within `day`, so it ends no later than a day past
    // day + PERIOD_MS: wait for that, plus the retention.
    if (day === null || nowMs < Date.parse(`${day}T00:00:00.000Z`) + MILLIS_PER_DAY + PERIOD_MS +
        RETENTION_AFTER_PERIOD_MS) {
      continue
    }
    try {
      const start = Date.parse(`${day}T00:00:00.000Z`)
      const record = normalizeAnon(await store.get(key, {type: 'json', consistency: 'strong'}),
        {start, end: start + PERIOD_MS})
      // Counted only once it is gone: a delete that fails leaves the record
      // for the next run, which would count it again (review on Share#2368).
      await store.delete(key)
      const month = day.slice(0, 7)
      byMonth.set(month, addToAggregate(byMonth.get(month) ?? emptyAggregate(), record))
      result.deleted.tokens++
    } catch {
      result.failed++
    }
  }

  // Written after the deletes: a run that dies between the two loses the
  // month's figures for those records (an under-count of a statistic), never
  // keeps a record past its retention.
  for (const [month, figures] of byMonth) {
    try {
      await compareAndSwap(store, `${AGGREGATE_PREFIX}${month}`, {
        normalize: (data) => (data && data.v === 1 ? data : emptyAggregate()),
        fail,
        change: (aggregate) => mergeAggregates(aggregate, figures),
      })
      result.aggregated.push(month)
    } catch {
      result.failed++
    }
  }

  const yesterday = utcDay(nowMs - MILLIS_PER_DAY)
  for (const key of await listKeys(store, IP_PREFIX)) {
    const day = dayOf(key, IP_PREFIX)
    if (day === null || day >= yesterday) {
      continue
    }
    try {
      await store.delete(key)
      result.deleted.ipBuckets++
    } catch {
      result.failed++
    }
  }
  return result
}


/**
 * @param {object} store
 * @param {string} prefix
 * @return {Promise<Array<string>>}
 */
async function listKeys(store, prefix) {
  try {
    const {blobs} = await store.list({prefix})
    return blobs.map((blob) => blob.key)
  } catch {
    return []
  }
}


/**
 * @param {string} key
 * @param {string} prefix
 * @return {?string} the UTC day the key starts with
 */
function dayOf(key, prefix) {
  return DAY_KEY.exec(key.slice(prefix.length))?.[1] ?? null
}


/** @return {object} an aggregate with nothing counted */
export function emptyAggregate() {
  return {v: 1, tokens: 0, merged: 0, features: {}}
}


/**
 * @param {object} aggregate mutated and returned
 * @param {object} record a normalized token record
 * @return {object}
 */
export function addToAggregate(aggregate, record) {
  aggregate.tokens += 1
  aggregate.merged += record.mergedAt === null ? 0 : 1
  for (const [feature, entry] of Object.entries(record.features)) {
    const figures = aggregate.features[feature] ?? {counted: 0, [STAGES.LAST_FREE]: 0, [STAGES.GATED]: 0, gatedByIp: 0}
    figures.counted += entry.count
    if (record.reported.includes(STAGES.LAST_FREE)) {
      figures[STAGES.LAST_FREE] += 1
    }
    if (entry.stage === STAGES.GATED) {
      figures[STAGES.GATED] += 1
      figures.gatedByIp += entry.gatedBy === 'ip' ? 1 : 0
    }
    aggregate.features[feature] = figures
  }
  return aggregate
}


/**
 * @param {object} into mutated and returned
 * @param {object} add
 * @return {object}
 */
export function mergeAggregates(into, add) {
  into.tokens = (into.tokens ?? 0) + add.tokens
  into.merged = (into.merged ?? 0) + add.merged
  into.features = into.features ?? {}
  for (const [feature, figures] of Object.entries(add.features)) {
    const current = into.features[feature] ?? {}
    for (const [name, n] of Object.entries(figures)) {
      current[name] = (current[name] ?? 0) + n
    }
    into.features[feature] = current
  }
  return into
}


/**
 * @param {number} status
 * @param {object} body
 * @return {Response}
 */
function json(status, body) {
  return new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}})
}


/**
 * @param {string} message
 */
function logInfo(message) {
  // eslint-disable-next-line no-console -- an expected outcome is INFO, not a warning
  console.log(message)
}
