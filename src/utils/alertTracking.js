import * as Sentry from '@sentry/react'
import {sentrySafeMessageOf} from '../privacy/sentryRedaction'
import {gtagEvent} from '../privacy/analytics'
import {normalizeMessageDigits} from './messageGrouping'


/**
 * Marks an alert's Sentry event as already counted in GA (the `alert` event
 * below), so sentry.js#shadowReportedCondition doesn't count the same
 * failure a second time as `reported_condition`. An event-local tag, set
 * through the capture context, so it never sticks to the scope. The shadow
 * would also have taken this fingerprint's message-derived key as its
 * category, which is free text.
 */
const GA_COUNTED = {ga_counted: 'alert'}


/**
 * Tracks an alert message in both Sentry and Google Analytics.
 * In Sentry, it captures the full error with stack trace.
 * In Google Analytics, it only tracks the message.
 *
 * @param {string} message The alert message to track
 * @param {Error} [error] Optional error object to capture in Sentry
 */
export function trackAlert(message, error = null) {
  // Track in Sentry with full stack trace if available
  if (error) {
    // No fingerprint here on purpose: a real error carries the stack of
    // wherever it was actually thrown, which discriminates better than its
    // message text does. Only the synthesized branch below needs help.
    Sentry.captureException(error, {tags: GA_COUNTED})
  } else {
    // Create a new error with the current stack trace
    const stackError = new Error(message)
    // Every alert without an error object is synthesized on the line above,
    // so all of them share one stack and Sentry's default stack-based
    // grouping folded the whole family into a single issue — SHARE-1EA held
    // "File upload of unknown type", "Failed to parse model" and "Could not
    // read full model structure" together, so none of them could be counted
    // or triaged separately. The explicit fingerprint groups by message
    // family instead, normalized (see normalizeMessageDigits) so a
    // per-upload byte size can't split one family into an issue per file.
    Sentry.captureException(stackError, {
      fingerprint: ['alert', alertFingerprintKey(String(message))],
      tags: GA_COUNTED,
    })
  }

  // An error whose text names the user's file (an upload's OPFS failure)
  // carries a safe message for the sinks (privacy/sentryRedaction.js), and
  // GA is one: the alert itself still shows the real text.
  trackAlertEvent(sentrySafeMessageOf(error) ?? message)
}


/**
 * Counts an alert in Google Analytics only, with no Sentry event.
 *
 * For alerts that report an expected outcome rather than a defect — the
 * unsupported-schema refusal (Share#1875), which CadView already keeps out
 * of Sentry. Routing it through {@link trackAlert} with the alert object
 * would send it to Sentry anyway, as a plain object with neither the
 * original stack nor the load context.
 *
 * Expected outcomes are counted here and nowhere else (AGENTS.md, "PRs: a
 * Reported Conditions section"): GA, never an info-level Sentry message. The
 * structured fields that used to ride such a message as tags come along as
 * `params`, so the one event carries them. They must be closed-set or
 * bucketed values, never a file name, URL or path; `message` must be a
 * constant for any alert whose text names the user's file.
 *
 * @param {string} message The alert message to count
 * @param {object} [params] Extra structured GA params, string values only
 */
export function trackAlertEvent(message, params = {}) {
  gtagEvent('alert', {
    ...params,
    message: message,
  })
}


/**
 * The grouping key for a synthesized alert: the shared digit collapse, plus
 * an alert-only collapse of whatever a message put in parentheses.
 *
 * Digits alone are not enough here. `dragAndDrop`'s unknown-upload alert is
 * `File upload of unknown type: type(${file.type}) size(${file.size})`, and
 * `file.type` is a browser-supplied MIME string — `application/octet-stream`,
 * `model/gltf-binary`, `''` — so collapsing only the size still mints a fresh
 * Sentry issue per MIME, which is the same explosion SHARE-1EA is about.
 *
 * The parenthesized collapse stays local to the alert fingerprint and is
 * deliberately NOT folded into normalizeMessageDigits: engine diagnostics
 * title themselves through that same helper, and there a parenthesized tail
 * ("(revolution unwrap)", "(hemisphere: #)") is the part that names the
 * failure — collapsing it would merge unrelated engine bugs.
 *
 * It is safe for the alert population because parentheses appear in exactly
 * two of the messages that reach this branch (the unknown-upload alert, and
 * the stale-cache alert's "(Profile menu → Clear Local Cache)"), and both
 * stay distinct on the surrounding text alone.
 *
 * @param {string} message
 * @return {string}
 */
function alertFingerprintKey(message) {
  return normalizeMessageDigits(message).replace(/\([^)]*\)/g, '(#)')
}
