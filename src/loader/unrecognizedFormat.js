/**
 * The analytics label for every unrecognized-format alert, whichever way the
 * file arrived. A constant on purpose: the picker's alert text names the
 * user's file, and a file name must not reach GA.
 */
export const UNRECOGNIZED_FORMAT_ALERT_EVENT = 'Unrecognized model format'


/** Longest extension kept as a token; anything longer reads as `other`. */
const MAX_EXT_LENGTH = 12


/**
 * The alert for a file whose name and header between them name no format
 * `findLoader` knows, raised from both ways a user hands Share a local file:
 * drag-and-drop (`utils/dragAndDrop.js`) and the Open dialog's picker
 * (`utils/loader.js#loadLocalFile`).
 *
 * An object rather than the bare message string, so AlertDialog can tell it
 * apart from a defect. As a string it went through `trackAlert`, whose
 * fingerprint is the message text: the picker's text carries the file name,
 * so every rejected pick minted its own Sentry issue (95 of them, nearly all
 * one event, by 2026-11-01), and the family's volume was unreadable.
 * `message` is still what the dialog shows, unchanged; GA gets the constant
 * {@link UNRECOGNIZED_FORMAT_ALERT_EVENT} and {@link unrecognizedFormatGaParams}.
 *
 * @param {string} message The text the dialog shows
 * @param {string} fileName The user's file name, reduced here to an
 *   extension tag; the name itself is never kept on the alert
 * @param {'drop'|'picker'} entry Which way the file arrived
 * @return {{type: 'unrecognizedFormat', message: string, ext: string, entry: string}}
 */
export function unrecognizedFormatAlert(message, fileName, entry) {
  return {type: 'unrecognizedFormat', message, ext: uploadExtension(fileName), entry}
}


/**
 * The structured fields of one rejected file, as params on its GA `alert`
 * event (AlertDialog, with {@link UNRECOGNIZED_FORMAT_ALERT_EVENT} as the
 * message).
 *
 * Choosing a .rvt, .dwg or .zip is user input Share doesn't support yet, not
 * a code defect, so it is counted in GA only (AGENTS.md, "PRs: a Reported
 * Conditions section"). Until 2026-11 it was also an info-level Sentry
 * message (SHARE-1X5); the `upload_ext` distribution is the same ranking of
 * the formats worth adding that issue's `upload.ext` tag was.
 *
 * Both values are closed-ish tokens ({@link uploadExtension}, the `entry`
 * enum), never the file name.
 *
 * @param {{ext: string, entry: string}} alert From {@link unrecognizedFormatAlert}
 * @return {{upload_ext: string, upload_entry: string}}
 */
export function unrecognizedFormatGaParams(alert) {
  return {upload_ext: String(alert?.ext ?? 'none'), upload_entry: String(alert?.entry ?? 'unknown')}
}


/**
 * A file name's last extension, lowercased, safe to use as an analytics param.
 *
 * Only the extension: the name is the user's own text and stays out of
 * every analytics param (the console warnings that name it have it withheld
 * from Sentry's breadcrumbs; see `privacy/sentryRedaction.js`). A trailing
 * `.gz` is looked through, because the gzip envelope keeps the user's name
 * (`loader/gzipEnvelope.js`): `Tower.rvt.gz` is a rejected .rvt, and counting
 * it as `gz` would fold every compressed upload into one bucket. Bounded to a
 * short alphanumeric token so the param's value set stays a closed-ish list
 * of formats — `Tower_rev03.IFC.RVT` → `rvt`,
 * `model.ifc.log.html` → `html`; a name with no extension → `none`, and one
 * whose extension isn't a short ASCII token → `other`.
 *
 * @param {string} fileName
 * @return {string}
 */
export function uploadExtension(fileName) {
  const raw = String(fileName || '')
  // Strip the `.gz` only when another extension sits inside it, so a bare
  // `archive.gz` is still tagged `gz` rather than `none`.
  const name = /\.[^.]+\.gz$/i.test(raw) ? raw.slice(0, -'.gz'.length) : raw
  const dot = name.lastIndexOf('.')
  if (dot < 0 || dot === name.length - 1) {
    return 'none'
  }
  return extensionTag(name.slice(dot + 1))
}


/**
 * An extension as a closed-ish token: lowercased, and `other` unless it is a
 * short ASCII alphanumeric. The same rule for a file's own extension and for
 * the ones inside an archive (`modelArchive.js`), where the text after an
 * entry's last dot can be a name fragment (`Client.Acme Corp Tower`).
 *
 * @param {string} ext the text after the last dot, non-empty
 * @return {string}
 */
export function extensionTag(ext) {
  const lower = String(ext).toLowerCase()
  return /^[a-z0-9]+$/.test(lower) && lower.length <= MAX_EXT_LENGTH ? lower : 'other'
}
