/**
 * Formatting for the task chip's times (TaskChip.jsx), and the paused turn's
 * resume time (pausedNotice.js). Kept apart so the
 * clock and the zone can be fixed in tests: every function takes the locale
 * and zone it should use, and the panel passes neither, which means the
 * viewer's own.
 */

const MS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60


/**
 * @param {number} ms epoch milliseconds
 * @param {object} [options]
 * @param {string} [options.locale] default the viewer's
 * @param {string} [options.timeZone] an IANA zone, default the viewer's
 * @return {string} the time of day without seconds, in the viewer's locale ("10:01 AM")
 */
export function formatClock(ms, {locale, timeZone} = {}) {
  return new Intl.DateTimeFormat(locale, {hour: 'numeric', minute: '2-digit', timeZone}).format(ms)
}


/**
 * @param {number} ms epoch milliseconds
 * @param {object} [options]
 * @param {string} [options.locale] default the viewer's
 * @param {string} [options.timeZone] an IANA zone, default the viewer's
 * @return {string} the day and the time of day without seconds ("Dec 3, 10:01 AM"), for a time
 *   too far off for the clock alone (the paused turn's resume, pausedNotice.js)
 */
export function formatDayAndClock(ms, {locale, timeZone} = {}) {
  return new Intl.DateTimeFormat(locale, {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone}).format(ms)
}


/**
 * @param {number} ms epoch milliseconds
 * @param {object} [options]
 * @param {string} [options.locale] default the viewer's
 * @param {string} [options.timeZone] an IANA zone, default the viewer's
 * @return {string} date, time with seconds and the zone's short name, for the
 *   hover and for the toggled-open time
 */
export function formatFullTime(ms, {locale, timeZone} = {}) {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
    timeZone,
  }).format(ms)
}


/**
 * Whole seconds, rounded: "0s", "4s", "1m 10s", "2m", "1h 5m". A part that
 * is zero is dropped once a larger unit is shown, so a minute is "1m", not
 * "1m 0s", but a sub-second task still reads "0s".
 *
 * @param {number} ms a span in milliseconds; negative (a clock that stepped back) reads as zero
 * @return {string}
 */
export function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / MS_PER_SECOND))
  const seconds = total % SECONDS_PER_MINUTE
  const minutes = Math.floor(total / SECONDS_PER_MINUTE) % MINUTES_PER_HOUR
  const hours = Math.floor(total / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR))
  const parts = []
  if (hours > 0) {
    parts.push(`${hours}h`)
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`)
  }
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds}s`)
  }
  return parts.join(' ')
}
