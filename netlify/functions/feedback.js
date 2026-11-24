/*
 * Netlify Function (v2): feedback
 * -------------------------------
 * Stores one piece of user feedback in Netlify Blobs, from any place in the
 * app that offers it (design/new/feedback.md): a rating, a note, an opt-in
 * screenshot of the 3D view, the view's structured snapshot (model ref,
 * camera, selection), and a context whose fields depend on the record's
 * `source` (the assistant's thumbs send the rated reply and the message
 * before it, Share#2306). The page sends it (src/feedback/submitFeedback.js);
 * GA gets only the structured `feedback_submitted` event, which shares the
 * record's `feedback_id` and nothing else.
 *
 *   POST /.netlify/functions/feedback   (JSON, the record)
 *   → 204 stored, or already stored under that id
 *   → 400 {error: 'invalid_feedback'}           not exactly a record of a known source
 *                                               (src/feedback/feedbackRecord.js)
 *   → 403 {error: 'feedback_forbidden_origin'}  a browser on another site
 *   → 405 {error: 'method_not_allowed'}
 *   → 413 {error: 'feedback_too_large'}         a body over MAX_FEEDBACK_BYTES, declared or as read
 *   → 500 {error: 'feedback_not_configured'}    the blob store couldn't be opened
 *   → 502 {error: 'feedback_store_failed'}      the write failed; the page offers a retry
 *
 * Where it lands: the `feedback` store, one blob per record, keyed by
 * `feedback_id`, holding the record (its `source` included) plus `at`, when
 * this function stored it; the page's clock isn't trusted. A change of mind
 * is a new record with a new id; the reader groups by the source's subject
 * and takes the latest, and a `rating: 'none'` record retracts.
 *
 * The write is `onlyIfNew`: a retry of a post whose answer was lost finds the
 * blob there and answers 204, and a caller who learnt someone's id (it is
 * in GA) can't overwrite their record. @netlify/blobs 10.7.4 drops the
 * condition from `setJSON` (_lib/aiLedger.js "The 10.7.4 trap"), so this is
 * `set` with a JSON string.
 *
 * Who may post: the app's own pages (_lib/aiOrigin.js, the relay's rule), so
 * another site can't have its visitors' browsers fill the store. A script
 * can set any Origin; it is bounded by the body cap and the per-source shape
 * check, which keep any one post small and typed. There is no per-caller rate
 * limit yet, nor a retention limit on the store: both are follow-ups in the
 * design doc.
 *
 * The store is opened inside the handler, never at module scope
 * (design/new/netlify-functions-testing.md "Adding a function").
 */
import {getStore} from '@netlify/blobs'
import {MAX_FEEDBACK_BYTES, parseFeedbackRecord} from '../../src/feedback/feedbackRecord.js'
import {isAllowedOrigin, originHostForLog} from './_lib/aiOrigin.js'
import {readCappedText} from './_lib/readCappedBody.js'


export const FEEDBACK_STORE = 'feedback'

const HTTP_NO_CONTENT = 204
const HTTP_BAD_REQUEST = 400
const HTTP_FORBIDDEN = 403
const HTTP_METHOD_NOT_ALLOWED = 405
const HTTP_PAYLOAD_TOO_LARGE = 413
const HTTP_INTERNAL_ERROR = 500
const HTTP_BAD_GATEWAY = 502


/**
 * @param {Request} req
 * @return {Promise<Response>}
 */
export default async function handler(req) {
  if (req.method !== 'POST') {
    return json(HTTP_METHOD_NOT_ALLOWED, {error: 'method_not_allowed'})
  }
  // A declared length over the cap is refused before the body is read; a
  // chunked body has no length and is checked after the read.
  if (Number(req.headers.get('content-length')) > MAX_FEEDBACK_BYTES) {
    return json(HTTP_PAYLOAD_TOO_LARGE, {error: 'feedback_too_large'})
  }
  // Counted in bytes as it streams, so a chunked body (no length to refuse
  // above) or one of multibyte text is stopped at the cap, not buffered whole.
  const read = await readCappedText(req, MAX_FEEDBACK_BYTES)
  if (read.tooLarge) {
    return json(HTTP_PAYLOAD_TOO_LARGE, {error: 'feedback_too_large'})
  }
  // An unreadable body is an invalid record, below.
  const text = read.text ?? ''
  // Shape first, as client-capabilities does: the deployed smoke probe posts
  // `{}` with the deploy's own Origin, and is answered without the store.
  const record = parseFeedbackRecord(text)
  if (!record) {
    return json(HTTP_BAD_REQUEST, {error: 'invalid_feedback'})
  }
  if (!isAllowedOrigin(req, process.env)) {
    logInfo(`feedback: refused, origin ${originHostForLog(req)}`)
    return json(HTTP_FORBIDDEN, {error: 'feedback_forbidden_origin'})
  }
  let store
  try {
    store = getStore({name: FEEDBACK_STORE, consistency: 'strong'})
  } catch (err) {
    console.error(`feedback: not configured, blob store: ${err.name}`)
    return json(HTTP_INTERNAL_ERROR, {error: 'feedback_not_configured'})
  }
  try {
    await store.set(record.feedback_id, JSON.stringify({...record, at: new Date().toISOString()}), {onlyIfNew: true})
  } catch (err) {
    // Never the record: it holds the user's text and screenshot.
    console.warn(`feedback: write failed: ${err.name}`)
    return json(HTTP_BAD_GATEWAY, {error: 'feedback_store_failed'})
  }
  logInfo(`feedback: stored ${record.source} ${record.rating ?? 'unrated'}`)
  return new Response(null, {status: HTTP_NO_CONTENT})
}


/**
 * @param {number} status
 * @param {object} body
 * @return {Response}
 */
function json(status, body) {
  return new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}})
}


/**
 * An expected outcome is INFO in the function log: Netlify labels each line
 * by its console method.
 *
 * @param {string} message
 */
function logInfo(message) {
  // eslint-disable-next-line no-console -- an expected outcome is INFO, not a warning
  console.log(message)
}
