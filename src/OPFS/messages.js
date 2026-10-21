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
