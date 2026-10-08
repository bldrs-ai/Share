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
 *   4. A Pro status (`sharePro` or `shareProPendingReauth`,
 *      src/quota/proStatus.js) → 200 with the module text, nothing written.
 *   5. Anyone else signed in is on the free tier, which gets
 *      FREE_EXPORT_LIMIT exports per rolling FREE_EXPORT_WINDOW_DAYS
 *      (src/export/freeExports.js). At the limit → 403
 *      `free_export_limit`, with the allowance (and when the next export
 *      frees up) in the body. Under it → a free export is CHARGED here: a
 *      `free: true` row is prepended to `app_metadata.exports` before the
 *      module goes out, and the 200 carries that row's id
 *      (`X-Bldrs-Export-Id`) and the allowance left
 *      (`X-Bldrs-Free-Exports`).
 *
 * Why the charge is HERE and not in `record-export`: this is the only step
 * the server controls. `record-export` is called by the client after the
 * file is already in the user's Downloads, so a counter there is one blocked
 * request away from unlimited exports. Charging on delivery means every
 * module a free user receives has been paid for out of their allowance; the
 * client must not memoise such a delivery (proModuleLoader.js reads the
 * header to know). What it cannot stop — a user who keeps the module text
 * they were served and replays it — is the same exposure §4.6 accepts for
 * Pro, and is spelled out in design/new/glb-export-premium.md §4.8.
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

import {randomUUID} from 'crypto'
import fs from 'fs/promises'
import * as path from 'path'
import * as Sentry from '@sentry/serverless'
import {
  FREE_EXPORTS_HEADER,
  FREE_EXPORT_ID_HEADER,
  FREE_EXPORT_LIMIT_REASON,
  freeExportAllowance,
  newFreeExportRow,
} from '../../src/export/freeExports.js'
import {isProSubscriptionStatus} from '../../src/quota/proStatus.js'
import {
  getUserAppMetadata,
  managementApiFailureDetail,
  patchUserAppMetadata,
  verifyAuth0Bearer,
} from './_lib/auth0.js'


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

// The complete set of servable module ids, each with the export format it
// produces (what a free export's ledger row records). The requested name is
// matched against these keys and the FILENAME is then composed from the
// matched constant — the query string never reaches the filesystem, so no
// amount of `../` in it can address a file outside `_pro-modules/`.
const PRO_MODULE_FORMATS = new Map([['glbExport', 'glb']])

// Same cap and same reason as `record-export.js`'s EXPORTS_CAP: the charge
// row lands in the list that function keeps, under Auth0's 16 KB
// app_metadata ceiling.
const EXPORTS_CAP = 100

const PRO_MODULES_DIR_NAME = '_pro-modules'


// Where `included_files` land inside the deployed bundle, relative to the
// task root. Both spellings are tried because the layout has varied with the
// bundler and isn't worth guessing wrong. With the current bundler (esbuild
// via netlify.toml, zip-it-and-ship-it 14.5.4) the repo-relative
// `netlify/functions/_pro-modules/x.js` is kept as-is — the second entry
// below is the match, verified by bundling with
// tools/netlify/bundleFunctions.mjs (functionBundler.test.js asserts it).
// The task-root `_pro-modules/x.js` spelling is a fallback for a bundler
// that strips the functions directory. The repo-relative spelling is also
// what `netlify dev` sees, running with the repo root as `cwd`.
const PRO_MODULES_RELATIVE_PATHS = [
  [PRO_MODULES_DIR_NAME],
  ['netlify', 'functions', PRO_MODULES_DIR_NAME],
]


/**
 * Read a pro module's built bytes.
 *
 * Candidate roots because the layout differs between environments and
 * neither is worth guessing wrong: a deployed lambda gets `included_files`
 * under LAMBDA_TASK_ROOT (see `PRO_MODULES_RELATIVE_PATHS`), while
 * `netlify dev` / `netlify-cli` set no such variable and run with the repo
 * root as `process.cwd()`.
 *
 * Deliberately NOT `import.meta.url`: the function is bundled to a single
 * CommonJS file (netlify.toml, `node_bundler = "esbuild"`), where
 * `import.meta.url` is undefined.
 *
 * @param {string} name An id already validated against PRO_MODULE_NAMES
 * @return {Promise<string|null>} module source, or null when not built
 */
async function readProModuleSource(name) {
  const roots = [process.env.LAMBDA_TASK_ROOT, process.cwd()].filter(Boolean)
  const candidates = roots.flatMap((root) => PRO_MODULES_RELATIVE_PATHS.map(
    (relative) => path.resolve(root, ...relative, `${name}.js`)))
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
 * @param {object} [detail] Extra fields beside `error` — a 502 says which
 *   step failed (`managementApiFailureDetail`), so the browser can tell the
 *   function's own answer from a function that never ran
 * @return {object} Netlify Functions response
 */
function errorResponse(statusCode, error, detail = {}) {
  return {
    statusCode,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({error, ...detail}),
  }
}


export const handler = Sentry.AWSLambda.wrapHandler(async (event) => {
  if (event.httpMethod !== 'GET') {
    return {statusCode: HTTP_METHOD_NOT_ALLOWED, body: 'Method Not Allowed'}
  }

  const name = event.queryStringParameters?.name || ''
  if (!PRO_MODULE_FORMATS.has(name)) {
    return errorResponse(HTTP_NOT_FOUND, 'unknown_module')
  }

  const auth = await verifyAuth0Bearer(event)
  if (!auth.ok) {
    return auth.response
  }

  // sub === null is the unconfigured-dev bypass `_lib/auth0.js` documents
  // (AUTH0_DOMAIN unset). It already fired its one-shot Sentry warning; there
  // is no Management API to ask (or to charge a free export to), so serve —
  // same posture as the gh-oauth broker functions, and such a deploy has no
  // paying users to protect.
  let appMetadata = null
  if (auth.sub !== null) {
    try {
      appMetadata = await getUserAppMetadata(auth.sub)
    } catch (err) {
      return managementApiFailure(err, 'app_metadata lookup', 'app_metadata_lookup_failed')
    }
  }
  const isFreeTier = appMetadata !== null && !isProSubscriptionStatus(appMetadata.subscriptionStatus)

  let allowance = null
  if (isFreeTier) {
    allowance = freeExportAllowance(appMetadata.exports)
    if (allowance.remaining === 0) {
      // Refusals are the signal that matters here: the Export tab gates a
      // free user at the limit before they can click, so a refusal means a
      // stale count on the client or someone probing the endpoint. Tagged
      // with the sub so either is attributable.
      Sentry.captureMessage(
        `pro-module: free export limit reached for ${auth.sub} (${name}; used ${allowance.used}/${allowance.limit})`,
        'warning',
      )
      return errorResponse(HTTP_FORBIDDEN, FREE_EXPORT_LIMIT_REASON, {freeExports: allowance})
    }
  }

  // Read BEFORE charging: a module missing from the deploy is a build fault,
  // and must not cost a free user one of their exports.
  const source = await readProModuleSource(name)
  if (source === null) {
    // Built output missing on a deploy that should have it — a build/config
    // fault, not a user error, so it is worth an exception rather than a
    // silent 404.
    Sentry.captureException(new Error(`pro-module: ${name} not found in ${PRO_MODULES_DIR_NAME}`))
    return errorResponse(HTTP_NOT_FOUND, 'module_not_built')
  }

  const headers = {
    // `private, no-store` so no shared cache (and no browser disk cache)
    // ever holds premium code that a later, unentitled request could be
    // served from. nosniff keeps a hostile embed from re-typing it.
    'Content-Type': 'text/javascript; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  }

  if (isFreeTier) {
    // Charge before serving, and refuse to serve if the charge didn't land:
    // an uncharged delivery is exactly the free export this gate exists to
    // count. Only the `exports` key is patched, so a concurrent
    // `record-load` write of `usageQuota` survives (same as record-export).
    // Read-modify-write with no compare-and-swap, like every app_metadata
    // writer here: two requests racing from one account can both read the
    // same count and both be served, and one charge row can be lost to the
    // other's write. That is a free extra export, never a wrongful refusal
    // (§4.8 lists it among what stays bypassable).
    const existing = Array.isArray(appMetadata.exports) ? appMetadata.exports : []
    const row = newFreeExportRow({id: randomUUID(), format: PRO_MODULE_FORMATS.get(name)})
    const charged = [row, ...existing].slice(0, EXPORTS_CAP)
    try {
      await patchUserAppMetadata(auth.sub, {exports: charged})
    } catch (err) {
      return managementApiFailure(err, 'free export charge', 'free_export_charge_failed')
    }
    headers[FREE_EXPORT_ID_HEADER] = row.id
    headers[FREE_EXPORTS_HEADER] = JSON.stringify(freeExportAllowance(charged))
  }

  return {statusCode: HTTP_OK, headers, body: source}
})


/**
 * Report a Management API failure and answer 502 with the step it failed
 * at, so the browser can tell the function's own answer from a function
 * that never ran.
 *
 * @param {Error} err
 * @param {string} what for the log line, e.g. 'app_metadata lookup'
 * @param {string} error the response's `error`
 * @return {object} Netlify Functions response
 */
function managementApiFailure(err, what, error) {
  const detail = managementApiFailureDetail(err)
  Sentry.captureException(err, {tags: {step: detail.step}})
  // Netlify's function log is the one channel every deploy context has —
  // Sentry only exists where SENTRY_DSN is set — so the step goes there
  // too. Names of unset env vars only; never their values.
  console.error(`pro-module: ${what} failed at ${detail.step}` +
    ` (upstream ${detail.upstreamStatus ?? 'n/a'}): ${err.message}`)
  return errorResponse(HTTP_BAD_GATEWAY, error, detail)
}
