import {normalizeMessageDigits} from '../utils/messageGrouping'


/**
 * The load status conway records when the bytes are not a STEP file it
 * recognises (conway#741): the reason then names the shape (zip, UTF-16,
 * header syntax error at byte N, unknown FILE_SCHEMA, …).
 */
export const STATUS_UNRECOGNIZED_FORMAT = 'UNRECOGNIZED_FORMAT'

// The reason is an engine string (for OPEN_FAIL, a raw exception message),
// so it is capped before it reaches a dialog or a Sentry tag. Sentry also
// truncates tag values past 200 characters; staying under that keeps the
// value searchable as written.
const MAX_REASON_CHARS = 160
const MAX_TAG_CHARS = 200

/**
 * What GA is told when an engine open failure's alert is shown. A constant,
 * never the alert's text: that text carries conway's free-form reason, which
 * can hold file-derived or raw exception content and has unbounded
 * cardinality. The class of failure reaches GA through `load_failed`'s
 * closed-set `reason_class` (loadAnalytics#classifyLoadFailure).
 */
export const ENGINE_FAILURE_ALERT_EVENT = 'Engine open failure'


/**
 * Thrown when conway's `OpenModel*` returned -1 and, on that open's
 * statistics, recorded a reason other than a schema refusal (conway#742's
 * `getLoadFailureReason()`, with a load status such as `UNRECOGNIZED_FORMAT`,
 * `OPEN_FAIL` or `INDEX_RESTORE_FAIL`).
 *
 * Before the reason existed every one of these reached Share as the same
 * `parseIfcWithConway: OpenModel returned -1`: a renamed `.ifczip`, a UTF-16
 * re-save and an engine exception could not be told apart in the dialog, in
 * Sentry or in GA. The message keeps that original text as its prefix, so
 * anything keyed on it (the `parse` pattern in loadAnalytics, tests, Sentry
 * search) still matches; the reason follows it.
 *
 * A typed refusal for a schema has its own class
 * (`UnsupportedSchemaError`, unsupportedSchema.js); this one is the failure-with-a-reason
 * case, and is a real failure for triage — it is still captured in Sentry
 * as an error, now with the reason on the event.
 */
export class EngineOpenFailureError extends Error {
  /**
   * @param {number|undefined} modelID what OpenModel* returned
   * @param {string} status conway's load status for the attempt
   * @param {string} reason conway's failure reason for the attempt
   */
  constructor(modelID, status, reason) {
    const tidy = tidyReason(reason)
    super(`parseIfcWithConway: OpenModel returned ${modelID}: ${tidy}`)
    this.name = 'EngineOpenFailureError'
    this.status = status
    // The tidy form is for people and tags; the engine's own text is kept
    // for the Sentry context, where the whole diagnostic is the point.
    this.reason = tidy
    this.rawReason = String(reason)
  }

  /**
   * The short, human-readable form for the alert dialog.
   *
   * @return {string}
   */
  get alertMessage() {
    return this.status === STATUS_UNRECOGNIZED_FORMAT ?
      `Share couldn't read this file: ${this.reason}.` :
      `Share couldn't open this model: ${this.reason}.`
  }
}


/**
 * Collapse whitespace, drop a trailing period and cap the length, so the
 * reason reads as a clause inside a sentence.
 *
 * @param {string} reason
 * @return {string}
 */
function tidyReason(reason) {
  const flat = String(reason).replace(/\s+/g, ' ').trim().replace(/\.+$/, '')
  return flat.length > MAX_REASON_CHARS ? `${flat.slice(0, MAX_REASON_CHARS - 1)}…` : flat
}


/**
 * Sentry capture context for an {@link EngineOpenFailureError}: what the
 * engine said, searchable and groupable without opening the event.
 *
 * - `engine.load_status` tag: low cardinality (a handful of conway
 *   statuses), and the fingerprint's second element, so a zip archive and
 *   an engine exception no longer share one issue. `{{ default }}` keeps
 *   the stack-based grouping the generic error had; the status only splits it.
 * - `engine.failure_reason` tag: the reason with digit runs collapsed
 *   (messageGrouping#normalizeMessageDigits), so "syntax error at byte
 *   1042" and "…byte 7" are one value. The exact text is in the
 *   `engine_failure` context.
 *
 * Passed as a capture context, not set on the scope: a scope tag would ride
 * along on every later event of the SPA session.
 *
 * @param {EngineOpenFailureError} err
 * @return {{tags: object, contexts: object, fingerprint: string[]}}
 */
export function engineFailureCaptureContext(err) {
  return {
    tags: {
      'engine.load_status': err.status,
      'engine.failure_reason': normalizeMessageDigits(err.reason).slice(0, MAX_TAG_CHARS),
      ...engineSourceTags(err),
    },
    contexts: {
      engine_failure: {status: err.status, reason: err.rawReason},
    },
    fingerprint: ['{{ default }}', err.status],
  }
}


/**
 * The source-mode tags a failed engine-worker open carries
 * (engine/engineModelLoad.js#withEngineSource; the source policy,
 * engine/sourcePolicy.js): `engine_source` `buffered` | `windowed`, and the
 * policy's reason code, so a failed buffered open can be told from any other
 * open failure. Structured values only; empty for an error without them (a
 * main-thread load, a worker from before the policy).
 *
 * @param {Error} err
 * @return {object}
 */
export function engineSourceTags(err) {
  if (typeof err?.engineSource !== 'string') {
    return {}
  }
  return {engine_source: err.engineSource, engine_source_reason: String(err.engineSourceReason ?? 'unknown')}
}
