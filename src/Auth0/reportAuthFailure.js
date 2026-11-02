import {addBreadcrumb, captureException, captureMessage} from '@sentry/react'
import {authErrorCode, authFailureTags, sanitizeAuthReport} from './authFailureCodes'


/*
 * The one way the app reports a login failure to Sentry. Every client path
 * that can fail a sign-in calls this (the table is in
 * src/connections/README.md §"Reporting login failures"), so every event
 * carries the same tags and can be matched with Auth0's log by
 * `auth0.tracking` or by the user's `sub`.
 *
 * What goes out: the step, the Auth0 error code, the connection, Auth0's
 * tracking id and the `sub` when known, plus a cleaned error_description in
 * the `auth` context. Never email, name, tokens, or the raw description; the
 * exception is synthetic (AuthFailure), not the SDK's error, because an
 * OAuthError's message IS the raw description.
 *
 * The `sub` is sent whether or not analytics consent was given: error
 * monitoring is necessary/functional (Sentry as bldrs' processor), and the
 * privacy policy §1 says so. Only the GA client id is consent-gated
 * (privacy/analytics.js#getOpenCidForSentry), because it is the analytics
 * identifier. The Netlify functions attach the sub too
 * (netlify/functions/_lib/auth0.js); here it goes per event rather than on
 * the global scope. src/connections/README.md §"Reporting login failures"
 * has the full split.
 */


/**
 * The exception reported for an `error`-level failure. Its message is the
 * step and code only, and the event is fingerprinted on them, so each
 * (step, code) pair is one Sentry issue regardless of where it was thrown.
 */
export class AuthFailure extends Error {
  /**
   * @param {string} step
   * @param {string} code
   */
  constructor(step, code) {
    super(`Login failed at ${step}: ${code}`)
    this.name = 'AuthFailure'
  }
}


// `${step}|${code}` already reported on this page load. BaseRoutes' auth
// effect re-runs on every navigation and repeats its token fetch; without
// this, one dead refresh token would report once per route change.
const reported = new Set()

// The signed-in user's sub, kept current by useAuthFailureReporting so call
// sites that don't have `user` in hand (or would have to add it to an
// effect's deps to get it) still attribute the event.
let knownSub


/**
 * @param {string|undefined} sub Auth0 user id, or undefined when signed out
 */
export function setAuthFailureSub(sub) {
  knownSub = sub
}


/**
 * Report a login failure.
 *
 * @param {string} step one of AUTH_STEPS
 * @param {Error|object|string} error what the SDK threw, or a code string
 * @param {object} [context]
 * @param {string} [context.connection] e.g. 'github', 'google-oauth2'
 * @param {string} [context.tracking] Auth0 log tracking id
 * @param {string} [context.sub] Auth0 user id; defaults to the signed-in user
 * @param {string} [context.flow] which kind of sign-in, for the context only
 * @return {boolean} whether anything was reported (false when deduped)
 */
export function reportAuthFailure(step, error, {connection, tracking, sub, flow} = {}) {
  const report = sanitizeAuthReport({
    step,
    code: authErrorCode(error),
    connection,
    tracking,
    sub: sub ?? knownSub,
    description: error && typeof error === 'object' ? error.error_description : undefined,
  })
  const key = `${report.step}|${report.code}`
  if (reported.has(key)) {
    return false
  }
  reported.add(key)

  const tags = authFailureTags(report)
  if (report.level === 'breadcrumb') {
    addBreadcrumb({category: 'auth', level: 'info', message: `${report.step}: ${report.code}`, data: tags})
    return true
  }
  const captureContext = {
    level: report.level,
    tags,
    fingerprint: ['auth-failure', report.step, report.code],
    contexts: {
      auth: {
        description: report.description,
        errorName: error && typeof error === 'object' && typeof error.name === 'string' ? error.name : undefined,
        flow,
      },
    },
    ...(report.sub && {user: {id: report.sub}}),
  }
  if (report.level === 'error') {
    captureException(new AuthFailure(report.step, report.code), captureContext)
  } else {
    captureMessage(`Login ${report.code} at ${report.step}`, captureContext)
  }
  return true
}


/** Test-only: forget what this page load has reported, and the sub. */
export function _resetAuthFailureReportsForTests() {
  reported.clear()
  knownSub = undefined
}
