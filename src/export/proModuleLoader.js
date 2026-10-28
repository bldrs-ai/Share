import {HTTP_AUTHORIZATION_REQUIRED, HTTP_FORBIDDEN} from '../net/http'
import {MODEL_KEY_HEADER, MODEL_SLOTS_HEADER} from './exportSlots'
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
 * ONLY A PRO DELIVERY IS MEMOISED. A free user's module is handed over for
 * ONE model — the one whose slot key the request carried, which `pro-module`
 * checked holds one of the user's model slots, or gave it one
 * (src/export/exportSlots.js) — and says so with an `X-Bldrs-Model-Slots`
 * header. Memoising that would let the rest of the session export any other
 * model without the server ever asking whether it holds a slot: the soft
 * spot design/new/glb-export-premium.md §4.8 closes. So a free delivery is
 * used for the one export it was granted and dropped, and the next export
 * fetches (and is decided) again. The SERVER's header decides, not the
 * client's idea of the tier, which can be stale either way.
 *
 * Design: design/new/glb-export-premium.md §3, §4.1, §4.6.
 */


const PRO_MODULE_ENDPOINT = '/.netlify/functions/pro-module'

// How much of a non-JSON error body makes it into the error message. A
// Netlify-level failure page is HTML; its first line is what says "timed
// out" or "crashed".
const MAX_DETAIL_CHARS = 120

// name → in-flight or settled `{namespace, slots}`, keyed by module name AND
// model key while in flight, since a free user's request is decided for one
// model. Holding the PROMISE (not the namespace) is what makes concurrent
// callers share one fetch: two clicks before the first response still cost
// one request — but only for the same model, so a request for model B never
// rides on the answer about model A. A settled Pro delivery (no slots header) is
// then filed under the name alone and serves every model; a free delivery is
// dropped as soon as it settles. See the header.
const loadedModules = new Map()


/** Thrown when the server refused to hand over the module. */
export class ProModuleDeniedError extends Error {
  /**
   * @param {number} status 401 (no/invalid token) or 403 (refused)
   * @param {string} message
   * @param {object} [detail]
   * @param {?string} [detail.reason] The function's `error`, e.g.
   *   'no_free_model_slot' or 'missing_auth0_token'
   * @param {?object} [detail.modelSlots] The slots a slots-full refusal
   *   carries (`exportSlots.js#modelSlots`), for the "next slot frees up
   *   on …" message
   */
  constructor(status, message, {reason = null, modelSlots = null} = {}) {
    super(message)
    this.name = 'ProModuleDeniedError'
    this.status = status
    this.reason = reason
    this.modelSlots = modelSlots
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
 * @param {?string} [modelKey] The slot key of the model being exported
 *   (quota/modelSlotKey.js). A free user's request is refused (400) without one;
 *   Pro's never reads it.
 * @return {Promise<{namespace: object, slots: ?{limit: number, used: number,
 *   remaining: number, nextFreeAt: ?string, taken: boolean}}>} the module
 *   namespace, and — for a free-tier delivery — the slots after it, and
 *   whether it took one
 * @throws {ProModuleDeniedError} on 401/403; a plain Error otherwise
 */
export function loadProModule(name, getAccessToken, modelKey = null) {
  const memoised = loadedModules.get(name)
  if (memoised) {
    return memoised
  }
  const inFlightKey = `${name}\u0000${modelKey ?? ''}`
  const inFlight = loadedModules.get(inFlightKey)
  if (inFlight) {
    return inFlight
  }
  const pending = fetchAndImport(name, getAccessToken, modelKey)
  // The in-flight entry goes either way once settled. Evicting on failure is
  // what lets the retry after an upgrade (or a network blip) actually
  // re-request instead of replaying the rejection forever; a FREE success
  // goes too, since it was granted for one model, not a session. Only an
  // Pro success (no slots header) is kept, under the name alone.
  const settle = () => {
    if (loadedModules.get(inFlightKey) === pending) {
      loadedModules.delete(inFlightKey)
    }
  }
  pending.then(
    ({slots}) => {
      settle()
      if (!slots) {
        loadedModules.set(name, pending)
      }
    },
    settle)
  loadedModules.set(inFlightKey, pending)
  return pending
}


/**
 * Drop one memoised module, so the next export asks `pro-module` again.
 *
 * For a Pro delivery the server no longer stands behind: the account lost
 * Pro while this page stayed open (canceled from another tab or device,
 * demoted by a failed payment), so the memoised module would keep exporting
 * any model, slot or no slot, for the rest of the session. `useExport` calls this when
 * `record-export` refuses an export of a model holding no slot
 * (`export_slot_missing`) — the in-session signal that the memo has gone
 * stale. The next export then fetches afresh and is decided by model slots
 * like any other free-tier one.
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
 * @param {?string} modelKey
 * @return {Promise<object>} the module namespace
 */
async function fetchAndImport(name, getAccessToken, modelKey) {
  const token = getAccessToken ? await getAccessToken() : null
  const headers = token ? {Authorization: `Bearer ${token}`} : {}
  if (modelKey) {
    // Encoded: a header value must be ISO-8859-1 and a model path need not
    // be (exportSlots.js#MODEL_KEY_HEADER).
    headers[MODEL_KEY_HEADER] = encodeURIComponent(modelKey)
  }
  const response = await fetch(`${PRO_MODULE_ENDPOINT}?name=${encodeURIComponent(name)}`, {headers})

  if (!response.ok) {
    const {detail, body} = await serverErrorDetail(response)
    if (response.status === HTTP_AUTHORIZATION_REQUIRED || response.status === HTTP_FORBIDDEN) {
      throw new ProModuleDeniedError(
        response.status, `Pro module "${name}" denied (${response.status}${detail})`,
        {reason: body?.error ?? null, modelSlots: body?.modelSlots ?? null})
    }
    throw new Error(`Pro module "${name}" failed to load (${response.status}${detail})`)
  }

  const slots = slotsFrom(response)
  const source = await response.text()
  const blobUrl = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}))
  try {
    return {namespace: await importModuleFromUrl(blobUrl), slots}
  } finally {
    // Revoke as soon as the import resolves: the module is compiled and the
    // URL is a live handle to the premium source for as long as it exists.
    URL.revokeObjectURL(blobUrl)
  }
}


/**
 * The slots a free-tier delivery reports, read off `pro-module`'s
 * `X-Bldrs-Model-Slots` header, or null for a Pro delivery (no header).
 *
 * A header that is present but unreadable still marks the delivery as free —
 * `{}` rather than null — because its presence, not its content, is what
 * says the module must not be memoised.
 *
 * @param {Response} response A 200 from `pro-module`
 * @return {?object}
 */
function slotsFrom(response) {
  const value = response.headers.get(MODEL_SLOTS_HEADER)
  if (value === null) {
    return null
  }
  try {
    return JSON.parse(value) || {}
  } catch {
    // The slot line just waits for record-export's figure instead.
    return {}
  }
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
