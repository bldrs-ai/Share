/*
 * The anonymous metering ledger (design/new/quotas.md §"Anonymous
 * metering"), on Netlify Blobs under compare-and-swap (`blobCas.js`).
 *
 * ## LIMIT DATA STAYS LIMIT DATA
 *
 * What this ledger holds exists to apply free-use limits, and for nothing
 * else. It must never feed general analytics: no per-visitor reports, no
 * feature-usage profiles, no joining it to GA or Sentry. The only statistics
 * allowed out of it are about the limits themselves — how many visitors
 * reached each stage, how many signed in from a gate — and those leave as
 * ID-free counts: one GA event per token per stage, sent under one fixed
 * client id (`meter.js`), and the sweep's monthly aggregates
 * (`meter-sweep.js`). A change that reads it for anything else is a change
 * to the privacy policy first.
 *
 * ## Records
 *
 * One blob per metering token, `meter/anon/<UTC day its period began>/<anonId>`,
 * holding only the current period's data (a token lives one period,
 * `meteringToken.js`). The day in the key is the token's own start (it
 * carries it), and lets the sweep find expired records by listing alone:
 *
 *   {v: 1, period: {start, end},          // epoch ms; the token's period
 *    features: {remote_load: {count,      // remote loads counted this period
 *                             models,     // keyed digests of the models counted, to tell a reopen
 *                                         //   from a new model; never a key, path or URL
 *                             stage,      // null | 'last_free' | 'gated': the limit stage reached
 *                             gatedBy}},  // 'token' | 'ip' once gated
 *    reported: ['last_free', ...],        // the stages already sent to GA, so each goes once
 *    mergedAt: null | ms}                 // when it was carried into an account (link at sign-in)
 *
 * One blob per network per day, `meter/ip/<UTC day>/<hash>`, for the
 * day-salted IP cap: `{v: 1, count}`. The hash is `meteringToken.js
 * #hashMeteringIp`, salted by the day, so it neither stores the IP nor links
 * across days.
 *
 * ## Retention
 *
 * A token's record is deleted 30 days after its period ends
 * (RETENTION_AFTER_PERIOD_MS), an IP bucket the day after its own, both by
 * the daily sweep (`meter-sweep.js`). The 30 days are for the link at
 * sign-in to find a token whose period has just ended, and for the abuse
 * that matters to be investigated; after them only the sweep's ID-free
 * aggregates (`meter/aggregate/<YYYY-MM>`) remain.
 */
import {createHmac} from 'node:crypto'
import {compareAndSwap} from './blobCas.js'


export const METER_STORE = 'metering'
export const FEATURES = Object.freeze({REMOTE_LOAD: 'remote_load'})
export const STAGES = Object.freeze({LAST_FREE: 'last_free', GATED: 'gated'})
const RECORD_VERSION = 1
const MILLIS_PER_DAY = 86400000
const RETENTION_DAYS = 30
export const RETENTION_AFTER_PERIOD_MS = RETENTION_DAYS * MILLIS_PER_DAY
const MODEL_DIGEST_HEX_CHARS = 24
// A period's models are bounded by its limit; this bounds a malformed or
// hostile record's list anyway.
const MAX_MODELS = 64


/** A ledger that could not be read or written: the caller fails open. */
export class MeterLedgerError extends Error {
  /**
   * @param {string} reason 'store' or 'contention'
   * @param {?Error} cause
   */
  constructor(reason, cause) {
    super(`metering ledger unavailable: ${reason}`)
    this.name = 'MeterLedgerError'
    this.reason = reason
    if (cause) {
      this.cause = cause
    }
  }
}


export const ANON_PREFIX = 'meter/anon/'
export const IP_PREFIX = 'meter/ip/'
export const AGGREGATE_PREFIX = 'meter/aggregate/'


/**
 * @param {string} anonId
 * @param {{start: number}} period the token's
 * @return {string}
 */
export function anonRecordKey(anonId, period) {
  return `${ANON_PREFIX}${utcDay(period.start)}/${anonId}`
}


/**
 * @param {string} day UTC 'YYYY-MM-DD'
 * @param {string} ipHash
 * @return {string}
 */
export function ipBucketKey(day, ipHash) {
  return `${IP_PREFIX}${day}/${ipHash}`
}


/**
 * @param {number} ms
 * @return {string} UTC 'YYYY-MM-DD'
 */
export function utcDay(ms) {
  return new Date(ms).toISOString().slice(0, 10)
}


/**
 * A keyed digest of a model's key, unique to this token: the same model
 * opened by two visitors gives two unrelated digests, and the secret keeps
 * it from being reversed by trying keys.
 *
 * @param {string} secret the metering secret
 * @param {string} anonId
 * @param {string} key the model's slot key
 * @return {string} hex
 */
export function modelDigest(secret, anonId, key) {
  return createHmac('sha256', secret).update(`bldrs-meter|model|${anonId}|${key}`).digest('hex')
    .slice(0, MODEL_DIGEST_HEX_CHARS)
}


/**
 * @param {*} data
 * @param {{start: number, end: number}} period the token's
 * @return {object} a well-formed record (anything malformed reads as empty)
 */
export function normalizeAnon(data, period) {
  const empty = {v: RECORD_VERSION, period, features: {}, reported: [], mergedAt: null}
  if (!data || typeof data !== 'object' || data.v !== RECORD_VERSION) {
    return empty
  }
  const features = {}
  for (const [name, entry] of Object.entries(data.features && typeof data.features === 'object' ? data.features : {})) {
    if (entry && typeof entry === 'object') {
      features[name] = {
        count: Number.isInteger(entry.count) && entry.count >= 0 ? entry.count : 0,
        models: Array.isArray(entry.models) ? entry.models.filter((m) => typeof m === 'string').slice(0, MAX_MODELS) : [],
        stage: Object.values(STAGES).includes(entry.stage) ? entry.stage : null,
        gatedBy: entry.gatedBy === 'ip' || entry.gatedBy === 'token' ? entry.gatedBy : null,
      }
    }
  }
  return {
    v: RECORD_VERSION,
    period,
    features,
    reported: Array.isArray(data.reported) ? data.reported.filter((s) => Object.values(STAGES).includes(s)) : [],
    mergedAt: Number.isFinite(data.mergedAt) ? data.mergedAt : null,
  }
}


/**
 * @param {object} record
 * @param {string} feature
 * @return {object} the feature's entry, created empty
 */
function featureOf(record, feature) {
  if (!record.features[feature]) {
    record.features[feature] = {count: 0, models: [], stage: null, gatedBy: null}
  }
  return record.features[feature]
}


/**
 * Mark a stage reached, and say whether it is the first time this token
 * reached it (so the caller sends its one GA event). Mutates `record`.
 *
 * @param {object} record
 * @param {object} entry the feature's
 * @param {string} stage
 * @return {boolean} whether this is the stage's first report
 */
function reachStage(record, entry, stage) {
  if (stage === STAGES.GATED || entry.stage === null) {
    entry.stage = stage
  }
  if (record.reported.includes(stage)) {
    return false
  }
  record.reported.push(stage)
  return true
}


/**
 * @param {string} reason
 * @param {?Error} cause
 * @return {MeterLedgerError}
 */
export function fail(reason, cause) {
  return new MeterLedgerError(reason, cause)
}


/**
 * @typedef {object} UseDecision
 * @property {boolean} allowed whether the model may open
 * @property {boolean} alreadyCounted a model this token has already counted: free to reopen
 * @property {number} used counted this period, after this use
 * @property {?string} stage the furthest stage the token has reached: null, 'last_free' or 'gated'
 * @property {boolean} lastFree this use was counted and was the period's last free one: the notice
 * @property {?string} gatedBy 'token' (its own limit) or 'ip' (the network's day cap) when refused
 * @property {?string} firstReached the stage this use reached for the first time, to report once
 */


/**
 * Count one metered use of `feature` by a token, or refuse it.
 *
 * In order: a model the token already counted is allowed and costs nothing
 * (no IP count either); a token at its limit is refused (gated); a network
 * at its day cap is refused (gated, `gatedBy: 'ip'`) without counting; else
 * the network's day count and the token's count go up, and reaching the
 * limit is the last-free stage. The network is counted before the token, so
 * a race between the two can only over-count the network by one, the safe
 * direction.
 *
 * @param {object} store
 * @param {object} use
 * @param {string} use.anonId
 * @param {{start: number, end: number}} use.period the token's
 * @param {string} use.feature FEATURES.*
 * @param {string} use.digest {@link modelDigest} of the model
 * @param {number} use.limit uses per period
 * @param {?{key: string, limit: number}} use.ipBucket the network's day bucket, or null when the
 *   platform gave no IP
 * @return {Promise<UseDecision>}
 * @throws {MeterLedgerError}
 */
export async function recordUse(store, {anonId, period, feature, digest, limit, ipBucket}) {
  const key = anonRecordKey(anonId, period)
  const gate = (gatedBy) => compareAndSwap(store, key, {
    normalize: (data) => normalizeAnon(data, period),
    fail,
    change: (record) => {
      const entry = featureOf(record, feature)
      if (entry.models.includes(digest)) {
        return {write: false, allowed: true, alreadyCounted: true, used: entry.count, stage: entry.stage,
          gatedBy: null, firstReached: null, lastFree: false}
      }
      // Gated the same way already, and reported: nothing new to write.
      const unchanged = entry.stage === STAGES.GATED && entry.gatedBy === gatedBy &&
        record.reported.includes(STAGES.GATED)
      const firstReached = reachStage(record, entry, STAGES.GATED) ? STAGES.GATED : null
      entry.gatedBy = gatedBy
      const decision = {allowed: false, alreadyCounted: false, used: entry.count, stage: STAGES.GATED, gatedBy,
        firstReached, lastFree: false}
      return unchanged ? {write: false, ...decision} : decision
    },
  })

  // A read first, to answer a reopen or a gated token without touching the
  // network's bucket.
  let current
  try {
    current = await store.get(key, {type: 'json', consistency: 'strong'})
  } catch (err) {
    throw fail('store', err)
  }
  const before = featureOf(normalizeAnon(current, period), feature)
  if (before.models.includes(digest)) {
    return {allowed: true, alreadyCounted: true, used: before.count, stage: before.stage, gatedBy: null,
      firstReached: null, lastFree: false}
  }
  if (before.count >= limit) {
    return gate('token')
  }

  if (ipBucket) {
    const ip = await compareAndSwap(store, ipBucket.key, {
      normalize: (data) => ({v: RECORD_VERSION, count: Number.isInteger(data?.count) ? data.count : 0}),
      fail,
      change: (record) => {
        if (record.count >= ipBucket.limit) {
          return {write: false, ok: false}
        }
        record.count += 1
        return {ok: true}
      },
    })
    if (!ip.ok) {
      return gate('ip')
    }
  }

  return compareAndSwap(store, key, {
    normalize: (data) => normalizeAnon(data, period),
    fail,
    change: (record) => {
      const entry = featureOf(record, feature)
      if (entry.models.includes(digest)) {
        return {write: false, allowed: true, alreadyCounted: true, used: entry.count, stage: entry.stage,
          gatedBy: null, firstReached: null, lastFree: false}
      }
      if (entry.count >= limit) {
        // Another tab got there between the read and here.
        const firstReached = reachStage(record, entry, STAGES.GATED) ? STAGES.GATED : null
        entry.gatedBy = 'token'
        return {allowed: false, alreadyCounted: false, used: entry.count, stage: STAGES.GATED, gatedBy: 'token',
          firstReached, lastFree: false}
      }
      entry.count += 1
      entry.models.push(digest)
      let firstReached = null
      if (entry.count >= limit && reachStage(record, entry, STAGES.LAST_FREE)) {
        firstReached = STAGES.LAST_FREE
      }
      return {allowed: true, alreadyCounted: false, used: entry.count, stage: entry.stage, gatedBy: null,
        firstReached, lastFree: entry.count >= limit}
    },
  })
}


/**
 * A token's record as it stands, for the link at sign-in. Read-only.
 *
 * @param {object} store
 * @param {string} anonId
 * @param {{start: number, end: number}} period
 * @return {Promise<object>} the normalized record (empty when there is none)
 * @throws {MeterLedgerError}
 */
export async function readAnonRecord(store, anonId, period) {
  try {
    return normalizeAnon(await store.get(anonRecordKey(anonId, period), {type: 'json', consistency: 'strong'}), period)
  } catch (err) {
    throw fail('store', err)
  }
}


/**
 * Mark a token merged into an account (the link at sign-in), once.
 *
 * @param {object} store
 * @param {string} anonId
 * @param {{start: number, end: number}} period
 * @param {number} nowMs
 * @return {Promise<{merged: boolean}>} merged false when it already was
 * @throws {MeterLedgerError}
 */
export function markMerged(store, anonId, period, nowMs) {
  return compareAndSwap(store, anonRecordKey(anonId, period), {
    normalize: (data) => normalizeAnon(data, period),
    fail,
    change: (record) => {
      if (record.mergedAt !== null) {
        return {write: false, merged: false}
      }
      record.mergedAt = nowMs
      return {merged: true}
    },
  })
}


/**
 * What a token's record carries into an account: the counts and stage per
 * feature, nothing else (no model digests).
 *
 * @param {object} record normalized
 * @return {object} `{<feature>: {count, stage}}`
 */
export function carriedCounts(record) {
  const out = {}
  for (const [feature, entry] of Object.entries(record.features)) {
    out[feature] = {count: entry.count, stage: entry.stage}
  }
  return out
}
