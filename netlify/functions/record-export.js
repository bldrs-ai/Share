/*
 * Netlify Function: record-export.js
 * ----------------------------------
 * Server-side history of what a user has exported, and the free tier's
 * export allowance read off it.
 *
 *   GET  /.netlify/functions/record-export
 *   Headers: Authorization: Bearer <Auth0 access token>
 *   → {tier: 'paid', freeExports: null} for Pro, or
 *     {tier: 'free', freeExports: {limit, used, remaining, nextFreeAt}}
 *   What the Export tab shows a free user before they export
 *   (src/export/useFreeExports.js). Read-only.
 *
 *   POST /.netlify/functions/record-export
 *   Headers: Authorization: Bearer <Auth0 access token>
 *   Body:    {key, format, bytes, title?, id?}
 *            key    — share path of the model, e.g. /share/v/gh/o/r/main/x.ifc
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
 *  - Free: the export was already CHARGED, by `pro-module`, which wrote a
 *    `free: true` row before handing over the module and told the client its
 *    id. This fills that row in — key, title, format, bytes — under the same
 *    id, so one free export is one row and is counted once. A body whose id
 *    matches no charged row is refused (403 `free_export_not_charged`): this
 *    function never ADDS a free row, so it is not a way to count, or to
 *    un-count, anything (design/new/glb-export-premium.md §4.8).
 *  → respond `{exports}`, plus `freeExports` for a free user.
 *
 * This is deliberately not where free exports are counted. It runs after
 * the file is already in the user's Downloads, so a client that never calls
 * it would never be counted; `pro-module` charges at delivery instead.
 *
 * Response: {exports: [{id, key, title, format, bytes, exportedAt, free?}, …],
 * freeExports?}, newest first, capped at EXPORTS_CAP. The client mirrors
 * `exports` into OPFS (`src/export/exportHistory.js`) as its instant-display
 * copy, and `freeExports` into the Export tab's remaining-count line.
 *
 * READ-MODIFY-WRITE CAVEAT, same as `record-load.js`: the list is read,
 * prepended to and written back with no compare-and-swap, so two exports
 * racing from two tabs can lose one row. That loss direction is deliberate —
 * for a Pro user this list is history, never an entitlement, so the worst
 * outcome is a missing row in "My Exports". For a free user it is also the
 * allowance ledger, and a lost write there can only lose a charge row
 * (another tab's `pro-module` charge landing between this read and this
 * write) — a free extra export, never a wrongful refusal. §4.8 lists it.
 *
 * Only the `exports` key is patched (`patchUserAppMetadata`), so a
 * concurrent `record-load.js` write of `usageQuota` — or the Stripe
 * webhook's `subscriptionStatus` — survives untouched.
 *
 * Design: design/new/glb-export-premium.md §4.5.
 */

import {randomUUID} from 'crypto'
import * as Sentry from '@sentry/serverless'
import {freeExportAllowance} from '../../src/export/freeExports.js'
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
  // Not named `exports`: babel-jest transpiles this module to CJS for the
  // unit tests, where that identifier is the module's own binding.
  let updatedExports
  if (isPro) {
    updatedExports = [
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
  } else {
    const chargedAt = parsed.entry.id === null ? -1 :
      existing.findIndex((row) => row && row.free === true && row.id === parsed.entry.id)
    if (chargedAt === -1) {
      // A free user's export that `pro-module` never charged: either the
      // module came from somewhere other than this deploy's gate (saved and
      // replayed, §4.8) or the client faked the POST. Refused rather than
      // appended, because an appended row would count — and a free user
      // must not be able to write their own ledger. Attributable either way.
      Sentry.captureMessage(
        `record-export: no charged free export ${parsed.entry.id || '(no id)'} for ${auth.sub}` +
          ` (subscriptionStatus=${appMetadata.subscriptionStatus || 'none'})`,
        'warning',
      )
      // The allowance rides along because the refusal can be the LOSER of a
      // two-tab read-modify-write race on the ledger (the other tab's PATCH
      // overwrote this tab's charge row): the client's cached count — taken
      // from the charge header, which counted that row — is then too LOW, and
      // this is the only answer it will get before the next remount. `existing`
      // is already the authoritative ledger, so it costs nothing to state.
      return errorResponse(HTTP_FORBIDDEN, 'free_export_not_charged',
        {freeExports: freeExportAllowance(existing)})
    }
    // Fill the charge row in place. Its id, `exportedAt` and `free` are the
    // server's from the charge and stay: the window counts from when the
    // module was handed over, not from whatever this request says.
    const charged = existing[chargedAt]
    updatedExports = existing.map((row, i) => (i === chargedAt ? {
      ...charged,
      key: parsed.entry.key,
      title: parsed.entry.title,
      format: parsed.entry.format,
      bytes: parsed.entry.bytes,
    } : row))
  }

  try {
    await patchUserAppMetadata(auth.sub, {exports: updatedExports})
  } catch (err) {
    return managementApiFailure(err, 'history write', 'record_export_failed')
  }

  return jsonResponse(HTTP_OK, isPro ?
    {exports: updatedExports} :
    {exports: updatedExports, freeExports: freeExportAllowance(updatedExports)})
})


/**
 * GET: the caller's tier and, for a free user, their export allowance.
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
  // without charging there, so there is no allowance to report.
  if (auth.sub === null) {
    return jsonResponse(HTTP_OK, {tier: 'paid', freeExports: null})
  }
  let appMetadata
  try {
    appMetadata = await getUserAppMetadata(auth.sub)
  } catch (err) {
    return managementApiFailure(err, 'app_metadata lookup', 'app_metadata_lookup_failed')
  }
  if (isProSubscriptionStatus(appMetadata.subscriptionStatus)) {
    return jsonResponse(HTTP_OK, {tier: 'paid', freeExports: null})
  }
  return jsonResponse(HTTP_OK, {tier: 'free', freeExports: freeExportAllowance(appMetadata.exports)})
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
