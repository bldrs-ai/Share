import {CAPABILITY_FIELDS} from './clientCapabilityReport'
import {isAllowed} from './analytics'


/**
 * Where a report goes: a function on Share's own origin, which passes it to
 * GA through the Measurement Protocol (netlify/functions/client-capabilities.js).
 * Same-origin, so a blocker that stops googletagmanager.com lets it through.
 * The name avoids the words filter lists match on paths (`beacon`, `collect`,
 * `analytics`, `track`, `telemetry`).
 */
export const CAPABILITY_REPORT_PATH = '/.netlify/functions/client-capabilities'

/** Once per page session, per condition. Also kept in memory, for a page with no sessionStorage. */
const SENT_KEY_PREFIX = 'bldrs.clientCapability.'
const sentThisPage = new Set()

/**
 * Class names generic cosmetic filters hide (EasyList's `##.adsbox`,
 * `##.ad-banner` and similar). An element-hiding ad blocker hides a bait
 * element carrying them; a request-level blocker doesn't touch it.
 */
const BAIT_CLASSES = 'adsbox ad-banner textads banner-ads pub_300x250'


/**
 * The browser family, by its own markers rather than a full UA parse. Brave
 * reports a plain Chrome user agent and is told apart by `navigator.brave`.
 * Order matters: Edge, Opera and Samsung Internet all say `Chrome` too.
 *
 * @param {object} [nav] navigator
 * @return {string} one of CAPABILITY_FIELDS.browser
 */
export function browserFamily(nav = globalThis.navigator) {
  if (nav?.brave && typeof nav.brave.isBrave === 'function') {
    return 'brave'
  }
  const ua = String(nav?.userAgent ?? '')
  if (/DuckDuckGo\/|Ddg\//.test(ua)) {
    return 'duckduckgo'
  }
  if (/\bEdgA?\/|\bEdgiOS\//.test(ua)) {
    return 'edge'
  }
  if (/\bOPR\/|\bOPT\/|Opera/.test(ua)) {
    return 'opera'
  }
  if (/SamsungBrowser\//.test(ua)) {
    return 'samsung'
  }
  if (/Firefox\/|FxiOS\//.test(ua)) {
    return 'firefox'
  }
  if (/Chrome\/|CriOS\//.test(ua)) {
    return 'chrome'
  }
  if (/Safari\//.test(ua) && /Version\//.test(ua)) {
    return 'safari'
  }
  return 'other'
}


/**
 * @param {object} [nav] navigator
 * @return {string} 'mobile' or 'desktop'
 */
export function formFactor(nav = globalThis.navigator) {
  if (nav?.userAgentData && typeof nav.userAgentData.mobile === 'boolean') {
    return nav.userAgentData.mobile ? 'mobile' : 'desktop'
  }
  return /Mobi|Android|iPhone|iPad|iPod/.test(String(nav?.userAgent ?? '')) ? 'mobile' : 'desktop'
}


/**
 * What kind of blocking this looks like (CAPABILITY_FIELDS.blocker).
 * `offline` when the browser says so. Otherwise a bait element goes into the
 * page for one style read: hidden means an element-hiding ad blocker
 * (`cosmetic`); visible means the script was stopped at the request level, or
 * the network failed (`network`). Computed style rather than layout, so it
 * reads the same in a test DOM.
 *
 * @param {object} [doc] document
 * @param {object} [nav] navigator
 * @return {string}
 */
export function blockerKind(doc = globalThis.document, nav = globalThis.navigator) {
  if (nav && nav.onLine === false) {
    return 'offline'
  }
  if (!doc?.body || typeof doc.defaultView?.getComputedStyle !== 'function') {
    return 'network'
  }
  const bait = doc.createElement('div')
  bait.className = BAIT_CLASSES
  bait.setAttribute('aria-hidden', 'true')
  bait.style.cssText = 'position:absolute;left:-10000px;top:-10000px;width:1px;height:1px;'
  doc.body.appendChild(bait)
  try {
    const style = doc.defaultView.getComputedStyle(bait)
    return style.display === 'none' || style.visibility === 'hidden' ? 'cosmetic' : 'network'
  } finally {
    bait.remove()
  }
}


/**
 * The report for a condition, built from this client.
 *
 * @param {string} condition one of CAPABILITY_FIELDS.condition
 * @param {object} [env] document, navigator and consent, for tests
 * @return {object}
 */
export function capabilityReport(condition, {doc = globalThis.document, nav = globalThis.navigator, consent = isAllowed()} = {}) {
  return {
    condition,
    browser: browserFamily(nav),
    blocker: blockerKind(doc, nav),
    form_factor: formFactor(nav),
    consent: consent ? 'on' : 'off',
  }
}


/**
 * Send one capability report for this condition, once per page session.
 * Best-effort: a report that can't be sent is dropped, never thrown.
 *
 * `navigator.sendBeacon` posts a string as text/plain, a simple request, so
 * there is no preflight and it survives the page unloading. `fetch` with
 * `keepalive` is the fallback.
 *
 * Sent whatever the user's analytics setting (owner's call, 2026-11-18): it
 * is a count of what kinds of client can't run Share's GA, carrying only the
 * enums in clientCapabilityReport.js, with `consent` saying which way the
 * setting was. The function sends it under one fixed GA client id, so it is
 * never tied to this browser.
 *
 * @param {string} condition one of CAPABILITY_FIELDS.condition
 * @param {object} [env] see capabilityReport; plus `storage` for tests
 * @return {boolean} whether a report was handed to the browser
 */
export function reportClientCapability(condition, env = {}) {
  if (!CAPABILITY_FIELDS.condition.includes(condition) || sentThisPage.has(condition)) {
    return false
  }
  const storage = 'storage' in env ? env.storage : sessionStorageOrNull()
  const key = `${SENT_KEY_PREFIX}${condition}`
  try {
    if (storage?.getItem(key)) {
      sentThisPage.add(condition)
      return false
    }
  } catch (_) {
    // Storage blocked: the in-memory flag still holds for this page.
  }
  sentThisPage.add(condition)
  try {
    storage?.setItem(key, '1')
  } catch (_) {
    // As above.
  }
  try {
    const body = JSON.stringify(capabilityReport(condition, env))
    const nav = env.nav ?? globalThis.navigator
    if (typeof nav?.sendBeacon === 'function' && nav.sendBeacon(CAPABILITY_REPORT_PATH, body)) {
      return true
    }
    if (typeof globalThis.fetch === 'function') {
      globalThis.fetch(CAPABILITY_REPORT_PATH, {method: 'POST', body, keepalive: true}).catch(() => null)
      return true
    }
  } catch (_) {
    // Best-effort.
  }
  return false
}


/** @return {?Storage} */
function sessionStorageOrNull() {
  try {
    return globalThis.sessionStorage ?? null
  } catch (_) {
    return null
  }
}


/** Test-only: forget which conditions this page has reported. */
export function _resetClientCapabilitiesForTests() {
  sentThisPage.clear()
}
