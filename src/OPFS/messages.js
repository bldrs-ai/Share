/**
 * What the user is told when they try to open a file from their computer in
 * a browser without OPFS (Firefox private windows, some embeds).
 *
 * Uploads are stored in OPFS and loaded back out of it after
 * `navigateToModel`'s full page load, so without OPFS there is nowhere for
 * the file to survive that load. The blob-URL fallbacks that used to run here
 * could never open anything: the URL dies with the page that minted it. Until
 * the File is held in memory across an in-app navigation (#1906), say so
 * plainly instead of failing.
 *
 * Its own module, not `OPFS/utils.js` or `utils/loader.js`, because tests of
 * both call sites mock those wholesale.
 */
export const NO_OPFS_LOCAL_FILE_ALERT =
  'Opening a file from your computer needs browser storage, which isn\'t available here. ' +
  'Private browsing windows often turn it off. ' +
  'Try a regular window, or open the model from GitHub or Google Drive.'


/**
 * The alert to raise, as a typed object rather than the bare string, so
 * `AlertDialog` can give it its own header, leave off the "contact us"
 * footer (it is a known limit, not a defect), and count it in analytics
 * only: an expected environment condition doesn't belong in Sentry, the way
 * `unsupportedSchema` stays out of it. `AlertDialog` does the counting, so
 * callers must not `trackAlert` it themselves (that double-counted, #1905
 * review).
 *
 * @return {{type: string, message: string}}
 */
export function noOpfsLocalFileAlert() {
  return {type: 'noOpfs', message: NO_OPFS_LOCAL_FILE_ALERT}
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
 * Typed alert for {@link UploadNotInBrowserError}. Like `noOpfs`, it is an
 * expected outcome, not a defect: `AlertDialog` counts it in analytics only,
 * and `CadView` skips `captureException` for it.
 *
 * @return {{type: string, message: string}}
 */
export function uploadNotInBrowserAlert() {
  return {type: 'uploadNotInBrowser', message: UPLOAD_NOT_IN_BROWSER_ALERT}
}
