/*
 * Anonymous identity for the hosted assistant (design/new/ai-workspace.md §7
 * D5): a relay-issued, HMAC-signed token, and a day-salted hash of the
 * caller's IP. Neither needs storage to verify. The scheme itself is shared
 * (`anonToken.js`) with the 30-day metering token (`meteringToken.js`); what
 * is the relay's own is below.
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
import {anonTokenScheme} from './anonToken.js'


export const TOKEN_PREFIX = 'ba1'
const SECONDS_PER_HOUR = 3600
const HOURS_PER_DAY = 24
export const TOKEN_TTL_SECONDS = HOURS_PER_DAY * SECONDS_PER_HOUR

// The AI relay's scheme of the shared anonymous token (`anonToken.js`). Its
// namespace and prefix are what they were before the token was shared, so
// every token and IP hash already issued still verifies. Moving the relay to
// the 30-day metering token (`meteringToken.js`) is the owner's open choice
// of a 30-day anonymous AI budget (design/new/quotas.md §"Anonymous
// metering": AI chat stays on this 24-hour window for now); it is a change of
// which scheme `ai-chat.js#identify` verifies, and of `aiCredits.js`'s
// anonymous window, not of the token.
const SCHEME = anonTokenScheme({prefix: TOKEN_PREFIX, ttlSeconds: TOKEN_TTL_SECONDS, namespace: 'bldrs-ai'})


/**
 * @param {string} secret AI_TOKEN_SECRET
 * @param {number} [nowMs]
 * @return {{token: string, anonId: string}}
 */
export function mintAnonToken(secret, nowMs = Date.now()) {
  const {token, anonId} = SCHEME.mint(secret, nowMs)
  return {token, anonId}
}


/**
 * @param {string} value a bearer value
 * @return {boolean} whether it is shaped like an anonymous token (vs an Auth0 one)
 */
export function looksLikeAnonToken(value) {
  return SCHEME.looksLike(value)
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
  const verified = SCHEME.verify(secret, token, nowMs)
  return verified.ok ? {ok: true, anonId: verified.anonId} : verified
}


/**
 * @param {string} secret AI_TOKEN_SECRET
 * @param {string} ip the caller's address as Netlify reports it
 * @param {string} day UTC 'YYYY-MM-DD'
 * @return {string} hex, salted by the day; never the IP
 */
export function hashIp(secret, ip, day) {
  return SCHEME.hashIp(secret, ip, day)
}
