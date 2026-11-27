import {captureMessage} from '@sentry/react'
import {nonIdentifyingLoadContext} from './loadCaptureContext'
import {gtagEvent} from '../privacy/analytics'


/**
 * Reports for the conditions OPFS.worker.js#downloadModelToOPFS and
 * Loader.js's OPFS-source eviction handle (Share#2103).
 *
 * Owner rubric: only an immediately actionable condition goes to Sentry, as
 * an error or warning; diagnostic info that is useful after the fact goes to
 * GA. So a download that failed (a hosted model unreachable or answering an
 * error) is a Sentry warning with a fixed message and fingerprint, while the
 * two expected states
 * (an entry evicted and re-fetched, a download served from memory because
 * `move()` is missing) are GA events, `opfs_source_evicted` and
 * `opfs_not_cached`, whose params are exactly `kind` and `condition`. Those
 * need event-scoped custom dimensions registered in GA Admin before they can
 * be queried (design/new/quotas.md §"Funnel analytics").
 *
 * The loader's, not the OPFS module's (open-t200 slice R, layering.md §4.4):
 * the one Sentry report here carries the load's own context, from the load's
 * reporter, which the base layer may not import. The worker's conditions and
 * the source kind, which `OPFS/utils.js` needs too, are in `OPFS/messages.js`.
 *
 * Main thread only. The OPFS worker has no Sentry (`index.jsx` initialises it
 * on the page, and the worker bundle never imports it), so the worker tells
 * the page which condition it hit in its reply (`condition`, `status`,
 * `cached`) and the page reports it from here.
 *
 * What is NOT sent here, on purpose:
 * - A load that ends in failure. CadView's `captureException` already
 *   reports it with the load context; a second event per failed load would
 *   double the volume and split one defect across two issues. These reports
 *   therefore fire only after the fallback (the direct fetch) succeeded, or
 *   for a condition that never blocks the load (Loader.js#load,
 *   utils.js#downloadToOPFS).
 * - The leftover-temp sweep and the worker's `Error getting file handle`
 *   family. Best-effort housekeeping; a failure costs disk or a re-download
 *   and nothing the user or we would act on.
 *
 * Privacy: tags and GA params carry the source KIND, the condition and the
 * HTTP status only; GA gets no load context at all. Never a file name, URL, path or the worker's error text, all of which
 * name the user's file for a private source (privacy/sentryRedaction.js;
 * design/new/load-log-format.md). The helper's arguments make that
 * structural: it takes no path and no message.
 */

const COMPONENT_TAG = 'opfs-source'


/**
 * An OPFS source entry was found empty or truncated, evicted, and the model
 * fetched again. Expected and self-healing, so GA only (diagnostic: the count
 * shows how often older builds' partial entries are still around).
 *
 * @param {string} kind 'github' | 'external' | 'local'
 */
export function reportOpfsSourceEvicted(kind) {
  sendToGa('opfs_source_evicted', {kind, condition: 'evicted'})
}


/**
 * A hosted/external download into OPFS failed and the load carried on by
 * fetching directly. Warning: the cache is best-effort, but a hosted model
 * that is unreachable or answers an error (a project's `index.ifc` 404ing)
 * is something to follow up on even when this tab's retry got through.
 *
 * @param {object} args
 * @param {string} args.kind 'external' | 'local'
 * @param {string} args.condition the worker's condition: 'fetch-rejected',
 *   'http-error', 'no-body', 'empty-body' or 'stream-error'
 * @param {number} [args.status] HTTP status for 'http-error'
 * @param {object} [report] the load's reporter (loadProgress.js#LoadReporter),
 *   whose phase and report the warning carries
 */
export function reportOpfsDownloadFailed({kind, condition, status}, report = null) {
  const tags = {kind, condition}
  if (Number.isFinite(status)) {
    tags.http_status = String(status)
  }
  send('OPFS download failed; fetched directly', 'warning', ['opfs-source', 'download-failed', condition, kind], tags,
    report)
}


/**
 * A download completed but couldn't be cached because the browser has no
 * (or refused the) atomic `move()`. The model loaded from memory. GA only: an
 * expected browser limit, counted so we know how many users re-download
 * every time.
 *
 * @param {string} kind 'external' | 'local'
 */
export function reportOpfsNotCached(kind) {
  sendToGa('opfs_not_cached', {kind, condition: 'move-unavailable'})
}


/**
 * One GA event with exactly these params: no load context, path or URL.
 * Best-effort.
 *
 * @param {string} name
 * @param {{kind: string, condition: string}} params
 */
function sendToGa(name, params) {
  try {
    gtagEvent(name, {kind: params.kind, condition: params.condition})
  } catch (_) {
    // Reporting is best-effort; the load has its own outcome.
  }
}


/**
 * One Sentry warning with this load's context on it only (never the
 * scope, which later unrelated events would inherit). Best-effort.
 *
 * @param {string} message fixed text, no user data
 * @param {string} level 'warning'
 * @param {string[]} fingerprint
 * @param {object} tags
 * @param {object|null} report the load's reporter
 */
function send(message, level, fingerprint, tags, report) {
  try {
    const load = nonIdentifyingLoadContext(report?.captureContext())
    captureMessage(message, {
      level,
      fingerprint,
      tags: {...load.tags, component: COMPONENT_TAG, ...tags},
      contexts: load.contexts,
    })
  } catch (_) {
    // Reporting is best-effort; the load has its own outcome.
  }
}
