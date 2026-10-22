/**
 * What the user is told when a `/v/new/<id>` URL names a file that was
 * opened in a browser without OPFS (Firefox private windows, some embeds),
 * and the page that opened it is gone: a reload, or the link opened anywhere
 * else (#1906).
 *
 * Without OPFS a local file is held only in the memory of the page that
 * opened it (`loader/inMemoryUploads.js`), so nothing can load it now.
 *
 * Its own module, not `OPFS/utils.js` or `utils/loader.js`, because tests of
 * the call sites mock those wholesale.
 */
export const IN_MEMORY_UPLOAD_GONE_ALERT =
  'This file was opened from your computer in a previous page and is no longer available. ' +
  'This browser has no storage for opened files, so they last only until the page is reloaded or closed. ' +
  'Open it again from your computer to view it.'


/**
 * Thrown by CadView for a `/v/new/` URL, in a browser without OPFS, whose
 * file this page doesn't hold (`hasInMemoryUpload`).
 */
export class InMemoryUploadGoneError extends Error {
  /** @param {string} storageId `<uuid>.<ext>` */
  constructor(storageId) {
    super(IN_MEMORY_UPLOAD_GONE_ALERT)
    this.name = 'InMemoryUploadGoneError'
    this.storageId = storageId
  }
}


/**
 * Typed alert for {@link InMemoryUploadGoneError}, as an object rather than
 * the bare string, so `AlertDialog` can give it its own header, leave off the
 * "contact us" footer (it is a known limit of browsers without OPFS, not a
 * defect), and count it in analytics only: an expected outcome doesn't belong
 * in Sentry, the way `unsupportedSchema` stays out of it. `AlertDialog` does
 * the counting, so callers must not `trackAlert` it themselves.
 *
 * @return {{type: string, message: string}}
 */
export function inMemoryUploadGoneAlert() {
  return {type: 'inMemoryUploadGone', message: IN_MEMORY_UPLOAD_GONE_ALERT}
}


/**
 * What the user is told when a `/v/new/<storageId>` URL names an upload that
 * isn't in this browser's OPFS (#1955).
 *
 * An upload's bytes live only in the OPFS of the browser profile that
 * dropped it, but its URL is portable: it gets pasted into chats (#705 —
 * Share still offers it for local files), opened on another device, or
 * outlives a storage clear. Sentry showed this as the top hard-failure
 * cause, with one storage id opened from up to 11 IPs. There is nothing to
 * fall back to, so the load can't succeed; the job here is to say why, in
 * the user's terms, instead of the worker's `Folder <id> not found` string.
 */
export const UPLOAD_NOT_IN_BROWSER_ALERT =
  'This model was opened from a file on someone\'s computer, and files opened that way are ' +
  'kept only in the browser that opened them. It isn\'t in this browser, so it can\'t be shown here. ' +
  'If it\'s your file, open it again from your computer. ' +
  'If someone sent you this link, ask them to share the model from GitHub or Google Drive instead.'


/**
 * Thrown by `Loader#load` when an upload's OPFS read failed AND a direct
 * probe (`doesUploadExistInOPFS`) says the entry is definitively absent.
 * Any other upload read failure keeps its original error, so real OPFS
 * defects still reach Sentry. Lives here rather than in `Loader.js` so
 * `CadView` can test for it without importing the loader.
 */
export class UploadNotInBrowserError extends Error {
  /** @param {string} storageId `<blob-uuid>.<ext>` */
  constructor(storageId) {
    super(UPLOAD_NOT_IN_BROWSER_ALERT)
    this.name = 'UploadNotInBrowserError'
    this.storageId = storageId
  }
}


/**
 * Typed alert for {@link UploadNotInBrowserError}. Like `inMemoryUploadGone`, it is an
 * expected outcome, not a defect: `AlertDialog` counts it in analytics only,
 * and `CadView` skips `captureException` for it.
 *
 * @return {{type: string, message: string}}
 */
export function uploadNotInBrowserAlert() {
  return {type: 'uploadNotInBrowser', message: UPLOAD_NOT_IN_BROWSER_ALERT}
}
