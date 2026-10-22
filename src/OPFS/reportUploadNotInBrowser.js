import {captureMessage} from '@sentry/react'
import {loadFailureCaptureContext} from '../loader/loadProgress'


/**
 * Count one `/v/local-only/` open whose upload isn't in this browser (#1955), as an
 * info-level Sentry message rather than an exception.
 *
 * Until #1956 these were SHARE-1NR, the top hard-failure group, filed as a
 * defect. The load still can't succeed, but it's user state, not a bug, so
 * CadView keeps it out of `captureException`. This keeps the VOLUME visible
 * in Sentry anyway (asked for on #1956): one issue (the fingerprint) whose
 * event and user counts say how often shared or stale local-file links are
 * opened, and so how much #705 (don't hand those links out) is worth.
 * Modelled on `loader/unsupportedSchema.js#reportUnsupportedSchema`.
 *
 * The load context (`load.phase` tag, `load` context with the report) goes on
 * THIS event only, never the session's scope, so it doesn't leak onto later
 * events. The transaction already names the route, so no id is tagged.
 */
export function reportUploadNotInBrowser() {
  try {
    const load = loadFailureCaptureContext()
    captureMessage('Upload not in this browser', {
      level: 'info',
      fingerprint: ['upload-not-in-browser'],
      tags: load.tags,
      contexts: load.contexts,
    })
  } catch (_) {
    // Reporting is best-effort; the user already has the dialog.
  }
}
