/*
 * The anonymous metering token (design/new/quotas.md §"Anonymous
 * metering"): one server-issued, HMAC-signed identity shared by every metered
 * anonymous feature, today the signed-out visitor's remote model loads
 * (`meter.js`). The scheme is the AI relay's, generalized (`anonToken.js`).
 *
 * It lives exactly one metering period (`src/quota/period.js`, 30 days): its
 * `issuedAt` IS the period's start, so the token carries its own period and
 * no store is needed to know when the period ends. At the end it is not
 * renewed: the next metered use mints a new, unrelated one (a fresh random
 * id), which starts the next period. Nothing links the two, so the visitor
 * is not followed from one period to the next.
 *
 * Signed with METERING_TOKEN_SECRET, or AI_TOKEN_SECRET when that is unset,
 * so production needs no new secret to start. The two schemes derive their
 * keys under different namespaces and use different prefixes, so a token or
 * an IP hash of one never verifies or matches as the other even under one
 * secret; setting METERING_TOKEN_SECRET later splits their rotation (and
 * invalidates every metering token, which starts every visitor's period
 * afresh: the IP-hash cap still bounds the day).
 */
import {PERIOD_DAYS, periodStartingAt} from '../../../src/quota/period.js'
import {anonTokenScheme} from './anonToken.js'


export const METERING_TOKEN_PREFIX = 'bm1'
const SECONDS_PER_DAY = 86400
export const METERING_TOKEN_TTL_SECONDS = PERIOD_DAYS * SECONDS_PER_DAY

const SCHEME = anonTokenScheme({
  prefix: METERING_TOKEN_PREFIX,
  ttlSeconds: METERING_TOKEN_TTL_SECONDS,
  namespace: 'bldrs-meter',
})


/**
 * @param {object} env process.env
 * @return {?string} the signing secret, or null when this deploy has neither
 */
export function meteringTokenSecret(env) {
  return env.METERING_TOKEN_SECRET || env.AI_TOKEN_SECRET || null
}


/**
 * A new token, and with it a new period starting now.
 *
 * @param {string} secret
 * @param {number} [nowMs]
 * @return {{token: string, anonId: string, period: {start: number, end: number}}}
 */
export function mintMeteringToken(secret, nowMs = Date.now()) {
  const {token, anonId, issuedAtMs} = SCHEME.mint(secret, nowMs)
  return {token, anonId, period: periodStartingAt(issuedAtMs)}
}


/**
 * Verify a token. Never throws. An expired token is one whose period has
 * ended.
 *
 * @param {string} secret
 * @param {*} token
 * @param {number} [nowMs]
 * @return {object} `{ok: true, anonId, period}`, or `{ok: false, reason}` ('malformed', 'signature',
 *   'expired')
 */
export function verifyMeteringToken(secret, token, nowMs = Date.now()) {
  const verified = SCHEME.verify(secret, token, nowMs)
  return verified.ok ? {ok: true, anonId: verified.anonId, period: periodStartingAt(verified.issuedAtMs)} : verified
}


/**
 * The day-salted IP hash the per-network cap is keyed by.
 *
 * @param {string} secret
 * @param {string} ip
 * @param {string} day UTC 'YYYY-MM-DD'
 * @return {string} hex; never the IP
 */
export function hashMeteringIp(secret, ip, day) {
  return SCHEME.hashIp(secret, ip, day)
}
