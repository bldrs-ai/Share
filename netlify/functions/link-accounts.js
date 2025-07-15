/*
 * Netlify Function: link-accounts.js
 * ----------------------------------
 * Safely link a newly‑authenticated identity (secondaryIdToken) to the user
 * represented by the primary access‑token supplied in the Authorization header.
 *
 * 1. Caller sends:
 *      POST /.netlify/functions/link-accounts
 *      Headers:  Authorization: Bearer <primaryAccessToken>
 *      Body:     { "secondaryIdToken": "<JWT from popup>" }
 *
 * 2. We validate the primary token by hitting the Auth0 /userinfo endpoint.
 * 3. We obtain a short‑lived Management‑API token via Client‑Credentials.
 * 4. We POST /api/v2/users/{primaryUserId}/identities  { link_with: secondaryIdToken }
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
 * Fetch an Auth0 Management API token via Client Credentials flow.
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
    const resp = await axios.get(`https://${process.env.AUTH0_DOMAIN}/userinfo`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    return resp.data && resp.data.sub; // e.g. "auth0|abc123"
  } catch (err) {
    Sentry.captureException(err);
    throw new Error('Invalid primary access‑token');
  }
}

/**
 * Decode a JWT payload safely in Node _or_ the browser.
 * @param {string} jwt  A full JWT string (xxx.yyy.zzz)
 * @returns {object}    The parsed JSON payload
 */
function decodeJwtPayload(jwt) {
  const b64Url = jwt.split('.')[1];            // yyy
  const b64    = b64Url
                   .replace(/-/g, '+')
                   .replace(/_/g, '/')
                   .padEnd(b64Url.length + (4 - b64Url.length % 4) % 4, '=');

  // Node: Buffer exists.  Browser: atob exists.
  const json = typeof Buffer !== 'undefined'
                 ? Buffer.from(b64, 'base64').toString('utf8')
                 : atob(b64);

  return JSON.parse(json);
}

/**
 * Netlify handler
 */
exports.handler = Sentry.AWSLambda.wrapHandler(async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Extract the primary user access‑token from the Authorization header.
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { statusCode: 401, body: 'Missing or invalid Authorization header' };
  }
  const primaryToken = match[1];

  // Parse JSON body (consider base64‑encoded payloads)
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

  const { secondaryIdToken } = body;
  if (!secondaryIdToken) {
    return { statusCode: 400, body: 'secondaryIdToken is required' };
  }

  try {
    // 1) Validate primary token and get its user_id (primaryUserId)
    const primaryUserId = await getUserIdFromToken(primaryToken);
    if (!primaryUserId) {
      return { statusCode: 401, body: 'Unable to resolve primary user' };
    }

    // usage inside link-accounts.js
    const { sub } = decodeJwtPayload(secondaryIdToken);   // "google-oauth2|1037…"
    const [provider, user_id] = sub.split('|');



    // 2) Obtain Management‑API token (client credentials)
    const mgmtToken = await getManagementApiToken();

    // 3) Call Auth0 to link accounts
    const linkResp = await axios.post(
      `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(primaryUserId)}/identities`,
      { provider: provider, user_id: user_id },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${mgmtToken}`,
        },
      },
    );

    // Success – return the unified identities array from Auth0
    return {
      statusCode: 200,
      body: JSON.stringify({ linked: true, identities: linkResp.data }),
    };
  } catch (err) {
    // Surface Auth0 error details if available
    const msg = err.response ? `${err.response.status} ${err.response.data?.message || err.response.data}` : err.message;
    Sentry.captureException(err);
    return {
      statusCode: 500,
      body: `Account linking failed: ${msg}`,
    };
  }
});