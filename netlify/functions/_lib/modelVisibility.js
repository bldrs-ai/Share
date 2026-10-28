/*
 * Which models count: the one classification `record-load` meters private
 * opens by and `pro-module` / `record-export` decide free exports by
 * (design/new/quotas.md §"What counts", design/new/glb-export-premium.md
 * §4.8). Moved here from record-load.js so the functions share it rather
 * than each keeping a copy.
 *
 * - GitHub (`/v/gh/`): looked up here, unauthenticated, against
 *   api.github.com — the server does not take the client's word for it. A
 *   200 is a public repo; a 404 (private or missing) or other 4xx counts; a
 *   403 (rate limit) or 5xx is "don't penalize the user" — not counted, and
 *   not cached, so the next call asks again.
 * - Drive (`/v/g/`): the server can't see a Drive file's sharing (that would
 *   need the user's Drive token), so it is the CLIENT's classification that
 *   decides (quota/driveVisibility.js): record-load counts every Drive key it
 *   is sent because the client sends only private ones; an export says so
 *   with the request (`drivePublic`). A known gap, documented in quotas.md
 *   §"Drive visibility".
 * - Local files (`/v/local-only/`, legacy `/v/new/`): counted by record-load
 *   only with the `meterLocalFiles` switch on. An EXPORT of one always takes
 *   a slot (owner decision 2026-10-27), which `isPublicModel` encodes.
 * - Everything else — hosted files (`/v/p/`, the deploy's own public
 *   samples), generic URLs (`/v/u/`) — is never counted.
 *
 * Module-scope cache of GitHub answers (per "owner/repo", 15-minute TTL), as
 * record-load always kept: it survives warm invocations of each function.
 */

import axios from 'axios'
import * as Sentry from '@sentry/serverless'
import {LOCAL_ROUTE_KINDS, isCountedByRouteKind} from '../../../src/quota/limits.js'


const HTTP_OK = 200
const HTTP_FORBIDDEN = 403
const HTTP_INTERNAL_SERVER_ERROR = 500

const SECONDS_PER_MIN = 60
const MILLIS_PER_SECOND = 1000
const GH_PRIVACY_CACHE_TTL_MIN = 15
const GH_PRIVACY_CACHE_TTL_MS = GH_PRIVACY_CACHE_TTL_MIN * SECONDS_PER_MIN * MILLIS_PER_SECOND

// "owner/repo" -> {private: bool, fetchedAt: ms}
const ghPrivacyCache = new Map()


/** Tests only: forget the cached GitHub answers. */
export function resetGhPrivacyCache() {
  ghPrivacyCache.clear()
}


/**
 * The view route's kind: the path segment after the FIRST `/v/` of a share
 * path, e.g. 'gh', 'g', 'local-only'. The same rule as
 * src/routes/localOnly.ts#viewRouteKind, which the function bundles can't
 * import. Only the first `/v/` is the route: a GitHub file path may itself
 * contain `v/local-only/` or `v/g/` (codex review on Share#1967).
 *
 * @param {string} key Share path
 * @return {?string}
 */
export function viewRouteKind(key) {
  const match = /\/v\/([^/?#]+)/.exec(key)
  return match ? match[1] : null
}


/**
 * Resolve whether a GitHub repo is private. Returns true (= counts) for
 * private/missing/4xx answers, false for public and for a rate limit, a 5xx
 * or a network failure. Cached for GH_PRIVACY_CACHE_TTL_MS, except the
 * don't-penalize answers.
 *
 * @param {string} owner
 * @param {string} repo
 * @return {Promise<boolean>}
 */
export async function isPrivateGhRepo(owner, repo) {
  const cacheKey = `${owner.toLowerCase()}/${repo.toLowerCase()}`
  const now = Date.now()
  const hit = ghPrivacyCache.get(cacheKey)
  if (hit && (now - hit.fetchedAt) < GH_PRIVACY_CACHE_TTL_MS) {
    return hit.private
  }
  try {
    const resp = await axios.get(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      {validateStatus: () => true},
    )
    let isPrivate
    if (resp.status === HTTP_OK) {
      isPrivate = false
    } else if (resp.status === HTTP_FORBIDDEN || resp.status >= HTTP_INTERNAL_SERVER_ERROR) {
      // Rate-limited (403) or any 5xx upstream hiccup — don't penalize the
      // user; treat as not counted (design/new/quotas.md §GitHub privacy
      // detection: "403 / 5xx → No"). Not cached, so the next call retries.
      Sentry.captureException(new Error(`GH repo lookup status=${resp.status} for ${cacheKey}`))
      return false
    } else {
      // 404 (private or missing) and other 4xx -> count it.
      isPrivate = true
    }
    ghPrivacyCache.set(cacheKey, {private: isPrivate, fetchedAt: now})
    return isPrivate
  } catch (err) {
    Sentry.captureException(err)
    return false
  }
}


/**
 * Whether record-load counts an open of `key`.
 *
 * @param {string} key Share path
 * @param {object} options
 * @param {boolean} options.meterLocalFiles Whether the local-file meter is on
 * @param {boolean} [options.drivePublic] The client found this Drive file
 *   public. record-load is never sent a public Drive key, so it leaves this
 *   unset; the export side passes what the client said.
 * @return {Promise<boolean>}
 */
export async function isQuotableModel(key, {meterLocalFiles, drivePublic = false}) {
  const kind = viewRouteKind(key)
  if (kind === 'g' && drivePublic === true) {
    return false
  }
  // Drive counts as sent; local files with the meter on. The one rule, shared
  // with the MSW mock and, for local files, src/quota/quota.js.
  if (isCountedByRouteKind(kind, meterLocalFiles)) {
    return true
  }
  // /v/gh/<owner>/<repo>/<branch>/<path>
  const ghMatch = kind === 'gh' && key.match(/\/v\/gh\/([^/]+)\/([^/]+)\//)
  if (ghMatch) {
    return await isPrivateGhRepo(decodeURIComponent(ghMatch[1]), decodeURIComponent(ghMatch[2]))
  }
  return false
}


/**
 * Whether a free user's export of `key` is of a PUBLIC model, which exports
 * unlimited and never takes a slot (owner decision on Share#1980): exactly
 * the models record-load would not count — public GitHub, a Drive file the
 * client found public, hosted samples, generic URLs — EXCEPT local files,
 * which take a slot on first export whatever the local-file meter says, so
 * GLB export does not become free by way of a file from disk.
 *
 * @param {string} key Share path (src/quota/modelSlotKey.js)
 * @param {object} [options]
 * @param {boolean} [options.drivePublic] what the client said about a Drive
 *   file's sharing; ignored for every other route
 * @return {Promise<boolean>}
 */
export async function isPublicModel(key, {drivePublic = false} = {}) {
  if (LOCAL_ROUTE_KINDS.includes(viewRouteKind(key))) {
    return false
  }
  return !(await isQuotableModel(key, {meterLocalFiles: false, drivePublic}))
}
