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
 * Also false on Netlify deploy hosts (*.netlify.app): deploy previews,
 * branch deploys and the bldrs-share-dev site all serve the production
 * index.html with the prod GA tag baked in, so team review sessions on
 * a PR preview would otherwise register as conversions. Production is
 * bldrs.ai; localhost stays included because the Playwright E2E suite
 * (realModelOpen.spec.ts) asserts against dataLayer on localhost and
 * the googletagmanager script is blocked there anyway.
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
