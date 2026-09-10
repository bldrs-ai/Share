/*
 * Netlify Function: record-export.js
 * ----------------------------------
 * Server-side history of what a Pro user has exported.
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
 * it was minted into) → `subscriptionStatus === 'sharePro'` or 403 → prepend
 * the new entry to `app_metadata.exports` → PATCH → respond `{exports}`.
 *
 * Response: {exports: [{id, key, title, format, bytes, exportedAt}, …]},
 * newest first, capped at EXPORTS_CAP. The client mirrors this array into
 * OPFS (`src/export/exportHistory.js`) as its instant-display copy.
 *
 * READ-MODIFY-WRITE CAVEAT, same as `record-load.js`: the list is read,
 * prepended to and written back with no compare-and-swap, so two exports
 * racing from two tabs can lose one row. That loss direction is deliberate —
 * this list is history, never an entitlement, so the worst outcome is a
 * missing row in "My Exports"; the gate above it is decided per request from
 * freshly-read `app_metadata` and cannot be affected by a lost write.
 *
 * Only the `exports` key is patched (`patchUserAppMetadata`), so a
 * concurrent `record-load.js` write of `usageQuota` — or the Stripe
 * webhook's `subscriptionStatus` — survives untouched.
 *
 * Design: design/new/glb-export-premium.md §4.5.
 */

import {randomUUID} from 'crypto'
import * as Sentry from '@sentry/serverless'
import {getUserAppMetadata, patchUserAppMetadata, verifyAuth0Bearer} from './_lib/auth0.js'


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

// Mirrors src/quota/quota.js#getTier's PAID branch, and pro-module.js's own
// copy of it: `getTier` is the entitlement authority everywhere.
const PRO_SUBSCRIPTION_STATUS = 'sharePro'

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
 * @return {object} Netlify Functions response
 */
function errorResponse(statusCode, error) {
  return {
    statusCode,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({error}),
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
    Sentry.captureException(err)
    return errorResponse(HTTP_BAD_GATEWAY, 'app_metadata_lookup_failed')
  }

  if (appMetadata.subscriptionStatus !== PRO_SUBSCRIPTION_STATUS) {
    // Reaching here means a non-subscriber ran an export to completion, so
    // either `pro-module` handed out the module it shouldn't have or the
    // client faked the POST. Both are worth attributing.
    Sentry.captureMessage(
      `record-export: denied ${auth.sub} (subscriptionStatus=${appMetadata.subscriptionStatus || 'none'})`,
      'warning',
    )
    return errorResponse(HTTP_FORBIDDEN, 'subscription_required')
  }

  const existing = Array.isArray(appMetadata.exports) ? appMetadata.exports : []
  // Not named `exports`: babel-jest transpiles this module to CJS for the
  // unit tests, where that identifier is the module's own binding.
  const updatedExports = [
    {
      // The client's id when it sent one, so its optimistic row and this one
      // are the same row on both sides of the mirror.
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
    Sentry.captureException(err)
    return errorResponse(HTTP_BAD_GATEWAY, 'record_export_failed')
  }

  return jsonResponse(HTTP_OK, {exports: updatedExports})
})
