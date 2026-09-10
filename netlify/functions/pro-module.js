/*
 * Netlify Function: pro-module.js
 * -------------------------------
 * Gated delivery of premium ("pro") JavaScript modules.
 *
 *   GET /.netlify/functions/pro-module?name=glbExport
 *   Headers: Authorization: Bearer <Auth0 access token>
 *
 * Flow:
 *   1. Allowlist the requested name (no path ever comes from the query).
 *   2. Validate the bearer via Auth0 /userinfo → sub (`verifyAuth0Bearer`).
 *   3. Read app_metadata through the Management API — NOT the caller's JWT
 *      claim, which is as stale as the token it was minted into.
 *   4. `subscriptionStatus === 'sharePro'` → 200 with the module text;
 *      anything else → 403.
 *
 * Why a function serves this at all: the module is built OUTSIDE `docs/`
 * (into `_pro-modules/`, gitignored, shipped to the lambda by netlify.toml's
 * `included_files`) so no public copy of the premium code exists. The client
 * fetches it with a bearer, wraps the text in a `blob:` URL and imports it —
 * a dynamic `import()` cannot carry an Authorization header, and a token in
 * the query string would land in logs.
 *
 * Design: design/new/glb-export-premium.md §3 (option C), §4.2, §4.6.
 */

import fs from 'fs/promises'
import * as path from 'path'
import * as Sentry from '@sentry/serverless'
import {getUserAppMetadata, verifyAuth0Bearer} from './_lib/auth0.js'


Sentry.AWSLambda.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: process.env.NODE_ENV || 'development',
})

const HTTP_OK = 200
const HTTP_FORBIDDEN = 403
const HTTP_NOT_FOUND = 404
const HTTP_METHOD_NOT_ALLOWED = 405
const HTTP_BAD_GATEWAY = 502

// The complete set of servable module ids. The requested name is matched
// against this set and the FILENAME is then composed from the matched
// constant — the query string never reaches the filesystem, so no amount of
// `../` in it can address a file outside `_pro-modules/`.
const PRO_MODULE_NAMES = new Set(['glbExport'])

// Mirrors src/quota/quota.js#getTier's PAID branch. Deliberately NOT
// including 'shareProPendingReauth' (which `GitHubFileBrowser` does treat as
// Pro): `getTier` is the entitlement authority, and the export UI follows it
// too — design/new/glb-export-premium.md §7 open question 2.
const PRO_SUBSCRIPTION_STATUS = 'sharePro'

const PRO_MODULES_DIR_NAME = '_pro-modules'


/**
 * Read a pro module's built bytes.
 *
 * Two candidate roots because the layout differs between environments and
 * neither is worth guessing wrong: a deployed lambda gets `included_files`
 * copied under LAMBDA_TASK_ROOT with their repo-relative path preserved,
 * while `netlify dev` / `netlify-cli` set no such variable and run with the
 * repo root as `process.cwd()`.
 *
 * Deliberately NOT `import.meta.url`: no other function in this directory
 * uses `import.meta`, so how the deploy bundler treats it here is one more
 * unknown in a path that has to work on the first try.
 *
 * @param {string} name An id already validated against PRO_MODULE_NAMES
 * @return {Promise<string|null>} module source, or null when not built
 */
async function readProModuleSource(name) {
  const roots = [process.env.LAMBDA_TASK_ROOT, process.cwd()].filter(Boolean)
  const candidates = roots.map(
    (root) => path.resolve(root, 'netlify', 'functions', PRO_MODULES_DIR_NAME, `${name}.js`))
  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate, 'utf8')
    } catch {
      // Try the next root; a genuinely missing module falls out below.
    }
  }
  return null
}


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


export const handler = Sentry.AWSLambda.wrapHandler(async (event) => {
  if (event.httpMethod !== 'GET') {
    return {statusCode: HTTP_METHOD_NOT_ALLOWED, body: 'Method Not Allowed'}
  }

  const name = event.queryStringParameters?.name || ''
  if (!PRO_MODULE_NAMES.has(name)) {
    return errorResponse(HTTP_NOT_FOUND, 'unknown_module')
  }

  const auth = await verifyAuth0Bearer(event)
  if (!auth.ok) {
    return auth.response
  }

  // sub === null is the unconfigured-dev bypass `_lib/auth0.js` documents
  // (AUTH0_DOMAIN unset). It already fired its one-shot Sentry warning; there
  // is no Management API to ask, so serve — same posture as the gh-oauth
  // broker functions, and such a deploy has no paying users to protect.
  if (auth.sub !== null) {
    let appMetadata
    try {
      appMetadata = await getUserAppMetadata(auth.sub)
    } catch (err) {
      Sentry.captureException(err)
      return errorResponse(HTTP_BAD_GATEWAY, 'app_metadata_lookup_failed')
    }
    if (appMetadata.subscriptionStatus !== PRO_SUBSCRIPTION_STATUS) {
      // Denials are the signal that matters here: a spike means either a
      // stale client badge (the UI let someone click who shouldn't have) or
      // someone probing the endpoint. Tagged with the sub so either is
      // attributable.
      Sentry.captureMessage(
        `pro-module: denied ${name} to ${auth.sub} (subscriptionStatus=${appMetadata.subscriptionStatus || 'none'})`,
        'warning',
      )
      return errorResponse(HTTP_FORBIDDEN, 'subscription_required')
    }
  }

  const source = await readProModuleSource(name)
  if (source === null) {
    // Built output missing on a deploy that should have it — a build/config
    // fault, not a user error, so it is worth an exception rather than a
    // silent 404.
    Sentry.captureException(new Error(`pro-module: ${name} not found in ${PRO_MODULES_DIR_NAME}`))
    return errorResponse(HTTP_NOT_FOUND, 'module_not_built')
  }

  return {
    statusCode: HTTP_OK,
    headers: {
      // `private, no-store` so no shared cache (and no browser disk cache)
      // ever holds premium code that a later, unentitled request could be
      // served from. nosniff keeps a hostile embed from re-typing it.
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
    body: source,
  }
})
