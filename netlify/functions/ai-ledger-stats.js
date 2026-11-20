/*
 * Netlify Function (v2): ai-ledger-stats
 * --------------------------------------
 * Read-only aggregates of the hosted assistant's relay (ai-chat.js), for
 * Bldrs' private admin dashboard: the credit limits in force, which of the
 * relay's settings and secrets are set, each daily breaker's spend over the
 * last week, and the count of reconciliation records.
 *
 *   GET /.netlify/functions/ai-ledger-stats
 *   Authorization: Bearer <ADMIN_STATS_SECRET>
 *   → 200 {v, now, limits, envSet, secrets, breakers, reconcile}
 *   → 401 {error: {code: 'admin_stats_unauthorized'}}
 *   → 500 {error: {code: 'admin_stats_not_configured'}}
 *
 * Who calls it: one server, the admin dashboard's own function (in the
 * private bizdev repo), which checks the viewer's Google sign-in against an
 * allowlist and holds the shared secret. A browser never sees the secret, so
 * the response carries no CORS headers: a page can't read it even with one.
 *
 * Why it lives here and not on the admin site: the ledger is this site's
 * `ai-ledger` blob store, which a function of this site reads with no token
 * at all. Reading it from another site would take a Netlify personal access
 * token, which can't be narrowed to one site and so would hold far more than
 * this endpoint ever answers. The limits come from aiCreditLimits(process.env),
 * the relay's own reader, so the dashboard can't drift from what the relay
 * enforces.
 *
 * What it never returns: a secret's value (only whether it is set), an env
 * value other than through aiCreditLimits' parsed numbers, a ledger key
 * (keys name identities: an anon id, an IP hash, an Auth0 sub), or any
 * per-identity figure. Breaker records are relay-wide, one per tier per UTC
 * day, and reconciliation records are counted, never listed.
 *
 * The secret must be at least MIN_SECRET_LENGTH characters; a shorter one
 * counts as unset (500), so a placeholder can't open the endpoint. It is
 * compared in constant time.
 */
import {createHash, timingSafeEqual} from 'node:crypto'
import {getStore} from '@netlify/blobs'
import {AI_CREDIT_ENV_VARS, aiCreditLimits} from '../../src/quota/aiCredits.js'
import {HOLD_TTL_MS, utcDay} from './_lib/aiLedger.js'


export const LEDGER_STORE = 'ai-ledger'
export const STATS_DAYS = 7
export const MIN_SECRET_LENGTH = 32
export const BREAKER_TIERS = Object.freeze(['anonymous', 'free'])
/** Secrets ai-chat needs: reported as set or not, never read further. */
export const RELAY_SECRETS = Object.freeze(['OPENROUTER_API_KEY', 'AI_TOKEN_SECRET'])
const STATS_VERSION = 1
const DAY_MS = 86400000

const HTTP_OK = 200
const HTTP_UNAUTHORIZED = 401
const HTTP_METHOD_NOT_ALLOWED = 405
const HTTP_INTERNAL_ERROR = 500


/**
 * @param {Request} req
 * @return {Promise<Response>}
 */
export default async function handler(req) {
  const secret = process.env.ADMIN_STATS_SECRET
  // Config first, so the deployed smoke probe's strict mode sees an unset secret.
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) {
    return json(HTTP_INTERNAL_ERROR, {error: {code: 'admin_stats_not_configured'}})
  }
  if (req.method !== 'GET') {
    return json(HTTP_METHOD_NOT_ALLOWED, {error: {code: 'method_not_allowed'}})
  }
  if (!bearerMatches(req.headers.get('authorization'), secret)) {
    return json(HTTP_UNAUTHORIZED, {error: {code: 'admin_stats_unauthorized'}})
  }
  let store = null
  try {
    store = getStore({name: LEDGER_STORE, consistency: 'strong'})
  } catch {
    store = null
  }
  return json(HTTP_OK, await ledgerStats(store, process.env, Date.now()))
}


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


/**
 * Everything the endpoint answers. Each ledger part fails alone, as
 * `{error: 'ledger_unavailable'}`, so a Blobs outage still leaves the limits.
 *
 * @param {object|null} store the `ai-ledger` store, or null when it couldn't be opened
 * @param {object} env process.env, or a test's
 * @param {number} nowMs
 * @return {Promise<object>}
 */
export async function ledgerStats(store, env, nowMs) {
  const set = (name) => typeof env[name] === 'string' && env[name].trim() !== ''
  const [breakers, reconcile] = await Promise.all([
    part(store, () => breakerStats(store, nowMs)),
    part(store, () => reconcileStats(store, nowMs)),
  ])
  return {
    v: STATS_VERSION,
    now: new Date(nowMs).toISOString(),
    limits: aiCreditLimits(env),
    envSet: Object.fromEntries(AI_CREDIT_ENV_VARS.map((name) => [name, set(name)])),
    secrets: Object.fromEntries(RELAY_SECRETS.map((name) => [name, set(name)])),
    breakers,
    reconcile,
  }
}


/**
 * @param {object|null} store
 * @param {Function} fn
 * @return {Promise<object>}
 */
async function part(store, fn) {
  if (!store) {
    return {error: 'ledger_unavailable'}
  }
  try {
    return await fn()
  } catch {
    return {error: 'ledger_unavailable'}
  }
}


/**
 * @param {number} nowMs
 * @return {Array<string>} the last STATS_DAYS UTC days, oldest first, today last
 */
export function lastDays(nowMs) {
  return Array.from({length: STATS_DAYS}, (_, i) => utcDay(nowMs - ((STATS_DAYS - 1 - i) * DAY_MS)))
}


/**
 * Each breaker's record per day: `{day, spent, held}` in micro-USD, oldest
 * first. A day with no record spent nothing (`recorded: false`). A hold past
 * HOLD_TTL_MS is spend at its reservation, as the ledger's own prune books it
 * on the record's next write, which a past day's record never gets.
 *
 * `spent` is every day entry in the blob, not just the blob's own day: the
 * relay builds a request's breaker key once, at reservation, but settle
 * books the spend under the day it settles (`addToDay(utcDay(nowMs))`) and
 * its 1-day prune then drops the reservation day's entry. So a request
 * reserved before UTC midnight and settled after lands in the earlier day's
 * blob under the later day's key (Codex on #2254), and reading only
 * `days[day]` would lose it from both days. Each blob is one breaker-day,
 * which is the day the relay counted the request against.
 *
 * @param {object} store
 * @param {number} nowMs
 * @return {Promise<object>} {anonymous: [...], free: [...]}
 */
export async function breakerStats(store, nowMs) {
  const days = lastDays(nowMs)
  const entries = await Promise.all(BREAKER_TIERS.map(async (tier) =>
    [tier, await Promise.all(days.map(async (day) =>
      summarizeBreakerDay(await store.get(`ai/breaker/${tier}/${day}`, {type: 'json'}), day, nowMs)))]))
  return Object.fromEntries(entries)
}


/**
 * @param {object|null} record a ledger record, or null when there is none
 * @param {string} day
 * @param {number} nowMs
 * @return {{day: string, spent: number, held: number, recorded: boolean}}
 */
export function summarizeBreakerDay(record, day, nowMs) {
  if (!record || typeof record !== 'object') {
    return {day, spent: 0, held: 0, recorded: false}
  }
  let spent = 0
  for (const entry of Object.values(record.days || {})) {
    spent += Number(entry?.spent) || 0
  }
  let held = 0
  for (const hold of Object.values(record.holds || {})) {
    const micro = Number(hold?.micro) || 0
    if (nowMs - Number(hold?.at) < HOLD_TTL_MS) {
      held += micro
    } else {
      spent += micro
    }
  }
  return {day, spent, held, recorded: true}
}


/**
 * Reconciliation records per day of the last week, and how many are older.
 * Counted from the keys alone (`ai/reconcile/<day>/<request>`); no record is
 * read and no key is returned.
 *
 * @param {object} store
 * @param {number} nowMs
 * @return {Promise<{days: object, total: number, older: number}>}
 */
export async function reconcileStats(store, nowMs) {
  const {blobs} = await store.list({prefix: 'ai/reconcile/'})
  return countReconcile((blobs || []).map((b) => b.key), nowMs)
}


/**
 * @param {Array<string>} keys
 * @param {number} nowMs
 * @return {{days: object, total: number, older: number}}
 */
export function countReconcile(keys, nowMs) {
  const days = Object.fromEntries(lastDays(nowMs).map((d) => [d, 0]))
  let older = 0
  for (const key of keys) {
    const match = /^ai\/reconcile\/(\d{4}-\d{2}-\d{2})\//.exec(key)
    if (!match) {
      continue
    }
    if (match[1] in days) {
      days[match[1]]++
    } else if (match[1] < Object.keys(days)[0]) {
      older++
    }
  }
  return {days, total: Object.values(days).reduce((a, b) => a + b, 0), older}
}


/**
 * @param {number} status
 * @param {object} body
 * @return {Response}
 */
function json(status, body) {
  return new Response(JSON.stringify(body), {status, headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  }})
}
