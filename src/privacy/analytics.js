import Cookies from 'js-cookie'
import {assertDefined} from '../utils/assert'
import {isFeatureEnabled} from '../FeatureFlags'
import Expires from './Expires'


const COOKIE_NAME = 'isAnalyticsAllowed'
const DEFAULT_VALUE = true


/** @return {boolean} */
export function isAllowed() {
  const val = Cookies.get(COOKIE_NAME)
  return val === undefined ? DEFAULT_VALUE : val === 'true'
}


/**
 * @param {boolean} allowed
 */
export function setIsAllowed(allowed) {
  assertDefined(allowed)
  Cookies.set(COOKIE_NAME, allowed, {expires: Expires.DAYS})
  // gtagEvent re-reads consent on every call, so withholding it is
  // enough to stop our own events. A user property is different: it is
  // sticky once set, and gtag/js keeps attaching it to the automatic
  // events it sends on its own (page_view, user_engagement) for the
  // rest of the page's life — including after an opt-out, since
  // index/ga.js has no way to unload the tag it already injected.
  // Withdrawal therefore has to clear it explicitly.
  syncUserCidProperty()
}


/**
 * @param {string} eventName
 * @param {object} parameters
 */
export function gtagEvent(eventName, parameters) {
  if (window.location.hostname.startsWith('deploy-preview-') &&
      window.location.hostname.endsWith('.netlify.app') &&
      isFeatureEnabled('gaEnableInPreview')) {
    // Preview-only observability: production stays quiet, while a smoke test
    // remains inspectable even when browser privacy tooling blocks gtag/js.
    // eslint-disable-next-line no-console
    console.info(`[ga] event ${eventName}`, parameters)
  }
  if (window.gtag && isAllowed()) {
    window.gtag('event', eventName, parameters)
  }
}


/**
 * Track foreground engagement with one loaded model. Durations are emitted
 * when the page loses focus/visibility, unloads, or the next model replaces
 * this one. This follows GA4's foreground-engagement semantics while keeping
 * the model identity explicit instead of relying on a mutable page title.
 *
 * The duration rides in `engagement_time_msec`, which is GA4's own reserved
 * parameter rather than a name of our choosing. Two consequences, both
 * load-bearing:
 *
 *   1. It can never be a custom metric. Admin → Custom definitions rejects
 *      the name inline with "Parameter name is not allowed for this scope"
 *      (tried 2026-08-21), so `customEvent:engagement_time_msec` never
 *      resolves and a Data API report naming it 400s forever.
 *   2. It doesn't need to be. GA4 reserves the name precisely because it
 *      consumes it to compute the standard `userEngagementDuration` metric,
 *      so these intervals are already queryable with no GA4-side
 *      registration at all: metric `userEngagementDuration`, dimension
 *      `customEvent:content_id`, filtered to eventName `model_engagement`
 *      — which is what the bizdev dashboard reads (bizdev `ga/README.md`
 *      §"Model engagement"). That total is across *all* users and cannot
 *      be anything else: unlike `real_model_open` this event carries no
 *      `open_cid`, so there is nothing to key a person to. Mind the unit
 *      too — the metric reports seconds, against the milliseconds sent
 *      from here.
 *
 * So the name is fixed, not incidental. Renaming it to something
 * registerable would take these durations straight back out of
 * `userEngagementDuration` — where every consumer now reads them — in
 * exchange for a custom metric that has to be created GA4-side first.
 *
 * Sending it explicitly is also what ties the interval to *this* model:
 * gtag accrues foreground time on its own and attaches it to whatever event
 * it sends next, which is neither model-scoped nor aligned with the
 * visibility windows tracked here.
 *
 * How gtag reconciles the two is unverified, and the answer decides how
 * exact the reported total is: if it replaces its accrued value with the
 * one sent here, the metric is these intervals; if it adds the two, the
 * metric runs high. So treat per-model engagement as close rather than
 * exact until a DebugView pass (or a look at `_et` on the collect beacon)
 * settles it — and don't write "GA4 summed exactly what we sent" anywhere
 * downstream before then.
 *
 * @param {object} modelParams stable `content_id` / `content_type` identity
 * @return {Function} idempotent stop function that flushes the final interval
 */
export function startModelEngagement(modelParams) {
  let startedAt = null
  let stopped = false
  const isForeground = () => document.visibilityState === 'visible' && document.hasFocus()
  const resume = () => {
    if (!stopped && startedAt === null && isForeground()) {
      startedAt = performance.now()
    }
  }
  const pause = () => {
    if (startedAt === null) {
      return
    }
    const engagementTimeMs = Math.round(performance.now() - startedAt)
    startedAt = null
    if (engagementTimeMs > 0) {
      gtagEvent('model_engagement', {
        ...modelParams,
        engagement_time_msec: engagementTimeMs,
        transport_type: 'beacon',
      })
    }
  }
  const onVisibilityChange = () => isForeground() ? resume() : pause()

  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('focus', resume)
  window.addEventListener('blur', pause)
  window.addEventListener('pagehide', pause)
  window.addEventListener('pageshow', resume)
  resume()

  return () => {
    if (stopped) {
      return
    }
    pause()
    stopped = true
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('focus', resume)
    window.removeEventListener('blur', pause)
    window.removeEventListener('pagehide', pause)
    window.removeEventListener('pageshow', resume)
  }
}


/*
 * GA4's client id, captured at init by index/ga.js.
 *
 * The GA4 Data API exposes no user-id dimension, so per-user open
 * depth ("how many people opened exactly one model vs six or more")
 * can't be derived — only the eventCount ÷ totalUsers average. Sending
 * the client id as the OPEN_CID_PARAM event param, with a matching
 * event-scoped custom dimension registered GA4-side, makes the
 * distribution queryable: customEvent:open_cid × eventCount, bucketed
 * client-side.
 *
 * Null wherever GA never initializes — off-prod, under automation, or
 * on blocked clients — so events simply omit the param there rather
 * than carrying a placeholder that would form its own bogus bucket. No
 * backfill: the dimension only accrues data from ship time forward.
 *
 * At much larger scale GA4 rolls high-cardinality dimension values
 * into "(other)"; that's the signal to graduate this query to the
 * BigQuery export.
 */
let gaClientId = null


/*
 * NOT `ga_cid`: GA4 reserves the `ga_`, `google_`, `firebase_` and
 * `gtag.` prefixes (plus a leading underscore) for event and parameter
 * names, and silently disables anything that matches — the param would
 * be dropped at ingestion with no error, leaving the custom dimension
 * permanently empty.
 */
export const OPEN_CID_PARAM = 'open_cid'


/*
 * Hour of day in the *user's* timezone, on model-open events.
 *
 * GA4 already has an `hour` dimension, but it is in the property's
 * timezone, which says nothing about when someone in Milan or São Paulo
 * actually works — and real authored opens are a Europe + Brazil story
 * (bizdev growth-strategy §2).
 */
export const LOCAL_HOUR_PARAM = 'local_hour'


/*
 * Prefix on the LOCAL_HOUR_PARAM value, for the same reason
 * OPEN_CID_PREFIX exists: gtag types each param when it builds the
 * beacon, and anything that parses as a number goes out as `epn.`,
 * which an event-scoped custom *dimension* will not populate from.
 *
 * Zero-padding alone does NOT achieve this — `Number('08')` is 8, so
 * every one of the 24 values would still be numeric and the dimension
 * would stay empty. The padding is kept only so values sort correctly
 * and read like GA4's own `hour`.
 */
const LOCAL_HOUR_PREFIX = 'h.'


/**
 * The LOCAL_HOUR_PARAM value for right now: the browser's hour, padded
 * and prefixed so GA4 stores it as text.
 *
 * @return {string} e.g. 'h.09'
 */
export function getLocalHour() {
  const HOUR_DIGITS = 2
  return `${LOCAL_HOUR_PREFIX}${String(new Date().getHours()).padStart(HOUR_DIGITS, '0')}`
}


// Cookie GA writes the client id into, as `GA<version>.<domain depth>.<id>`
// where the id itself contains a dot (GA1.1.1234567890.0987654321).
const GA_COOKIE_NAME = '_ga'
const GA_COOKIE_ID_OFFSET = 2


/**
 * Record the GA4 client id. Ignores anything but a non-empty string —
 * gtag's `get` callback yields undefined when the property isn't
 * loaded yet, and a falsy id is worse than none.
 *
 * @param {string} cid
 */
export function setGaClientId(cid) {
  if (typeof cid === 'string' && cid.length > 0) {
    gaClientId = cid
  }
}


/**
 * The client id from gtag's async `get` callback, falling back to the
 * `_ga` cookie gtag/js writes synchronously on config.
 *
 * The fallback matters more than it looks: the callback only resolves
 * after gtag/js loads, and any event fired before then still reaches
 * GA4 (gtagEvent buffers into dataLayer, which gtag/js drains on load)
 * — just without the param. That window sits at session start, so the
 * losses would concentrate on each visitor's *first* open, which is
 * exactly the "1 open" cohort this instrumentation exists to size.
 *
 * @return {string|null} GA4 client id, or null if unavailable
 */
export function getGaClientId() {
  return gaClientId ?? gaClientIdFromCookie()
}


/*
 * Tag prefixing the client id in the OPEN_CID_PARAM value, so the value
 * can never be read as a number.
 *
 * A raw client id is numeric-looking by construction
 * ("1871520000.1754700000"), and gtag classifies each event param as
 * text or numeric when it builds the collect beacon — numeric-looking
 * values go out as `epn.` (number) instead of `ep.` (text). Landing in
 * the numeric slot has two consequences, both observed in the GA4 UI as
 * a value rendered "1.87152e+09":
 *
 *   1. float64 holds ~15-17 significant digits against the id's 20, so
 *      "1871520000.1754700000" truncates to 1871520000.17547 and
 *      distinct clients silently collide — fatal for a per-user count.
 *   2. An event-scoped custom *dimension* (text) doesn't populate from
 *      a numeric param at all.
 *
 * The same coercion bites downstream of GA4 too: any CSV/Sheets export
 * of a bare id re-parses it to a float on open.
 *
 * A non-digit prefix removes the ambiguity everywhere at once. It makes
 * the value opaque rather than joinable against a raw client id, which
 * this metric doesn't need — it only ever counts events per distinct
 * value.
 */
const OPEN_CID_PREFIX = 'cid.'


/**
 * The OPEN_CID_PARAM value for the current client: the client id
 * tagged so GA4 stores it as text. Null when no id is available, in
 * which case callers must omit the param rather than send a blank.
 *
 * @return {string|null}
 */
export function getOpenCid() {
  const cid = getGaClientId()
  return cid === null ? null : `${OPEN_CID_PREFIX}${cid}`
}


/*
 * Name of the GA4 *user property* carrying the same value as
 * OPEN_CID_PARAM. Same string on purpose — it is the same identifier,
 * and GA4 keeps event parameters and user properties in separate
 * namespaces, so an event-scoped and a user-scoped custom dimension can
 * both be registered from `open_cid` without colliding.
 */
export const OPEN_CID_USER_PROPERTY = OPEN_CID_PARAM


/**
 * Publish the client id as a user property as well as an event param.
 *
 * The event param answers "how many models did this person open",
 * because it rides on real_model_open. It cannot answer anything else:
 * an event-scoped dimension exists only on the events that carry it, so
 * session count, engagement duration, landing page and
 * new-vs-returning are unreachable per user no matter how the GA4 Data
 * API query is written — filtering to real_model_open yields no
 * engagement, and not filtering yields "(not set)" for every other
 * event. A user property attaches to *every* subsequent event and
 * session from this browser, which is what makes those queryable.
 *
 * Requires a matching User-scoped custom dimension GA4-side; without
 * one the property is collected but not reportable. No backfill, as
 * ever.
 *
 * Called twice by index/ga.js by design — once at setup, so events
 * fired before gtag/js resolves the id still carry it via the `_ga`
 * cookie fallback, and again from the `get` callback, which is the
 * only path that works for a first-ever visitor who has no cookie yet.
 * Setting it twice with the same value is a no-op GA4-side.
 */
export function setUserCidProperty() {
  syncUserCidProperty()
}


/**
 * Publish or retract the user property to match current consent.
 *
 * Reads isAllowed() rather than taking the decision as an argument, so
 * a caller passing something merely truthy — setIsAllowed('false')
 * writes a cookie that isAllowed() then reads as a denial — cannot
 * publish an identifier the cookie says is not allowed. Consent gates
 * should fail closed.
 *
 * Retraction sets the property to null. Verify in GA4 DebugView that
 * this actually clears it, rather than storing null as a value, before
 * PrivacyControl is restored to the UI (AboutDialog has it commented
 * out today, so nothing in the app can currently withdraw consent). If
 * null does not clear, this is the one place to change.
 */
function syncUserCidProperty() {
  if (!window.gtag) {
    return
  }
  if (!isAllowed()) {
    window.gtag('set', 'user_properties', {[OPEN_CID_USER_PROPERTY]: null})
    return
  }
  const cid = getOpenCid()
  if (cid) {
    window.gtag('set', 'user_properties', {[OPEN_CID_USER_PROPERTY]: cid})
  }
}


/** @return {string|null} client id parsed from the `_ga` cookie */
function gaClientIdFromCookie() {
  const raw = Cookies.get(GA_COOKIE_NAME)
  if (!raw) {
    return null
  }
  const parts = raw.split('.')
  if (parts.length <= GA_COOKIE_ID_OFFSET) {
    return null
  }
  const cid = parts.slice(GA_COOKIE_ID_OFFSET).join('.')
  return cid.length > 0 ? cid : null
}


/** Test-only reset for the captured client id. */
export function _resetGaClientIdForTests() {
  gaClientId = null
}


/**
 * True for model loads worth counting as the `real_model_open` GA event:
 * any remote source (GitHub, Google Drive, generic URL) or an uploaded
 * file. False for the bundled demo model the homepage auto-loads
 * (navToDefault → /share/v/p/index.ifc) — counting it would fire on
 * every homepage visit. real_model_open is a GA4 key event imported
 * into Google Ads as the search campaigns' conversion, so
 * pageview-shaped noise here would poison bidding (bizdev
 * ads-campaign-build §1, growth-strategy §3).
 *
 * Demo detection matches routes.ts#processFile output for hosted
 * project files: {kind: 'file', isUploadedFile: false, filepath}. The
 * filepath check covers uploads on GitHub Pages installs, where
 * processFile's '/share/v/new' prefix test misses ('/Share/share/v/new')
 * and isUploadedFile comes back false — upload filepaths are
 * UUID-derived, never 'index.ifc'.
 *
 * Also false on Netlify hosts (*.netlify.app), except deploy previews with
 * `?feature=gaEnableInPreview`, so ordinary team review sessions don't
 * register as conversions. This is deliberate defense-in-depth behind
 * index/ga.js#shouldInitGa, whose host allowlist keeps gtag/js from loading
 * off-prod unless that same preview override is present. The two predicates
 * differ on purpose and can't be merged:
 * localhost must stay *included* here because the Playwright E2E suite
 * (realModelOpen.spec.ts) asserts this event lands in the dataLayer
 * buffer on localhost, while shouldInitGa excludes localhost from
 * loading GA entirely.
 *
 * @param {object} routeResult from routes.ts#handleRoute
 * @param {string} hostname current page host; parameterized for tests
 * @param {boolean} enableInPreview feature override; parameterized for tests
 * @return {boolean}
 */
export function isRealModelOpen(
  routeResult,
  hostname = window.location.hostname,
  enableInPreview = isFeatureEnabled('gaEnableInPreview'),
) {
  const isDeployPreview = hostname.startsWith('deploy-preview-') && hostname.endsWith('.netlify.app')
  if (hostname.endsWith('.netlify.app') && !(isDeployPreview && enableInPreview)) {
    return false
  }
  const isBundledDemo = routeResult?.kind === 'file' &&
    !routeResult.isUploadedFile &&
    routeResult.filepath === 'index.ifc'
  return !isBundledDemo
}
