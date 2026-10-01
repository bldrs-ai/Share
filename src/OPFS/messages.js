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
