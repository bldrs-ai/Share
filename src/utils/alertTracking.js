import * as Sentry from '@sentry/react'
import {gtagEvent} from '../privacy/analytics'
import {normalizeMessageDigits} from './messageGrouping'


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
    Sentry.captureException(error)
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
      fingerprint: ['alert', normalizeMessageDigits(String(message))],
    })
  }

  // Track in Google Analytics (just the message)
  gtagEvent('alert', {
    message: message,
  })
}
