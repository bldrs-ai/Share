import {HTTP_AUTHORIZATION_REQUIRED, HTTP_FORBIDDEN} from '../net/http'
import {FREE_EXPORTS_HEADER, FREE_EXPORT_ID_HEADER} from './freeExports'
import {importModuleFromUrl} from './importModuleFromUrl'


/**
 * Host-side loader for premium ("pro") export modules.
 *
 * The module text is never part of the public bundle: it is fetched from the
 * `pro-module` Netlify Function with the user's Auth0 bearer, wrapped in a
 * same-origin `blob:` URL and `import()`ed from there. The server re-checks
 * the subscription on every request, so this file is a courier, not a gate —
 * the UI's own tier check (`getTier`) only decides what to render.
 *
 * Why the blob hop at all: a dynamic `import()` can't carry an
 * `Authorization` header, and moving the token into the query string would
 * log it. The fetch carries the header; the blob URL is revoked immediately
 * after the import, and the namespace lives only in this module's Map — gone
 * on reload, never in OPFS, localStorage or the HTTP cache.
 *
 * ONLY A PRO DELIVERY IS MEMOISED. A free user's module comes with a free
 * export charged against it (`pro-module` says so with an
 * `X-Bldrs-Export-Id` header), and memoising that would let the rest of the
 * session export for nothing — the soft spot design/new/glb-export-premium.md
 * §4.8 closes. So a charged delivery is used for the one export it paid for
 * and dropped, and the next export fetches (and is charged) again. The
 * SERVER's header decides, not the client's idea of the tier, which can be
 * stale either way.
 *
 * Design: design/new/glb-export-premium.md §3, §4.1, §4.6.
 */


const PRO_MODULE_ENDPOINT = '/.netlify/functions/pro-module'

// How much of a non-JSON error body makes it into the error message. A
// Netlify-level failure page is HTML; its first line is what says "timed
// out" or "crashed".
const MAX_DETAIL_CHARS = 120

// name → in-flight or settled `{namespace, charge}`. Holding the PROMISE (not
// the namespace) is what makes concurrent callers share one fetch: two clicks
// before the first response still cost one request. A charged (free-tier)
// delivery is evicted as soon as it settles; see the header.
const loadedModules = new Map()


/** Thrown when the server refused to hand over the module. */
export class ProModuleDeniedError extends Error {
  /**
   * @param {number} status 401 (no/invalid token) or 403 (refused)
   * @param {string} message
   * @param {object} [detail]
   * @param {?string} [detail.reason] The function's `error`, e.g.
   *   'free_export_limit' or 'missing_auth0_token'
   * @param {?object} [detail.freeExports] The allowance a free-tier refusal
   *   carries (`freeExports.js#freeExportAllowance`), for the "next free
   *   export on …" message
   */
  constructor(status, message, {reason = null, freeExports = null} = {}) {
    super(message)
    this.name = 'ProModuleDeniedError'
    this.status = status
    this.reason = reason
    this.freeExports = freeExports
  }
}


/**
 * Fetch and import a pro module — memoised per page for Pro, fetched afresh
 * for every free-tier export.
 *
 * @param {string} name Module id, e.g. 'glbExport'
 * @param {Function} [getAccessToken] Returns a Promise of an Auth0 access
 *   token. Omitted (or resolving to nothing) means an unauthenticated
 *   request, which the server answers with 401.
 * @return {Promise<{namespace: object, charge: ?{exportId: string, freeExports: ?object}}>}
 *   the module namespace, and — when the server charged a free export for
 *   this delivery — the charge's ledger row id and the allowance left
 * @throws {ProModuleDeniedError} on 401/403; a plain Error otherwise
 */
export function loadProModule(name, getAccessToken) {
  const memoised = loadedModules.get(name)
  if (memoised) {
    return memoised
  }
  const pending = fetchAndImport(name, getAccessToken)
  // Evict on failure, so the retry after an upgrade (or after a network
  // blip) actually re-requests instead of replaying the rejection forever.
  // And evict a CHARGED success too: it paid for one export, not a session.
  // Only an uncharged (Pro) success stays memoised.
  pending.then(
    ({charge}) => {
      if (charge && loadedModules.get(name) === pending) {
        loadedModules.delete(name)
      }
    },
    () => loadedModules.delete(name))
  loadedModules.set(name, pending)
  return pending
}


/**
 * Drop one memoised module, so the next export asks `pro-module` again.
 *
 * For a Pro delivery the server no longer stands behind: the account lost
 * Pro while this page stayed open (canceled from another tab or device,
 * demoted by a failed payment), so the memoised module would keep exporting
 * uncharged for the rest of the session. `useExport` calls this when
 * `record-export` refuses an uncharged export — the in-session signal that
 * the memo has gone stale. The next export then fetches afresh and is
 * charged, or refused, like any other free-tier one.
 *
 * @param {string} name Module id, e.g. 'glbExport'
 */
export function forgetProModule(name) {
  loadedModules.delete(name)
}


/**
 * Drop the memoised modules. Tests only — a page never wants this (the
 * whole point of the Map is that the second export costs no request).
 */
export function resetProModuleCache() {
  loadedModules.clear()
}


/**
 * @param {string} name
 * @param {Function} [getAccessToken]
 * @return {Promise<object>} the module namespace
 */
async function fetchAndImport(name, getAccessToken) {
  const token = getAccessToken ? await getAccessToken() : null
  const headers = token ? {Authorization: `Bearer ${token}`} : {}
  const response = await fetch(`${PRO_MODULE_ENDPOINT}?name=${encodeURIComponent(name)}`, {headers})

  if (!response.ok) {
    const {detail, body} = await serverErrorDetail(response)
    if (response.status === HTTP_AUTHORIZATION_REQUIRED || response.status === HTTP_FORBIDDEN) {
      throw new ProModuleDeniedError(
        response.status, `Pro module "${name}" denied (${response.status}${detail})`,
        {reason: body?.error ?? null, freeExports: body?.freeExports ?? null})
    }
    throw new Error(`Pro module "${name}" failed to load (${response.status}${detail})`)
  }

  const charge = chargeFrom(response)
  const source = await response.text()
  const blobUrl = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}))
  try {
    return {namespace: await importModuleFromUrl(blobUrl), charge}
  } finally {
    // Revoke as soon as the import resolves: the module is compiled and the
    // URL is a live handle to the premium source for as long as it exists.
    URL.revokeObjectURL(blobUrl)
  }
}


/**
 * The free export a delivery was charged against, read off `pro-module`'s
 * response headers, or null for an uncharged (Pro) delivery.
 *
 * @param {Response} response A 200 from `pro-module`
 * @return {?{exportId: string, freeExports: ?object}}
 */
function chargeFrom(response) {
  const exportId = response.headers.get(FREE_EXPORT_ID_HEADER)
  if (!exportId) {
    return null
  }
  let freeExports = null
  try {
    freeExports = JSON.parse(response.headers.get(FREE_EXPORTS_HEADER))
  } catch {
    // The count line just waits for record-export's figure instead.
  }
  return {exportId, freeExports}
}


/**
 * What the server said went wrong, for the error message.
 *
 * The status alone is what #1837's deploy-preview smoke handed Sentry, and a
 * bare 502 there is either the function's own answer — a Management API
 * step it names in its body (`netlify/functions/pro-module.js`) — or a
 * function that never ran, which Netlify answers with its own page. Those
 * are different fixes, so the body is read and folded in: the function's
 * `{error, step, upstreamStatus, missing}` as a phrase, anything else as
 * its first line.
 *
 * @param {Response} response A non-OK response
 * @return {Promise<{detail: string, body: ?object}>} `detail` e.g.
 *   ': app_metadata_lookup_failed at mgmt_token, upstream 401' — or '' — and
 *   the parsed JSON body when there was one
 */
async function serverErrorDetail(response) {
  let text = ''
  try {
    text = await response.text()
  } catch {
    return {detail: '', body: null}
  }
  let body = null
  try {
    body = JSON.parse(text)
  } catch {
    return {detail: text ? `: ${text.trim().split('\n')[0].slice(0, MAX_DETAIL_CHARS)}` : '', body: null}
  }
  if (!body || typeof body.error !== 'string') {
    return {detail: '', body: null}
  }
  let detail = `: ${body.error}`
  if (body.step) {
    detail += ` at ${body.step}`
  }
  if (body.upstreamStatus !== null && body.upstreamStatus !== undefined) {
    detail += `, upstream ${body.upstreamStatus}`
  }
  if (Array.isArray(body.missing) && body.missing.length) {
    detail += `, unset ${body.missing.join(' ')}`
  }
  return {detail, body}
}
