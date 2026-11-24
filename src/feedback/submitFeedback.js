import {v4 as uuid} from 'uuid'
import {gtagEvent, modelActionTier} from '../privacy/analytics'
import {withholdModelNames} from '../privacy/sentryRedaction'
import {scrubLocations} from '../privacy/textScrub'
import useStore from '../store/useStore'
import {
  FEEDBACK_RECORD_VERSION,
  FEEDBACK_SOURCES,
  MAX_NOTE_CHARS,
  MAX_PROMPT_CHARS,
  MAX_REPLY_CHARS,
} from './feedbackRecord'
import {feedbackView} from './feedbackView'


/**
 * Feedback from the user to Bldrs, from any place in the app that offers it
 * (design/tracks/community-t100/feedback.md). One rating, note or screenshot goes to two sinks,
 * split by what each may hold:
 *
 * - GA gets `feedback_submitted`, structured fields only (feedbackGaParams):
 *   the counts dashboards read. Never text, a screenshot, a model name or a
 *   path.
 * - Bldrs' own store gets the record (feedbackRecord.js): the note, the
 *   screenshot when the user attached one, the view, and the source's
 *   context, posted to the same-origin `feedback` function under the same
 *   `feedback_id`. For a model that isn't Share-hosted, its names and paths
 *   are withheld from the text first, and anything shaped like a URL, path
 *   or model file name after that (privacy/textScrub.js).
 *
 * A failed post is the user's to retry (postFeedback, same record), and is
 * counted in GA as `feedback_failed` with `stage: 'send'`. Nothing reaches
 * Sentry: a lost report is volume, not something to go fix, unless the
 * failures climb, which the GA count shows (CLAUDE.md "Reported Conditions").
 */


/** The same-origin function that stores records (netlify/functions/feedback.js). */
export const FEEDBACK_PATH = '/.netlify/functions/feedback'

export const FEEDBACK_SUBMITTED_EVENT = 'feedback_submitted'
export const FEEDBACK_FAILED_EVENT = 'feedback_failed'

export const RATINGS = Object.freeze({UP: 'up', DOWN: 'down', NONE: 'none'})

/** What failed, on `feedback_failed`: the post, or a screenshot capture (captureScreenshot.js). */
export const FAILURE_STAGES = Object.freeze({SEND: 'send', SCREENSHOT: 'screenshot'})


/**
 * What each source adds on the client side, beside feedbackRecord.js's
 * context allowlist:
 * - `text`: its context's free-text fields and their caps. They get the same
 *   model-name withholding as the note.
 * - `ga`: its structured GA extras, picked from the context. Only counts and
 *   closed sets, never a text field.
 */
const SOURCE_SPECS = Object.freeze({
  [FEEDBACK_SOURCES.ASSIST_REPLY]: {
    text: {reply: MAX_REPLY_CHARS, prompt: MAX_PROMPT_CHARS},
    ga: (context) => ({model_choice: context.model_choice, steps: context.steps, tool_calls: context.tool_calls}),
  },
  [FEEDBACK_SOURCES.GENERAL]: {
    text: {},
    ga: () => ({}),
  },
})


/**
 * The `feedback_submitted` params: exactly these structured fields, so no
 * text can ride along. `feedback_id` is the record's key in the store, the
 * only thing the two sinks share.
 *
 * The feedback's source is `feedback_source`, not `source`: GA keys a custom
 * dimension by parameter name, and `source` is already the model's source
 * (local | hosted) on the normalized model events (quotas.md §"Analytics:
 * normalized tier events"), which this event also sends.
 *
 * @param {object} record a built record
 * @return {object}
 */
export function feedbackGaParams(record) {
  const {model} = record.view
  const params = {
    feedback_id: record.feedback_id,
    feedback_source: record.source,
    has_note: record.note === '' ? 'false' : 'true',
    has_screenshot: record.screenshot === null ? 'false' : 'true',
    tier: record.tier,
    ...SOURCE_SPECS[record.source].ga(record.context),
  }
  if (record.rating !== null) {
    params.rating = record.rating
  }
  if (model.source) {
    params.source = model.source
  }
  if (model.route_kind) {
    params.route_kind = model.route_kind
  }
  return params
}


/**
 * Build a record as the store gets it.
 *
 * @param {object} feedback
 * @param {string} feedback.source FEEDBACK_SOURCES
 * @param {?string} [feedback.rating] RATINGS, or null for none at all
 * @param {string} [feedback.note]
 * @param {?string} [feedback.screenshot] a JPEG data URL (captureScreenshot.js), or null
 * @param {object} [feedback.context] the source's (feedbackRecord.js CONTEXT_CHECKS)
 * @param {boolean} [feedback.isAuthenticated] for the tier
 * @param {object} [feedback.state] the store's
 * @return {object} the record
 */
export function buildFeedbackRecord({source, rating = null, note = '', screenshot = null, context = {},
  isAuthenticated = false, state = useStore.getState()}) {
  const spec = SOURCE_SPECS[source]
  if (!spec) {
    throw new Error(`unknown feedback source: ${source}`)
  }
  const {view, names, isPublic} = feedbackView(state)
  const isClear = rating === RATINGS.NONE
  // Two layers for any model that isn't Share-hosted (feedback.md
  // §"Privacy"): the precise one withholds the names Share knows for it, then
  // the structural backstop withholds anything shaped like a URL, a path or
  // a model file name, whatever it names. A Share-hosted model's text is
  // public and kept as written. Withheld, then capped: a placeholder is
  // longer than most names, so a cap first could push the text back over.
  const safe = (text, max) => {
    const named = withholdModelNames(String(text ?? ''), names)
    return (isPublic ? named : scrubLocations(named)).slice(0, max)
  }
  const safeContext = {...context}
  for (const [field, max] of Object.entries(spec.text)) {
    safeContext[field] = safe(context[field], max)
  }
  return {
    v: FEEDBACK_RECORD_VERSION,
    feedback_id: uuid(),
    source,
    rating,
    // A clear retracts; it carries no note or screenshot.
    note: isClear ? '' : safe(note.trim(), MAX_NOTE_CHARS),
    screenshot: isClear ? null : screenshot,
    view,
    tier: modelActionTier({isAuthenticated, appMetadata: state.appMetadata}),
    context: safeContext,
  }
}


/**
 * Post a record to the store. A failure is counted in GA and answered false;
 * the caller shows the hint and may post the same record again.
 *
 * @param {object} record from buildFeedbackRecord
 * @return {Promise<boolean>} whether the store took it
 */
export async function postFeedback(record) {
  let status = 0
  try {
    const response = await globalThis.fetch(FEEDBACK_PATH, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(record),
    })
    if (response.ok) {
      return true
    }
    status = response.status
  } catch {
    status = 0
  }
  reportFeedbackFailure({
    source: record.source, stage: FAILURE_STAGES.SEND, reason: status === 0 ? 'network' : 'http', status,
    feedbackId: record.feedback_id,
  })
  return false
}


/**
 * Send feedback: GA gets one `feedback_submitted`, the store the record. A
 * retry after a failed post goes through postFeedback with the returned
 * record, so GA isn't told twice.
 *
 * @param {object} feedback buildFeedbackRecord's
 * @return {Promise<{ok: boolean, record: object}>}
 */
export async function submitFeedback(feedback) {
  const record = buildFeedbackRecord(feedback)
  gtagEvent(FEEDBACK_SUBMITTED_EVENT, feedbackGaParams(record))
  return {ok: await postFeedback(record), record}
}


/**
 * `feedback_failed`, structured fields only.
 *
 * @param {object} failure
 * @param {string} failure.source FEEDBACK_SOURCES
 * @param {string} failure.stage FAILURE_STAGES
 * @param {string} failure.reason a closed set per stage: `network` | `http`
 *   for a send, frameCapture.js CAPTURE_FAILURES for a screenshot
 * @param {number} [failure.status] the HTTP status of a refused send
 * @param {string} [failure.feedbackId] the record's, for a send
 */
export function reportFeedbackFailure({source, stage, reason, status, feedbackId}) {
  gtagEvent(FEEDBACK_FAILED_EVENT, {
    feedback_source: source,
    stage,
    reason,
    ...(status ? {status} : {}),
    ...(feedbackId ? {feedback_id: feedbackId} : {}),
  })
}
