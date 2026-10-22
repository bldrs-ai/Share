import {FUNNEL_EVENTS, gtagFunnelEvent, isAllowed} from './analytics'
import {withCrossTabLock} from './crossTabLock'


/*
 * Engaged-use conversion events (Share#1960, bizdev#339 option (b)):
 *
 *   engaged_use   the open that makes this browser's 3rd real model open
 *                 inside a rolling 7 days; at most once per browser per 30 days
 *   return_visit  an open, on a later calendar day, by a browser whose previous
 *                 open was 1-14 days earlier; at most once per return day
 *
 * Both are observe-only secondary conversions for Google Ads. GA4 cannot
 * express "3rd open in a rolling 7 days" itself, so the count is kept in the
 * browser, in localStorage, and the event is sent when it is reached.
 *
 * "Open" is whatever CadView counts as `real_model_open`: it calls
 * trackEngagementOnOpen from inside the isRealModelOpen branch, so the bundled
 * hosted demos and every *.netlify.app host (review and CI traffic) never
 * reach here, and gtag/js itself only loads on prod hosts (index/ga.js
 * #shouldInitGa). Exclusion is therefore inherited rather than re-implemented.
 * That is a host and demo exclusion only: team members' own opens on
 * bldrs.ai are counted here as for real_model_open, and are filtered at
 * query time on the bizdev dashboard (GA_CONFIG.orgUsers), not in the client.
 *
 * Storage failure fails CLOSED. With no way to remember an open, the only
 * alternative is a per-page counter, which would fire engaged_use for anyone
 * who opens a few models in one session and would re-fire it every reload.
 * An under-count is the safe error for a conversion that Ads may learn from.
 */

export const ENGAGEMENT_STORAGE_KEY = 'bldrs.ga.engagement'

export const ENGAGED_OPENS_THRESHOLD = 3
export const ENGAGED_WINDOW_DAYS = 7
export const ENGAGED_COOLDOWN_DAYS = 30
export const RETURN_MIN_DAYS = 1
export const RETURN_MAX_DAYS = 14

// Newest opens kept. Only the last ENGAGED_OPENS_THRESHOLD matter for the
// window count and only the newest for the return gap; the slack keeps a
// hand-edited or older-shaped list harmless.
export const MAX_STORED_OPENS = 10

/** Forget the page-load model memory. Test seam only. */
export function resetEngagementPageState() {
  lastCountedModelKey = null
}

const MS_PER_DAY = 24 * 60 * 60 * 1000 // eslint-disable-line no-magic-numbers

// The model the last counted open in THIS page load was for. CadView reloads
// the loaded model without the user opening anything (a theme change or
// Widget API view settings re-create the viewer, which re-runs the load, and
// each success sends real_model_open again), and counting those would let
// toggling the theme twice on one model read as engaged use. A different
// model, or a fresh page load, counts as a new open. Known under-count: A,
// then the demo (never tracked, so it does not clear this), then A again in
// one page load is skipped; that is the safe error for this conversion.
let lastCountedModelKey = null


/**
 * Local calendar day as a sortable key. Local, not UTC, because "came back
 * the next day" is how the user experienced it: a UTC day would split an
 * evening session in the Americas in two.
 *
 * @param {number} ms epoch milliseconds
 * @return {string} e.g. '2026-10-22'
 */
function localDayKey(ms) {
  const date = new Date(ms)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}


/**
 * Whole local calendar days from `fromMs` to `toMs`. Computed on the day
 * keys at UTC midnight so a DST change cannot make a day 23 or 25 hours.
 *
 * @param {number} fromMs
 * @param {number} toMs
 * @return {number}
 */
function calendarDaysBetween(fromMs, toMs) {
  const asUtcDay = (ms) => Date.parse(`${localDayKey(ms)}T00:00:00Z`)
  return Math.round((asUtcDay(toMs) - asUtcDay(fromMs)) / MS_PER_DAY)
}


/**
 * Read the stored state, tolerating junk. Throws only when storage itself is
 * unavailable, which the caller treats as "do nothing".
 *
 * @return {{opens: number[], engagedAt: ?number, returnDay: ?string}}
 */
function readState() {
  const raw = localStorage.getItem(ENGAGEMENT_STORAGE_KEY)
  let parsed = null
  if (raw) {
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = null
    }
  }
  const opens = Array.isArray(parsed?.opens) ? parsed.opens.filter(Number.isFinite) : []
  return {
    opens,
    engagedAt: Number.isFinite(parsed?.engagedAt) ? parsed.engagedAt : null,
    returnDay: typeof parsed?.returnDay === 'string' ? parsed.returnDay : null,
  }
}


/**
 * Record one real model open and send engaged_use / return_visit when this
 * open earns them. Call once per real open, after real_model_open is sent.
 *
 * Writes nothing and sends nothing when the user has opted out of analytics, when
 * localStorage is unavailable, or when the write fails (the state that would
 * stop a repeat could not be saved).
 *
 * The read-compare-write-emit runs under a Web Lock named for the storage key
 * so two tabs opening at once cannot both read the old state and both emit.
 * Without the Web Locks API the race remains, as for the other funnel
 * trackers (crossTabLock.js).
 *
 * @param {number} [now] epoch milliseconds; parameterized for tests
 * @param {string} [modelKey] identity of the model opened. When it equals the
 *   previous counted open's in this page load the call is a reload of the
 *   same model and counts nothing. Omit to always count.
 * @return {Promise<string[]>} names of the events sent
 */
export function trackEngagementOnOpen(now = Date.now(), modelKey = undefined) {
  if (!isAllowed()) {
    return Promise.resolve([])
  }
  if (modelKey !== undefined) {
    if (modelKey === lastCountedModelKey) {
      return Promise.resolve([])
    }
    lastCountedModelKey = modelKey
  }
  return withCrossTabLock(ENGAGEMENT_STORAGE_KEY, () => {
    let state
    try {
      state = readState()
    } catch {
      return []
    }

    // A stored time ahead of `now` means the clock moved back since it was
    // written. Such an entry cannot be placed in any window, so it is dropped
    // rather than counted as "just now" forever.
    const past = state.opens.filter((t) => t <= now)
    const previousOpen = past.length > 0 ? Math.max(...past) : null
    const windowOpens = past.filter((t) => now - t < ENGAGED_WINDOW_DAYS * MS_PER_DAY)
    const opensInWindow = windowOpens.length + 1

    // The same clock step-back applies to the last engaged_use: the open that
    // sent it is dropped from `past` above as future-stamped, but the opens
    // before it are still in the window, so the next open would make three
    // again and send a second engaged_use minutes after the first. Clamp the
    // stamp to now instead, which keeps the cooldown running and restarts its
    // 30 days from the corrected clock.
    if (state.engagedAt !== null && state.engagedAt > now) {
      state.engagedAt = now
    }

    const events = []
    if (opensInWindow >= ENGAGED_OPENS_THRESHOLD &&
        (state.engagedAt === null ||
          now - state.engagedAt >= ENGAGED_COOLDOWN_DAYS * MS_PER_DAY)) {
      events.push([FUNNEL_EVENTS.ENGAGED_USE, {
        window_days: ENGAGED_WINDOW_DAYS,
        opens_in_window: opensInWindow,
        threshold: ENGAGED_OPENS_THRESHOLD,
      }])
      state.engagedAt = now
    }

    if (previousOpen !== null) {
      const daysSince = calendarDaysBetween(previousOpen, now)
      if (daysSince >= RETURN_MIN_DAYS && daysSince <= RETURN_MAX_DAYS &&
          state.returnDay !== localDayKey(now)) {
        events.push([FUNNEL_EVENTS.RETURN_VISIT, {days_since_last_open: daysSince}])
        state.returnDay = localDayKey(now)
      }
    }

    try {
      localStorage.setItem(ENGAGEMENT_STORAGE_KEY, JSON.stringify({
        opens: [...past, now].slice(-MAX_STORED_OPENS),
        engagedAt: state.engagedAt,
        returnDay: state.returnDay,
      }))
    } catch {
      return []
    }

    events.forEach(([name, params]) => gtagFunnelEvent(name, params))
    return events.map(([name]) => name)
  })
}
