/*
 * netlify/functions/page-visit.js
 * -------------------------------
 * Receives a cookieless report of one page load from the page
 * (src/app/pageVisit.js) and passes it to GA4 through the Measurement
 * Protocol. The visit-side twin of model-open-count.js, which it mirrors
 * line for line where it can.
 *
 * Why: with no GA tag in the browser (#2354), GA counts no visits: no users,
 * sessions, page views, sources or countries. This restores the visit count
 * and its coarse splits without an identifier (design/new/model-open-counts.md
 * §"Page visits").
 *
 * What reaches GA: the `page_visit` event with exactly the fields
 * src/privacy/pageVisitReport.js allows (closed enums and GA's own
 * `session_id`), plus `country`. A body with any other key or value, a
 * `country` of its own included, is refused (400).
 *
 * `country` is the only thing this function adds: Netlify's geolocation of
 * the request (`context.geo.country.code`, Functions v2), kept only if it is
 * an ISO 3166-1 alpha-2 code, else `unknown`. It is read from the platform's
 * context, never from the request or the visitor's IP here, and stored
 * nowhere: it is a parameter of the one GA event and nothing else.
 *
 * Answers: 405 for anything but POST; 400 `invalid_page_visit` for a body
 * that doesn't parse as a report (the deployed smoke probe sends `{}`) or
 * declares a length over MAX_VISIT_BYTES; 204 otherwise, whether the report
 * was sent, dropped (an origin that isn't Share's) or skipped (GA not
 * configured, every context but production). GA is best-effort: a failed
 * send is a log line, never a different answer.
 */

import {MAX_VISIT_BYTES, PAGE_VISIT_EVENT, countryParam, parsePageVisitReport} from '../../src/privacy/pageVisitReport.js'
import {FIRST_PARTY_CLIENT_ID} from './_lib/firstPartyClientId.js'
import {gaMeasurementConfig, sendMeasurementProtocolEvent} from './_lib/measurementProtocol.js'
import {isShareOrigin} from './_lib/shareOrigin.js'


const HTTP_NO_CONTENT = 204
const HTTP_BAD_REQUEST = 400
const HTTP_METHOD_NOT_ALLOWED = 405


/**
 * @param {Request} req
 * @param {object} [context] Netlify's Functions v2 context; `geo` is read
 * @return {Promise<Response>}
 */
export default async (req, context) => {
  if (req.method !== 'POST') {
    return json(HTTP_METHOD_NOT_ALLOWED, {error: 'method_not_allowed'})
  }
  // A declared length over the cap is refused before the body is read; a
  // chunked body has no length and is checked after the read, below.
  if (Number(req.headers.get('content-length')) > MAX_VISIT_BYTES) {
    return json(HTTP_BAD_REQUEST, {error: 'invalid_page_visit'})
  }
  let text = ''
  try {
    text = await req.text()
  } catch (_) {
    // An unreadable body is an invalid report, below.
  }
  const report = text.length <= MAX_VISIT_BYTES ? parsePageVisitReport(text) : null
  if (!report) {
    return json(HTTP_BAD_REQUEST, {error: 'invalid_page_visit'})
  }
  // Dropped quietly, since telling a caller why helps only a caller trying
  // to get through.
  if (!isShareOrigin(req.headers.get('origin'))) {
    logInfo(`page-visit: ${report.route_kind} dropped: origin not Share's`)
    return new Response(null, {status: HTTP_NO_CONTENT})
  }
  const config = gaMeasurementConfig(process.env)
  if (!config) {
    logInfo(`page-visit: ${report.route_kind} not sent to GA: GA4_MEASUREMENT_ID and GA4_API_SECRET are not both set`)
    return new Response(null, {status: HTTP_NO_CONTENT})
  }
  const params = {...report, country: countryParam(context?.geo?.country?.code)}
  try {
    // Awaited, not fired and forgotten: Lambda freezes the process when the
    // handler returns, which would cut the POST off.
    await sendMeasurementProtocolEvent({config, clientId: FIRST_PARTY_CLIENT_ID, name: PAGE_VISIT_EVENT, params})
  } catch (err) {
    console.warn(`page-visit: ${report.route_kind} not sent to GA: ${err.message}`)
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
