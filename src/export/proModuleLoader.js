import {HTTP_AUTHORIZATION_REQUIRED, HTTP_FORBIDDEN} from '../net/http'
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
 * Design: design/new/glb-export-premium.md §3, §4.1, §4.6.
 */


const PRO_MODULE_ENDPOINT = '/.netlify/functions/pro-module'

// name → in-flight or settled module namespace. Holding the PROMISE (not the
// namespace) is what makes concurrent callers share one fetch: two clicks
// before the first response still cost one request.
const loadedModules = new Map()


/** Thrown when the server refused to hand over the module. */
export class ProModuleDeniedError extends Error {
  /**
   * @param {number} status 401 (no/invalid token) or 403 (not subscribed)
   * @param {string} message
   */
  constructor(status, message) {
    super(message)
    this.name = 'ProModuleDeniedError'
    this.status = status
  }
}


/**
 * Fetch and import a pro module, memoised per page.
 *
 * @param {string} name Module id, e.g. 'glbExport'
 * @param {Function} [getAccessToken] Returns a Promise of an Auth0 access
 *   token. Omitted (or resolving to nothing) means an unauthenticated
 *   request, which the server answers with 401.
 * @return {Promise<object>} the module namespace
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
  // Only SUCCESS is permanently memoised.
  pending.catch(() => loadedModules.delete(name))
  loadedModules.set(name, pending)
  return pending
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
    if (response.status === HTTP_AUTHORIZATION_REQUIRED || response.status === HTTP_FORBIDDEN) {
      throw new ProModuleDeniedError(
        response.status, `Pro module "${name}" denied (${response.status})`)
    }
    throw new Error(`Pro module "${name}" failed to load (${response.status})`)
  }

  const source = await response.text()
  const blobUrl = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}))
  try {
    return await importModuleFromUrl(blobUrl)
  } finally {
    // Revoke as soon as the import resolves: the module is compiled and the
    // URL is a live handle to the premium source for as long as it exists.
    URL.revokeObjectURL(blobUrl)
  }
}
