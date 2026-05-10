/*
 * Netlify Function: gh-oauth-exchange.js
 * --------------------------------------
 * Exchange a GitHub OAuth authorization code for an access + refresh token
 * pair. Sole purpose: keep `client_secret` out of the browser bundle. The
 * popup hits github.com/login/oauth/authorize directly, the static
 * /auth/gh/callback.html page postMessages the code to the opener, and the
 * opener calls this function to complete the swap.
 *
 *   POST /.netlify/functions/gh-oauth-exchange
 *   Headers: Authorization: Bearer <Auth0-access-token>
 *     Required when AUTH0_DOMAIN is set (i.e. always in prod). Anchors
 *     per-sub quota and gates the code-for-token swap behind primary auth.
 *   Body: { "code": "<authcode>", "redirect_uri": "<...>" }
 *     redirect_uri is required by GitHub and must match the value used in
 *     the authorize step exactly.
 *
 * On success returns GitHub's response verbatim:
 *   { access_token, refresh_token, expires_in, refresh_token_expires_in,
 *     scope, token_type }
 *
 * Modeled on netlify/functions/unlink-identity.js for Sentry/axios/body
 * conventions but emitted as ESM since netlify/package.json sets
 * "type": "module".
 *
 * Env required:
 *   GH_OAUTH_CLIENT_ID     — public OAuth App client id
 *   GH_OAUTH_CLIENT_SECRET — server-only OAuth App client secret
 *   AUTH0_DOMAIN           — primary-auth tenant; when set, Auth0 token is
 *                            required on every call. When unset (truly
 *                            unconfigured local dev) enforcement is skipped.
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

  // Primary-auth gate. Validate before reaching GitHub so an unauthenticated
  // caller can't probe for valid OAuth codes.
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

  const {code, redirect_uri: redirectUri} = body
  if (!code || !redirectUri) {
    return {statusCode: 400, body: 'code and redirect_uri are required'}
  }

  try {
    // GitHub returns JSON when the Accept header is set; otherwise it returns
    // form-urlencoded — keep that explicit so we don't have to URL-decode.
    const resp = await axios.post(
      GH_TOKEN_URL,
      {
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      },
      {headers: {'Content-Type': 'application/json', 'Accept': 'application/json'}},
    )

    // GitHub signals errors with HTTP 200 + an `error` field in the body.
    // Surface those as 4xx so the browser doesn't think it succeeded.
    if (resp.data && resp.data.error) {
      return {
        statusCode: 400,
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
    return {statusCode: 502, body: `GitHub token exchange failed: ${msg}`}
  }
})
