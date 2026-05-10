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
