/*
 * Netlify Function: record-export.js
 * ----------------------------------
 * Server-side history of what a user has exported, and the free tier's
 * model slots read off `app_metadata.usageQuota.loads`.
 *
 *   GET  /.netlify/functions/record-export
 *   Headers: Authorization: Bearer <Auth0 access token>
 *   → {tier: 'paid', modelSlots: null} for Pro, or
 *     {tier: 'free', modelSlots: {limit, used, remaining, nextFreeAt, keys}}
 *   What the Export tab shows a free user before they export — whether the
 *   model on screen holds a slot, and how many are free
 *   (src/export/useExportSlots.js). Read-only.
 *
 *   POST /.netlify/functions/record-export
 *   Headers: Authorization: Bearer <Auth0 access token>
 *   Body:    {key, format, bytes, title?, id?}
 *            key    — slot key of the model, e.g. /share/v/gh/o/r/main/x.ifc
 *                     (src/quota/modelSlotKey.js) — the key `pro-module`
 *                     was sent for the same export
 *            format — export format id from src/export/exportRegistry.js
 *            bytes  — size of the downloaded file
 *            title  — display label; falls back to the key's basename in the UI
 *            id     — the row id the client already wrote into its own mirror.
 *                     Echoed back on the stored row so the client can match
 *                     the two one-to-one (src/export/exportHistory.js
 *                     #withLocalArtifactFields); a body with no id gets one
 *                     minted here, as every request did before #1834. It is
 *                     an opaque LABEL, never an authorization input, so the
 *                     only check is its shape — but a malformed one is a
 *                     client bug worth a 400 rather than a silently
 *                     different id than the client believes it wrote.
 *
 * Flow: validate the body → `verifyAuth0Bearer` (401) → Management API
 * `app_metadata` (NOT the caller's JWT claim, which is as stale as the token
 * it was minted into) → then by tier:
 *  - Pro (`sharePro` or `shareProPendingReauth`, src/quota/proStatus.js):
 *    prepend the new entry to `app_metadata.exports` → PATCH.
 *  - Free: the export was decided by `pro-module`, which handed over the
 *    module only for a model holding one of the user's slots (taking a free
 *    slot when it held none). So the key must hold a slot now: if it does,
 *    the entry is prepended like a Pro one; if it doesn't, the module did
 *    not come from `pro-module` for this model — in practice a module
 *    memoised while the account was Pro, on an account that has since lost
 *    Pro — and the POST is refused (403 `export_slot_missing`), which is
 *    the client's signal to drop that memo (design/new/glb-export-premium.md
 *    §4.8).
 *  → respond `{exports}`, plus `modelSlots` for a free user.
 *
 * This is deliberately not where slots are taken. It runs after the file is
 * already in the user's Downloads, so a client that never calls it would
 * never be counted; `pro-module` takes the slot at delivery instead. Nothing
 * here writes `usageQuota`.
 *
 * Rows the retired per-export allowance wrote (`free: true`, charged by
 * `pro-module` before 2026-10-27) are history like any other row: kept,
 * listed, and counted for nothing.
 *
 * Response: {exports: [{id, key, title, format, bytes, exportedAt, free?}, …],
 * modelSlots?}, newest first, capped at EXPORTS_CAP. The client mirrors
 * `exports` into OPFS (`src/export/exportHistory.js`) as its instant-display
 * copy, and `modelSlots` into the Export tab's slot line.
 *
 * READ-MODIFY-WRITE CAVEAT, same as `record-load.js`: the list is read,
 * prepended to and written back with no compare-and-swap, so two exports
 * racing from two tabs can lose one row. That loss direction is deliberate:
 * this list is history, never an entitlement, so the worst outcome is a
 * missing row in "My Exports".
 *
 * Only the `exports` key is patched (`patchUserAppMetadata`), so a
 * concurrent `record-load.js` or `pro-module.js` write of `usageQuota` — or
 * the Stripe webhook's `subscriptionStatus` — survives untouched.
 *
 * Design: design/new/glb-export-premium.md §4.5.
 */

import {randomUUID} from 'crypto'
import * as Sentry from '@sentry/serverless'
import {EXPORT_SLOT_MISSING_REASON, modelSlots} from '../../src/export/exportSlots.js'
import {isProSubscriptionStatus} from '../../src/quota/proStatus.js'
import {
  getUserAppMetadata,
  managementApiFailureDetail,
  patchUserAppMetadata,
  verifyAuth0Bearer,
} from './_lib/auth0.js'


Sentry.AWSLambda.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: process.env.NODE_ENV || 'development',
})

const HTTP_OK = 200
const HTTP_BAD_REQUEST = 400
const HTTP_FORBIDDEN = 403
const HTTP_METHOD_NOT_ALLOWED = 405
const HTTP_BAD_GATEWAY = 502

// Auth0's app_metadata has a 16 KB soft ceiling shared with usageQuota and
// the Stripe fields. 100 rows of ~150 B leaves that ceiling comfortable
// while covering far more history than the dialog ever shows at once.
const EXPORTS_CAP = 100

// A title is a display label, not content: long enough for any real model
// name, short enough that a hostile client cannot fill app_metadata with it.
const TITLE_MAX_LENGTH = 200

// Exactly what `crypto.randomUUID` emits, which is also what the client's
// no-webcrypto fallback shapes itself into (exportHistory.js#newLocalId).
// Bounding the id's shape bounds its size, so a client cannot grow
// app_metadata through this field either.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i


/**
 * @param {number} statusCode
 * @param {string} error
 * @param {object} [detail] Extra fields beside `error` — a 502 names the
 *   Management API step that failed (`managementApiFailureDetail`), as
 *   `pro-module.js` does
 * @return {object} Netlify Functions response
 */
function errorResponse(statusCode, error, detail = {}) {
  return {
    statusCode,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({error, ...detail}),
  }
}


/**
 * @param {number} statusCode
 * @param {object} body
 * @return {object} Netlify Functions response
 */
function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  }
}


/**
 * Parse and validate the request body.
 *
 * @param {object} event Netlify Functions event
 * @return {{entry: object}|{error: string}} the fields to record, or why not
 */
function parseBody(event) {
  let bodyStr = event.body || ''
  if (event.isBase64Encoded) {
    bodyStr = Buffer.from(bodyStr, 'base64').toString('utf8')
  }
  let body
  try {
    body = JSON.parse(bodyStr)
  } catch {
    return {error: 'invalid_json'}
  }
  const {id, key, format, title, bytes} = body || {}
  if (typeof key !== 'string' || key.length === 0) {
    return {error: 'missing_key'}
  }
  if (typeof format !== 'string' || format.length === 0) {
    return {error: 'missing_format'}
  }
  if (!Number.isInteger(bytes) || bytes < 0) {
    return {error: 'invalid_bytes'}
  }
  if (title !== undefined && title !== null &&
      (typeof title !== 'string' || title.length > TITLE_MAX_LENGTH)) {
    return {error: 'invalid_title'}
  }
  if (id !== undefined && id !== null && (typeof id !== 'string' || !UUID_PATTERN.test(id))) {
    return {error: 'invalid_id'}
  }
  return {entry: {id: id || null, key, format, title: title || null, bytes}}
}


export const handler = Sentry.AWSLambda.wrapHandler(async (event) => {
  if (event.httpMethod === 'GET') {
    return reportAllowance(event)
  }
  if (event.httpMethod !== 'POST') {
    return {statusCode: HTTP_METHOD_NOT_ALLOWED, body: 'Method Not Allowed'}
  }

  const parsed = parseBody(event)
  if (parsed.error) {
    return errorResponse(HTTP_BAD_REQUEST, parsed.error)
  }

  const auth = await verifyAuth0Bearer(event)
  if (!auth.ok) {
    return auth.response
  }

  // sub === null is the unconfigured-dev bypass `_lib/auth0.js` documents
  // (AUTH0_DOMAIN unset). There is no Management API to read or write, so
  // answer with an empty history rather than failing the export the client
  // has already delivered to the user — same posture as `pro-module.js`.
  if (auth.sub === null) {
    return jsonResponse(HTTP_OK, {exports: []})
  }

  let appMetadata
  try {
    appMetadata = await getUserAppMetadata(auth.sub)
  } catch (err) {
    return managementApiFailure(err, 'app_metadata lookup', 'app_metadata_lookup_failed')
  }

  const existing = Array.isArray(appMetadata.exports) ? appMetadata.exports : []
  const isPro = isProSubscriptionStatus(appMetadata.subscriptionStatus)
  const slots = isPro ? null : modelSlots(appMetadata.usageQuota?.loads)
  if (!isPro && !slots.keys.includes(parsed.entry.key)) {
    // A free user's export of a model holding no slot: `pro-module` never
    // hands the module over for one, so the module came from somewhere
    // else — a Pro delivery memoised before the account lost Pro, a saved
    // module replayed (§4.8), or a faked POST. Refused rather than
    // recorded; the slots ride along so the client's display catches up.
    // Attributable either way; the key stays out of the message, since it
    // can name a private repo's file.
    Sentry.captureMessage(
      `record-export: export of a model holding no slot for ${auth.sub}` +
        ` (subscriptionStatus=${appMetadata.subscriptionStatus || 'none'})`,
      'warning',
    )
    return errorResponse(HTTP_FORBIDDEN, EXPORT_SLOT_MISSING_REASON, {modelSlots: slots})
  }
  // Not named `exports`: babel-jest transpiles this module to CJS for the
  // unit tests, where that identifier is the module's own binding.
  const updatedExports = [
    {
      // The client's id when it sent one, so its optimistic row and this
      // one are the same row on both sides of the mirror.
      id: parsed.entry.id || randomUUID(),
      key: parsed.entry.key,
      title: parsed.entry.title,
      format: parsed.entry.format,
      bytes: parsed.entry.bytes,
      exportedAt: new Date().toISOString(),
    },
    ...existing,
  ].slice(0, EXPORTS_CAP)

  try {
    await patchUserAppMetadata(auth.sub, {exports: updatedExports})
  } catch (err) {
    return managementApiFailure(err, 'history write', 'record_export_failed')
  }

  return jsonResponse(HTTP_OK, isPro ? {exports: updatedExports} : {exports: updatedExports, modelSlots: slots})
})


/**
 * GET: the caller's tier and, for a free user, their model slots.
 *
 * @param {object} event Netlify Functions event
 * @return {Promise<object>} Netlify Functions response
 */
async function reportAllowance(event) {
  const auth = await verifyAuth0Bearer(event)
  if (!auth.ok) {
    return auth.response
  }
  // Unconfigured dev bypass: no ledger to read, and pro-module serves
  // without a slot check there, so there are no slots to report.
  if (auth.sub === null) {
    return jsonResponse(HTTP_OK, {tier: 'paid', modelSlots: null})
  }
  let appMetadata
  try {
    appMetadata = await getUserAppMetadata(auth.sub)
  } catch (err) {
    return managementApiFailure(err, 'app_metadata lookup', 'app_metadata_lookup_failed')
  }
  if (isProSubscriptionStatus(appMetadata.subscriptionStatus)) {
    return jsonResponse(HTTP_OK, {tier: 'paid', modelSlots: null})
  }
  return jsonResponse(HTTP_OK, {tier: 'free', modelSlots: modelSlots(appMetadata.usageQuota?.loads)})
}


/**
 * Report a Management API failure and answer 502 naming the step, as
 * `pro-module.js` does.
 *
 * @param {Error} err
 * @param {string} what for the log line, e.g. 'history write'
 * @param {string} error the response's `error`
 * @return {object} Netlify Functions response
 */
function managementApiFailure(err, what, error) {
  const detail = managementApiFailureDetail(err)
  Sentry.captureException(err, {tags: {step: detail.step}})
  // The function log is the channel every deploy context has; see the same
  // line in pro-module.js.
  console.error(`record-export: ${what} failed at ${detail.step}` +
    ` (upstream ${detail.upstreamStatus ?? 'n/a'}): ${err.message}`)
  return errorResponse(HTTP_BAD_GATEWAY, error, detail)
}
