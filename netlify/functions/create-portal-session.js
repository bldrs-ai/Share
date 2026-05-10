/*
 * Netlify Function: create-portal-session.js
 * -------------------------------------------
 * Issue a Stripe Billing Portal session for the *authenticated* caller.
 *
 *   POST /.netlify/functions/create-portal-session
 *   Headers: Authorization: Bearer <user access token>
 *   Body:    {} (the customer is derived server-side, not from the client)
 *
 * The caller's Stripe customer ID is read from Auth0 app_metadata via the
 * Management API after the user's access token is verified against
 * /userinfo. This prevents an unauthenticated attacker from minting a
 * portal URL for someone else's `cus_…` ID — see
 * https://github.com/bldrs-ai/Share/pull/1489 for the report.
 */

import Stripe from 'stripe'
import axios from 'axios'
import * as Sentry from '@sentry/serverless'


Sentry.AWSLambda.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: process.env.NODE_ENV,
})

const HTTP_OK = 200
const HTTP_UNAUTHORIZED = 401
const HTTP_NOT_FOUND = 404
const HTTP_METHOD_NOT_ALLOWED = 405
const HTTP_BAD_GATEWAY = 502
const HTTP_INTERNAL_ERROR = 500

// Refresh management tokens this many seconds before their stated expiry to
// avoid using a token that expires mid-flight.
const MGMT_TOKEN_REFRESH_SAFETY_SEC = 60
const MILLIS_PER_SECOND = 1000

// Cached across warm invocations of the same Lambda container. Skips one of
// the three Auth0 round trips on the hot path. Cold starts pay the full cost.
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
 * Validate a user access token via /userinfo and return the user_id (sub).
 *
 * @param {string} userToken
 * @return {Promise<string|null>}
 */
async function getUserIdFromToken(userToken) {
  const resp = await axios.get(
    `https://${process.env.AUTH0_DOMAIN}/userinfo`,
    {headers: {Authorization: `Bearer ${userToken}`}},
  )
  return resp.data && resp.data.sub
}

/**
 * Read app_metadata.stripeCustomerId for the given Auth0 user.
 *
 * @param {string} mgmtToken
 * @param {string} auth0UserId
 * @return {Promise<string|null>}
 */
async function getStripeCustomerId(mgmtToken, auth0UserId) {
  const resp = await axios.get(
    `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(auth0UserId)}`,
    {headers: {Authorization: `Bearer ${mgmtToken}`}},
  )
  return resp.data && resp.data.app_metadata && resp.data.app_metadata.stripeCustomerId
}

/**
 * Netlify handler.
 */
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

  let stripeCustomerId
  try {
    const mgmtToken = await getManagementApiToken()
    stripeCustomerId = await getStripeCustomerId(mgmtToken, auth0UserId)
  } catch (err) {
    Sentry.captureException(err)
    return {statusCode: HTTP_BAD_GATEWAY, body: 'Failed to look up customer'}
  }
  if (!stripeCustomerId) {
    return {
      statusCode: HTTP_NOT_FOUND,
      body: JSON.stringify({error: 'No subscription on file for this account'}),
      headers: {'Content-Type': 'application/json'},
    }
  }

  try {
    // eslint-disable-next-line new-cap -- `stripe` SDK ships as a factory function
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY)
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: 'https://bldrs.ai/',
    })
    return {
      statusCode: HTTP_OK,
      body: JSON.stringify({url: portalSession.url}),
      headers: {'Content-Type': 'application/json'},
    }
  } catch (err) {
    Sentry.captureException(err)
    return {
      statusCode: HTTP_INTERNAL_ERROR,
      body: JSON.stringify({error: err.message}),
      headers: {'Content-Type': 'application/json'},
    }
  }
})

