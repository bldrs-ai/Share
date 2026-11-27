import {shouldInitGa} from '../index/ga'
import {formFactor} from '../privacy/clientCapabilities'
import {UTM_MEDIUMS, UTM_SOURCES, parsePageVisitReport} from '../privacy/pageVisitReport'
import {viewRouteKind} from '../routes/localOnly'
import {processExternalUrl} from '../routes/routes'
import {pageSession} from './modelOpenCount'


/**
 * Where a report goes: a function on Share's own origin
 * (netlify/functions/page-visit.js), the visit-side twin of model-open-count.
 * The name avoids the words filter lists match on paths (`beacon`,
 * `collect`, `analytics`, `track`, `telemetry`).
 */
export const PAGE_VISIT_PATH = '/.netlify/functions/page-visit'

// The hosted demo's files (privacy/analytics.js#isRealModelOpen's list).
const DEMO_FILES = new Set(['index.ifc', 'index.step'])

// The app's root and its `/share` mount, under the two install prefixes
// there are (bldrs.ai serves `/`, the GitHub Pages install `/Share/`;
// BaseRoutes' installPrefix). Spelled out rather than "any first segment",
// which would also take `/privacy`. The homepage then navigates to the demo,
// but this report is read at page load, before that.
const HOME_PATH = /^(\/Share)?(\/share)?\/?$/


/**
 * The kind of page this load opened, one of PAGE_VISIT_FIELDS.route_kind.
 * Read from the path's shape only (routes/localOnly.ts#viewRouteKind, the
 * prefix-independent route kind); the path itself is never sent.
 *
 * @param {string} pathname window.location.pathname
 * @return {string}
 */
export function visitRouteKind(pathname) {
  const path = String(pathname ?? '')
  const kind = viewRouteKind(path)
  switch (kind) {
    case 'p': {
      const file = path.slice(path.indexOf('/v/p/') + '/v/p/'.length).split('/')[0].toLowerCase()
      return DEMO_FILES.has(file) ? 'viewer-demo' : 'other'
    }
    case 'local-only':
    case 'new':
      return 'viewer-local'
    case 'gh':
      return 'viewer-github'
    case 'g':
      return 'viewer-gdrive'
    case 'u':
      return externalUrlKind(path.slice(path.indexOf('/v/u/') + '/v/u/'.length))
    case null:
      return HOME_PATH.test(path) ? 'home' : 'other'
    default:
      return 'other'
  }
}


/**
 * The kind of a `/v/u/<url>` route, decided by the router itself
 * (routes.ts#processExternalUrl, which opens a Google URL as a Drive file),
 * so the count and the open can't disagree. A substring test over the path
 * would call `https://example.com/drive.google.com/x.ifc` Drive, and miss
 * `www.googleapis.com` (review on #2371).
 *
 * @param {string} splat what follows `/v/u/`
 * @return {string} `viewer-gdrive`, `viewer-url`, or `other` for no URL
 */
function externalUrlKind(splat) {
  let result = null
  try {
    result = processExternalUrl(new URL('https://bldrs.ai/'), splat)
  } catch (_) {
    result = null
  }
  if (!result) {
    return 'other'
  }
  return result.kind === 'url' ? 'viewer-url' : 'viewer-gdrive'
}


// Hosts by class. A host matches an entry when it is that host or a subdomain
// of it (`www.google.com`, `l.facebook.com`). Google's and Yandex's country
// domains (`google.de`, `google.co.uk`, `google.com.br`) match the pattern
// below, pinned to the end of the host so a look-alike (`google.evil.com`,
// `google.com.evil.example`) is `other` (review on #2371).
const SEARCH_HOSTS = ['bing.com', 'duckduckgo.com', 'search.yahoo.com', 'baidu.com', 'yandex.ru', 'yandex.com',
  'ecosia.org', 'search.brave.com', 'startpage.com', 'qwant.com', 'kagi.com']
const SEARCH_LABELS = /^(www\.)?(google|yandex)\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/
const SOCIAL_HOSTS = ['linkedin.com', 'lnkd.in', 'twitter.com', 'x.com', 't.co', 'facebook.com', 'fb.com',
  'instagram.com', 'reddit.com', 'youtube.com', 'youtu.be', 'mastodon.social', 'threads.net', 'bsky.app',
  'news.ycombinator.com', 'discord.com', 'whatsapp.com', 'telegram.org', 't.me']
const BLDRS_HOSTS = ['bldrs.ai']


/**
 * @param {string} host lowercased
 * @param {Array<string>} list
 * @return {boolean}
 */
function hostIn(host, list) {
  return list.some((entry) => host === entry || host.endsWith(`.${entry}`))
}


/**
 * How the visitor arrived, one of PAGE_VISIT_FIELDS.referrer_class, from the
 * referrer's host alone. The referrer itself is never sent: not its path, not
 * its query, not even its host.
 *
 * @param {string} referrer document.referrer
 * @param {string} [ownHost] this page's host; a referrer from it is `bldrs`
 * @return {string}
 */
export function referrerClass(referrer, ownHost = globalThis.location?.hostname) {
  if (typeof referrer !== 'string' || referrer === '') {
    return 'direct'
  }
  let host
  try {
    host = new URL(referrer).hostname.toLowerCase()
  } catch (_) {
    return 'other'
  }
  if (hostIn(host, BLDRS_HOSTS) || (ownHost && host === String(ownHost).toLowerCase()) ||
      /^deploy-preview-\d+--bldrs-share(-prod)?\.netlify\.app$/.test(host)) {
    return 'bldrs'
  }
  if (hostIn(host, SEARCH_HOSTS) || SEARCH_LABELS.test(host)) {
    return 'search'
  }
  if (hostIn(host, SOCIAL_HOSTS)) {
    return 'social'
  }
  return 'other'
}


/**
 * @param {?string} value a `utm_*` query value
 * @param {Array<string>} allowed the allowlist
 * @return {string} the value if allowed (lowercased), `other` if present but
 *   not, `none` if absent
 */
function campaignParam(value, allowed) {
  if (value === null || value === undefined || value === '') {
    return 'none'
  }
  const v = String(value).trim().toLowerCase()
  return allowed.includes(v) ? v : 'other'
}


/**
 * The report for this page load.
 *
 * @param {object} [env] overrides, for tests
 * @param {string} [env.pathname]
 * @param {string} [env.search] window.location.search
 * @param {string} [env.referrer] document.referrer
 * @param {string} [env.hostname] this page's host
 * @param {object} [env.nav] navigator
 * @return {object} exactly PAGE_VISIT_FIELDS' keys and `session_id`
 */
export function pageVisitReport({
  pathname = globalThis.location?.pathname,
  search = globalThis.location?.search,
  referrer = globalThis.document?.referrer,
  hostname = globalThis.location?.hostname,
  nav = globalThis.navigator,
} = {}) {
  let params
  try {
    params = new URLSearchParams(search ?? '')
  } catch (_) {
    params = new URLSearchParams()
  }
  return {
    route_kind: visitRouteKind(pathname),
    referrer_class: referrerClass(referrer, hostname),
    utm_source: campaignParam(params.get('utm_source'), UTM_SOURCES),
    utm_medium: campaignParam(params.get('utm_medium'), UTM_MEDIUMS),
    form_factor: formFactor(nav),
    session_id: pageSession(),
  }
}


// Once per page load: a module flag, so a remount or a second call sends
// nothing. In memory only, like the session id.
let sentThisPage = false


/**
 * Send one cookieless report of this page load. Called once, at startup
 * (index.jsx, beside setupGa).
 *
 * Needs no consent for model_open_count's reasons
 * (design/new/model-open-counts.md): enums only, nothing stored on the
 * device (the session id is in page memory), one fixed GA client id, and the
 * request to GA comes from the function, so the visitor's IP never reaches
 * Google. The country is the function's, from Netlify's geolocation; the page
 * never works one out.
 *
 * Only where GA itself would have loaded (index/ga.js#shouldInitGa's host
 * rule: production, or a bldrs deploy preview with
 * `?feature=gaEnableInPreview`; never localhost or under webdriver), so dev,
 * unit tests and E2E send nothing.
 *
 * `navigator.sendBeacon` posts a string as text/plain, a simple request, so
 * there is no preflight and it survives the page unloading. `fetch` with
 * `keepalive` is the fallback. Best-effort: never throws.
 *
 * @param {object} [env] see pageVisitReport; plus shouldInitGa's
 *   `isWebdriver` and `enableInPreview`, for tests
 * @return {boolean} whether a report was handed to the browser
 */
export function reportPageVisit(env = {}) {
  if (sentThisPage) {
    return false
  }
  try {
    const hostEnv = {}
    for (const key of ['hostname', 'isWebdriver', 'enableInPreview']) {
      if (key in env) {
        hostEnv[key] = env[key]
      }
    }
    if (!shouldInitGa(hostEnv)) {
      return false
    }
    sentThisPage = true
    const body = JSON.stringify(pageVisitReport(env))
    // The function's own check, run here too: a report it would refuse is
    // never sent, whatever a later change to the builders does.
    if (!parsePageVisitReport(body)) {
      return false
    }
    const nav = env.nav ?? globalThis.navigator
    if (typeof nav?.sendBeacon === 'function' && nav.sendBeacon(PAGE_VISIT_PATH, body)) {
      return true
    }
    if (typeof globalThis.fetch === 'function') {
      globalThis.fetch(PAGE_VISIT_PATH, {method: 'POST', body, keepalive: true}).catch(() => null)
      return true
    }
  } catch (_) {
    // Best-effort: a report that can't be sent is dropped.
  }
  return false
}


/** Test-only: forget that this page has reported, as a reload would. */
export function _resetPageVisitForTests() {
  sentThisPage = false
}
