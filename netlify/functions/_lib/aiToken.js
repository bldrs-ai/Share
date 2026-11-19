/*
 * Anonymous identity for the hosted assistant (design/new/ai-workspace.md §7
 * D5): a relay-issued, HMAC-signed token, and a day-salted hash of the
 * caller's IP. Neither needs storage to verify.
 *
 * Token: `ba1.<anonId>.<issuedAt>.<sig>`
 *  - `anonId`: 16 random bytes, base64url. The ledger key of the anonymous
 *    budget (`ai/anonymous/<anonId>`).
 *  - `issuedAt`: unix seconds.
 *  - `sig`: HMAC-SHA256 over `ba1|anonId|issuedAt`, base64url.
 * It lives for TOKEN_TTL_SECONDS, one anonymous window. A token that is
 * missing, malformed, forged or expired is not an error: the relay mints a
 * fresh one and answers with it (`x-bldrs-ai-token`). Refusing would protect
 * nothing, since anyone can get a fresh token by sending none; what bounds a
 * token-churning client is the IP bucket and the global breaker, not the
 * token. So the token's only job is continuity: one browser's turns land in
 * one anonymous budget.
 *
 * Deliberately NOT bound to the IP: a phone changing networks would lose its
 * budget's continuity and get a fresh one, which is the opposite of what
 * binding is for. The coarse per-network cap is the IP-hash bucket instead
 * (§7 D5 "IP-hash limit").
 *
 * IP hash: HMAC(ipKey, `<UTC day>|<ip>`), so no raw IP is stored, and the
 * hashes don't link across days (§7 D5: "The salt rotates daily").
 *
 * Both keys are derived from one secret, AI_TOKEN_SECRET, so rotating it
 * invalidates every token and re-salts every IP hash at once.
 */
import {createHmac, randomBytes, timingSafeEqual} from 'node:crypto'


export const TOKEN_PREFIX = 'ba1'
const SECONDS_PER_HOUR = 3600
const HOURS_PER_DAY = 24
export const TOKEN_TTL_SECONDS = HOURS_PER_DAY * SECONDS_PER_HOUR
const ANON_ID_BYTES = 16
const IP_HASH_HEX_CHARS = 32
const MILLIS_PER_SECOND = 1000
const ANON_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/
const ISSUED_AT_PATTERN = /^\d{1,12}$/


/**
 * @param {string} secret AI_TOKEN_SECRET
 * @param {string} purpose
 * @return {Buffer} a key for one purpose, so the token and IP keys differ
 */
function derivedKey(secret, purpose) {
  return createHmac('sha256', secret).update(`bldrs-ai|${purpose}`).digest()
}


/**
 * @param {string} secret
 * @param {string} anonId
 * @param {string} issuedAt
 * @return {string} base64url signature
 */
function sign(secret, anonId, issuedAt) {
  return createHmac('sha256', derivedKey(secret, 'anon-token'))
    .update(`${TOKEN_PREFIX}|${anonId}|${issuedAt}`).digest('base64url')
}


/**
 * @param {string} secret AI_TOKEN_SECRET
 * @param {number} [nowMs]
 * @return {{token: string, anonId: string}}
 */
export function mintAnonToken(secret, nowMs = Date.now()) {
  const anonId = randomBytes(ANON_ID_BYTES).toString('base64url')
  const issuedAt = String(Math.floor(nowMs / MILLIS_PER_SECOND))
  return {token: `${TOKEN_PREFIX}.${anonId}.${issuedAt}.${sign(secret, anonId, issuedAt)}`, anonId}
}


/**
 * @param {string} value a bearer value
 * @return {boolean} whether it is shaped like an anonymous token (vs an Auth0 one)
 */
export function looksLikeAnonToken(value) {
  return typeof value === 'string' && value.startsWith(`${TOKEN_PREFIX}.`)
}


/**
 * Verify a token. Never throws.
 *
 * @param {string} secret AI_TOKEN_SECRET
 * @param {string} token
 * @param {number} [nowMs]
 * @return {object} `{ok: true, anonId}`, or `{ok: false, reason}` with reason 'malformed', 'signature'
 *   or 'expired'
 */
export function verifyAnonToken(secret, token, nowMs = Date.now()) {
  const parts = typeof token === 'string' ? token.split('.') : []
  if (parts.length !== 4 || parts[0] !== TOKEN_PREFIX || !ANON_ID_PATTERN.test(parts[1]) ||
      !ISSUED_AT_PATTERN.test(parts[2])) {
    return {ok: false, reason: 'malformed'}
  }
  const [, anonId, issuedAt, sig] = parts
  const expected = Buffer.from(sign(secret, anonId, issuedAt))
  const given = Buffer.from(sig)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return {ok: false, reason: 'signature'}
  }
  const ageSeconds = (nowMs / MILLIS_PER_SECOND) - Number(issuedAt)
  // A token from the future (clock skew beyond a minute) is as suspect as an old one.
  const SKEW_SECONDS = 60
  if (ageSeconds >= TOKEN_TTL_SECONDS || ageSeconds < -SKEW_SECONDS) {
    return {ok: false, reason: 'expired'}
  }
  return {ok: true, anonId}
}


/**
 * @param {string} secret AI_TOKEN_SECRET
 * @param {string} ip the caller's address as Netlify reports it
 * @param {string} day UTC 'YYYY-MM-DD'
 * @return {string} hex, salted by the day; never the IP
 */
export function hashIp(secret, ip, day) {
  return createHmac('sha256', derivedKey(secret, 'ip')).update(`${day}|${ip}`).digest('hex')
    .slice(0, IP_HASH_HEX_CHARS)
}
