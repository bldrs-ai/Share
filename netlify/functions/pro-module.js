/*
 * Netlify Function: pro-module.js
 * -------------------------------
 * Gated delivery of premium ("pro") JavaScript modules.
 *
 *   GET /.netlify/functions/pro-module?name=glbExport
 *   Headers: Authorization: Bearer <Auth0 access token>
 *            X-Bldrs-Model-Key: <encodeURIComponent(share path of the model)>
 *
 * Flow:
 *   1. Allowlist the requested name (no path ever comes from the query).
 *   2. Validate the bearer via Auth0 /userinfo → sub (`verifyAuth0Bearer`).
 *   3. Read app_metadata through the Management API — NOT the caller's JWT
 *      claim, which is as stale as the token it was minted into.
 *   4. A Pro status (`sharePro` or `shareProPendingReauth`,
 *      src/quota/proStatus.js) → 200 with the module text, nothing written,
 *      no model key needed.
 *   5. Anyone else signed in is on the free tier, whose exports are governed
 *      by MODEL SLOTS (src/export/exportSlots.js): the model's key must hold
 *      one of the user's FREE_MODEL_SLOTS in `app_metadata.usageQuota.loads`
 *      — the same ledger, window and limit `record-load` meters private
 *      opens with. A missing or malformed key → 400. Then
 *      (`exportSlotDecision`):
 *      - the key already holds a slot → 200, nothing written;
 *      - it holds none and a slot is free → the slot is TAKEN here (the key
 *        appended to `usageQuota.loads`, the way record-load appends an
 *        open) before the module goes out;
 *      - it holds none and none is free → 403 `no_free_model_slot`, with
 *        the slots (and when the next frees up) in the body.
 *      Every free 200 carries `X-Bldrs-Model-Slots`: the slots after the
 *      delivery and whether it took one.
 *
 * Why the slot is taken HERE and not in `record-export`: this is the only
 * step the server controls. `record-export` is called by the client after the
 * file is already in the user's Downloads, so a slot taken there is one
 * blocked request away from exporting every model for nothing. Deciding on
 * delivery means every module a free user receives was handed over for a
 * model holding a slot; the client must not memoise such a delivery
 * (proModuleLoader.js reads the header to know), since a memo would export
 * the NEXT model without asking. What this cannot check — which model the
 * client actually exports, since the export runs in the browser — and what it
 * cannot stop — a user who keeps the module text and replays it — are the
 * exposures design/new/glb-export-premium.md §4.8 spells out.
 *
 * The retired per-export allowance (2 exports per 7 days, charged as
 * `free: true` rows in `app_metadata.exports`) is not read here any more;
 * old rows are history, nothing more.
 *
 * Why a function serves this at all: the module is built OUTSIDE `docs/`
 * (into `_pro-modules/`, gitignored, shipped to the lambda by netlify.toml's
 * `included_files`) so no public copy of the premium code exists. The client
 * fetches it with a bearer, wraps the text in a `blob:` URL and imports it —
 * a dynamic `import()` cannot carry an Authorization header, and a token in
 * the query string would land in logs.
 *
 * Design: design/new/glb-export-premium.md §3 (option C), §4.2, §4.6, §4.8.
 */

import fs from 'fs/promises'
import * as path from 'path'
import * as Sentry from '@sentry/serverless'
import {
  DRIVE_PUBLIC_HEADER,
  MODEL_KEY_HEADER,
  MODEL_SLOTS_HEADER,
  NO_FREE_SLOT_REASON,
  decodeModelKeyHeader,
  exportSlotDecision,
  isModelKey,
  modelSlots,
  slotsHeaderValue,
} from '../../src/export/exportSlots.js'
import {usageQuotaWithLoads} from '../../src/quota/limits.js'
import {isPublicModel} from './_lib/modelVisibility.js'
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
const HTTP_BAD_REQUEST = 400
const HTTP_FORBIDDEN = 403
const HTTP_NOT_FOUND = 404
const HTTP_METHOD_NOT_ALLOWED = 405
const HTTP_BAD_GATEWAY = 502

// The complete set of servable module ids, each with the export format it
// produces. The requested name is matched against these keys and the
// FILENAME is then composed from the matched constant — the query string
// never reaches the filesystem, so no amount of `../` in it can address a
// file outside `_pro-modules/`.
const PRO_MODULE_FORMATS = new Map([['glbExport', 'glb']])

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
  // is no Management API to ask (or to take a model slot in), so serve —
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

  let decision = null
  let publicSlots = null
  if (isFreeTier) {
    // Lambda lowercases header names; the dev server and the tests may not.
    const modelKey = decodeModelKeyHeader(headerValue(event, MODEL_KEY_HEADER))
    if (modelKey === null) {
      return errorResponse(HTTP_BAD_REQUEST, 'missing_model_key')
    }
    if (!isModelKey(modelKey)) {
      return errorResponse(HTTP_BAD_REQUEST, 'invalid_model_key')
    }
    // A PUBLIC model exports unlimited and takes no slot (owner decision on
    // Share#1980): what record-load would not count — public GitHub, looked
    // up here; a Drive file the client found public, on its word; hosted
    // samples and generic URLs — except a local file, which always takes one
    // (_lib/modelVisibility.js#isPublicModel).
    // A model already holding a slot is served on that alone, so the lookup
    // (a GitHub API call) is made only for a model that would otherwise
    // take, or be refused, a slot.
    decision = exportSlotDecision(appMetadata.usageQuota?.loads, modelKey)
    if (decision.verdict !== 'held' &&
        await isPublicModel(modelKey, {drivePublic: headerValue(event, DRIVE_PUBLIC_HEADER) === '1'})) {
      publicSlots = modelSlots(appMetadata.usageQuota?.loads)
      decision = null
    }
    if (decision?.verdict === 'full') {
      // Refusals are the signal that matters here: the Export tab gates a
      // free user whose slots are full before they can click, so a refusal
      // means stale slots on the client or someone probing the endpoint.
      // Tagged with the sub so either is attributable; the key is left out
      // of the message, since it can name a private repo's file.
      Sentry.captureMessage(
        `pro-module: no free model slot for ${auth.sub} (${name}; used ${decision.slots.used}/${decision.slots.limit})`,
        'warning',
      )
      return errorResponse(HTTP_FORBIDDEN, NO_FREE_SLOT_REASON, {modelSlots: decision.slots})
    }
  }

  // Read BEFORE taking a slot: a module missing from the deploy is a build
  // fault, and must not cost a free user one of their slots.
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

  if (isFreeTier && publicSlots !== null) {
    headers[MODEL_SLOTS_HEADER] = slotsHeaderValue(publicSlots, false, true)
  } else if (isFreeTier) {
    if (decision.verdict === 'take') {
      // Take the slot before serving, and refuse to serve if the write didn't
      // land: a delivery for a model holding no slot is exactly what this
      // gate exists to prevent. The write is `record-load`'s own — the
      // window's rows plus this key, under `usageQuota`, with every other
      // `usageQuota` field written back (Auth0 replaces a top-level key
      // whole; `usageQuotaWithLoads`) — so the two agree on the ledger and a
      // later open of this model reads as already counted.
      // Read-modify-write with no compare-and-swap, like every app_metadata
      // writer here (record-load included): two requests racing from one
      // account can both read the same free slot and both be served, and one
      // slot row can be lost to the other's write. That is a free extra
      // slot, never a wrongful refusal (§4.8 lists it among what stays
      // bypassable).
      try {
        await patchUserAppMetadata(auth.sub, {usageQuota: usageQuotaWithLoads(appMetadata.usageQuota, decision.loads)})
      } catch (err) {
        return managementApiFailure(err, 'model slot write', 'model_slot_write_failed')
      }
    }
    headers[MODEL_SLOTS_HEADER] = slotsHeaderValue(decision.slots, decision.verdict === 'take')
  }

  return {statusCode: HTTP_OK, headers, body: source}
})


/**
 * A request header, whatever case it arrived in.
 *
 * @param {object} event Netlify Functions event
 * @param {string} name e.g. 'X-Bldrs-Model-Key'
 * @return {?string}
 */
function headerValue(event, name) {
  const headers = event.headers || {}
  const wanted = name.toLowerCase()
  const found = Object.keys(headers).find((header) => header.toLowerCase() === wanted)
  return found === undefined ? null : headers[found]
}


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
