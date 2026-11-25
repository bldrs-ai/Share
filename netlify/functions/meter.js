/*
 * Netlify Function (v2): meter
 * ----------------------------
 * The anonymous metering gate (design/new/quotas.md §"Anonymous metering"):
 * a signed-out visitor's remote model loads, 2 per 30-day period, counted
 * against a server-issued metering token (`_lib/meteringToken.js`) on the
 * Blobs ledger (`_lib/meterLedger.js`), with a day-salted IP cap behind it.
 * And the link at sign-in, which carries a token's current-period counts and
 * stage into the account, so signing in or out can't reset a budget.
 *
 *   POST /.netlify/functions/meter
 *     {action: 'remote_load', key}   key: the model's slot key (src/quota/modelSlotKey.js)
 *     headers: x-bldrs-meter-token (optional: none, or an expired one, mints a new token)
 *   → 200 {allowed: true, alreadyCounted, used, limit, notice, periodEnd, token?}
 *         notice 'last_free' when this was the period's last free remote load
 *   → 200 {allowed: true, metered: false}   a key the meter doesn't count (a sample, a
 *         hosted model); nothing is minted or stored
 *   → 403 {allowed: false, gate: 'sign_in', gatedBy: 'token'|'ip', used, limit, periodEnd, token?}
 *
 *     {action: 'link'}
 *     headers: authorization: Bearer <Auth0 access token>, x-bldrs-meter-token
 *   → 200 {merged: true, carried: {remote_load: {count, stage}}}
 *   → 200 {merged: false, reason: 'no_token'|'already_merged'|'no_account'}
 *   → 401 the Auth0 gate's answer (_lib/auth0.js#verifyAuth0Bearer)
 *
 *   → 400 {error: 'invalid_meter_request'}  not exactly one of those bodies (the smoke probe sends {})
 *   → 403 {error: 'meter_forbidden_origin'} a browser on another site
 *   → 405 {error: 'method_not_allowed'}
 *   → 500 {error: 'meter_not_configured'}   no token secret, or no blob store
 *   → 503 {error: 'meter_unavailable'}      the ledger (or, for link, Auth0) could not be
 *                                            reached; the page fails OPEN and loads the model
 *
 * ## Limit data stays limit data
 *
 * Everything this function reads or writes exists to apply free-use limits
 * (`_lib/meterLedger.js` says the rule in full). What leaves it for
 * analytics is ID-free: one GA4 Measurement Protocol event the first time a
 * token reaches each stage (`anon_limit_stage`), and one when a visitor who
 * reached a stage signs in (`anon_limit_signin`), all under ONE fixed client
 * id, so GA counts each anonymous visitor once per stage and can never
 * follow one. No token, digest, key or IP is in any event, log line or
 * Sentry report.
 *
 * The page never decides that a load is free on its own: a signed-out page
 * that skips this call loads the model, which is the known gap every
 * client-side gate has (quotas.md §"Drive visibility"); the IP cap and the
 * per-token count are what is enforced against a page that does call.
 */
import {getStore} from '@netlify/blobs'
import * as Sentry from '@sentry/serverless'
import {ANONYMOUS_IP_DAILY_REMOTE_LOADS, ANONYMOUS_REMOTE_LOAD_LIMIT, slotPeriod} from '../../src/quota/limits.js'
import {isAnonMeteredKey} from '../../src/quota/anonMeterKeys.js'
import {createHmac} from 'node:crypto'
import {carryAnonymousSpend} from './_lib/aiLedger.js'
import {getUserAppMetadata, patchUserAppMetadata, verifyAuth0Bearer} from './_lib/auth0.js'
import {isAllowedOrigin, originHostForLog} from './_lib/aiOrigin.js'
import {gaMeasurementConfig, sendMeasurementProtocolEvent} from './_lib/measurementProtocol.js'
import {
  FEATURES,
  METER_STORE,
  MeterLedgerError,
  STAGES,
  carriedCounts,
  ipBucketKey,
  markMerged,
  modelDigest,
  readAnonRecord,
  recordUse,
  utcDay,
} from './_lib/meterLedger.js'
import {hashMeteringIp, meteringTokenSecret, mintMeteringToken, verifyMeteringToken} from './_lib/meteringToken.js'
import {readCappedText} from './_lib/readCappedBody.js'


export const METER_TOKEN_HEADER = 'x-bldrs-meter-token'
export const ACTIONS = Object.freeze({REMOTE_LOAD: 'remote_load', LINK: 'link'})
export const MAX_METER_REQUEST_BYTES = 2048

/**
 * The GA client id every metering event is sent under: one id, so GA counts
 * events (each token's first reach of a stage), never a visitor, and adds no
 * "users". GA's web client-id shape, `<uint32>.<uint32>`: the first eight
 * bytes of SHA-256('bldrs-share:metering'), the construction
 * client-capabilities.js and subscriptionAnalytics.js use, written out so the
 * replays can match it.
 */
export const METER_CLIENT_ID = '2310583466.891516497'

/** The AI relay's ledger store (ai-chat.js), which the link carries AI spend into. */
export const AI_LEDGER_STORE = 'ai-ledger'

export const STAGE_EVENT = 'anon_limit_stage'
export const SIGNIN_EVENT = 'anon_limit_signin'

const HTTP_OK = 200
const HTTP_BAD_REQUEST = 400
const HTTP_FORBIDDEN = 403
const HTTP_METHOD_NOT_ALLOWED = 405
const HTTP_INTERNAL_ERROR = 500
const HTTP_SERVICE_UNAVAILABLE = 503
const CARRY_ID_HEX_CHARS = 24
const STAGE_RANK = {[STAGES.LAST_FREE]: 1, [STAGES.GATED]: 2}


/**
 * @param {Request} req
 * @param {object} [context] Netlify's: `ip`, `waitUntil`
 * @return {Promise<Response>}
 */
export default async function handler(req, context = {}) {
  if (req.method !== 'POST') {
    return json(HTTP_METHOD_NOT_ALLOWED, {error: 'method_not_allowed'})
  }
  if (Number(req.headers.get('content-length')) > MAX_METER_REQUEST_BYTES) {
    return json(HTTP_BAD_REQUEST, {error: 'invalid_meter_request'})
  }
  const read = await readCappedText(req, MAX_METER_REQUEST_BYTES)
  const request = read.tooLarge ? null : parseMeterRequest(read.text ?? '')
  // Shape first, as feedback and client-capabilities do: the deployed smoke
  // probe posts `{}` and is answered without the store or a secret.
  if (!request) {
    return json(HTTP_BAD_REQUEST, {error: 'invalid_meter_request'})
  }
  if (!isAllowedOrigin(req, process.env)) {
    logInfo(`meter: refused, origin ${originHostForLog(req)}`)
    return json(HTTP_FORBIDDEN, {error: 'meter_forbidden_origin'})
  }
  if (request.action === ACTIONS.REMOTE_LOAD && !isAnonMeteredKey(request.key)) {
    // A sample or a hosted model: free, and nothing to mint or store.
    return json(HTTP_OK, {allowed: true, metered: false})
  }
  const secret = meteringTokenSecret(process.env)
  if (!secret) {
    console.error('meter: not configured, missing METERING_TOKEN_SECRET (or AI_TOKEN_SECRET)')
    return json(HTTP_INTERNAL_ERROR, {error: 'meter_not_configured'})
  }
  let store
  try {
    store = getStore({name: METER_STORE, consistency: 'strong'})
  } catch (err) {
    console.error(`meter: not configured, blob store: ${err.name}`)
    return json(HTTP_INTERNAL_ERROR, {error: 'meter_not_configured'})
  }
  const nowMs = Date.now()
  return request.action === ACTIONS.LINK ?
    link(req, context, {store, secret, nowMs}) :
    remoteLoad(req, context, {store, secret, nowMs, key: request.key})
}


/**
 * @param {string} text the request body
 * @return {?object} `{action, key}` or `{action}`; null for anything but exactly a known request
 */
export function parseMeterRequest(text) {
  let body
  try {
    body = JSON.parse(text)
  } catch {
    return null
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null
  }
  const keys = Object.keys(body).sort().join(',')
  if (body.action === ACTIONS.REMOTE_LOAD && keys === 'action,key' && typeof body.key === 'string' &&
      body.key.length > 0) {
    return {action: ACTIONS.REMOTE_LOAD, key: body.key}
  }
  if (body.action === ACTIONS.LINK && keys === 'action') {
    return {action: ACTIONS.LINK}
  }
  return null
}


/**
 * @param {Request} req
 * @param {object} context
 * @param {object} args
 * @return {Promise<Response>}
 */
async function remoteLoad(req, context, {store, secret, nowMs, key}) {
  const verified = verifyMeteringToken(secret, req.headers.get(METER_TOKEN_HEADER), nowMs)
  // Missing, malformed, forged or expired (its period has ended): a new,
  // unrelated token, and with it a new period. Never a renewal.
  const identity = verified.ok ? verified : mintMeteringToken(secret, nowMs)
  const minted = verified.ok ? null : identity.token
  const limit = ANONYMOUS_REMOTE_LOAD_LIMIT
  const ip = context.ip || req.headers.get('x-nf-client-connection-ip')
  const day = utcDay(nowMs)
  const ipBucket = ip ?
    {key: ipBucketKey(day, hashMeteringIp(secret, ip, day)), limit: ipDailyLimit(process.env)} :
    null

  let decision
  try {
    decision = await recordUse(store, {
      anonId: identity.anonId,
      period: identity.period,
      feature: FEATURES.REMOTE_LOAD,
      digest: modelDigest(secret, identity.anonId, key),
      limit,
      ipBucket,
    })
  } catch (err) {
    if (!(err instanceof MeterLedgerError)) {
      throw err
    }
    // The page fails open on this answer: the model loads, unmetered.
    await report(context, 'ledger_unavailable', {reason: err.reason})
    return json(HTTP_SERVICE_UNAVAILABLE, {error: 'meter_unavailable'})
  }

  if (decision.firstReached) {
    await sendFunnelEvent(context, STAGE_EVENT, {
      stage: decision.firstReached,
      feature: FEATURES.REMOTE_LOAD,
      ...(decision.gatedBy ? {gated_by: decision.gatedBy} : {}),
    })
  }
  const common = {used: decision.used, limit, periodEnd: new Date(identity.period.end).toISOString(),
    ...(minted ? {token: minted} : {})}
  logInfo(`meter: remote_load ${decision.allowed ? (decision.alreadyCounted ? 'reopen' : 'counted') :
    `gated_${decision.gatedBy}`}`)
  if (!decision.allowed) {
    return json(HTTP_FORBIDDEN, {allowed: false, gate: 'sign_in', gatedBy: decision.gatedBy, ...common})
  }
  return json(HTTP_OK, {allowed: true, alreadyCounted: decision.alreadyCounted,
    notice: decision.lastFree ? STAGES.LAST_FREE : null, ...common})
}


/**
 * The link at sign-in: carry the token's current-period counts and stage
 * into the signed-in account, once. Only the token the browser holds now is
 * linked (no backfill of older periods), and it keeps metering afterwards,
 * so signing out leaves the visitor where they were.
 *
 * Order: the account is written first (its `usageQuota.anonymous`, then the
 * token's AI spend into the account's AI ledger record), then the token is
 * marked merged. Both account writes are idempotent (a max-merge,
 * `mergeAnonymousCarry`, and a carry remembered by digest,
 * `aiLedger.js#carryAnonymousSpend`), so a retry after a failed mark writes
 * the same thing again rather than adding twice.
 *
 * @param {Request} req
 * @param {object} context
 * @param {object} args
 * @return {Promise<Response>}
 */
async function link(req, context, {store, secret, nowMs}) {
  const auth = await verifyAuth0Bearer({headers: {authorization: req.headers.get('authorization') || ''}})
  if (!auth.ok) {
    return new Response(auth.response.body, {status: auth.response.statusCode,
      headers: {'content-type': 'application/json'}})
  }
  if (!auth.sub) {
    // AUTH0_DOMAIN unset (dev): there is no account to carry into.
    return json(HTTP_OK, {merged: false, reason: 'no_account'})
  }
  const verified = verifyMeteringToken(secret, req.headers.get(METER_TOKEN_HEADER), nowMs)
  if (!verified.ok) {
    // No token, or one whose period has ended: nothing current to carry.
    return json(HTTP_OK, {merged: false, reason: 'no_token'})
  }
  try {
    const record = await readAnonRecord(store, verified.anonId, verified.period)
    if (record.mergedAt !== null) {
      return json(HTTP_OK, {merged: false, reason: 'already_merged'})
    }
    const carried = carriedCounts(record)
    const appMetadata = await getUserAppMetadata(auth.sub)
    const usageQuota = isPlainObject(appMetadata.usageQuota) ? appMetadata.usageQuota : {}
    const anonymous = mergeAnonymousCarry(usageQuota.anonymous, carried, {
      accountPeriod: slotPeriod(usageQuota.loads, nowMs).period,
      tokenPeriod: verified.period,
      nowMs,
    })
    await patchUserAppMetadata(auth.sub, {usageQuota: {...usageQuota, anonymous}})
    // The carry that limits something: the token's AI spend counts toward
    // the account's day, 7-day and period caps (owner, 2026-11-25). Once per
    // token, by a keyed digest the account's AI record remembers.
    await carryAnonymousSpend(getStore({name: AI_LEDGER_STORE, consistency: 'strong'}), {
      fromKey: `ai/anonymous/${verified.anonId}`,
      toKey: `ai/user/${encodeURIComponent(auth.sub)}`,
      carryId: createHmac('sha256', secret).update(`bldrs-meter|ai-carry|${verified.anonId}`).digest('hex').slice(0, CARRY_ID_HEX_CHARS),
      tokenPeriod: verified.period,
      nowMs,
    })
    await markMerged(store, verified.anonId, verified.period, nowMs)
    const stage = carried[FEATURES.REMOTE_LOAD]?.stage ?? null
    if (stage) {
      // "Sign-ins from gates": a statistic about the limit itself.
      await sendFunnelEvent(context, SIGNIN_EVENT, {from_stage: stage, feature: FEATURES.REMOTE_LOAD})
    }
    logInfo(`meter: link merged${stage ? ` from ${stage}` : ''}`)
    return json(HTTP_OK, {merged: true, carried})
  } catch (err) {
    // A ledger or Auth0 step that failed: the page tries again at its next
    // sign-in settle. Never the sub, the token or the error's body.
    await report(context, 'link_failed', {reason: err instanceof MeterLedgerError || err?.name === 'LedgerUnavailableError' ?
      err.reason : (err.step || err.name)})
    return json(HTTP_SERVICE_UNAVAILABLE, {error: 'meter_unavailable'})
  }
}


/**
 * The account's `usageQuota.anonymous` after carrying a token's counts in.
 *
 * It lives in the account's current slot period when one is running (the
 * carried counts end with it), else in the token's own period. A carry
 * already there for a period that is still running is merged by taking, per
 * feature, the larger count and the further stage, so the write is
 * idempotent and two tokens (two browsers) carried into one account count
 * as the larger, not the sum: the carry records how far the visitor got
 * signed out, it does not use up anything the account has.
 *
 * @param {*} existing the account's current `usageQuota.anonymous`
 * @param {object} carried {@link carriedCounts}'s
 * @param {object} periods
 * @param {?{start: number, end: number}} periods.accountPeriod
 * @param {{start: number, end: number}} periods.tokenPeriod
 * @param {number} periods.nowMs
 * @return {object} `{periodStart, periodEnd, features: {<feature>: {count, stage}}, mergedAt}`
 */
export function mergeAnonymousCarry(existing, carried, {accountPeriod, tokenPeriod, nowMs}) {
  const running = isPlainObject(existing) && Date.parse(existing.periodEnd) > nowMs ? existing : null
  const period = running ?
    {start: Date.parse(running.periodStart), end: Date.parse(running.periodEnd)} :
    (accountPeriod ?? tokenPeriod)
  const features = {}
  const before = running && isPlainObject(running.features) ? running.features : {}
  for (const name of new Set([...Object.keys(before), ...Object.keys(carried)])) {
    const a = isPlainObject(before[name]) ? before[name] : {}
    const b = carried[name] ?? {}
    const count = Math.max(Number.isInteger(a.count) ? a.count : 0, Number.isInteger(b.count) ? b.count : 0)
    const stage = (STAGE_RANK[b.stage] ?? 0) > (STAGE_RANK[a.stage] ?? 0) ? b.stage : (a.stage ?? null)
    features[name] = {count, stage: STAGE_RANK[stage] ? stage : null}
  }
  return {
    periodStart: new Date(period.start).toISOString(),
    periodEnd: new Date(period.end).toISOString(),
    features,
    mergedAt: new Date(nowMs).toISOString(),
  }
}


/**
 * @param {object} env
 * @return {number} the per-network day cap: METER_ANON_IP_DAILY_REMOTE_LOADS, else the default
 */
export function ipDailyLimit(env) {
  const n = Number(env.METER_ANON_IP_DAILY_REMOTE_LOADS)
  return Number.isInteger(n) && n > 0 ? n : ANONYMOUS_IP_DAILY_REMOTE_LOADS
}


/**
 * One funnel event, through the Measurement Protocol, under the one fixed
 * client id. Best-effort: never a different answer, never a throw.
 *
 * @param {object} context
 * @param {string} name
 * @param {object} params enum fields only
 * @return {Promise<void>}
 */
async function sendFunnelEvent(context, name, params) {
  const config = gaMeasurementConfig(process.env)
  if (!config) {
    logInfo(`meter: ${name} not sent to GA: GA4_MEASUREMENT_ID and GA4_API_SECRET are not both set`)
    return
  }
  const sent = sendMeasurementProtocolEvent({config, clientId: METER_CLIENT_ID, name, params})
    .catch((err) => console.warn(`meter: ${name} not sent to GA: ${err.message}`))
  // After the answer where the platform allows it, so the load isn't held up
  // by GA; awaited otherwise, since the process freezes when the handler returns.
  if (typeof context.waitUntil === 'function') {
    context.waitUntil(sent)
  } else {
    await sent
  }
}


// Sentry, initialised on first report, once per condition per instance per
// UTC day: a store outage is one problem, not one per visitor.
let sentryReady = false
const reported = new Set()


/** For tests: forget what this instance has reported, as a cold start would. */
export function resetReportedConditions() {
  reported.clear()
}


/**
 * A Sentry warning: the meter could not reach its ledger (every signed-out
 * remote load is then unmetered) or could not carry a sign-in. Structured
 * tags only.
 *
 * @param {object} context
 * @param {string} condition
 * @param {object} tags
 * @return {Promise<void>}
 */
async function report(context, condition, tags) {
  console.error(`meter: ${condition} (${tags.reason})`)
  const key = `${condition}|${tags.reason}|${utcDay(Date.now())}`
  if (reported.has(key)) {
    return
  }
  reported.add(key)
  try {
    if (!sentryReady) {
      Sentry.init({dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV, tracesSampleRate: 0})
      sentryReady = true
    }
    Sentry.withScope((scope) => {
      // verifyAuth0Bearer tags the instance's scope with the caller's sub.
      scope.setUser(null)
      scope.setFingerprint(['meter', condition])
      scope.setTag('component', 'meter')
      scope.setTag('meter_condition', condition)
      scope.setTag('meter_reason', String(tags.reason))
      Sentry.captureMessage(`meter: ${condition}`, 'warning')
    })
    const FLUSH_MS = 2000
    const flushed = Sentry.flush(FLUSH_MS).catch(() => false)
    if (typeof context.waitUntil === 'function') {
      context.waitUntil(flushed)
    } else {
      await flushed
    }
  } catch {
    // Reporting is best-effort.
  }
}


/**
 * @param {*} value
 * @return {boolean}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
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
 * An expected outcome is INFO in the function log.
 *
 * @param {string} message
 */
function logInfo(message) {
  // eslint-disable-next-line no-console -- an expected outcome is INFO, not a warning
  console.log(message)
}
