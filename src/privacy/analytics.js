import Cookies from 'js-cookie'
import {assertDefined} from '../utils/assert'
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
}


/**
 * @param {string} eventName
 * @param {object} parameters
 */
export function gtagEvent(eventName, parameters) {
  if (window.gtag && isAllowed()) {
    window.gtag('event', eventName, parameters)
  }
}


/*
 * GA4's client id, captured at init by index/ga.js.
 *
 * The GA4 Data API exposes no user-id dimension, so per-user open
 * depth ("how many people opened exactly one model vs six or more")
 * can't be derived — only the eventCount ÷ totalUsers average. Sending
 * the client id as a `ga_cid` event param, with a matching
 * event-scoped custom dimension registered GA4-side (Admin → Custom
 * definitions → event parameter `ga_cid`), makes the distribution
 * queryable: customEvent:ga_cid × eventCount, bucketed client-side.
 *
 * Null until gtag's async callback lands, and permanently null
 * wherever GA never initializes — off-prod, under automation, or on
 * blocked clients — so events simply omit the param there rather than
 * carrying a placeholder that would form its own bogus bucket. No
 * backfill: the dimension only accrues data from ship time forward.
 *
 * At much larger scale GA4 rolls high-cardinality dimension values
 * into "(other)"; that's the signal to graduate this query to the
 * BigQuery export.
 */
let gaClientId = null


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


/** @return {string|null} GA4 client id, or null if unavailable */
export function getGaClientId() {
  return gaClientId
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
 * Also false on Netlify deploy hosts (*.netlify.app), so team review
 * sessions on a PR preview don't register as conversions. This is
 * deliberate defense-in-depth behind index/ga.js#shouldInitGa, whose
 * prod-hostname allowlist already keeps gtag/js from loading off-prod
 * at all. The two predicates differ on purpose and can't be merged:
 * localhost must stay *included* here because the Playwright E2E suite
 * (realModelOpen.spec.ts) asserts this event lands in the dataLayer
 * buffer on localhost, while shouldInitGa excludes localhost from
 * loading GA entirely.
 *
 * @param {object} routeResult from routes.ts#handleRoute
 * @param {string} hostname current page host; parameterized for tests
 * @return {boolean}
 */
export function isRealModelOpen(routeResult, hostname = window.location.hostname) {
  if (hostname.endsWith('.netlify.app')) {
    return false
  }
  const isBundledDemo = routeResult?.kind === 'file' &&
    !routeResult.isUploadedFile &&
    routeResult.filepath === 'index.ifc'
  return !isBundledDemo
}
