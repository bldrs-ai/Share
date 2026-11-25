/*
 * netlify/functions/_lib/adminStatsAuth.js
 * ----------------------------------------
 * The shared-secret check of the admin readers (ai-ledger-stats,
 * account-usage-stats): one server, the private admin dashboard's own
 * function, holds ADMIN_STATS_SECRET and sends it as a bearer. Moved here
 * from ai-ledger-stats.js when account-usage-stats became the second reader,
 * so the two can't drift on the minimum length or the comparison.
 */
import {createHash, timingSafeEqual} from 'node:crypto'


/** A shorter secret counts as unset, so a placeholder can't open a reader. */
export const MIN_SECRET_LENGTH = 32


/**
 * @param {string|null} header
 * @param {string} secret
 * @return {boolean} whether it is `Bearer <secret>`, compared in constant time
 */
export function bearerMatches(header, secret) {
  const match = /^Bearer (.+)$/.exec(header || '')
  if (!match) {
    return false
  }
  // Hash both sides first, so the comparison is over equal lengths and
  // leaks nothing about the secret's length.
  const digest = (s) => createHash('sha256').update(s).digest()
  return timingSafeEqual(digest(match[1]), digest(secret))
}
