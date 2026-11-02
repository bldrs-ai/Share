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

import fs from 'fs'
import path from 'path'
import * as Sentry from '@sentry/serverless'
import {
  AUTH_STEPS,
  authFailureTags,
  sanitizeAuthReport,
} from '../../src/Auth0/authFailureCodes.js'


// No `environment` or `release` here: both are set per event below, to
// match what the app's own events carry (see sentryEnvironment and
// shareRelease). The other functions still use `environment: NODE_ENV`,
// which files a deploy preview's events under `production`.
Sentry.AWSLambda.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
})

const HTTP_NO_CONTENT = 204
const HTTP_BAD_REQUEST = 400
const HTTP_METHOD_NOT_ALLOWED = 405
// The page sends five short fields; anything much bigger isn't from it.
const MAX_BODY_BYTES = 4096
export const INVALID_REPORT = 'invalid_auth_error_report'
const PRODUCTION_HOSTS = new Set(['bldrs.ai', 'www.bldrs.ai'])


/**
 * A variable that is really set. The build's define tables stringify an
 * unset value, so `"null"` reaches some environments (Jest's, for one) as
 * if it were a name.
 *
 * @param {string|undefined} value
 * @return {boolean}
 */
function isSet(value) {
  return typeof value === 'string' && value !== '' && value !== 'null' && value !== 'undefined'
}


/**
 * The Sentry environment for this function's events, the same one the
 * app's are filed under: `production` for the production deploy and
 * `staging` for everything else (deploy previews, branch deploys,
 * `netlify dev`). `staging` is a hidden environment in the Sentry project,
 * so preview traffic stays out of the default issue view.
 *
 * The app gets it from SENTRY_ENVIRONMENT, set per deploy context in the
 * Netlify UI and compiled into the bundle (tools/esbuild/defines.js). A
 * function has no build step of its own, so this tries what can be read at
 * request time, in order, and says which one decided:
 *  1. SENTRY_ENVIRONMENT, if the Netlify variable is scoped to functions;
 *  2. CONTEXT (`production` | `deploy-preview` | `branch-deploy` | `dev`),
 *     if Netlify exposes it to the function at runtime;
 *  3. the request's Host: bldrs.ai is production, any *.netlify.app or
 *     local host is not. Always present, so this never falls through.
 *
 * @param {object} env process.env
 * @param {object} [headers] the request's headers
 * @return {{environment: string, source: string}}
 */
export function sentryEnvironment(env, headers = {}) {
  if (isSet(env.SENTRY_ENVIRONMENT)) {
    return {environment: env.SENTRY_ENVIRONMENT, source: 'SENTRY_ENVIRONMENT'}
  }
  if (isSet(env.CONTEXT)) {
    return {environment: env.CONTEXT === 'production' ? 'production' : 'staging', source: 'CONTEXT'}
  }
  const host = String(headers.host || headers.Host || '').toLowerCase().replace(/:\d+$/, '')
  return {environment: PRODUCTION_HOSTS.has(host) ? 'production' : 'staging', source: 'host'}
}


// Where netlify.toml's `included_files` puts the version the build wrote
// (tools/updateVersion.mjs): at this repo-relative path under
// LAMBDA_TASK_ROOT when deployed (zip-it-and-ship-it 14.5.4 keeps it, as for
// pro-module's `_pro-modules/`), under `process.cwd()` for `netlify dev`.
// The task-root `_build/` spelling is the same fallback pro-module.js keeps.
// Read at runtime rather than imported: it's a gitignored build output, so a
// fresh checkout (the hook's tests, esmLoad.test.js) has none, and then the
// event simply goes out without a release.
const RELEASE_RELATIVE_PATHS = [
  ['netlify', 'functions', '_build', 'release.json'],
  ['_build', 'release.json'],
]
let cachedRelease


/**
 * The Sentry release the app tags its events with,
 * `bldrs-share@<major>.<PR>.<sha>` (src/index/sentry.js), so both paths'
 * events group under one release.
 *
 * @param {object} [env] process.env
 * @return {string|undefined} undefined where no build has written it
 */
export function shareRelease(env = process.env) {
  if (cachedRelease !== undefined) {
    return cachedRelease || undefined
  }
  cachedRelease = ''
  const roots = [env.LAMBDA_TASK_ROOT, process.cwd()].filter(Boolean)
  for (const root of roots) {
    for (const relative of RELEASE_RELATIVE_PATHS) {
      try {
        const {version} = JSON.parse(fs.readFileSync(path.resolve(root, ...relative), 'utf8'))
        if (typeof version === 'string' && /^[\w.-]+$/.test(version)) {
          cachedRelease = `bldrs-share@${version}`
          return cachedRelease
        }
      } catch {
        // Try the next candidate.
      }
    }
  }
  return undefined
}


/** Test-only: forget the release read from disk. */
export function _resetReleaseForTests() {
  cachedRelease = undefined
}


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

  const {environment, source} = sentryEnvironment(process.env, event.headers)
  const release = shareRelease()
  const captureContext = {
    // The browser's breadcrumb level has no meaning for a one-event relay.
    level: report.level === 'breadcrumb' ? 'info' : report.level,
    tags: authFailureTags(report),
    fingerprint: ['auth-failure', report.step, report.code],
    contexts: {auth: {description: report.description, clientId: report.clientId, environmentSource: source}},
  }
  Sentry.withScope((scope) => {
    // After the client's own defaults are applied, so these win.
    scope.addEventProcessor((sentryEvent) => ({...sentryEvent, environment, ...(release && {release})}))
    if (captureContext.level === 'error') {
      Sentry.captureException(new Error(`Login failed at ${report.step}: ${report.code}`), captureContext)
    } else {
      Sentry.captureMessage(`Login ${report.code} at ${report.step}`, captureContext)
    }
  })
  return {statusCode: HTTP_NO_CONTENT, body: ''}
})
