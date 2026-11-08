import {captureMessage} from '@sentry/react'
import {loadFailureCaptureContext} from '../loader/loadProgress'


/**
 * Sentry reports for the conditions OPFS.worker.js#downloadModelToOPFS and
 * Loader.js's OPFS-source eviction handle (Share#2103). Modelled on
 * {@link ./reportUploadNotInBrowser.js}: a fixed message and fingerprint per
 * condition, so one Sentry issue's event and user counts say how often it
 * happens, and nothing the user could be named by.
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
 * Privacy: tags carry the source KIND, the condition and the HTTP status
 * only. Never a file name, URL, path or the worker's error text, all of which
 * name the user's file for a private source (privacy/sentryRedaction.js;
 * design/new/load-log-format.md). The helper's arguments make that
 * structural: it takes no path and no message.
 */

/** Source kinds a download can have. `local` is a Share-hosted path such as `/index.ifc`. */
export const OPFS_SOURCE_KINDS = ['local', 'external', 'github']

const COMPONENT_TAG = 'opfs-source'


/**
 * The source kind of a `downloadToOPFS` call. Hosted and external models are
 * stored under the URL's host; a Share-hosted `/index.ifc`-style path is
 * stored under the constant commit hash 'bldrs-ai' (Loader.js#load).
 *
 * @param {string} commitHash the `commitHash` argument of downloadToOPFS
 * @return {string} 'local' | 'external'
 */
export function downloadSourceKind(commitHash) {
  return commitHash === 'bldrs-ai' ? 'local' : 'external'
}


/**
 * An OPFS source entry was found empty or truncated, evicted, and the model
 * fetched again. Expected and self-healing, so info; the count shows how
 * often older builds' partial entries are still around.
 *
 * @param {string} kind 'github' | 'external' | 'local'
 */
export function reportOpfsSourceEvicted(kind) {
  send('OPFS source entry was empty or truncated; evicted', 'info', ['opfs-source', 'evicted', kind],
    {kind, condition: 'evicted'})
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
 */
export function reportOpfsDownloadFailed({kind, condition, status}) {
  const tags = {kind, condition}
  if (Number.isFinite(status)) {
    tags.http_status = String(status)
  }
  send('OPFS download failed; fetched directly', 'warning', ['opfs-source', 'download-failed', condition, kind], tags)
}


/**
 * A download completed but couldn't be cached because the browser has no
 * (or refused the) atomic `move()`. The model loaded from memory. Info: an
 * expected browser limit, counted so we know how many users re-download
 * every time.
 *
 * @param {string} kind 'external' | 'local'
 */
export function reportOpfsNotCached(kind) {
  send('OPFS download served from memory, not cached', 'info', ['opfs-source', 'not-cached', 'move-unavailable', kind],
    {kind, condition: 'move-unavailable'})
}


// The only `contexts.load` fields these events carry. An allowlist, so a field
// a later change adds to the load state is withheld until someone decides it
// is safe. NOT here: `fileInfo` (the raw route path or URL, set in
// CadView.jsx from the filepath: for a private GitHub or external model it is
// the path), and anything else that could name the file. `report` is the
// Sentry copy of the load report (model line withheld, privacy/
// sentryRedaction.js), the same text CadView's exception carries.
const LOAD_CONTEXT_FIELDS = ['phase', 'completed', 'total', 'unit', 'elapsedMs', 'memoryMb', 'report']

/**
 * The active load's capture context minus anything that identifies the
 * model: `load.*` tags (phase only) and the allowlisted `load` fields.
 *
 * @param {{tags: object, contexts: object}} load loadFailureCaptureContext()
 * @return {{tags: object, contexts: object}}
 */
function nonIdentifyingLoadContext(load) {
  const tags = {}
  for (const [key, value] of Object.entries(load?.tags ?? {})) {
    if (key === 'load.phase') {
      tags[key] = value
    }
  }
  const source = load?.contexts?.load
  if (!source) {
    return {tags, contexts: {}}
  }
  const loadContext = {}
  for (const field of LOAD_CONTEXT_FIELDS) {
    if (source[field] !== undefined) {
      loadContext[field] = source[field]
    }
  }
  return {tags, contexts: {load: loadContext}}
}


/**
 * One info/warning event with this load's context on it only (never the
 * scope, which later unrelated events would inherit). Best-effort.
 *
 * @param {string} message fixed text, no user data
 * @param {string} level 'info' | 'warning'
 * @param {string[]} fingerprint
 * @param {object} tags
 */
function send(message, level, fingerprint, tags) {
  try {
    const load = nonIdentifyingLoadContext(loadFailureCaptureContext())
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
