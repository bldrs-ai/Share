/*
 * Netlify Function: gh-oauth-refresh.js
 * -------------------------------------
 * Rotate a GitHub OAuth refresh token for a fresh access + refresh pair.
 * Same shape as gh-oauth-exchange.js (client_secret must not ship to the
 * browser); used by GitHubProvider's refresh-on-401 path.
 *
 *   POST /.netlify/functions/gh-oauth-refresh
 *   Headers: Authorization: Bearer <Auth0-access-token>
 *     Same primary-auth gate as gh-oauth-exchange. See _lib/auth0.js.
 *   Body: { "refresh_token": "<rt>" }
 *
 * On success returns GitHub's response verbatim. With token-rotation enabled
 * on the OAuth App, every successful call invalidates the supplied refresh
 * token and returns a new one — the browser MUST persist the new value.
 *
 * Env required: GH_OAUTH_CLIENT_ID, GH_OAUTH_CLIENT_SECRET, AUTH0_DOMAIN.
 */

import axios from 'axios'
import * as Sentry from '@sentry/serverless'
import {verifyAuth0Bearer} from './_lib/auth0.js'


Sentry.AWSLambda.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: process.env.NODE_ENV || 'development',
})


const GH_TOKEN_URL = 'https://github.com/login/oauth/access_token'


export const handler = Sentry.AWSLambda.wrapHandler(async (event) => {
  if (event.httpMethod !== 'POST') {
    return {statusCode: 405, body: 'Method Not Allowed'}
  }

  const auth = await verifyAuth0Bearer(event)
  if (!auth.ok) {
    return auth.response
  }

  const clientId = process.env.GH_OAUTH_CLIENT_ID
  const clientSecret = process.env.GH_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return {statusCode: 500, body: 'GH_OAUTH_CLIENT_ID/SECRET not configured'}
  }

  let bodyStr = event.body || ''
  if (event.isBase64Encoded) {
    bodyStr = Buffer.from(bodyStr, 'base64').toString('utf8')
  }

  let body
  try {
    body = JSON.parse(bodyStr)
  } catch (err) {
    return {statusCode: 400, body: 'Invalid JSON body'}
  }

  const {refresh_token: refreshToken} = body
  if (!refreshToken) {
    return {statusCode: 400, body: 'refresh_token is required'}
  }

  try {
    const resp = await axios.post(
      GH_TOKEN_URL,
      {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      },
      {headers: {'Content-Type': 'application/json', 'Accept': 'application/json'}},
    )

    // GitHub returns 200 + {error} on bad refresh tokens (rotated, revoked,
    // expired). Map to 401 so the browser routes to a NeedsReconnect prompt
    // rather than a generic transport failure.
    if (resp.data && resp.data.error) {
      return {
        statusCode: 401,
        body: JSON.stringify({error: resp.data.error, error_description: resp.data.error_description}),
      }
    }

    return {
      statusCode: 200,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(resp.data),
    }
  } catch (err) {
    Sentry.captureException(err)
    const msg = err.response ?
      `${err.response.status} ${err.response.data?.message || err.response.data}` :
      err.message
    return {statusCode: 502, body: `GitHub token refresh failed: ${msg}`}
  }
})
