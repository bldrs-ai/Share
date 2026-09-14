/*
 * netlify/functions/_lib/auth0.js
 * --------------------------------
 * Shared helper for Netlify Functions that need to enforce Auth0 primary
 * authentication. The leading underscore in the directory name keeps Netlify
 * from treating this file as a function entry point — only `*.js` directly
 * under `netlify/functions/` (or matching `myfn/myfn.js`) become endpoints.
 *
 * Usage:
 *   import {verifyAuth0Bearer} from './_lib/auth0.js'
 *
 *   export const handler = wrapHandler(async (event) => {
 *     const auth = await verifyAuth0Bearer(event)
 *     if (!auth.ok) {
 *       return auth.response
 *     }
 *     // auth.sub === 'google-oauth2|123…' (or null in unconfigured-dev mode)
 *   })
 *
 * Enforcement is keyed off AUTH0_DOMAIN: when present (prod, deploy previews,
 * any local dev whose .env mirrors prod), every request must carry a valid
 * Authorization: Bearer <Auth0-access-token>. When AUTH0_DOMAIN is absent
 * (a fully unconfigured local dev), the helper returns ok with sub=null so
 * functions still respond — but those deploys also lack GH_OAUTH_CLIENT_*
 * and so the gh-oauth functions remain inert anyway.
 *
 * Validation mirrors netlify/functions/unlink-identity.js: a /userinfo round
 * trip. /userinfo accepts any Auth0-issued access token regardless of
 * audience, so it works with the current GitHub-federated audience and
 * survives the eventual switch to a bldrs-specific audience without code
 * changes here.
 */

import axios from 'axios'
import * as Sentry from '@sentry/serverless'


const AUTHORIZATION_HEADER_PATTERN = /^Bearer\s+(.+)$/i

// Fire the bypass-warning at most once per function-instance lifetime.
// Netlify reuses warm instances across many requests, so a per-request
// captureMessage would flood Sentry on a misconfigured deploy.
let bypassWarningSent = false


/**
 * Verify the Authorization: Bearer header on a Netlify Function request and
 * return the Auth0 user_id (sub) on success.
 *
 * Returns one of:
 *   {ok: true, sub: <auth0-sub> }              — sub may be null when AUTH0_DOMAIN unset
 *   {ok: false, response: {statusCode, body}}  — ready to return verbatim
 *
 * Never throws — callers can rely on the discriminated union.
 *
 * @param {object} event Netlify Functions event
 * @return {Promise<object>} Discriminated result; see description.
 */
export async function verifyAuth0Bearer(event) {
  const auth0Domain = process.env.AUTH0_DOMAIN
  if (!auth0Domain) {
    // No primary-auth configured at all — treat as dev/local and skip
    // enforcement. In prod this branch is impossible because Auth0 is the
    // app's primary identity layer; if this trips in prod, the bigger
    // problem is that the deploy is misconfigured. Fire a one-shot
    // Sentry warning so the bypassed-gate state is visible without
    // spamming on every request.
    if (!bypassWarningSent) {
      bypassWarningSent = true
      try {
        Sentry.captureMessage(
          'AUTH0_DOMAIN missing — primary-auth gate is bypassed',
          'warning',
        )
      } catch {
        // Sentry not initialised in some local dev paths — ignore.
      }
    }
    return {ok: true, sub: null}
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization || ''
  const match = authHeader.match(AUTHORIZATION_HEADER_PATTERN)
  if (!match) {
    return {
      ok: false,
      response: {
        statusCode: 401,
        body: JSON.stringify({error: 'missing_auth0_token', error_description: 'Authorization: Bearer <Auth0-access-token> required'}),
      },
    }
  }

  const userToken = match[1]

  try {
    const resp = await axios.get(
      `https://${auth0Domain}/userinfo`,
      {headers: {Authorization: `Bearer ${userToken}`}},
    )
    const sub = resp.data?.sub
    if (!sub) {
      return {
        ok: false,
        response: {
          statusCode: 401,
          body: JSON.stringify({error: 'invalid_auth0_token', error_description: 'userinfo returned no sub'}),
        },
      }
    }
    // Tag Sentry with the user for cross-event correlation. This is
    // best-effort; if Sentry isn't initialised the call is a no-op.
    try {
      Sentry.setUser({id: sub})
    } catch {
      // ignore
    }
    return {ok: true, sub}
  } catch (err) {
    // /userinfo returns 401 for invalid/expired tokens; Sentry-capture so
    // we see network/upstream issues distinctly from "user has no token".
    // Always surface as 401 to the caller — anything else (e.g. an Auth0
    // 5xx) shouldn't be treated as a server bug on our side, just as
    // "we couldn't validate, please re-authenticate".
    Sentry.captureException(err)
    return {
      ok: false,
      response: {
        statusCode: 401,
        body: JSON.stringify({error: 'invalid_auth0_token', error_description: 'Auth0 /userinfo validation failed'}),
      },
    }
  }
}


/**
 * A Management API step that did not complete, carrying enough for the
 * caller's error response and log line to say WHICH step and what the
 * upstream answered. Without that, the `502 app_metadata_lookup_failed`
 * the #1837 deploy preview produced was indistinguishable, from the browser,
 * from a function that never started — and those are different fixes (a
 * deploy context missing the client credentials versus a bundling fault).
 *
 * Never carries a secret: `missing` lists env var NAMES, `upstreamStatus`
 * is an HTTP status code, and the message repeats only what axios put in
 * its own.
 */
export class ManagementApiError extends Error {
  /**
   * @param {'mgmt_config'|'mgmt_token'|'user_lookup'|'user_patch'} step
   * @param {object} [detail]
   * @param {Error} [detail.cause] The axios error, when a request was made
   * @param {Array<string>} [detail.missing] Unset env var names (`mgmt_config`)
   */
  constructor(step, {cause = null, missing = []} = {}) {
    const upstreamStatus = cause?.response?.status ?? null
    super(missing.length ?
      `Management API not configured: ${missing.join(', ')} unset` :
      `Management API ${step} failed` +
        `${upstreamStatus === null ? '' : ` (upstream ${upstreamStatus})`}: ${cause?.message ?? 'unknown'}`)
    this.name = 'ManagementApiError'
    this.step = step
    this.upstreamStatus = upstreamStatus
    this.missing = missing
    if (cause) {
      this.cause = cause
    }
  }
}


/**
 * The fields of a `ManagementApiError` a function returns beside its 502's
 * error code — and nothing else off an arbitrary error, which is why this
 * is a projection rather than the error itself.
 *
 * @param {Error} err
 * @return {{step: string, upstreamStatus: ?number, missing: Array<string>}}
 */
export function managementApiFailureDetail(err) {
  return {
    step: err?.step || 'unknown',
    upstreamStatus: err?.upstreamStatus ?? null,
    missing: err?.missing || [],
  }
}


// Everything the client-credentials grant needs. Checked before the request
// is made: the credentials are set per Netlify deploy context, and a preview
// context that lacks them is the first thing a 502 should rule in or out.
const MGMT_ENV_VARS = ['AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET']

// Module-scope Management-API token cache — survives across warm Lambda
// invocations, which is the whole point: a cold client-credentials round
// trip per request would double the latency of every gated call.
let cachedMgmtToken = null
let cachedMgmtTokenExpiresAt = 0
const MGMT_TOKEN_REFRESH_SAFETY_SEC = 60
const MILLIS_PER_SECOND = 1000


/**
 * Drop the cached Management API token. Tests only: the cache is module
 * scope, so without this a suite's first successful grant would satisfy
 * every later test and the credential-check paths could never be reached.
 */
export function resetManagementApiTokenCache() {
  cachedMgmtToken = null
  cachedMgmtTokenExpiresAt = 0
}


/**
 * Fetch (or reuse) an Auth0 Management API token via Client Credentials.
 *
 * Mirrors `record-load.js`'s private copy, which stays where it is: that
 * function is CommonJS (`require`/`exports.handler`) and this module is ESM,
 * so sharing would mean an interop wrapper for no behavioural gain. Keep the
 * two in lock-step if the token flow changes.
 *
 * @return {Promise<string>} Management API access token
 * @throws {ManagementApiError} `mgmt_config` when a credential env var is
 *   unset, `mgmt_token` when Auth0 refuses the grant
 */
export async function getManagementApiToken() {
  const now = Date.now()
  if (cachedMgmtToken && now < cachedMgmtTokenExpiresAt) {
    return cachedMgmtToken
  }
  const missing = MGMT_ENV_VARS.filter((name) => !process.env[name])
  if (missing.length) {
    throw new ManagementApiError('mgmt_config', {missing})
  }
  let resp
  try {
    resp = await axios.post(
      `https://${process.env.AUTH0_DOMAIN}/oauth/token`,
      {
        client_id: process.env.AUTH0_CLIENT_ID,
        client_secret: process.env.AUTH0_CLIENT_SECRET,
        audience: `https://${process.env.AUTH0_DOMAIN}/api/v2/`,
        grant_type: 'client_credentials',
      },
      {headers: {'Content-Type': 'application/json'}},
    )
  } catch (err) {
    throw new ManagementApiError('mgmt_token', {cause: err})
  }
  cachedMgmtToken = resp.data.access_token
  const expiresInSec = Number(resp.data.expires_in) || 0
  cachedMgmtTokenExpiresAt = now + ((expiresInSec - MGMT_TOKEN_REFRESH_SAFETY_SEC) * MILLIS_PER_SECOND)
  return cachedMgmtToken
}


/**
 * Read a user's `app_metadata` through the Management API.
 *
 * The Management API — never the caller's JWT — is the authority for any
 * entitlement decision: the client's own copy of `app_metadata` is whatever
 * was minted into its token, which can be minutes (or a cancelled
 * subscription) stale. Same rule `record-load.js` follows for quotas and
 * `create-portal-session.js` for Stripe identity (#1489).
 *
 * @param {string} sub Auth0 user_id, e.g. 'google-oauth2|123…'
 * @return {Promise<object>} app_metadata, `{}` when the user has none
 * @throws {ManagementApiError} the token step's errors, or `user_lookup`
 */
export async function getUserAppMetadata(sub) {
  const mgmtToken = await getManagementApiToken()
  let resp
  try {
    resp = await axios.get(
      `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(sub)}`,
      {headers: {Authorization: `Bearer ${mgmtToken}`}},
    )
  } catch (err) {
    throw new ManagementApiError('user_lookup', {cause: err})
  }
  return (resp.data && resp.data.app_metadata) || {}
}


/**
 * Merge keys into a user's `app_metadata` through the Management API.
 *
 * Auth0's PATCH is a SHALLOW merge over `app_metadata`'s top-level keys, so
 * a patch of `{exports: [...]}` rewrites that one key and leaves
 * `usageQuota` / `subscriptionStatus` / `stripeCustomerId` exactly as they
 * were. `record-load.js` relies on the same property when it writes
 * `usageQuota` — nothing here may send a whole `app_metadata` object built
 * client-side, which would drop every key it didn't know about.
 *
 * Read-modify-write is last-write-wins: two concurrent patches of the SAME
 * key can lose one side's addition. Callers must keep the loss direction
 * harmless (a missing history row, never a wrong entitlement).
 *
 * @param {string} sub Auth0 user_id, e.g. 'google-oauth2|123…'
 * @param {object} patch Top-level `app_metadata` keys to write
 * @return {Promise<void>}
 * @throws {ManagementApiError} the token step's errors, or `user_patch`
 */
export async function patchUserAppMetadata(sub, patch) {
  const mgmtToken = await getManagementApiToken()
  try {
    await axios.patch(
      `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(sub)}`,
      {app_metadata: patch},
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mgmtToken}`,
        },
      },
    )
  } catch (err) {
    throw new ManagementApiError('user_patch', {cause: err})
  }
}
