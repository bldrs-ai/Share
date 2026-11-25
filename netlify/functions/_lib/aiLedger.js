/*
 * The hosted assistant's credit ledger: reserve, then settle
 * (design/new/ai-workspace.md §7 D4), on Netlify Blobs.
 *
 * ## Why reserve-then-settle, and why it has to be atomic
 *
 * A check-then-debit relay lets every concurrent request see the same
 * positive balance, call the paid upstream, and debit afterwards; with a
 * last-write-wins store only one debit may even stick. So before the call the
 * relay RESERVES the request's worst case (input estimate + `max_tokens` at
 * the chain's dearest price, `_lib/aiModels.js`) as a hold on each bucket,
 * and after the stream it SETTLES the hold to OpenRouter's actual
 * `usage.cost`. A per-identity cap on in-flight holds bounds how much can be
 * reserved at once.
 *
 * ## Soft and strict budgets
 *
 * Each bucket admits a request by one of two rules ({@link admits}):
 *  - **strict** (`soft` unset): admit only if `used + hold <= limit`, where
 *    `used` is the window's spend plus every live hold. Spend can never pass
 *    the limit (while a settle stays within its hold). For the global daily
 *    breakers, the hard dollar safety, and for Pro, whose budget is large
 *    next to any one request's hold.
 *  - **soft** (`soft: true`): admit if `used < limit`. The hold is still
 *    taken, so it counts against the next request, and still settles to
 *    `usage.cost`. For the per-identity budgets of anonymous and free and the
 *    anonymous IP bucket, whose budgets are set near one request's worst
 *    case: a worst case priced at the chain's dearest model, a token per
 *    byte and the whole `max_tokens` is 100x+ a real turn, so the strict rule
 *    refused users who had spent a tenth of their budget (ai-workspace.md §7
 *    D4). A request with no hold (a free model) is never refused for budget
 *    on a soft bucket: it can't add spend, and the free-requests cap bounds
 *    it instead.
 *
 * The soft rule's overshoot is bounded, and by less than one might think:
 * every admission is a compare-and-swap, so admissions to one bucket are
 * serialized, and each sees every hold admitted before it. The LAST request
 * admitted saw `spent + held < limit`; everything that settles afterwards
 * was in that `spent + held` or is that request's own hold. So a bucket's
 * spend stays below `limit + one hold` (the last one admitted), as long as
 * each settle stays within its hold (`settle_exceeded_reservation` in
 * ai-chat.js is the report when one doesn't). The relay caps a signed-out or
 * free request's size so that one hold is small (ai-chat.js
 * `maxBodyBytesFor`). `_tests/aiLedger.test.js` proves the bound under a
 * parallel burst.
 *
 * ## When a refused bucket admits again
 *
 * A budget refusal carries `resumeAt` ({@link resumeAtOf}): the first UTC
 * day boundary at which enough of the window's spend has left it for the
 * bucket to admit the same request. Live holds are counted as today's spend
 * (they settle, or expire into spend, today). It is an estimate the client
 * waits on, not a promise: a settle can lower the figure sooner.
 *
 * Every write is a compare-and-swap: read the record and its ETag with
 * strong consistency, change it, and write it back conditional on the ETag
 * (`onlyIfMatch`) — or, for a record that doesn't exist yet, conditional on
 * it still not existing (`onlyIfNew`). Netlify Blobs sends those as
 * `If-Match: <etag>` / `If-None-Match: *` and answers 412 when another write
 * got there first, which @netlify/blobs reports as `{modified: false}`; this
 * module then re-reads and tries again. So two reservations against one
 * balance can't both succeed: the second one's write fails, and its retry
 * sees the first one's hold (`_tests/aiLedger.test.js` races them through
 * the real @netlify/blobs client).
 *
 * ## The @netlify/blobs 10.7.4 trap this file avoids
 *
 * `store.setJSON(key, value, {onlyIfMatch})` does NOT send the condition in
 * 10.7.4, so every conditional write goes through `set()`. The loop that
 * does it lives in `blobCas.js` (shared with the metering ledger), which
 * says why; a test pins that the header reaches the wire.
 *
 * ## Record shape
 *
 * One blob per bucket (`ai/anonymous/<anonId>`, `ai/ip/<hash>`,
 * `ai/user/<sub>`, `ai/breaker/<tier>/<day>`):
 *
 *   {v: 1, days: {'2026-11-18': {spent: <micro-USD>, free: <requests>}},
 *    holds: {<requestId>: {micro, free: 0|1, at: <ms>}},
 *    estimates: {<requestId>: {micro, day, generation}}}
 *
 * `estimates` lists the spend booked at a reservation because no
 * `usage.cost` arrived (a cut stream, a connection lost after sending), so a
 * reconciliation job can find and correct it; it is part of `days`, not
 * added to it.
 *
 * A bucket's usage is the window's `spent` plus every live hold, so a hold
 * counts against the budget from the moment it is taken. Days outside the
 * window are pruned on every write.
 *
 * A hold older than HOLD_TTL_MS is a request whose function died before it
 * settled. It is converted to spend AT ITS RESERVED AMOUNT, never dropped:
 * the upstream may well have billed it, and the direction here is "never more
 * spend than budgeted" (§7 "The reservation must be atomic"), unlike model
 * slots' "free extra, never a wrongful block". A settle that arrives after
 * that conversion writes nothing (settle is idempotent: no hold, no write),
 * so nothing is booked twice; the relay leaves a reconciliation record
 * (`ai/reconcile/<day>/<request>`) so a job can correct the overcharge,
 * as it does for a settle that keeps failing (settleWithRetry).
 */


import {PERIOD_MS} from '../../../src/quota/period.js'
import {CAS_ATTEMPTS, compareAndSwap as sharedCompareAndSwap} from './blobCas.js'


const MILLIS_PER_MINUTE = 60000
const HOLD_TTL_MINUTES = 15
export const HOLD_TTL_MS = HOLD_TTL_MINUTES * MILLIS_PER_MINUTE
const DAY_MS = 86400000
const RECORD_VERSION = 1
// Anonymous tokens carried into one account (`carryAnonymousSpend`); a bound
// on the list, which only ever needs the current period's.
const MAX_CARRIED = 16

// Compare-and-swap retries before giving up with 'contention' (`blobCas.js`;
// a bucket that loses them all is a hot key, the global breaker under real
// load). Re-exported for the tests that count attempts.
export {CAS_ATTEMPTS}


/** A ledger the relay could not read or write: fail closed. */
export class LedgerUnavailableError extends Error {
  /**
   * @param {'contention'|'store'} reason
   * @param {object} [options]
   * @param {Error} [options.cause]
   */
  constructor(reason, {cause} = {}) {
    super(`ai ledger unavailable: ${reason}`)
    this.name = 'LedgerUnavailableError'
    this.reason = reason
    if (cause) {
      this.cause = cause
    }
  }
}


/**
 * @param {number} ms
 * @return {string} the UTC day, 'YYYY-MM-DD'
 */
export function utcDay(ms) {
  return new Date(ms).toISOString().slice(0, 10)
}


/** @return {object} an empty record */
function emptyRecord() {
  return {v: RECORD_VERSION, days: {}, holds: {}, estimates: {}}
}


/**
 * @param {*} data what the store held
 * @return {object} a well-formed record (anything malformed reads as empty)
 */
function normalize(data) {
  if (!data || typeof data !== 'object' || data.v !== RECORD_VERSION) {
    return emptyRecord()
  }
  return {
    v: RECORD_VERSION,
    days: data.days && typeof data.days === 'object' ? {...data.days} : {},
    holds: data.holds && typeof data.holds === 'object' ? {...data.holds} : {},
    estimates: data.estimates && typeof data.estimates === 'object' ? {...data.estimates} : {},
    // Only on a record that has them, so a bucket with no period writes the
    // shape it always has: `periodStart` (a signed-in identity's metering
    // period, applyPeriod) and `carried` (carryAnonymousSpend).
    ...(Number.isFinite(data.periodStart) ? {periodStart: data.periodStart} : {}),
    ...(Array.isArray(data.carried) ?
      {carried: data.carried.filter((c) => typeof c === 'string').slice(-MAX_CARRIED)} :
      {}),
  }
}


/**
 * Turn expired holds into spend on the day they were taken, and drop days
 * that have left the window. Mutates `record`.
 *
 * @param {object} record
 * @param {number} nowMs
 * @param {number} windowDays
 */
function prune(record, nowMs, windowDays) {
  for (const [id, hold] of Object.entries(record.holds)) {
    if (!(nowMs - hold.at < HOLD_TTL_MS)) {
      addToDay(record, utcDay(hold.at), hold.micro, hold.free)
      delete record.holds[id]
    }
  }
  const oldest = utcDay(nowMs - ((windowDays - 1) * DAY_MS))
  for (const day of Object.keys(record.days)) {
    if (day < oldest) {
      delete record.days[day]
    }
  }
  for (const [id, estimate] of Object.entries(record.estimates)) {
    if (estimate.day < oldest) {
      delete record.estimates[id]
    }
  }
}


/**
 * @param {object} record
 * @param {string} day
 * @param {number} micro
 * @param {number} free
 */
function addToDay(record, day, micro, free) {
  const entry = record.days[day] || {spent: 0, free: 0}
  record.days[day] = {spent: entry.spent + micro, free: entry.free + free}
}


/**
 * A bucket's standing: spend in the window plus live holds. Call after
 * {@link prune}.
 *
 * @param {object} record
 * @param {number} nowMs
 * @return {{used: number, freeToday: number, inFlight: number}}
 */
export function usageOf(record, nowMs) {
  const today = utcDay(nowMs)
  let used = 0
  for (const entry of Object.values(record.days)) {
    used += entry.spent
  }
  const holds = Object.values(record.holds)
  let freeToday = record.days[today]?.free ?? 0
  for (const hold of holds) {
    used += hold.micro
    freeToday += hold.free
  }
  return {used, freeToday, inFlight: holds.length}
}


/**
 * Whether a bucket admits a hold at its current usage (the header's "Soft
 * and strict budgets").
 *
 * @param {Bucket} bucket
 * @param {number} used spend in the window plus live holds
 * @param {number} micro the hold asked for
 * @return {boolean}
 */
export function admits(bucket, used, micro) {
  if (bucket.soft) {
    return micro === 0 || used < bucket.limit
  }
  return used + micro <= bucket.limit
}


/**
 * When a bucket that refuses `micro` now would admit it again, as enough of
 * its window's spend ages out (the header's "When a refused bucket admits
 * again"). Call after {@link prune}.
 *
 * @param {object} record
 * @param {Bucket} bucket
 * @param {number} micro the hold asked for
 * @param {number} nowMs
 * @return {?number} epoch ms of that UTC midnight; null when the bucket admits now, or never would
 *   (a strict hold larger than the whole limit)
 */
export function resumeAtOf(record, bucket, micro, nowMs) {
  const today = utcDay(nowMs)
  const byDay = new Map(Object.entries(record.days).map(([day, entry]) => [day, entry.spent]))
  let held = 0
  for (const hold of Object.values(record.holds)) {
    held += hold.micro
  }
  byDay.set(today, (byDay.get(today) ?? 0) + held)
  let remaining = 0
  for (const spent of byDay.values()) {
    remaining += spent
  }
  if (admits(bucket, remaining, micro)) {
    return null
  }
  for (const day of [...byDay.keys()].sort()) {
    remaining -= byDay.get(day)
    if (admits(bucket, remaining, micro)) {
      // Day D is in the window while now < D + windowDays (prune).
      return Date.parse(`${day}T00:00:00.000Z`) + (bucket.windowDays * DAY_MS)
    }
  }
  return null
}


/**
 * Read-modify-write one key under compare-and-swap (`blobCas.js`, shared
 * with the metering ledger), failing as {@link LedgerUnavailableError}.
 *
 * @param {object} store
 * @param {string} key
 * @param {Function} change `(record) => result`; mutates the record to write
 *   it, or returns `{write: false, ...}` to leave the store alone
 * @return {Promise<*>} what `change` returned on the attempt that stuck
 * @throws {LedgerUnavailableError}
 */
function compareAndSwap(store, key, change) {
  return sharedCompareAndSwap(store, key, {
    normalize,
    change,
    fail: (reason, cause) => new LedgerUnavailableError(reason, cause ? {cause} : {}),
  })
}


/**
 * @typedef {object} Bucket
 * @property {string} name 'identity', 'ip' or 'breaker': which one refused, for the response
 * @property {string} key the blob key
 * @property {number} limit micro-USD this bucket may spend in its window
 * @property {number} windowDays how many UTC days its spend is summed over
 * @property {?number} [freeRequestsPerDay] cap on free-model requests, or none
 * @property {?number} [concurrency] cap on in-flight holds, or none
 * @property {boolean} [soft] admit while under the limit rather than only when the hold fits
 *   (the header's "Soft and strict budgets")
 * @property {Array<{days: number, limit: number}>} [windows] nested caps, all enforced: a day, 7
 *   days and the period (src/quota/aiCredits.js). Without, the one `{windowDays, limit}`
 * @property {('self'|{start: number})} [period] the per-user metering period the spend is
 *   counted in ({@link applyPeriod}); none for a rolling window
 */


/**
 * Take a hold on one bucket.
 *
 * @param {object} store
 * @param {Bucket} bucket
 * @param {{id: string, micro: number, free: boolean, nowMs: number}} hold
 * @return {Promise<object>} `{ok, reason?, used, limit, resumeAt?}`: `reason` is 'budget', 'free_requests' or
 *   'concurrency' when refused, `used` is before this hold, and a budget refusal's `resumeAt`
 *   is {@link resumeAtOf}'s
 */
export function reserve(store, bucket, {id, micro, free, nowMs}) {
  return compareAndSwap(store, bucket.key, (record) => {
    prune(record, nowMs, keptDays(bucket))
    const period = applyPeriod(record, bucket, nowMs)
    const {freeToday, inFlight} = usageOf(record, nowMs)
    const standing = windowStanding(record, bucket, nowMs, period)
    const refuse = (reason, at = standing) => ({write: false, ok: false, reason, used: at.used, limit: at.limit})
    if (Number.isInteger(bucket.concurrency) && inFlight >= bucket.concurrency) {
      return refuse('concurrency')
    }
    if (free && Number.isInteger(bucket.freeRequestsPerDay) && freeToday >= bucket.freeRequestsPerDay) {
      return refuse('free_requests')
    }
    const refusing = windowsOf(bucket).map((w) => ({w, ...windowUsage(record, nowMs, w, period)}))
      .filter(({w, used}) => !admits({...bucket, limit: w.limit}, used, micro))
    if (refusing.length > 0) {
      // The cap reached: every window that refuses, and the user waits for the
      // last of them to admit again.
      const resumes = refusing.map(({w}) => windowResumeAt(record, bucket, w, micro, nowMs, period))
      const resumeAt = resumes.includes(null) ? null : Math.max(...resumes)
      return {...refuse('budget', {used: refusing[0].used, limit: refusing[0].w.limit}), resumeAt,
        windowDays: refusing.map(({w}) => w.days)}
    }
    record.holds[id] = {micro, free: free ? 1 : 0, at: nowMs}
    return {ok: true, used: standing.used, limit: standing.limit}
  })
}


/**
 * How many UTC days a bucket's record keeps. A bucket with a period keeps
 * one more than its window: a period that began at noon on its first day is
 * still running on the calendar's 31st day until noon, and its first day's
 * spend must count until then (review on Share#2368).
 *
 * @param {Bucket} bucket
 * @return {number}
 */
function keptDays(bucket) {
  return bucket.period ? bucket.windowDays + 1 : bucket.windowDays
}


/**
 * A bucket's cap windows: its nested `windows` (day, 7 days, the period),
 * or the one window `{windowDays, limit}` of a bucket that has none.
 *
 * @param {Bucket} bucket
 * @return {Array<{days: number, limit: number}>}
 */
function windowsOf(bucket) {
  return Array.isArray(bucket.windows) && bucket.windows.length > 0 ?
    bucket.windows :
    [{days: bucket.windowDays, limit: bucket.limit}]
}


/**
 * The metering period a bucket's spend is counted in, if it has one, with
 * the days before it dropped from the record. Mutates `record`.
 *
 *  - `period: {start}`: given (an anonymous identity's period is its
 *    metering token's, `_lib/meteringToken.js`).
 *  - `period: 'self'`: kept in the record (`periodStart`), for a signed-in
 *    identity: a period runs PERIOD_MS from the first metered use after the
 *    last one ended. With none running, every day is dropped, and the next
 *    spend booked starts one ({@link settle}, at the hold's time); a released
 *    hold starts nothing.
 *  - none: no period, the rolling `windowDays` as before (the IP bucket and
 *    the breakers).
 *
 * @param {object} record
 * @param {Bucket} bucket
 * @param {number} nowMs
 * @return {?{start: number, end: number}}
 */
function applyPeriod(record, bucket, nowMs) {
  let start = null
  if (bucket.period && Number.isFinite(bucket.period.start)) {
    start = bucket.period.start
  } else if (bucket.period === 'self' && Number.isFinite(record.periodStart) &&
      nowMs < record.periodStart + PERIOD_MS) {
    start = record.periodStart
  }
  if (!bucket.period) {
    return null
  }
  const firstDay = start === null ? null : utcDay(start)
  for (const day of Object.keys(record.days)) {
    if (firstDay === null || day < firstDay) {
      delete record.days[day]
    }
  }
  if (start === null) {
    delete record.periodStart
    return null
  }
  return {start, end: start + PERIOD_MS}
}


/**
 * Spend inside one window (its days, and not before the period's first day)
 * plus every live hold.
 *
 * @param {object} record
 * @param {number} nowMs
 * @param {{days: number}} w
 * @param {?{start: number}} period
 * @return {{used: number}}
 */
function windowUsage(record, nowMs, w, period) {
  return {used: windowView(record, nowMs, w.days, period).used}
}


/**
 * @param {object} record
 * @param {number} nowMs
 * @param {number} days
 * @param {?{start: number}} period
 * @return {{record: object, used: number}} the record with only the window's days, and its usage
 */
function windowView(record, nowMs, days, period) {
  // The period's own window is the whole period, from its first day, which
  // can be 31 calendar days back on its last day.
  let oldest = period && days * DAY_MS >= PERIOD_MS ? utcDay(period.start) : utcDay(nowMs - ((days - 1) * DAY_MS))
  if (period) {
    const periodDay = utcDay(period.start)
    oldest = periodDay > oldest ? periodDay : oldest
  }
  const view = {...record, days: {}}
  for (const [day, entry] of Object.entries(record.days)) {
    if (day >= oldest) {
      view.days[day] = entry
    }
  }
  return {record: view, used: usageOf(view, nowMs).used}
}


/**
 * The window nearest its cap (by the share of it used), as `{used, limit}`:
 * what the relay reports in `x-bldrs-ai-used` / `x-bldrs-ai-limit`.
 *
 * @param {object} record
 * @param {Bucket} bucket
 * @param {number} nowMs
 * @param {?{start: number}} period
 * @return {{used: number, limit: number}}
 */
function windowStanding(record, bucket, nowMs, period) {
  let best = null
  for (const w of windowsOf(bucket)) {
    const {used} = windowUsage(record, nowMs, w, period)
    const share = w.limit > 0 ? used / w.limit : Infinity
    if (best === null || share > best.share) {
      best = {share, used, limit: w.limit}
    }
  }
  return {used: best.used, limit: best.limit}
}


/**
 * When one refusing window admits again: as its oldest days age out
 * ({@link resumeAtOf}), and at the latest when the period ends, which frees
 * everything. The period's own window frees only then.
 *
 * @param {object} record
 * @param {Bucket} bucket
 * @param {{days: number, limit: number}} w
 * @param {number} micro
 * @param {number} nowMs
 * @param {?{start: number, end: number}} period
 * @return {?number} epoch ms
 */
function windowResumeAt(record, bucket, w, micro, nowMs, period) {
  if (period && w.days * DAY_MS >= PERIOD_MS) {
    return period.end
  }
  const at = resumeAtOf(windowView(record, nowMs, w.days, period).record, {...bucket, limit: w.limit, windowDays: w.days},
    micro, nowMs)
  if (!period) {
    return at
  }
  return at === null ? period.end : Math.min(at, period.end)
}


/**
 * When a bucket that refuses `micro` now admits it again, over all its
 * windows: the last of them. Read-only; call after {@link prune}.
 *
 * @param {object} record
 * @param {Bucket} bucket
 * @param {number} micro
 * @param {number} nowMs
 * @return {?number}
 */
function bucketResumeAt(record, bucket, micro, nowMs) {
  const period = applyPeriod(record, bucket, nowMs)
  let latest = null
  for (const w of windowsOf(bucket)) {
    if (admits({...bucket, limit: w.limit}, windowUsage(record, nowMs, w, period).used, micro)) {
      continue
    }
    const at = windowResumeAt(record, bucket, w, micro, nowMs, period)
    if (at === null) {
      return null
    }
    latest = latest === null ? at : Math.max(latest, at)
  }
  return latest
}


/**
 * Carry an anonymous identity's spend into a signed-in one at the link at
 * sign-in (netlify/functions/meter.js, design/new/quotas.md §"Link at
 * sign-in"): the anonymous token's days are added to the account's, so the
 * visitor's day, 7-day and period spend count toward the account's caps.
 * Once per token: `carryId` (a keyed digest of the token, never its id) is
 * remembered in the account's record, so a retry adds nothing. An account
 * with no period running starts one at the token's period start.
 *
 * @param {object} store the AI ledger
 * @param {object} carry
 * @param {string} carry.fromKey the anonymous bucket's key
 * @param {string} carry.toKey the account's bucket key
 * @param {string} carry.carryId
 * @param {{start: number}} carry.tokenPeriod
 * @param {number} carry.nowMs
 * @return {Promise<{carried: boolean, micro: number}>}
 * @throws {LedgerUnavailableError}
 */
export async function carryAnonymousSpend(store, {fromKey, toKey, carryId, tokenPeriod, nowMs}) {
  let from
  try {
    from = normalize((await store.getWithMetadata(fromKey, {type: 'json', consistency: 'strong'}))?.data)
  } catch (err) {
    throw new LedgerUnavailableError('store', {cause: err})
  }
  const days = Object.entries(from.days).filter(([day]) => day >= utcDay(tokenPeriod.start))
  const micro = days.reduce((sum, [, entry]) => sum + entry.spent, 0)
  if (micro === 0) {
    return {carried: false, micro: 0}
  }
  const {carried} = await compareAndSwap(store, toKey, (record) => {
    if ((record.carried ?? []).includes(carryId)) {
      return {write: false, carried: false, micro: 0}
    }
    if (!(Number.isFinite(record.periodStart) && nowMs < record.periodStart + PERIOD_MS)) {
      record.periodStart = tokenPeriod.start
    }
    for (const [day, entry] of days) {
      addToDay(record, day, entry.spent, 0)
    }
    record.carried = [...(record.carried ?? []), carryId]
    return {carried: true}
  })
  return {carried, micro: carried ? micro : 0}
}


/**
 * Settle a hold to what the request actually cost, or release it (`micro`
 * 0 and `release` true: the request never reached a billing upstream, so a
 * free-model request isn't counted either).
 *
 * @param {object} store
 * @param {Bucket} bucket
 * @param {object} settlement `{id, micro, nowMs, release, estimate}`; `release`
 *   defaults to false. `estimate: {generation}` marks `micro` as a guess (the
 *   reservation, booked when no `usage.cost` arrived): it is kept beside the
 *   day's spend with the OpenRouter generation id when known, so a
 *   reconciliation through `/api/v1/generation` can correct it later.
 * @return {Promise<void>}
 */
export function settle(store, bucket, {id, micro, nowMs, release = false, estimate = null}) {
  return compareAndSwap(store, bucket.key, (record) => {
    const hold = record.holds[id]
    if (!hold) {
      // Nothing to settle: this hold was settled already (a retry whose
      // earlier attempt landed but whose answer was lost) or it has expired
      // into spend at its reservation (prune). Either way, writing would
      // double-count, so this writes nothing and says so; the caller records
      // an expired one for reconciliation (ai-chat.js settleOrRecord).
      return {write: false, settled: false}
    }
    delete record.holds[id]
    prune(record, nowMs, keptDays(bucket))
    if (release) {
      return {settled: true}
    }
    if (bucket.period === 'self' && !(Number.isFinite(record.periodStart) && hold.at < record.periodStart + PERIOD_MS)) {
      // The first metered use with no period running starts one (src/quota/period.js).
      record.periodStart = hold.at
    }
    addToDay(record, utcDay(nowMs), micro, hold.free)
    if (estimate) {
      record.estimates[id] = {micro, day: utcDay(nowMs), generation: estimate.generation ?? null}
    }
    return {settled: true}
  })
}


export const SETTLE_ATTEMPTS = 3
const SETTLE_BACKOFF_BASE_MS = 100
const SETTLE_BACKOFF_JITTER_MS = 100


/**
 * {@link settle}, retried a few times when the store fails (each attempt is
 * already a compare-and-swap loop; this covers a store outage or a burst of
 * contention that outlasts one). Safe to retry because settle is
 * idempotent: an attempt that landed removed the hold, so a later attempt
 * finds none and writes nothing. Stops early past `deadline`.
 *
 * @param {object} store
 * @param {Bucket} bucket
 * @param {object} settlement as for settle
 * @param {object} [options]
 * @param {number} [options.attempts]
 * @param {number} [options.deadline] epoch ms after which no new attempt starts
 * @return {Promise<object>} `{ok: true, settled, attempts}`, or `{ok: false, attempts, reason}` with
 *   reason 'contention' or 'store'
 */
export async function settleWithRetry(store, bucket, settlement, {attempts = SETTLE_ATTEMPTS, deadline = Infinity} = {}) {
  let reason = 'store'
  let tried = 0
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      if (Date.now() >= deadline) {
        break
      }
      await new Promise((resolve) => {
        setTimeout(resolve, (SETTLE_BACKOFF_BASE_MS * attempt) + Math.floor(Math.random() * SETTLE_BACKOFF_JITTER_MS))
      })
    }
    tried++
    try {
      const {settled} = await settle(store, bucket, settlement)
      return {ok: true, settled, attempts: tried}
    } catch (err) {
      reason = err instanceof LedgerUnavailableError ? err.reason : 'store'
    }
  }
  return {ok: false, attempts: tried, reason}
}


/**
 * Take holds on several buckets, in order, all or nothing: a refusal (or a
 * failure) at one releases the ones already taken. Order the cheap,
 * per-identity buckets first so a refused request rarely touches the shared
 * breaker key.
 *
 * A release that itself fails leaves its hold to expire into spend
 * (HOLD_TTL_MS): an over-count, the safe direction.
 *
 * @param {object} store
 * @param {Array<Bucket>} buckets
 * @param {{id: string, micro: number, free: boolean, nowMs: number}} hold
 * @return {Promise<object>} `{ok: true, standing}`, or `{ok: false, bucket, reason, used, limit,
 *   standing, resumeAt}` naming the bucket that refused (`resumeAt` its own, for a budget refusal, else
 *   null); `standing` maps each bucket reached to its `{used, limit}`
 */
export async function reserveAll(store, buckets, hold) {
  const taken = []
  const standing = {}
  try {
    for (const bucket of buckets) {
      const result = await reserve(store, bucket, hold)
      standing[bucket.name] = {used: result.used, limit: result.limit}
      if (!result.ok) {
        await releaseAll(store, taken, hold)
        return {ok: false, bucket: bucket.name, reason: result.reason, used: result.used, limit: result.limit, standing,
          resumeAt: result.resumeAt ?? null, windowDays: result.windowDays ?? null}
      }
      taken.push(bucket)
    }
  } catch (err) {
    await releaseAll(store, taken, hold)
    throw err
  }
  return {ok: true, standing}
}


/**
 * The latest `resumeAt` among buckets that a refusal didn't reach
 * (reserveAll stops at the first that refuses), given the refusing one's
 * `resumeAt`: when several are exhausted, the user waits for the last. A
 * bucket is read only if it could resume later than `resumeAt` at all (its
 * window reaches past it), so the anonymous buckets, which share a one-day
 * window and so a resume at the next UTC midnight, cost no read. Read-only,
 * strong. A bucket that can't be read is skipped: the answer is an estimate.
 *
 * @param {object} store
 * @param {Array<Bucket>} buckets the ones after the refusing bucket
 * @param {{micro: number, nowMs: number, resumeAt: ?number}} refusal
 * @return {Promise<?number>} epoch ms, or `resumeAt` when none is later
 */
export async function latestResumeAt(store, buckets, {micro, nowMs, resumeAt}) {
  let latest = resumeAt
  const todayStart = Date.parse(`${utcDay(nowMs)}T00:00:00.000Z`)
  for (const bucket of buckets) {
    if (latest !== null && todayStart + (bucket.windowDays * DAY_MS) <= latest) {
      continue
    }
    let current
    try {
      current = await store.getWithMetadata(bucket.key, {type: 'json', consistency: 'strong'})
    } catch {
      continue
    }
    const record = normalize(current?.data)
    prune(record, nowMs, keptDays(bucket))
    const at = bucketResumeAt(record, bucket, micro, nowMs)
    if (at !== null && (latest === null || at > latest)) {
      latest = at
    }
  }
  return latest
}


/**
 * @param {object} store
 * @param {Array<Bucket>} buckets
 * @param {{id: string, nowMs: number}} hold
 * @return {Promise<void>} never rejects
 */
export async function releaseAll(store, buckets, {id, nowMs}) {
  await Promise.all(buckets.map((bucket) =>
    settle(store, bucket, {id, micro: 0, nowMs, release: true}).catch(() => undefined)))
}


/**
 * Settle every bucket to the actual cost, each retried (settleWithRetry). A
 * bucket that still fails, or whose hold had already expired, keeps its
 * reservation as spend: the caller records it for reconciliation
 * (ai-chat.js settleOrRecord, recordForReconciliation below).
 *
 * @param {object} store
 * @param {Array<Bucket>} buckets
 * @param {object} settlement as for settle
 * @param {object} [options] as for settleWithRetry
 * @return {Promise<Array<object>>} per bucket, in order: `{bucket, ...settleWithRetry's result}`
 */
export function settleAll(store, buckets, settlement, options = {}) {
  return Promise.all(buckets.map(async (bucket) =>
    ({bucket, ...await settleWithRetry(store, bucket, settlement, options)})))
}


/**
 * Leave what a reconciliation job needs to correct a request whose spend
 * stayed at its reservation in some bucket: a settle that kept failing, or a
 * hold that expired first. Its own small key, created once (`onlyIfNew`), so
 * it doesn't contend with the bucket keys (the hot breaker key above all) and
 * a retried call can't duplicate it. Never throws.
 *
 * Key: `ai/reconcile/<UTC day>/<requestId>`. Value: `{v, at, tier,
 * generation, actualMicro, reservedMicro, buckets: [{name, key, reason}]}`,
 * where `key` is the bucket's ledger key, so the job knows whose spend to
 * correct (the ledger is keyed by identity already; nothing here leaves the
 * store).
 *
 * @param {object} store
 * @param {object} entry
 * @return {Promise<boolean>} whether it was written (or was already there)
 */
export async function recordForReconciliation(store, entry) {
  const key = `ai/reconcile/${utcDay(entry.at)}/${entry.requestId}`
  try {
    // modified false: a record for this request is there already. Either way it exists.
    await store.set(key, JSON.stringify({v: RECORD_VERSION, ...entry}), {onlyIfNew: true})
    return true
  } catch {
    return false
  }
}
