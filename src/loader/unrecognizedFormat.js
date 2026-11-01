import {captureMessage} from '@sentry/react'


/**
 * The analytics label for every unrecognized-format alert, whichever way the
 * file arrived. A constant on purpose: the picker's alert text names the
 * user's file, and a file name must not reach GA.
 */
export const UNRECOGNIZED_FORMAT_ALERT_EVENT = 'Unrecognized model format'


/** Longest extension kept as a tag; anything longer reads as `other`. */
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
 * `message` is still what the dialog shows, unchanged.
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
 * Count one rejected file in Sentry, as an `info` message rather than an
 * exception.
 *
 * Choosing a .rvt, .dwg or .zip is user input Share doesn't support yet, not
 * a code defect, so it must not count toward crash-free rates or read as a
 * bug in triage — the same call made for the unsupported IFC schema
 * (`loader/unsupportedSchema.js`) and the missing local upload
 * (`OPFS/reportUploadNotInBrowser.js`). It is still counted, because which
 * extensions users bring is a ranking of the formats worth adding: one issue
 * (the fingerprint), with the `upload.ext` tag's distribution as the ranking.
 *
 * @param {{ext: string, entry: string}} alert From {@link unrecognizedFormatAlert}
 */
export function reportUnrecognizedFormat(alert) {
  try {
    captureMessage('Unrecognized model format', {
      level: 'info',
      fingerprint: ['unrecognized-format'],
      tags: {'upload.ext': alert.ext, 'upload.entry': alert.entry},
    })
  } catch (_) {
    // Reporting is best-effort; the user already has the dialog.
  }
}


/**
 * A file name's last extension, lowercased, safe to use as a Sentry tag.
 *
 * Only the extension: the name is the user's own text and stays out of the
 * event's tags and grouping (the drop path's console warning still reaches
 * Sentry as a breadcrumb; see `utils/dragAndDrop.js`). A trailing `.gz` is
 * looked through, because the gzip envelope keeps the user's name
 * (`loader/gzipEnvelope.js`): `Tower.rvt.gz` is a rejected .rvt, and tagging
 * it `gz` would fold every compressed upload into one bucket. Bounded to a short alphanumeric token so the tag's value set stays
 * a closed-ish list of formats — `Tower_rev03.IFC.RVT` → `rvt`,
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
  const ext = name.slice(dot + 1).toLowerCase()
  return /^[a-z0-9]+$/.test(ext) && ext.length <= MAX_EXT_LENGTH ? ext : 'other'
}
