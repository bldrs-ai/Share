import Cookies from 'js-cookie'
import {assertDefined} from '../utils/assert'
import Expires from './Expires'


/*
 * The visitor's analytics consent, as a versioned cookie. Design:
 * design/new/analytics-consent.md.
 *
 * Nothing asks for it at the moment: Google Analytics is off in the
 * browser for everyone (index/ga.js#IS_BROWSER_GA_ON, 2026-11-25), and the
 * consent dialog, then banner, that set it are gone. It is kept for a later
 * opt-in, and still read by analytics#isAllowed, so a visitor who accepted
 * under #2051 buffers our events in the inline gtag stub, where they stay:
 * gtag/js never loads to send them.
 *
 *   functional  Analytics allowed: GA with a pseudonymous client id, and our
 *               own model events. No ad signal is ever granted (index/ga.js).
 *   restricted  Declined. Under #2051/#2354's dialog and banner this also
 *               meant a local-only mode; that mode is gone.
 *
 * Sentry error monitoring is NOT governed by this. It's first-party
 * functional processing and stays on at every level; only the GA client id
 * tag on Sentry events follows consent (analytics#getOpenCidForSentry).
 */
export const CONSENT_LEVELS = Object.freeze({
  RESTRICTED: 'restricted',
  FUNCTIONAL: 'functional',
})


/** Every level a stored cookie may hold. */
export const CONSENT_LEVEL_ORDER = Object.freeze([
  CONSENT_LEVELS.RESTRICTED,
  CONSENT_LEVELS.FUNCTIONAL,
])


/*
 * The cookie's name and value shape, `<version>.<level>`, are duplicated in
 * public/index.html's inline gtag stub, which has to decide consent before
 * the bundle loads. consent.test.js runs that stub against these constants,
 * so a change here that the stub doesn't follow fails there.
 */
export const CONSENT_COOKIE_NAME = 'consentLevel'


/*
 * Bump to re-ask everyone: a stored choice from an older version reads as
 * undecided, which re-opens the dialog. Bump it when what a level means
 * changes in a way the visitor didn't agree to — e.g. when local-only mode
 * gives up more, or when public-model analysis is offered.
 */
export const CONSENT_VERSION = 1


/*
 * The pre-2026-11 boolean cookie. Its default was "allowed", it was never
 * settable from the UI after 2023 (#857 hid the toggle), and it predates
 * this dialog's wording, so it is NOT read as a choice; setConsentLevel
 * deletes it so it doesn't linger.
 */
const LEGACY_COOKIE_NAME = 'isAnalyticsAllowed'


/**
 * The visitor's stored level, or null when they haven't chosen under the
 * current CONSENT_VERSION. Null means "not consented": nothing that
 * needs consent may run on it.
 *
 * @return {string|null} one of CONSENT_LEVELS, or null
 */
export function getConsentLevel() {
  const raw = Cookies.get(CONSENT_COOKIE_NAME)
  if (typeof raw !== 'string') {
    return null
  }
  const match = /^(\d+)\.([a-z]+)$/.exec(raw)
  if (!match || parseInt(match[1]) < CONSENT_VERSION) {
    return null
  }
  return CONSENT_LEVEL_ORDER.includes(match[2]) ? match[2] : null
}


/** @return {boolean} true once the visitor has made a choice under the current version */
export function isConsentDecided() {
  return getConsentLevel() !== null
}


/**
 * Store the visitor's choice. Prefer analytics#setConsent, which also
 * retracts or republishes the identifiers that follow consent.
 *
 * @param {string} level one of CONSENT_LEVELS
 */
export function setConsentLevel(level) {
  assertDefined(level)
  if (!CONSENT_LEVEL_ORDER.includes(level)) {
    throw new Error(`Unknown consent level: ${level}`)
  }
  Cookies.set(CONSENT_COOKIE_NAME, consentCookieValue(level), {expires: Expires.DAYS, sameSite: 'lax'})
  Cookies.remove(LEGACY_COOKIE_NAME)
}


/**
 * @param {string} level one of CONSENT_LEVELS
 * @return {string} the cookie value that stores it
 */
export function consentCookieValue(level) {
  return `${CONSENT_VERSION}.${level}`
}


/**
 * @param {string|null} level
 * @return {boolean} whether this level consents to Google Analytics
 */
export function allowsAnalytics(level) {
  return level === CONSENT_LEVELS.FUNCTIONAL
}
