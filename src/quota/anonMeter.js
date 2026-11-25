/**
 * The page's side of the anonymous remote-load meter (design/new/quotas.md
 * §"Anonymous metering"): a signed-out visitor may open
 * ANONYMOUS_REMOTE_LOAD_LIMIT models from GitHub, Google Drive or a URL per
 * 30-day period; the last of them shows a non-blocking notice, and one past
 * it is gated by a sign-in prompt and doesn't open. The `meter` function
 * decides and keeps the count; this module asks it, keeps the visitor's
 * metering token, and carries it into the account at sign-in.
 *
 * The token is stored only once the visitor first uses a metered feature:
 * nothing is written for a visitor who only opens local files, the demo or
 * the samples, because none of those calls the meter. It is the server's
 * token, signed and good for one period; when it expires the server answers
 * the next metered use with a new, unrelated one, which replaces it here.
 * Signing out keeps it, so a visitor who signs in and out is where they were.
 *
 * Fails OPEN: an unreachable meter, a 5xx or anything unexpected loads the
 * model unmetered, as useQuota does for record-load. Quotas must never make
 * the app less available than it is without them.
 *
 * Sends nothing to GA: the funnel's stage counts are the server's, one
 * Measurement Protocol event per token per stage under a fixed client id, so
 * the meter never depends on GA in the browser (which may be blocked or
 * declined) and never makes a per-visitor event. Limit data stays limit data
 * (netlify/functions/_lib/meterLedger.js).
 */
import {isFeatureEnabled} from '../FeatureFlags'
import {HTTP_FORBIDDEN} from '../net/http'
import {isAnonMeteredKey} from './anonMeterKeys'
import {modelSlotKey} from './modelSlotKey'


export const METER_ENDPOINT = '/.netlify/functions/meter'
export const METER_TOKEN_HEADER = 'x-bldrs-meter-token'
/** localStorage: the visitor's metering token. */
export const METER_TOKEN_KEY = 'bldrs.meter.token'
/** localStorage: the token last carried into an account, so the link is asked for once. */
export const METER_LINKED_KEY = 'bldrs.meter.linked'
export const ANON_NOTICES = Object.freeze({LAST_FREE: 'last_free'})


/**
 * Whether the anonymous meter is on: with the `quotas` enforcement flag,
 * unless its own kill switch `disableAnonymousMetering` is.
 *
 * @return {boolean}
 */
export function isAnonMeteringEnabled() {
  return isFeatureEnabled('quotas') && !isFeatureEnabled('disableAnonymousMetering')
}


/**
 * The key a signed-out load of `modelPath` is metered under, or null when it
 * is not a metered remote load (a local file, the demo, a sample).
 *
 * @param {?object} modelPath routes.ts#handleRoute's result
 * @param {?string} appPrefix
 * @return {Promise<?string>}
 */
export async function anonRemoteLoadKey(modelPath, appPrefix) {
  if (!modelPath || !(modelPath.kind === 'provider' || modelPath.kind === 'url')) {
    return null
  }
  let key = null
  try {
    key = await modelSlotKey(modelPath, appPrefix)
  } catch {
    return null
  }
  return isAnonMeteredKey(key) ? key : null
}


/**
 * Whether a route could be a metered remote load, without hashing anything:
 * the cheap check that decides whether CadView waits for sign-in to settle.
 *
 * @param {?object} modelPath
 * @return {boolean}
 */
export function mayBeAnonRemoteLoad(modelPath) {
  return Boolean(modelPath) && (modelPath.kind === 'provider' || modelPath.kind === 'url')
}


/** @return {?string} the stored metering token */
export function readMeterToken() {
  try {
    return window.localStorage.getItem(METER_TOKEN_KEY)
  } catch {
    return null
  }
}


/** @param {string} token */
function storeMeterToken(token) {
  try {
    window.localStorage.setItem(METER_TOKEN_KEY, token)
  } catch {
    // Storage blocked (a private window): the next use mints again, and the
    // IP-hash cap is what bounds it.
  }
}


/**
 * @typedef {object} AnonMeterDecision
 * @property {boolean} open whether the model may load
 * @property {?string} notice 'last_free' when this was the period's last free remote load
 * @property {?string} [periodEnd] when the period ends, ISO, with a notice
 * @property {?object} gate `{gatedBy, used, limit, periodEnd}` when it may not
 */


/**
 * Ask the meter whether a signed-out visitor's remote load may open. Never
 * rejects.
 *
 * @param {string} key {@link anonRemoteLoadKey}'s
 * @param {Function} [fetchImpl]
 * @return {Promise<AnonMeterDecision>}
 */
export async function meterAnonRemoteLoad(key, fetchImpl = globalThis.fetch) {
  const token = readMeterToken()
  let res
  let body
  try {
    res = await fetchImpl(METER_ENDPOINT, {
      method: 'POST',
      headers: {'content-type': 'application/json', ...(token ? {[METER_TOKEN_HEADER]: token} : {})},
      body: JSON.stringify({action: 'remote_load', key}),
    })
    body = await res.json()
  } catch {
    return {open: true, notice: null, gate: null}
  }
  if (body && typeof body.token === 'string') {
    storeMeterToken(body.token)
  }
  if (res.status === HTTP_FORBIDDEN && body?.allowed === false) {
    return {open: false, notice: null,
      gate: {gatedBy: body.gatedBy ?? 'token', used: body.used, limit: body.limit, periodEnd: body.periodEnd ?? null}}
  }
  const isLastFree = res.ok && body?.notice === ANON_NOTICES.LAST_FREE
  return {open: true, notice: isLastFree ? ANON_NOTICES.LAST_FREE : null, gate: null,
    ...(isLastFree ? {periodEnd: body.periodEnd ?? null} : {})}
}


/**
 * The link at sign-in: carry this browser's metering token's current period
 * into the account, once per token. Only the token held now; the server
 * marks it merged, and it keeps metering after a sign-out. Never rejects.
 *
 * @param {Function} getAccessToken resolves an Auth0 access token
 * @param {Function} [fetchImpl]
 * @return {Promise<?object>} the server's answer, or null when nothing was asked
 */
export async function linkAnonMeter(getAccessToken, fetchImpl = globalThis.fetch) {
  const token = readMeterToken()
  let linked = null
  try {
    linked = window.localStorage.getItem(METER_LINKED_KEY)
  } catch {
    linked = null
  }
  if (!token || linked === token) {
    return null
  }
  try {
    const accessToken = await getAccessToken()
    const res = await fetchImpl(METER_ENDPOINT, {
      method: 'POST',
      headers: {'content-type': 'application/json', 'authorization': `Bearer ${accessToken}`,
        [METER_TOKEN_HEADER]: token},
      body: JSON.stringify({action: 'link'}),
    })
    if (!res.ok) {
      // 401 or 503: try again at the next sign-in settle.
      return null
    }
    const body = await res.json()
    try {
      window.localStorage.setItem(METER_LINKED_KEY, token)
    } catch {
      // The server marked it merged; a repeat is answered already_merged.
    }
    return body
  } catch {
    return null
  }
}


/**
 * The whole gate for one signed-out load: the key, then the meter. Not a
 * metered remote load → open. Never rejects.
 *
 * @param {?object} modelPath
 * @param {?string} appPrefix
 * @param {Function} [fetchImpl]
 * @return {Promise<AnonMeterDecision>}
 */
export async function gateAnonRemoteLoad(modelPath, appPrefix, fetchImpl = globalThis.fetch) {
  const key = await anonRemoteLoadKey(modelPath, appPrefix)
  return key === null ? {open: true, notice: null, gate: null} : meterAnonRemoteLoad(key, fetchImpl)
}
