/**
 * Where the page keeps the anonymous metering token
 * (netlify/functions/_lib/meteringToken.js; design/new/quotas.md §"The
 * metering token"): ONE token in the browser for every metered anonymous
 * feature — the remote-load meter (`anonMeter.js`) and the hosted
 * assistant (`Components/Bot/assistState.js`) both read and write it here,
 * so a visitor's remote loads and AI spend are one identity, one 30-day
 * period. It is written only when a metered feature's answer carries one.
 * Dependency-free, so the assistant can import it without the meter.
 */


/** localStorage key of the anonymous metering token. */
export const METER_TOKEN_KEY = 'bldrs.meter.token'

/** The request header the remote-load meter takes it in (the assistant's relay takes it as a bearer). */
export const METER_TOKEN_HEADER = 'x-bldrs-meter-token'
