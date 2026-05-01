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
 *   3. Derive tier: subscriptionStatus === 'sharePro' → PAID, else FREE.
 *   4. For /v/gh/, resolve repo privacy via unauth api.github.com
 *      (cached per "owner/repo" in module scope, 15-minute TTL).
 *   5. Prune loads outside the rolling 30-day window.
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

const axios = require('axios')
const Sentry = require('@sentry/serverless')


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

// Tier constants (kept in lock-step with src/OPFS/quota.js)
const TIER_FREE = 'free'
const TIER_PAID = 'paid'
const FREE_LIMIT = 4

// Time
const SECONDS_PER_MIN = 60
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24
const MILLIS_PER_SECOND = 1000
const ROLLING_WINDOW_DAYS = 30
const ROLLING_WINDOW_MS =
  ROLLING_WINDOW_DAYS * HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MIN * MILLIS_PER_SECOND

// Mgmt-token refresh safety margin
const MGMT_TOKEN_REFRESH_SAFETY_SEC = 60

// GH privacy cache TTL
const GH_PRIVACY_CACHE_TTL_MIN = 15
const GH_PRIVACY_CACHE_TTL_MS = GH_PRIVACY_CACHE_TTL_MIN * MINUTES_PER_HOUR * MILLIS_PER_SECOND

// Module-scope caches — survive across warm Lambda invocations.
let cachedMgmtToken = null
let cachedMgmtTokenExpiresAt = 0
const ghPrivacyCache = new Map() // "owner/repo" -> {private: bool, fetchedAt: ms}

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
 * @param {string} mgmtToken
 * @param {string} auth0UserId
 * @param {Array} loads New loads list to persist under app_metadata.usageQuota
 * @return {Promise<void>}
 */
async function patchUsageQuota(mgmtToken, auth0UserId, loads) {
  await axios.patch(
    `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(auth0UserId)}`,
    {app_metadata: {usageQuota: {loads}}},
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
  if (appMetadata && appMetadata.subscriptionStatus === 'sharePro') {
    return TIER_PAID
  }
  return TIER_FREE
}

/**
 * @param {Array} loads
 * @param {number} now
 * @return {Array}
 */
function pruneLoads(loads, now) {
  if (!Array.isArray(loads)) {
    return []
  }
  const cutoff = now - ROLLING_WINDOW_MS
  return loads.filter((l) => Date.parse(l.loadedAt) >= cutoff)
}

/**
 * Resolve whether a `/v/gh/{owner}/{repo}/...` path points at a private
 * repo. Returns true (=quotable) for private/missing/error responses.
 * Cached in module scope per (owner, repo) for GH_PRIVACY_CACHE_TTL_MS.
 *
 * @param {string} owner
 * @param {string} repo
 * @return {Promise<boolean>}
 */
async function isPrivateGhRepo(owner, repo) {
  const cacheKey = `${owner.toLowerCase()}/${repo.toLowerCase()}`
  const now = Date.now()
  const hit = ghPrivacyCache.get(cacheKey)
  if (hit && (now - hit.fetchedAt) < GH_PRIVACY_CACHE_TTL_MS) {
    return hit.private
  }
  try {
    const resp = await axios.get(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      {validateStatus: () => true},
    )
    let isPrivate
    if (resp.status === HTTP_OK) {
      isPrivate = false
    } else if (resp.status === HTTP_FORBIDDEN || resp.status >= HTTP_BAD_GATEWAY) {
      // Rate-limited or upstream hiccup — don't penalize the user; treat
      // as not-quotable. Do NOT cache this so we retry next time.
      Sentry.captureException(new Error(`GH repo lookup status=${resp.status} for ${cacheKey}`))
      return false
    } else {
      // 404 (private or missing) and other 4xx -> count it.
      isPrivate = true
    }
    ghPrivacyCache.set(cacheKey, {private: isPrivate, fetchedAt: now})
    return isPrivate
  } catch (err) {
    Sentry.captureException(err)
    return false
  }
}

/**
 * @param {string} key Share path
 * @return {Promise<boolean>}
 */
async function isQuotableLoad(key) {
  if (key.includes('/v/new/') || key.includes('/v/g/')) {
    return true
  }
  // /v/gh/<owner>/<repo>/<branch>/<path>
  const ghMatch = key.match(/\/v\/gh\/([^/]+)\/([^/]+)\//)
  if (ghMatch) {
    const owner = decodeURIComponent(ghMatch[1])
    const repo = decodeURIComponent(ghMatch[2])
    return await isPrivateGhRepo(owner, repo)
  }
  return false
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

exports.handler = Sentry.AWSLambda.wrapHandler(async (event) => {
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
  const existingLoads = pruneLoads((appMetadata.usageQuota && appMetadata.usageQuota.loads) || [], now)

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
    await patchUsageQuota(mgmtToken, auth0UserId, newLoads)
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
