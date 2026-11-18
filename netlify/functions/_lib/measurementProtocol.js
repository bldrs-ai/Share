/*
 * netlify/functions/_lib/measurementProtocol.js
 * ---------------------------------------------
 * Sending one event to GA4 from a function, through the Measurement Protocol.
 * Shared by stripe-webhook (subscriptionAnalytics.js) and client-capabilities.
 * Needs GA4_MEASUREMENT_ID and GA4_API_SECRET; callers skip with a log line
 * when either is missing, which is every deploy context but production.
 */


export const MP_COLLECT_URL = 'https://www.google-analytics.com/mp/collect'
// One short budget per send: both callers answer something else first (a
// Stripe acknowledgement, a beacon), and GA is best-effort for both.
export const GA_SEND_TIMEOUT_MS = 1500


/**
 * @param {object} env process.env
 * @return {?{measurementId: string, apiSecret: string}} null unless both are set
 */
export function gaMeasurementConfig(env) {
  const measurementId = env.GA4_MEASUREMENT_ID
  const apiSecret = env.GA4_API_SECRET
  return measurementId && apiSecret ? {measurementId, apiSecret} : null
}


/**
 * POST one event to the Measurement Protocol. Throws on a network failure,
 * a timeout or a non-2xx; the caller swallows it. GA answers 2xx even for a
 * malformed event or a wrong secret, so success here means "delivered", not
 * "counted" — the debug endpoint (/debug/mp/collect) is the way to validate.
 *
 * @param {object} args
 * @param {{measurementId: string, apiSecret: string}} args.config
 * @param {string} args.clientId
 * @param {string} args.name
 * @param {object} args.params
 * @param {number} [args.timeoutMs]
 * @return {Promise<void>}
 */
export async function sendMeasurementProtocolEvent({config, clientId, name, params, timeoutMs = GA_SEND_TIMEOUT_MS}) {
  const url = `${MP_COLLECT_URL}?measurement_id=${encodeURIComponent(config.measurementId)}` +
    `&api_secret=${encodeURIComponent(config.apiSecret)}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    let response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({client_id: clientId, events: [{name, params}]}),
        signal: controller.signal,
      })
    } catch (err) {
      // A fetch error can quote the URL, which carries api_secret. Every
      // caller logs this message, so it is redacted here, once.
      throw new Error(redactSecret(String(err?.message ?? err), config.apiSecret))
    }
    if (!response.ok) {
      throw new Error(`Measurement Protocol answered ${response.status}`)
    }
  } finally {
    clearTimeout(timer)
  }
}


/**
 * @param {string} message
 * @param {string} secret GA4_API_SECRET
 * @return {string} the message with the secret, raw or URL-encoded, replaced
 */
export function redactSecret(message, secret) {
  if (!secret) {
    return message
  }
  return message.split(secret).join('[GA4_API_SECRET]')
    .split(encodeURIComponent(secret)).join('[GA4_API_SECRET]')
}
