import * as Sentry from '@sentry/react'
import * as Analytics from '../privacy/analytics'


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
    Sentry.captureException(error)
  } else {
    // Create a new error with the current stack trace
    const stackError = new Error(message)
    Sentry.captureException(stackError)
  }

  // Track in Google Analytics (just the message)
  Analytics.recordEvent('alert', {
    message: message,
  })
}
