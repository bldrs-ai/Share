/**
 * Metering periods: THE one definition of the window every metered limit is
 * counted in (design/new/quotas.md §"Metering periods"). Owner decision
 * 2026-11-25: a per-user 30-day period, the same for an anonymous visitor, a
 * signed-in free user and Pro.
 *
 * - A period starts at the user's first metered use after their previous
 *   period ended, and lasts PERIOD_DAYS. So resets are staggered per user,
 *   never a calendar month and never a sliding window: everything counted in
 *   a period comes back at once, at its end.
 * - An account's period is not stored. It is derived by chaining the
 *   ledger's own timestamps ({@link currentPeriod}): the first row starts a
 *   period, and the first row at or after that period's end starts the next.
 *   So `app_metadata.usageQuota.loads` needed no new field and no migration:
 *   the 7-day rows that were there at the switch chain into a period that
 *   started at the oldest of them.
 * - An anonymous visitor's period is its metering token's life: the token
 *   carries its start, and expires at the period's end
 *   (netlify/functions/_lib/meteringToken.js). A new period is a new,
 *   unrelated token.
 *
 * Dependency-free and imported with its `.js` extension by the functions,
 * which load under plain Node ESM, as `limits.js` is.
 */


/** Length of a metering period, in days. */
export const PERIOD_DAYS = 30

const MILLIS_PER_DAY = 86400000

/** Length of a metering period, in milliseconds. */
export const PERIOD_MS = PERIOD_DAYS * MILLIS_PER_DAY


/**
 * @typedef {object} Period
 * @property {number} start epoch ms, inclusive
 * @property {number} end epoch ms, exclusive: `start + PERIOD_MS`
 */


/**
 * The period that starts at `start`.
 *
 * @param {number} start epoch ms
 * @return {Period}
 */
export function periodStartingAt(start) {
  return {start, end: start + PERIOD_MS}
}


/**
 * Whether `at` is inside `period`. The end is exclusive, the edge every
 * window here has used since Share#1974: a use exactly PERIOD_DAYS after the
 * start is the first of the next period.
 *
 * @param {?Period} period
 * @param {number} at epoch ms
 * @return {boolean}
 */
export function isInPeriod(period, at) {
  return period !== null && period !== undefined && at >= period.start && at < period.end
}


/**
 * The period `now` is in, chained from the metered uses' timestamps, or null
 * when none is running (no use yet, or the last period has ended: the next
 * metered use starts one).
 *
 * The chain walks the uses oldest first. The first starts a period; a use
 * inside the running period joins it; the first use at or after its end
 * starts the next. That is the whole rule, and it is why nothing needs
 * storing: a writer that keeps every row of the running period (and may
 * drop the rest, {@link usesInCurrentPeriod}) keeps the use that started it,
 * so the chain finds the same start next time.
 *
 * Unparseable timestamps are skipped. A use in the future (clock skew
 * between the browser mirror and the server) still chains; it just starts
 * or joins a period `now` is not yet in, so it does not count.
 *
 * @param {Array<number>} uses epoch ms of each metered use, any order
 * @param {number} now epoch ms
 * @return {?Period}
 */
export function currentPeriod(uses, now) {
  if (!Array.isArray(uses)) {
    return null
  }
  const sorted = uses.filter((t) => Number.isFinite(t)).sort((a, b) => a - b)
  let period = null
  for (const at of sorted) {
    if (period === null || at >= period.end) {
      period = periodStartingAt(at)
    }
  }
  return isInPeriod(period, now) ? period : null
}


/**
 * The rows of a ledger that count at `now`: those inside the current period
 * ({@link currentPeriod}, chained from the rows' own `at(row)`). Everything
 * else is from an ended period and may be dropped by a writer.
 *
 * @template T
 * @param {Array<T>} rows anything else is an empty ledger
 * @param {number} now epoch ms
 * @param {function(T): number} at a row's timestamp, epoch ms
 * @return {{period: ?Period, rows: Array<T>}}
 */
export function usesInCurrentPeriod(rows, now, at) {
  if (!Array.isArray(rows)) {
    return {period: null, rows: []}
  }
  const period = currentPeriod(rows.map(at), now)
  return {period, rows: period ? rows.filter((row) => isInPeriod(period, at(row))) : []}
}
