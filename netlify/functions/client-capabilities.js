/*
 * netlify/functions/client-capabilities.js
 * ----------------------------------------
 * Receives a client-capability report from the page
 * (src/privacy/clientCapabilities.js) and passes it to GA4 through the
 * Measurement Protocol.
 *
 * Why a function: the first report is `ga_blocked`, a browser where gtag/js
 * never loaded. GA itself can't count a client that can't reach it, and the
 * Reported Conditions rule (AGENTS.md) keeps an expected client state like
 * this out of Sentry, which is where it went before. A request to Share's own
 * origin gets past blockers that stop googletagmanager.com, and the function
 * reaches google-analytics.com from the server.
 *
 * What reaches GA: the `client_capability` event with exactly the enum
 * fields in src/privacy/clientCapabilityReport.js. A body that isn't exactly
 * those keys with those values is refused (400), so no free text, URL or user
 * agent can be passed through. Every report goes under one fixed client id,
 * so GA counts events, never a browser, and adds no "users". The request to
 * GA comes from the function, so the user's IP doesn't reach it either.
 *
 * Answers: 405 for anything but POST; 400 `invalid_capability_report` for a
 * body that doesn't parse as a report (the deployed smoke probe sends `{}`);
 * 204 otherwise, whether the report was sent, dropped (an origin that isn't
 * Share's) or skipped (GA not configured, every context but production). GA
 * is best-effort: a failed send is a log line, never a different answer.
 */

import {CAPABILITY_REPORT_EVENT, MAX_REPORT_BYTES, parseCapabilityReport} from '../../src/privacy/clientCapabilityReport.js'
import {gaMeasurementConfig, sendMeasurementProtocolEvent} from './_lib/measurementProtocol.js'


/**
 * The GA client id every report is sent under. GA4 counts each client id as a
 * user, so a per-report id would add a user per blocked visit; one id keeps
 * the user counts what they were and leaves the event count as the measure.
 *
 * In GA's web client-id shape, two positive integers joined by a dot, which
 * the Measurement Protocol expects: GA answers 2xx to a malformed id too and
 * then may not process the event (codex on #2224). The two halves are the
 * first eight bytes of SHA-256('bldrs-share:client-capabilities'), the same
 * `<uint32>.<uint32>` construction as subscriptionAnalytics.js
 * #fallbackClientId, written out so the replays can match it exactly.
 */
export const CAPABILITY_CLIENT_ID = '1766230857.3831044998'

const HTTP_NO_CONTENT = 204
const HTTP_BAD_REQUEST = 400
const HTTP_METHOD_NOT_ALLOWED = 405

// The hosts index/ga.js#PROD_HOSTNAMES loads GA on, plus local dev.
const ALLOWED_ORIGINS = new Set(['https://bldrs.ai', 'https://www.bldrs.ai', 'http://localhost:8080', 'http://localhost:8888'])
const DEPLOY_PREVIEW_ORIGIN = /^https:\/\/deploy-preview-\d+--bldrs-share(-prod)?\.netlify\.app$/


/**
 * @param {Request} req
 * @return {Promise<Response>}
 */
export default async (req) => {
  if (req.method !== 'POST') {
    return json(HTTP_METHOD_NOT_ALLOWED, {error: 'method_not_allowed'})
  }
  let text = ''
  try {
    text = await req.text()
  } catch (_) {
    // An unreadable body is an invalid report, below.
  }
  const report = text.length <= MAX_REPORT_BYTES ? parseCapabilityReport(text) : null
  if (!report) {
    return json(HTTP_BAD_REQUEST, {error: 'invalid_capability_report'})
  }
  // A cheap guard against counts sent from elsewhere: a browser always sets
  // Origin on a POST. Dropped quietly, since telling a caller why helps only
  // a caller trying to get through.
  if (!isAllowedOrigin(req.headers.get('origin'))) {
    logInfo(`client-capabilities: ${report.condition} dropped: origin not Share's`)
    return new Response(null, {status: HTTP_NO_CONTENT})
  }
  const config = gaMeasurementConfig(process.env)
  if (!config) {
    logInfo(`client-capabilities: ${report.condition} not sent to GA: GA4_MEASUREMENT_ID and GA4_API_SECRET are not both set`)
    return new Response(null, {status: HTTP_NO_CONTENT})
  }
  try {
    // Awaited, not fired and forgotten: Lambda freezes the process when the
    // handler returns, which would cut the POST off.
    await sendMeasurementProtocolEvent({config, clientId: CAPABILITY_CLIENT_ID, name: CAPABILITY_REPORT_EVENT, params: report})
  } catch (err) {
    console.warn(`client-capabilities: ${report.condition} not sent to GA: ${err.message}`)
  }
  return new Response(null, {status: HTTP_NO_CONTENT})
}


/**
 * @param {?string} origin
 * @return {boolean}
 */
export function isAllowedOrigin(origin) {
  return typeof origin === 'string' && (ALLOWED_ORIGINS.has(origin) || DEPLOY_PREVIEW_ORIGIN.test(origin))
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
