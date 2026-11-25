/*
 * Netlify Function (v2): account-usage
 * ------------------------------------
 * A signed-in user's page reports its usage here, with the user's Auth0
 * token, and the function records it against the account
 * (design/new/account-usage.md). One endpoint, four kinds of body, each
 * exactly the shape src/privacy/accountUsageReport.js allows:
 *
 *   POST /.netlify/functions/account-usage
 *   Authorization: Bearer <Auth0 access token>
 *
 *   {kind: 'load', report}      one real model open: enums and numbers only
 *   {kind: 'limit', limit, gate, route_kind?}
 *                               a private-model refusal the PAGE decided (its
 *                               pre-check of the ledger, its offline fallback);
 *                               a refusal the server decided is recorded by
 *                               record-load or pro-module themselves
 *   {kind: 'funnel', event, params}
 *                               login / begin_checkout, forwarded to GA4
 *   {kind: 'preference', usage_reports}
 *                               the Profile toggle "Use my usage to improve Bldrs"
 *
 *   → 204 recorded, forwarded, or skipped (opted out; GA not configured;
 *         ACCOUNT_USAGE_RECORDING not on, which is every context but production)
 *   → 200 {usage_reports}                       a preference, as stored
 *   → 400 {error: 'invalid_account_usage'}       not exactly one of the shapes
 *   → 401 {error: 'missing_auth0_token' | 'invalid_auth0_token'}
 *   → 403 {error: 'account_usage_forbidden_origin'}
 *   → 405 {error: 'method_not_allowed'}
 *   → 413 {error: 'account_usage_too_large'}
 *   → 500 {error: 'account_usage_not_configured'}  no Auth0, no blob store, or (for a
 *                                                   preference) no ACCOUNT_USAGE_KEY_SECRET
 *   → 502 {error: 'account_usage_store_failed' | 'preference_write_failed'}
 *
 * The opt-out: a preference of `false` is written to the store's
 * `pref/<account>`, which this function checks before storing a load report,
 * and to the Auth0 user's `app_metadata.usageReports`, the claim the page
 * reads its toggle from (Auth0/appMetadata.js). Each write is ordered so a
 * failure part-way errs towards not recording (setPreference). Turning it
 * off also deletes the account's stored load reports. Limit hits are
 * recorded either way, since enforcing a limit is the service, not
 * analytics; funnel steps are forwarded either way, since they carry no
 * account and nothing of them is stored (design doc §"Opt-out").
 *
 * Shape first, before the token is checked: a junk body costs no /userinfo
 * round trip, and the deployed smoke probe's `{}` is answered without auth.
 * The store is opened inside the handler, never at module scope
 * (design/new/netlify-functions-testing.md "Adding a function").
 */
import {
  ACCOUNT_USAGE_KINDS,
  LIMIT_DECIDERS,
  MAX_ACCOUNT_USAGE_BYTES,
  parseAccountUsageBody,
} from '../../src/privacy/accountUsageReport.js'
import {
  accountKey,
  accountKeySecret,
  deleteLoadReports,
  isRecordingEnabled,
  logInfo,
  openAccountUsageStore,
  recordLimitHit,
  recordLoadReport,
  sendAccountUsageEvent,
  usageReportsAllowed,
  writeUsagePreference,
} from './_lib/accountUsage.js'
import {isAllowedOrigin, originHostForLog} from './_lib/aiOrigin.js'
import {patchUserAppMetadata, verifyAuth0Bearer} from './_lib/auth0.js'
import {readCappedText} from './_lib/readCappedBody.js'


/** The app_metadata key the opt-out is stored under, and the page reads. */
export const USAGE_REPORTS_METADATA_KEY = 'usageReports'

/** The budget of a page-reported limit hit: its writes and GA sends. */
const CLIENT_LIMIT_BUDGET_MS = 5000

const HTTP_OK = 200
const HTTP_NO_CONTENT = 204
const HTTP_BAD_REQUEST = 400
const HTTP_FORBIDDEN = 403
const HTTP_METHOD_NOT_ALLOWED = 405
const HTTP_PAYLOAD_TOO_LARGE = 413
const HTTP_INTERNAL_ERROR = 500
const HTTP_BAD_GATEWAY = 502


/**
 * @param {Request} req
 * @return {Promise<Response>}
 */
export default async function handler(req) {
  if (req.method !== 'POST') {
    return json(HTTP_METHOD_NOT_ALLOWED, {error: 'method_not_allowed'})
  }
  if (Number(req.headers.get('content-length')) > MAX_ACCOUNT_USAGE_BYTES) {
    return json(HTTP_PAYLOAD_TOO_LARGE, {error: 'account_usage_too_large'})
  }
  const read = await readCappedText(req, MAX_ACCOUNT_USAGE_BYTES)
  if (read.tooLarge) {
    return json(HTTP_PAYLOAD_TOO_LARGE, {error: 'account_usage_too_large'})
  }
  const body = parseAccountUsageBody(read.text ?? '')
  if (!body) {
    return json(HTTP_BAD_REQUEST, {error: 'invalid_account_usage'})
  }
  if (!isAllowedOrigin(req, process.env)) {
    logInfo(`account-usage: refused, origin ${originHostForLog(req)}`)
    return json(HTTP_FORBIDDEN, {error: 'account_usage_forbidden_origin'})
  }
  // Before the token check, so a preview's reports cost no /userinfo call.
  if (body.kind !== ACCOUNT_USAGE_KINDS.PREFERENCE && !isRecordingEnabled(process.env)) {
    logInfo(`account-usage: ${body.kind} not recorded: ACCOUNT_USAGE_RECORDING is not on (production only)`)
    return new Response(null, {status: HTTP_NO_CONTENT})
  }
  // verifyAuth0Bearer takes a Lambda-shaped event; only the header is read.
  const auth = await verifyAuth0Bearer({headers: {authorization: req.headers.get('authorization') || ''}})
  if (!auth.ok) {
    return new Response(auth.response.body, {status: auth.response.statusCode, headers: {'content-type': 'application/json'}})
  }
  if (!auth.sub) {
    // The unconfigured-dev bypass (_lib/auth0.js): no account to record against.
    return json(HTTP_INTERNAL_ERROR, {error: 'account_usage_not_configured'})
  }
  const store = openAccountUsageStore()
  if (!store) {
    console.error('account-usage: not configured, blob store')
    return json(HTTP_INTERNAL_ERROR, {error: 'account_usage_not_configured'})
  }
  const secret = accountKeySecret(process.env)
  if (!secret) {
    // Reached only by a preference: recording already requires the secret.
    console.error('account-usage: not configured, ACCOUNT_USAGE_KEY_SECRET')
    return json(HTTP_INTERNAL_ERROR, {error: 'account_usage_not_configured'})
  }
  const account = accountKey(auth.sub, secret)
  const nowMs = Date.now()
  try {
    switch (body.kind) {
      case ACCOUNT_USAGE_KINDS.PREFERENCE:
        return await setPreference(store, auth.sub, account, body.usage_reports, nowMs)
      case ACCOUNT_USAGE_KINDS.LIMIT:
        // The page decided it; the limit is enforced either way, so this is
        // recorded whatever the opt-out says. Free by construction: only a
        // free account has a private-model limit.
        await recordLimitHit({
          store, sub: auth.sub, limit: body.limit, gate: body.gate, tier: 'free',
          decidedBy: LIMIT_DECIDERS.CLIENT, routeKind: body.route_kind, nowMs,
          // No one is waiting on a refusal here (the page already showed it),
          // so the hit gets longer than record-load's 1.5 s.
          budgetMs: CLIENT_LIMIT_BUDGET_MS,
        })
        logInfo(`account-usage: limit ${body.limit} ${body.gate} recorded`)
        return new Response(null, {status: HTTP_NO_CONTENT})
      default:
        break
    }
    if (body.kind === ACCOUNT_USAGE_KINDS.FUNNEL) {
      // Nothing is stored, only counted in GA under the fixed id, so there is
      // no account in it to opt out of.
      await sendAccountUsageEvent(process.env, body.event, {...body.params, source: 'server'})
      return new Response(null, {status: HTTP_NO_CONTENT})
    }
    if (!await usageReportsAllowed(store, account)) {
      logInfo('account-usage: load skipped, account opted out')
      return new Response(null, {status: HTTP_NO_CONTENT})
    }
    const key = await recordLoadReport(store, account, body.report, {nowMs})
    // An opt-out can land between the check above and the write: its
    // deletion then lists the load reports before this one exists. Reading
    // the preference again after the write closes that: the opt-out writes
    // the preference before it lists, and the store is strongly consistent,
    // so either it sees this report or this sees its preference.
    let stillAllowed = false
    try {
      stillAllowed = await usageReportsAllowed(store, account)
    } finally {
      // Also when the read failed: a report that couldn't be checked against
      // an opt-out is withdrawn rather than kept.
      if (!stillAllowed) {
        await store.delete(key)
      }
    }
    if (!stillAllowed) {
      logInfo('account-usage: load withdrawn, account opted out meanwhile')
      return new Response(null, {status: HTTP_NO_CONTENT})
    }
    logInfo(`account-usage: load recorded (${body.report.content_type}, ${body.report.load_outcome})`)
  } catch (err) {
    console.warn(`account-usage: ${body.kind} not stored: ${err?.name ?? 'error'}`)
    return json(HTTP_BAD_GATEWAY, {error: 'account_usage_store_failed'})
  }
  return new Response(null, {status: HTTP_NO_CONTENT})
}


/**
 * Store the preference in both places, ordered so a failure part-way leaves
 * the account NOT recorded rather than recorded against its wish:
 *
 * - Off: the store's mirror first (the server's enforcement) and the
 *   deletion of the stored load reports, then Auth0. If Auth0 then fails, the
 *   page says the save failed and its toggle still reads on, but nothing is
 *   recorded; the user's retry writes Auth0.
 * - On: Auth0 first, then the mirror is removed. If the removal fails, the
 *   account stays unrecorded until the retry.
 *
 * @param {object} store
 * @param {string} sub
 * @param {string} account
 * @param {boolean} on
 * @param {number} nowMs
 * @return {Promise<Response>}
 */
async function setPreference(store, sub, account, on, nowMs) {
  if (!on) {
    try {
      await writeUsagePreference(store, account, false, nowMs)
      const deleted = await deleteLoadReports(store, account, nowMs)
      logInfo(`account-usage: opted out, ${deleted} load reports deleted`)
    } catch (err) {
      console.warn(`account-usage: opt-out not stored: ${err?.name ?? 'error'}`)
      return json(HTTP_BAD_GATEWAY, {error: 'account_usage_store_failed'})
    }
  }
  try {
    // A top-level key of its own: Auth0 merges app_metadata one top-level
    // key at a time, so this touches nothing else on the user.
    await patchUserAppMetadata(sub, {[USAGE_REPORTS_METADATA_KEY]: on})
  } catch (err) {
    console.warn(`account-usage: preference not written to Auth0: ${err?.name ?? 'error'}`)
    return json(HTTP_BAD_GATEWAY, {error: 'preference_write_failed'})
  }
  if (on) {
    try {
      await writeUsagePreference(store, account, true, nowMs)
      logInfo('account-usage: opted in')
    } catch (err) {
      console.warn(`account-usage: opt-in not stored: ${err?.name ?? 'error'}`)
      return json(HTTP_BAD_GATEWAY, {error: 'account_usage_store_failed'})
    }
  }
  return json(HTTP_OK, {usage_reports: on})
}


/**
 * @param {number} status
 * @param {object} body
 * @return {Response}
 */
function json(status, body) {
  return new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json', 'cache-control': 'no-store'}})
}
