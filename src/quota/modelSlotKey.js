import {localOnlyPath} from '../routes/localOnly'
import {directLinkQuotaKey} from './useDirectLinkQuota'


/** The app prefix when the store has not been told one yet (BaseRoutes sets it). */
const DEFAULT_APP_PREFIX = '/share'

const HEX_RADIX = 16

/** Marks a `/v/u/` key as a digest, not a URL. */
const URL_DIGEST_PREFIX = 'sha256-'


/**
 * The model-slot key of a loaded model: the string a model holds a slot under
 * in `app_metadata.usageQuota.loads`. THE ONE function that builds it for an
 * export (`pro-module` checks it, `record-export` records it;
 * src/export/exportSlots.js, design/new/glb-export-premium.md §4.8).
 *
 * It MUST be the very string an open of the same model is recorded under,
 * because the ledger dedupes by exact key: a private model opened from the
 * Open dialog or a direct link already holds a slot, and its export must find
 * it rather than take a second one. So each route reuses its open's key:
 *
 * - GitHub and Drive: `useDirectLinkQuota.js#directLinkQuotaKey`, the key the
 *   direct-link meter and the Open dialog record (for GitHub
 *   `/share/v/gh/<org>/<repo>/<branch>/<file>`, for Drive
 *   `<appPrefix>/v/g/<fileId>`). The element path (`…/model.ifc/12/34`) is
 *   not part of it, so selecting an element doesn't make a new model.
 * - A local file: `<appPrefix>/v/local-only/<uuid>.<ext>`
 *   (`routes/localOnly.ts#localOnlyPath`), the key OpenModelDialog#openFile
 *   passes to record() and the one the `meterLocalFiles` switch would count.
 *   The uuid is per pick, so opening the same file from disk again is a new
 *   model; reopening it from Recents or reloading the page is not.
 * - A hosted file (`/v/p/`): `<appPrefix>/v/p/<file>`.
 * - A URL (`/v/u/`): `urlModelKey`, a digest of the URL — never the URL
 *   itself (below). No open records a `/v/u/` key today (record-load never
 *   counts the `u` route), so the export is the only writer of one.
 *
 * Async because the URL digest is (SubtleCrypto); every other route resolves
 * at once.
 *
 * @param {?object} modelPath The store's `modelPath` (routes.ts#handleRoute)
 * @param {?string} appPrefix The store's `appPrefix`, e.g. '/share'
 * @param {object} [subtle] SubtleCrypto — injectable for tests
 * @return {Promise<?string>} null when nothing is loaded
 */
export async function modelSlotKey(modelPath, appPrefix, subtle = globalThis.crypto?.subtle) {
  if (!modelPath) {
    return null
  }
  const prefix = appPrefix || DEFAULT_APP_PREFIX
  const providerKey = directLinkQuotaKey(modelPath, prefix)
  if (providerKey !== null) {
    return providerKey.key
  }
  if (modelPath.kind === 'file' && modelPath.filepath) {
    return modelPath.isUploadedFile ?
      localOnlyPath(prefix, modelPath.filepath) :
      `${prefix}/v/p/${modelPath.filepath}`
  }
  if (modelPath.kind === 'url' && modelPath.downloadUrl) {
    return await urlModelKey(modelPath.downloadUrl, prefix, subtle)
  }
  return null
}


/**
 * The slot key of a model opened from a URL (`/v/u/`):
 * `<appPrefix>/v/u/sha256-<64 hex>`, the SHA-256 of the normalized URL.
 *
 * Never the URL itself, for two reasons (codex review on Share#1980): a
 * presigned URL runs to thousands of characters, past the 1 KB the server
 * accepts as a key (`exportSlots.js#MODEL_KEY_MAX_LENGTH`), so every export
 * of one failed; and its query string is a CREDENTIAL (`X-Amz-Signature`,
 * `sig`, `token`, …), which must not be written into Auth0 `app_metadata`,
 * sent in a header, or stored in export history. A digest is fixed-length,
 * reveals neither, and still names one URL.
 *
 * Normalized as `new URL()` serializes it (lower-cased scheme and host,
 * default port dropped, path dot-segments resolved) with the fragment
 * dropped, since a fragment never reaches the server. The query is KEPT: it
 * can be what tells two files apart (`download?id=…`), and folding it away
 * would let one slot cover every file a service serves through one path.
 * The cost is that a re-signed link to the same object is a new model.
 *
 * SubtleCrypto exists only in a secure context, which export needs anyway:
 * the artifact it exports lives in OPFS, which is secure-context only too.
 *
 * @param {string|URL} url The model's download URL
 * @param {string} appPrefix e.g. '/share'
 * @param {object} [subtle] SubtleCrypto — injectable for tests
 * @return {Promise<string>}
 * @throws {Error} when SubtleCrypto is unavailable
 */
export async function urlModelKey(url, appPrefix, subtle = globalThis.crypto?.subtle) {
  if (!subtle || typeof subtle.digest !== 'function') {
    throw new Error('modelSlotKey: SubtleCrypto is unavailable, so a URL model has no slot key')
  }
  const normalized = new URL(String(url))
  normalized.hash = ''
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(normalized.href))
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(HEX_RADIX).padStart(2, '0')).join('')
  return `${appPrefix}/v/u/${URL_DIGEST_PREFIX}${hex}`
}
