/*
 * A server-issued anonymous identity: an HMAC-signed token, and a day-salted
 * hash of the caller's IP. Neither needs storage to verify. Shared by the
 * hosted assistant (`aiToken.js`, design/new/ai-workspace.md §7 D5) and the
 * metering token every other metered anonymous feature uses
 * (`meteringToken.js`, design/new/quotas.md §"Anonymous metering"); each is a
 * scheme here with its own prefix, lifetime and key namespace, so a token of
 * one is never accepted as the other.
 *
 * Token: `<prefix>.<anonId>.<issuedAt>.<sig>`
 *  - `anonId`: 16 random bytes, base64url: the ledger key of the anonymous
 *    budget. Random per mint, so two tokens are unrelated.
 *  - `issuedAt`: unix seconds.
 *  - `sig`: HMAC-SHA256 over `<prefix>|anonId|issuedAt`, base64url, under a
 *    key derived from the secret and the scheme's namespace.
 * It lives for the scheme's `ttlSeconds` and is never renewed in place: a
 * token that is missing, malformed, forged or expired is not an error, the
 * caller mints a fresh, unrelated one. Refusing would protect nothing, since
 * anyone can get a fresh token by sending none; what bounds a token-churning
 * client is the IP-hash bucket, not the token. So a token's only job is
 * continuity: one browser's uses land in one anonymous budget.
 *
 * Deliberately NOT bound to the IP: a phone changing networks would lose its
 * budget's continuity and get a fresh one, which is the opposite of what
 * binding is for. The coarse per-network cap is the IP-hash bucket instead.
 *
 * IP hash: HMAC(ipKey, `<UTC day>|<ip>`), so no raw IP is stored, and the
 * hashes don't link across days (the salt rotates daily).
 */
import {createHmac, randomBytes, timingSafeEqual} from 'node:crypto'


const ANON_ID_BYTES = 16
const IP_HASH_HEX_CHARS = 32
const MILLIS_PER_SECOND = 1000
const ANON_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/
const ISSUED_AT_PATTERN = /^\d{1,12}$/
// A token from the future (clock skew beyond a minute) is as suspect as an old one.
const SKEW_SECONDS = 60


/**
 * @typedef {object} AnonTokenScheme
 * @property {string} prefix the token's first field, e.g. 'ba1'
 * @property {number} ttlSeconds how long a token lives
 * @property {function(string, number=): {token: string, anonId: string, issuedAtMs: number}} mint a new
 *   token, `(secret, nowMs)`
 * @property {function(string, string, number=): object} verify `{ok: true, anonId, issuedAtMs}`, or
 *   `{ok: false, reason}` with reason 'malformed', 'signature' or 'expired'; never throws
 * @property {function(*): boolean} looksLike whether a value is shaped like this scheme's token
 * @property {function(string, string, string): string} hashIp `(secret, ip, utcDay)` → hex
 */


/**
 * @param {object} scheme
 * @param {string} scheme.prefix e.g. 'ba1'
 * @param {number} scheme.ttlSeconds how long a token lives
 * @param {string} scheme.namespace the key-derivation namespace, e.g. 'bldrs-ai'
 * @return {AnonTokenScheme}
 */
export function anonTokenScheme({prefix, ttlSeconds, namespace}) {
  /**
   * @param {string} secret
   * @param {string} purpose
   * @return {Buffer} a key for one purpose, so the token and IP keys differ
   */
  const derivedKey = (secret, purpose) => createHmac('sha256', secret).update(`${namespace}|${purpose}`).digest()
  const sign = (secret, anonId, issuedAt) => createHmac('sha256', derivedKey(secret, 'anon-token'))
    .update(`${prefix}|${anonId}|${issuedAt}`).digest('base64url')

  return {
    prefix,
    ttlSeconds,
    mint(secret, nowMs = Date.now()) {
      const anonId = randomBytes(ANON_ID_BYTES).toString('base64url')
      const issuedAt = String(Math.floor(nowMs / MILLIS_PER_SECOND))
      return {
        token: `${prefix}.${anonId}.${issuedAt}.${sign(secret, anonId, issuedAt)}`,
        anonId,
        issuedAtMs: Number(issuedAt) * MILLIS_PER_SECOND,
      }
    },
    verify(secret, token, nowMs = Date.now()) {
      const parts = typeof token === 'string' ? token.split('.') : []
      if (parts.length !== 4 || parts[0] !== prefix || !ANON_ID_PATTERN.test(parts[1]) ||
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
      if (ageSeconds >= ttlSeconds || ageSeconds < -SKEW_SECONDS) {
        return {ok: false, reason: 'expired'}
      }
      return {ok: true, anonId, issuedAtMs: Number(issuedAt) * MILLIS_PER_SECOND}
    },
    looksLike(value) {
      return typeof value === 'string' && value.startsWith(`${prefix}.`)
    },
    hashIp(secret, ip, day) {
      return createHmac('sha256', derivedKey(secret, 'ip')).update(`${day}|${ip}`).digest('hex')
        .slice(0, IP_HASH_HEX_CHARS)
    },
  }
}
