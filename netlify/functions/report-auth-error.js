/*
 * Netlify Function: report-auth-error
 * -----------------------------------
 * Relays a login failure from the static Auth0 error page
 * (public/auth/error/) to Sentry.
 *
 * When a login fails before Auth0 can return to the app, Auth0 redirects to
 * that page with ?error, error_description, tracking, client_id, connection.
 * The page ships none of the app bundle, so it has no Sentry SDK; it
 * `sendBeacon`s those fields here instead:
 *
 *   POST /.netlify/functions/report-auth-error
 *   Body: {"error": "access_denied", "tracking": "…", "connection": "github",
 *          "client_id": "…", "error_description": "…"}
 *   → 204, or 400 `invalid_auth_error_report`
 *
 * Why a function rather than the page posting to Sentry itself: the DSN
 * stays in this function's env instead of being templated into a public
 * file, the page's CSP only has to allow its own origin, and the fields are
 * re-checked here against the same allowlists the app uses
 * (src/Auth0/authFailureCodes.js), so whatever reaches Sentry is a known
 * step, a well-formed code and nothing else. The endpoint is open by nature
 * (Auth0 sends users to the page signed out); it lets a caller do no more
 * than the app's public browser DSN already does, with tighter input.
 *
 * Tags match the app's own reports, so `auth.step:*` finds both and
 * `auth0.tracking:<id>` finds the event for a line in Auth0's log. See
 * src/connections/README.md §"Reporting login failures".
 */

import * as Sentry from '@sentry/serverless'
import {
  AUTH_STEPS,
  authFailureTags,
  sanitizeAuthReport,
} from '../../src/Auth0/authFailureCodes.js'


Sentry.AWSLambda.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: process.env.NODE_ENV,
})

const HTTP_NO_CONTENT = 204
const HTTP_BAD_REQUEST = 400
const HTTP_METHOD_NOT_ALLOWED = 405
// The page sends five short fields; anything much bigger isn't from it.
const MAX_BODY_BYTES = 4096
export const INVALID_REPORT = 'invalid_auth_error_report'


/**
 * @param {object} event Netlify Functions event
 * @return {object|null} the parsed report body, or null if it isn't one
 */
function parseBody(event) {
  if (typeof event.body !== 'string' || event.body.length > MAX_BODY_BYTES) {
    return null
  }
  const text = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body
  try {
    const body = JSON.parse(text)
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null
  } catch {
    return null
  }
}


// Synchronous: nothing to await. wrapHandler awaits the result and flushes
// the capture before the Lambda freezes.
export const handler = Sentry.AWSLambda.wrapHandler((event) => {
  if (event.httpMethod !== 'POST') {
    return {statusCode: HTTP_METHOD_NOT_ALLOWED, body: 'Method Not Allowed'}
  }
  const body = parseBody(event)
  const report = body && sanitizeAuthReport({
    step: AUTH_STEPS.ERROR_PAGE,
    code: body.error,
    connection: body.connection,
    tracking: body.tracking,
    clientId: body.client_id,
    description: body.error_description,
  })
  // No well-formed error code: not a report from the page (which only sends
  // when Auth0 gave it one).
  if (!report || report.code === 'unknown') {
    return {statusCode: HTTP_BAD_REQUEST, body: INVALID_REPORT}
  }

  const captureContext = {
    // The browser's breadcrumb level has no meaning for a one-event relay.
    level: report.level === 'breadcrumb' ? 'info' : report.level,
    tags: authFailureTags(report),
    fingerprint: ['auth-failure', report.step, report.code],
    contexts: {auth: {description: report.description, clientId: report.clientId}},
  }
  if (captureContext.level === 'error') {
    Sentry.captureException(new Error(`Login failed at ${report.step}: ${report.code}`), captureContext)
  } else {
    Sentry.captureMessage(`Login ${report.code} at ${report.step}`, captureContext)
  }
  return {statusCode: HTTP_NO_CONTENT, body: ''}
})
