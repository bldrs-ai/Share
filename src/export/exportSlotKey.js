import {directLinkQuotaKey} from '../quota/useDirectLinkQuota'
import {localOnlyPath} from '../routes/localOnly'


/** The app prefix when the store has not been told one yet (BaseRoutes sets it). */
const DEFAULT_APP_PREFIX = '/share'


/**
 * The slot key an export of the loaded model is decided under: the string
 * `pro-module` checks against `app_metadata.usageQuota.loads` and
 * `record-export` records (src/export/exportSlots.js;
 * design/new/glb-export-premium.md §4.8).
 *
 * It MUST be the very string a private open of the same model is recorded
 * under, because the ledger dedupes by exact key: a private model opened from
 * the Open dialog already holds a slot, and its export must find it there
 * rather than take a second one. So each route reuses the key its open
 * already uses:
 *
 * - GitHub and Drive: `quota/useDirectLinkQuota.js#directLinkQuotaKey`, the
 *   key the direct-link meter and the Open dialog record (for GitHub
 *   `/share/v/gh/<org>/<repo>/<branch>/<file>`, for Drive
 *   `<appPrefix>/v/g/<fileId>`). The element path (`…/model.ifc/12/34`) is
 *   not part of it, so selecting an element doesn't make a new model.
 * - A local file: `<appPrefix>/v/local-only/<uuid>.<ext>`
 *   (`routes/localOnly.ts#localOnlyPath`), the key OpenModelDialog#openFile
 *   passes to record() and the one the `meterLocalFiles` switch would count.
 *   The uuid is per pick, so opening the same file from disk again is a new
 *   model; reopening it from Recents or reloading the page is not.
 * - A hosted file (`/v/p/`): `<appPrefix>/v/p/<file>`.
 * - A URL (`/v/u/`): `<appPrefix>/v/u/<url>`.
 *
 * @param {?object} modelPath The store's `modelPath` (routes.ts#handleRoute)
 * @param {?string} appPrefix The store's `appPrefix`, e.g. '/share'
 * @return {?string} null when nothing is loaded
 */
export function exportSlotKey(modelPath, appPrefix) {
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
    return `${prefix}/v/u/${String(modelPath.downloadUrl)}`
  }
  return null
}
