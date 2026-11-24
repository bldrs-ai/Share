/*
 * netlify/functions/model-open-count.js
 * -------------------------------------
 * Receives a cookieless count of one real model open from the page
 * (src/privacy/modelOpenCount.js) and passes it to GA4 through the
 * Measurement Protocol. Modeled on client-capabilities.js, which it mirrors
 * line for line where it can.
 *
 * Why: since #2051 GA is opt-in, so `real_model_open` and `model_view` count
 * only the visitors who consent. This count is sent whatever the visitor
 * chose, and needs no consent because nothing in it is about the visitor:
 * no identifier, nothing stored on the device, and the request to GA comes
 * from this function, so the visitor's IP never reaches Google
 * (design/new/model-open-counts.md).
 *
 * What reaches GA: the `model_open_count` event with exactly the enum fields
 * in src/privacy/modelOpenCountReport.js. A body that isn't exactly those
 * keys with those values is refused (400), so no file name, URL, path or id
 * can be passed through. Every report goes under one fixed client id, so GA
 * counts events, never a browser, and adds no "users".
 *
 * Answers: 405 for anything but POST; 400 `invalid_model_open_count` for a
 * body that doesn't parse as a report (the deployed smoke probe sends `{}`)
 * or declares a length over MAX_REPORT_BYTES; 204 otherwise, whether the
 * report was sent, dropped (an origin that isn't Share's) or skipped (GA not
 * configured, every context but production). GA is best-effort: a failed
 * send is a log line, never a different answer.
 */

import {MAX_REPORT_BYTES, MODEL_OPEN_COUNT_EVENT, parseModelOpenCountReport} from '../../src/privacy/modelOpenCountReport.js'
import {gaMeasurementConfig, sendMeasurementProtocolEvent} from './_lib/measurementProtocol.js'
import {isShareOrigin} from './_lib/shareOrigin.js'


/**
 * The GA client id every count is sent under, for client-capabilities.js
 * #CAPABILITY_CLIENT_ID's reasons: one id adds no users and ties no count to
 * a browser, and it is in GA's `<uint32>.<uint32>` web shape because GA
 * answers 2xx to a malformed id yet may not process the event. The first
 * eight bytes of SHA-256('bldrs-share:model-open-count'), written out so the
 * replays can match it exactly. Its own id, not the capability one, so the
 * two streams can never be read as one client's.
 */
export const MODEL_OPEN_COUNT_CLIENT_ID = '3587090903.711617492'

const HTTP_NO_CONTENT = 204
const HTTP_BAD_REQUEST = 400
const HTTP_METHOD_NOT_ALLOWED = 405


/**
 * @param {Request} req
 * @return {Promise<Response>}
 */
export default async (req) => {
  if (req.method !== 'POST') {
    return json(HTTP_METHOD_NOT_ALLOWED, {error: 'method_not_allowed'})
  }
  // A declared length over the cap is refused before the body is read; a
  // chunked body has no length and is checked after the read, below.
  if (Number(req.headers.get('content-length')) > MAX_REPORT_BYTES) {
    return json(HTTP_BAD_REQUEST, {error: 'invalid_model_open_count'})
  }
  let text = ''
  try {
    text = await req.text()
  } catch (_) {
    // An unreadable body is an invalid report, below.
  }
  const report = text.length <= MAX_REPORT_BYTES ? parseModelOpenCountReport(text) : null
  if (!report) {
    return json(HTTP_BAD_REQUEST, {error: 'invalid_model_open_count'})
  }
  // Dropped quietly, since telling a caller why helps only a caller trying
  // to get through.
  if (!isShareOrigin(req.headers.get('origin'))) {
    logInfo(`model-open-count: ${report.content_type} dropped: origin not Share's`)
    return new Response(null, {status: HTTP_NO_CONTENT})
  }
  const config = gaMeasurementConfig(process.env)
  if (!config) {
    logInfo(`model-open-count: ${report.content_type} not sent to GA: GA4_MEASUREMENT_ID and GA4_API_SECRET are not both set`)
    return new Response(null, {status: HTTP_NO_CONTENT})
  }
  try {
    // Awaited, not fired and forgotten: Lambda freezes the process when the
    // handler returns, which would cut the POST off.
    await sendMeasurementProtocolEvent({config, clientId: MODEL_OPEN_COUNT_CLIENT_ID, name: MODEL_OPEN_COUNT_EVENT, params: report})
  } catch (err) {
    console.warn(`model-open-count: ${report.content_type} not sent to GA: ${err.message}`)
  }
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
