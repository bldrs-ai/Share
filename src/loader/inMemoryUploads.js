import {v4 as uuidv4} from 'uuid'


/**
 * Local files opened in a browser without OPFS, held in memory for the life
 * of the page (#1906).
 *
 * With OPFS, a picked or dropped file is written there and the viewer loads
 * it back out after `navigateToModel`'s full page load. Without OPFS
 * (Firefox private windows, some embeds) there is nowhere for it to survive
 * that load: a blob URL ends with the page that minted it. So the `File`
 * stays here instead, the opener navigates in-app (`navigateToInMemoryModel`,
 * no page load), and `Loader#load` reads the bytes from here.
 *
 * Keys look like OPFS storage ids, `<uuid>.<ext>`, so the `/v/new/` route
 * parses them and `findLoader` picks the loader by extension, exactly as for
 * an OPFS upload. Entries are never removed while the page lives: keeping
 * them is what lets Back return to an earlier upload. A picked or dropped
 * `File` is a handle on the user's file rather than a copy of its bytes; only
 * an inflated `.glb.gz` is held as bytes. A reload starts with an empty registry,
 * which is how CadView knows such a URL can no longer load
 * (`InMemoryUploadGoneError`, `OPFS/messages.js`).
 */
const uploads = new Map()


/**
 * Hold `file` and return the id to navigate to.
 *
 * @param {File} file The picked or dropped file, already unwrapped from any
 *   gzip transport envelope (`loader/gzipEnvelope.js`)
 * @param {string} ext The extension the loader resolves it by, no dot, e.g.
 *   `ifc` — the same one an OPFS upload is stored under
 * @return {string} `<uuid>.<ext>`, the `/v/new/` path segment
 */
export function registerInMemoryUpload(file, ext) {
  // A v4 uuid, which `testUuid` (`Loader#load`'s upload test) accepts. The
  // `uuid` package rather than `crypto.randomUUID`, which only exists in
  // secure contexts (and not in jsdom).
  const storageId = `${uuidv4()}.${ext}`
  uploads.set(storageId, file)
  return storageId
}


/**
 * @param {string} storageId `<uuid>.<ext>`
 * @return {boolean} Whether this page holds that upload
 */
export function hasInMemoryUpload(storageId) {
  return uploads.has(storageId)
}


/**
 * @param {string} storageId `<uuid>.<ext>`
 * @return {File|undefined} The held file, or undefined if this page never
 *   registered `storageId`
 */
export function getInMemoryUpload(storageId) {
  return uploads.get(storageId)
}


/**
 * Drop a held file the opener decided not to open after all: the quota's
 * `record()` denied it after it was registered (codex review on #1957).
 * Nothing else removes entries, so without this a denied file would stay in
 * memory for the life of the page.
 *
 * @param {string} storageId `<uuid>.<ext>`
 */
export function forgetInMemoryUpload(storageId) {
  uploads.delete(storageId)
}


/**
 * Test-only: forget every held file, as a reload would.
 */
export function resetInMemoryUploadsForTest() {
  uploads.clear()
}
