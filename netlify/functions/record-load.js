/*
 * Netlify Function: record-load.js
 * --------------------------------
 * Authoritative gate for usage-quota counting.
 *
 *   POST /.netlify/functions/record-load
 *   Headers: Authorization: Bearer <user access token>
 *   Body:    { key: string }   // share path, e.g. /share/v/g/<id>
 *
 * Flow:
 *   1. Validate the access token via Auth0 /userinfo → sub.
 *   2. Read user app_metadata via Auth0 Management API
 *      (mgmt token cached in module scope).
 *   3. Derive tier: a Pro subscriptionStatus (`sharePro` or
 *      `shareProPendingReauth`, src/quota/proStatus.js) → PAID, else FREE.
 *   4. For /v/gh/, resolve repo privacy via unauth api.github.com
 *      (cached per "owner/repo", 15-minute TTL; _lib/modelVisibility.js, the classification pro-module and record-export share). This
 *      function does not take the client's word for GitHub.
 *      For /v/g/ (Drive) it does: it can't see a Drive file's sharing (that
 *      would need the user's Drive token), so it counts every Drive key it
 *      is sent, and the client sends only the files it found private — never
 *      a link-shared one (src/quota/limits.js#isCountedByRouteKind,
 *      design/new/quotas.md §"Drive visibility": a known gap).
 *   5. Prune loads outside the rolling window (ROLLING_WINDOW_DAYS, 7).
 *      Local files (`/v/local-only/`, legacy `/v/new/`) are not quotable:
 *      they're free and unmetered (Share#1966) unless local metering is
 *      switched on (isLocalFileMeteringEnabled below).
 *   6. Idempotent: if key already counted, return current state.
 *   7. If FREE && used >= limit, return 403 — client surfaces dialog.
 *   8. Otherwise PATCH app_metadata.usageQuota.loads with the new entry.
 *
 * Response: { allowed, used, limit, tier, alreadyCounted }
 *   limit is null for paid (unlimited).
 *
 * Storage shape under app_metadata.usageQuota:
 *   { loads: [{ key, loadedAt }, ...] }
 */

import axios from 'axios'
import * as Sentry from '@sentry/serverless'
import {flags} from '../../src/FeatureFlags.js'
import {
  FREE_PRIVATE_MODEL_LIMIT,
  TIERS,
  loadsInsideRollingWindow,
  usageQuotaWithLoads,
} from '../../src/quota/limits.js'
import {isProSubscriptionStatus} from '../../src/quota/proStatus.js'
import {isQuotableModel} from './_lib/modelVisibility.js'


Sentry.AWSLambda.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: process.env.NODE_ENV,
})

// HTTP status codes
const HTTP_OK = 200
const HTTP_BAD_REQUEST = 400
const HTTP_UNAUTHORIZED = 401
const HTTP_FORBIDDEN = 403
const HTTP_METHOD_NOT_ALLOWED = 405
const HTTP_BAD_GATEWAY = 502

// Tiers, the free limit and the rolling window come from src/quota/limits.js,
// the definition the client, the MSW mock and the pricing-page guard share.
const TIER_FREE = TIERS.FREE
const TIER_PAID = TIERS.PAID
const FREE_LIMIT = FREE_PRIVATE_MODEL_LIMIT

// Time
const MILLIS_PER_SECOND = 1000

// Mgmt-token refresh safety margin
const MGMT_TOKEN_REFRESH_SAFETY_SEC = 60


// Module-scope caches — survive across warm Lambda invocations.
let cachedMgmtToken = null
let cachedMgmtTokenExpiresAt = 0

/**
 * Fetch (or reuse) an Auth0 Management API token via Client Credentials.
 *
 * @return {Promise<string>}
 */
async function getManagementApiToken() {
  const now = Date.now()
  if (cachedMgmtToken && now < cachedMgmtTokenExpiresAt) {
    return cachedMgmtToken
  }
  const resp = await axios.post(
    `https://${process.env.AUTH0_DOMAIN}/oauth/token`,
    {
      client_id: process.env.AUTH0_CLIENT_ID,
      client_secret: process.env.AUTH0_CLIENT_SECRET,
      audience: `https://${process.env.AUTH0_DOMAIN}/api/v2/`,
      grant_type: 'client_credentials',
    },
    {headers: {'Content-Type': 'application/json'}},
  )
  cachedMgmtToken = resp.data.access_token
  const expiresInSec = Number(resp.data.expires_in) || 0
  cachedMgmtTokenExpiresAt = now + ((expiresInSec - MGMT_TOKEN_REFRESH_SAFETY_SEC) * MILLIS_PER_SECOND)
  return cachedMgmtToken
}

/**
 * @param {string} userToken Bearer token presented by the caller
 * @return {Promise<string|null>} Auth0 user_id (sub)
 */
async function getUserIdFromToken(userToken) {
  const resp = await axios.get(
    `https://${process.env.AUTH0_DOMAIN}/userinfo`,
    {headers: {Authorization: `Bearer ${userToken}`}},
  )
  return resp.data && resp.data.sub
}

/**
 * @param {string} mgmtToken Management API token
 * @param {string} auth0UserId
 * @return {Promise<object>} Full user record (includes app_metadata)
 */
async function getUserRecord(mgmtToken, auth0UserId) {
  const resp = await axios.get(
    `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(auth0UserId)}`,
    {headers: {Authorization: `Bearer ${mgmtToken}`}},
  )
  return resp.data || {}
}

/**
 * Auth0 merges `app_metadata` one top-level key at a time, so this writes
 * the WHOLE `usageQuota` back — its other fields with `loads` replaced
 * (`limits.js#usageQuotaWithLoads`, the write `pro-module` makes too) — or a
 * load would erase them (codex review on Share#1980).
 *
 * @param {string} mgmtToken
 * @param {string} auth0UserId
 * @param {*} usageQuota The user's current app_metadata.usageQuota
 * @param {Array} loads New loads list to persist under app_metadata.usageQuota
 * @return {Promise<void>}
 */
async function patchUsageQuota(mgmtToken, auth0UserId, usageQuota, loads) {
  await axios.patch(
    `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(auth0UserId)}`,
    {app_metadata: {usageQuota: usageQuotaWithLoads(usageQuota, loads)}},
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mgmtToken}`,
      },
    },
  )
}

/**
 * @param {object} appMetadata
 * @return {string}
 */
function getTier(appMetadata) {
  // The same Pro definition `src/quota/quota.js#getTier` reads, so the badge
  // and this gate agree about a pending-reauth user (both: paid).
  if (appMetadata && isProSubscriptionStatus(appMetadata.subscriptionStatus)) {
    return TIER_PAID
  }
  return TIER_FREE
}

/**
 * Whether local files count: the `meterLocalFiles` flag in
 * src/FeatureFlags.js (the client reads the same flag), or the
 * METER_LOCAL_FILES=true env var, which turns the meter on for this
 * function alone — e.g. on a deploy preview being tested with
 * `?feature=meterLocalFiles`, since a URL flag only reaches the client. Off
 * by default: local files are free and unmetered (Share#1966,
 * design/new/quotas.md §"Metering local files again"). Read per call, not at
 * module scope, so an env change applies without a cold start.
 *
 * @return {boolean}
 */
function isLocalFileMeteringEnabled() {
  const flag = flags.find((f) => f.name === 'meterLocalFiles')
  return Boolean(flag && flag.isActive) || process.env.METER_LOCAL_FILES === 'true'
}

/**
 * The shared classification (`_lib/modelVisibility.js#isQuotableModel`,
 * which `pro-module` and `record-export` decide exports by too), with this
 * function's local-file switch.
 *
 * @param {string} key Share path
 * @return {Promise<boolean>}
 */
function isQuotableLoad(key) {
  return isQuotableModel(key, {meterLocalFiles: isLocalFileMeteringEnabled()})
}

/**
 * Build the response payload for a given decision.
 *
 * @param {boolean} allowed
 * @param {number} used
 * @param {string} tier
 * @param {boolean} alreadyCounted
 * @param {Array} [loads] Authoritative loads array to mirror to client
 * @return {object}
 */
function buildResponse(allowed, used, tier, alreadyCounted, loads) {
  const limit = tier === TIER_PAID ? null : FREE_LIMIT
  const body = {allowed, used, limit, tier, alreadyCounted}
  if (loads) {
    body.loads = loads
  }
  return body
}

export const handler = Sentry.AWSLambda.wrapHandler(async (event) => {
  if (event.httpMethod !== 'POST') {
    return {statusCode: HTTP_METHOD_NOT_ALLOWED, body: 'Method Not Allowed'}
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || ''
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    return {statusCode: HTTP_UNAUTHORIZED, body: 'Missing or invalid Authorization header'}
  }
  const userToken = match[1]

  let bodyStr = event.body || ''
  if (event.isBase64Encoded) {
    bodyStr = Buffer.from(bodyStr, 'base64').toString('utf8')
  }
  let body
  try {
    body = JSON.parse(bodyStr)
  } catch {
    return {statusCode: HTTP_BAD_REQUEST, body: 'Invalid JSON body'}
  }
  const {key} = body || {}
  if (typeof key !== 'string' || !key) {
    return {statusCode: HTTP_BAD_REQUEST, body: 'Missing key'}
  }

  let auth0UserId
  try {
    auth0UserId = await getUserIdFromToken(userToken)
  } catch (err) {
    Sentry.captureException(err)
    return {statusCode: HTTP_UNAUTHORIZED, body: 'Invalid access token'}
  }
  if (!auth0UserId) {
    return {statusCode: HTTP_UNAUTHORIZED, body: 'Unable to resolve user'}
  }

  let mgmtToken
  let userRecord
  try {
    mgmtToken = await getManagementApiToken()
    userRecord = await getUserRecord(mgmtToken, auth0UserId)
  } catch (err) {
    Sentry.captureException(err)
    return {statusCode: HTTP_BAD_GATEWAY, body: 'Failed to look up user'}
  }

  const appMetadata = userRecord.app_metadata || {}
  const tier = getTier(appMetadata)
  const now = Date.now()
  // The client's pruning too (limits.js#loadsInsideRollingWindow), so the
  // server, the OPFS mirror and the MSW mock share one edge.
  const existingLoads = loadsInsideRollingWindow((appMetadata.usageQuota && appMetadata.usageQuota.loads) || [], now)

  // Paid: never gated, never recorded (no point burning Mgmt API writes).
  if (tier === TIER_PAID) {
    return jsonResponse(HTTP_OK, buildResponse(true, existingLoads.length, tier, false))
  }

  let quotable
  try {
    quotable = await isQuotableLoad(key)
  } catch (err) {
    Sentry.captureException(err)
    quotable = false
  }
  if (!quotable) {
    return jsonResponse(HTTP_OK, buildResponse(true, existingLoads.length, tier, false))
  }

  if (existingLoads.some((l) => l.key === key)) {
    return jsonResponse(HTTP_OK, buildResponse(true, existingLoads.length, tier, true, existingLoads))
  }

  if (existingLoads.length >= FREE_LIMIT) {
    return jsonResponse(HTTP_FORBIDDEN, buildResponse(false, existingLoads.length, tier, false, existingLoads))
  }

  const newLoads = [...existingLoads, {key, loadedAt: new Date(now).toISOString()}]
  try {
    await patchUsageQuota(mgmtToken, auth0UserId, appMetadata.usageQuota, newLoads)
  } catch (err) {
    Sentry.captureException(err)
    return {statusCode: HTTP_BAD_GATEWAY, body: 'Failed to record load'}
  }

  return jsonResponse(HTTP_OK, buildResponse(true, newLoads.length, tier, false, newLoads))
})

/**
 * @param {number} status HTTP status code
 * @param {object} body JSON body
 * @return {object} Netlify function response
 */
function jsonResponse(status, body) {
  return {
    statusCode: status,
    body: JSON.stringify(body),
    headers: {'Content-Type': 'application/json'},
  }
}
