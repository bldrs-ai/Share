/*
 * Netlify Function: unlink-identity.js
 * ------------------------------------
 * Safely unlink a secondary identity from the primary user in Auth0.
 *
 * 1. Caller sends:
 *      POST /.netlify/functions/unlink-identity
 *      Headers:  Authorization: Bearer <primaryAccessToken>
 *      Body:     {
 *                   "secondaryProvider": "github",
 *                   "secondaryUserId": "17447690"
 *                 }
 *
 * 2. We validate the primary token by hitting the Auth0 /userinfo endpoint.
 * 3. We obtain a short‑lived Management‑API token via Client‑Credentials.
 * 4. We DELETE /api/v2/users/{primaryUserId}/identities/{secondaryProvider}/{secondaryUserId}
 */

/* eslint-disable node/no-unsupported-features/es-syntax */
const axios = require('axios');
const Sentry = require('@sentry/serverless');

Sentry.AWSLambda.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: process.env.NODE_ENV || 'development',
});

/**
 * Fetch an Auth0 Management API token via Client‑Credentials flow.
 * Returns a short‑lived bearer token for the Management API.
 */
async function getManagementApiToken() {
  try {
    const resp = await axios.post(
      `https://${process.env.AUTH0_DOMAIN}/oauth/token`,
      {
        client_id: process.env.AUTH0_CLIENT_ID,
        client_secret: process.env.AUTH0_CLIENT_SECRET,
        audience: `https://${process.env.AUTH0_DOMAIN}/api/v2/`,
        grant_type: 'client_credentials',
      },
      { headers: { 'Content-Type': 'application/json' } },
    );
    return resp.data.access_token;
  } catch (err) {
    Sentry.captureException(err);
    throw new Error('Failed to obtain Management API token');
  }
}

/**
 * Verify a user access‑token via /userinfo and return the user_id (sub).
 */
async function getUserIdFromToken(userToken) {
  try {
    const resp = await axios.get(
      `https://${process.env.AUTH0_DOMAIN}/userinfo`,
      { headers: { Authorization: `Bearer ${userToken}` } },
    );
    return resp.data && resp.data.sub; // e.g. "google-oauth2|1037…"
  } catch (err) {
    Sentry.captureException(err);
    throw new Error('Invalid primary access‑token');
  }
}

/**
 * Netlify handler
 */
exports.handler = Sentry.AWSLambda.wrapHandler(async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // -------------------------------------------------------------------------
  // Extract & validate the Authorization header (primary user access token)
  // -------------------------------------------------------------------------
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { statusCode: 401, body: 'Missing or invalid Authorization header' };
  }
  const primaryToken = match[1];

  // -------------------------------------------------------------------------
  // Parse body (may be base64‑encoded depending on Netlify settings)
  // -------------------------------------------------------------------------
  let bodyStr = event.body || '';
  if (event.isBase64Encoded) {
    bodyStr = Buffer.from(bodyStr, 'base64').toString('utf8');
  }

  let body;
  try {
    body = JSON.parse(bodyStr);
  } catch (err) {
    return { statusCode: 400, body: 'Invalid JSON body' };
  }

  const { secondaryProvider, secondaryUserId } = body;
  if (!secondaryProvider || !secondaryUserId) {
    return { statusCode: 400, body: 'secondaryProvider and secondaryUserId are required' };
  }

  try {
    // 1️⃣ Validate primary token and get its user_id (primaryUserId)
    const primaryUserId = await getUserIdFromToken(primaryToken);
    if (!primaryUserId) {
      return { statusCode: 401, body: 'Unable to resolve primary user' };
    }

    // 2️⃣ Obtain Management‑API token (client credentials)
    const mgmtToken = await getManagementApiToken();

    // 3️⃣ Call Auth0 Management API to unlink accounts
    const unlinkUrl = `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(
      primaryUserId,
    )}/identities/${secondaryProvider}/${secondaryUserId}`;

    const unlinkResp = await axios.delete(unlinkUrl, {
      headers: {
        Authorization: `Bearer ${mgmtToken}`,
      },
    });

    // Success – Auth0 returns the updated identities array
    return {
      statusCode: 200,
      body: JSON.stringify({ unlinked: true, identities: unlinkResp.data }),
    };
  } catch (err) {
    const msg = err.response
      ? `${err.response.status} ${err.response.data?.message || err.response.data}`
      : err.message;
    Sentry.captureException(err);
    return { statusCode: 500, body: `Account unlink failed: ${msg}` };
  }
});
