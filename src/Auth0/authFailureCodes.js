/*
 * What a login failure is, independent of where it is reported from.
 *
 * Shared by the app's Sentry reporter (reportAuthFailure.js) and the
 * report-auth-error Netlify Function, which relays failures from the static
 * Auth0 error page (public/auth/error/). Kept free of imports so the function
 * bundle pulls in nothing but this file.
 *
 * Everything here turns untrusted input into values safe to put in a Sentry
 * tag or context: an Auth0 error code, connection, tracking id or sub that
 * doesn't match its allowlist is dropped, never escaped. Design and the
 * Sentry search: src/connections/README.md §"Reporting login failures".
 */


/**
 * Where in the login flows a failure happened: the `auth.step` tag.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const AUTH_STEPS = Object.freeze({
  // window.open('/popup-auth…') returned null: a popup blocker.
  POPUP_OPEN: 'popup_open',
  // PopupAuth's loginWithRedirect threw before leaving for Auth0.
  AUTHORIZE: 'authorize',
  // /popup-callback: Auth0 came back with ?error=, or the code exchange
  // failed. One step per flow, so a failed account link or GitHub scope
  // re-consent is told apart from a plain sign-in.
  CALLBACK: 'callback',
  LINK_CALLBACK: 'link_callback',
  SCOPE_CALLBACK: 'scope_callback',
  // The provider's own handleRedirectCallback, for a full-page redirect
  // back to the app (not the popup), and its boot-time checkSession.
  REDIRECT_CALLBACK: 'redirect_callback',
  SESSION_RESTORE: 'session_restore',
  // getAccessTokenSilently: BaseRoutes' boot pass (cached token, then the
  // fresh-claims pass), the opener picking up a popup sign-in, and the
  // token bridge the cloud-source providers call.
  TOKEN_RESTORE: 'token_restore',
  TOKEN_REFRESH: 'token_refresh',
  POPUP_COMPLETE: 'popup_complete',
  TOKEN_BRIDGE: 'token_bridge',
  // ManageProfile: starting a link, re-reading identities afterwards, and
  // unlinking (the unlink-identity function).
  LINK_START: 'link_start',
  LINK_REFRESH: 'link_refresh',
  UNLINK: 'unlink',
  // Auth0's own redirect to public/auth/error/, relayed by report-auth-error.
  ERROR_PAGE: 'error_page',
})


const STEP_VALUES = new Set(Object.values(AUTH_STEPS))
const CODE_RE = /^[A-Za-z0-9_.-]{1,64}$/
const CONNECTION_RE = /^[A-Za-z0-9_.-]{1,64}$/
const TRACKING_RE = /^[A-Za-z0-9_-]{1,128}$/
const CLIENT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/
// Auth0 subs are `<provider>|<id>`: github|123, google-oauth2|123, auth0|abc.
const SUB_RE = /^[A-Za-z0-9_.-]{1,64}\|[A-Za-z0-9_.-]{1,128}$/
const MAX_DESCRIPTION_LENGTH = 200
// C0/C1 controls, zero-width marks and the bidi embeddings, overrides and
// isolates. Built from a string so the source stays plain ASCII.
// eslint-disable-next-line no-control-regex
const UNPRINTABLE_RE = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u202a-\\u202e\\u2066-\\u2069]', 'g')
const TAG_RE = /<[^>]*>/g
const EMAIL_RE = /[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/g


/*
 * How loud each outcome is. Anything not listed is an `error`.
 *
 * - breadcrumb: the session has simply ended. A cached user whose refresh
 *   fails with login_required is signed out, which the app already handles;
 *   an event per occurrence would be pure noise. (A visitor who was never
 *   signed in doesn't get here at all: checkSession swallows it.)
 * - info: the user said no, or the browser stopped us — cancelling at the
 *   provider (access_denied), declining consent, a popup blocker, a refresh
 *   token Auth0 has retired (invalid_grant after its lifetime or a logout
 *   elsewhere; the app signs out). Searchable, but not an error.
 * - warning: the network, not the login (an offline or filtering client).
 */
const LEVEL_BY_CODE = {
  login_required: 'breadcrumb',
  access_denied: 'info',
  consent_required: 'info',
  interaction_required: 'info',
  popup_blocked: 'info',
  invalid_grant: 'info',
  network: 'warning',
  timeout: 'warning',
}


/**
 * The Auth0 error code for a failure, as an `auth.error` tag value.
 *
 * auth0-spa-js errors carry the OAuth `error` field (GenericError,
 * MissingRefreshTokenError, TimeoutError, auth0-react's OAuthError), so that
 * is the code when it is well-formed. A few failures are plain Errors and are
 * named here from their message; anything else is `unknown`.
 *
 * @param {Error|object|string|null|undefined} err
 * @return {string}
 */
export function authErrorCode(err) {
  if (typeof err === 'string') {
    return CODE_RE.test(err) ? err : 'unknown'
  }
  if (!err || typeof err !== 'object') {
    return 'unknown'
  }
  if (typeof err.error === 'string' && CODE_RE.test(err.error)) {
    return err.error
  }
  const message = typeof err.message === 'string' ? err.message : ''
  // auth0-spa-js handleRedirectCallback with no stored transaction: a
  // reloaded or replayed callback URL, or a state mismatch.
  if (message === 'Invalid state') {
    return 'invalid_state'
  }
  if (/timeout/i.test(message)) {
    return 'timeout'
  }
  if (err.name === 'TypeError' && /fetch|network|load failed/i.test(message)) {
    return 'network'
  }
  return 'unknown'
}


/**
 * @param {string} code from authErrorCode
 * @return {'breadcrumb'|'info'|'warning'|'error'}
 */
export function authFailureLevel(code) {
  return Object.prototype.hasOwnProperty.call(LEVEL_BY_CODE, code) ? LEVEL_BY_CODE[code] : 'error'
}


/**
 * @param {*} value
 * @param {RegExp} re
 * @return {string|undefined} value trimmed if it matches re
 */
function allow(value, re) {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return re.test(trimmed) ? trimmed : undefined
}


/**
 * error_description reduced to something safe to store: one line of plain
 * text, markup and control characters removed, email addresses masked (an
 * Auth0 Action's deny reason could quote one), capped. Raw descriptions
 * never leave the browser.
 *
 * @param {*} value
 * @return {string|undefined}
 */
export function cleanAuthDescription(value) {
  if (typeof value !== 'string') {
    return undefined
  }
  const flat = value
    .replace(TAG_RE, ' ')
    .replace(UNPRINTABLE_RE, ' ')
    .replace(EMAIL_RE, '[email]')
    .replace(/\s+/g, ' ')
    .trim()
  if (!flat) {
    return undefined
  }
  return flat.length > MAX_DESCRIPTION_LENGTH ? `${flat.slice(0, MAX_DESCRIPTION_LENGTH)}…` : flat
}


/**
 * Everything a report carries, reduced to allowlisted values. Missing or
 * malformed fields come back undefined so the caller can omit them; Sentry
 * drops undefined tags rather than sending a blank.
 *
 * @param {object} fields
 * @param {string} fields.step one of AUTH_STEPS
 * @param {string} fields.code from authErrorCode, or a raw code
 * @param {string} [fields.connection]
 * @param {string} [fields.tracking] Auth0's log tracking id
 * @param {string} [fields.clientId]
 * @param {string} [fields.sub] Auth0 user id
 * @param {string} [fields.description] error_description, raw
 * @return {object} {step, code, level, connection?, tracking?, clientId?, sub?, description?}
 */
export function sanitizeAuthReport({step, code, connection, tracking, clientId, sub, description}) {
  const safeStep = STEP_VALUES.has(step) ? step : 'unknown'
  const safeCode = allow(code, CODE_RE) || 'unknown'
  return {
    step: safeStep,
    code: safeCode,
    level: authFailureLevel(safeCode),
    connection: allow(connection, CONNECTION_RE),
    tracking: allow(tracking, TRACKING_RE),
    clientId: allow(clientId, CLIENT_ID_RE),
    sub: allow(sub, SUB_RE),
    description: cleanAuthDescription(description),
  }
}


/**
 * Sentry tags for a sanitized report. Dotted names, so `auth.step:*` finds
 * every login failure and `auth0.tracking:<id>` the one Auth0's log names.
 *
 * @param {object} report from sanitizeAuthReport
 * @return {object}
 */
export function authFailureTags(report) {
  return {
    'auth.step': report.step,
    'auth.error': report.code,
    'auth.connection': report.connection,
    'auth0.tracking': report.tracking,
  }
}
