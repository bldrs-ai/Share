import {supportedTypes} from '../Filetype'


/**
 * The help page the guidance below links into: a static marketing route
 * (`marketing/src/app/help/native-cad-files/page.tsx`), one section per
 * authoring tool, each with an `id` this module's anchors name. Root-relative
 * so it resolves on bldrs.ai and on every deploy preview, which both serve
 * the marketing build beside the SPA (marketing/README.md §Deploy).
 * Trailing slash because the marketing build is `trailingSlash: true`; the
 * slash-less form costs a redirect. `formatGuidance.test.js` checks each
 * anchor exists on that page.
 */
export const NATIVE_CAD_HELP_PATH = '/help/native-cad-files/'


/**
 * What to say about a file Share rejected, keyed by its extension.
 *
 * An unrecognized pick or drop used to get one generic sentence whatever it
 * was — "Cannot extract filetype from filename: Tower.rvt" — which tells a
 * Revit user nothing about what to do. The 2026-11-01 Sentry triage of 94
 * rejected uploads (bldrs-ai/ops#26) ranked what users actually bring:
 * archives first, then Revit (19), then non-models (9), AutoCAD (6),
 * SolidWorks (3) and CATIA (2). Each of those gets a header and a short
 * "what this is, what to do instead"; everything else keeps the generic
 * text (Share#2007).
 *
 * Decided by extension alone, because by the time this is asked the sniff
 * has already said "none of ours" (`Filetype.js#analyzeHeader`), and these
 * formats are proprietary binaries with no reader here to confirm them. The
 * key is `unrecognizedFormatAlert`'s `ext`, which already looks through a
 * trailing `.gz` (`uploadExtension`), so `Tower.rvt.gz` is guided as Revit.
 *
 * This is the one place the text lives: AlertDialog renders whatever entry
 * the alert's `ext` names. To guide another format, add an entry to
 * `GUIDANCE_BY_EXT` below; to reuse an existing text for a new extension,
 * map it to the same object (as `rar` and `7z` share `ARCHIVE`).
 *
 * @typedef {object} FormatGuidance
 * @property {string} header Dialog header, in place of the generic "Error"
 * @property {Array<string>} lines Body paragraphs, in order: what the file
 *   is, then what to do instead
 * @property {{href: string, label: string}} [help] A link to more detail
 */


/** @type {FormatGuidance} */
export const REVIT = Object.freeze({
  header: 'Revit file',
  lines: Object.freeze([
    'This is a native Revit file. Share can\'t open Revit files directly.',
    'In Revit, use File → Export → IFC, then open the .ifc here.',
    // Revit can write a .txt beside the .ifc it exports, and users open that
    // instead (Share#1087); the `txt` entry below says the same from the
    // other side.
    'Revit may also write a .txt file next to the export: open the .ifc, not the .txt.',
  ]),
  help: Object.freeze({href: `${NATIVE_CAD_HELP_PATH}#revit`, label: 'How to export IFC from Revit'}),
})


/** @type {FormatGuidance} */
export const AUTOCAD = Object.freeze({
  header: 'AutoCAD file',
  lines: Object.freeze([
    'This is an AutoCAD drawing. Share opens 3D models and can\'t read AutoCAD files.',
    'If it came from a 3D model, export IFC or STEP from the program that made it, then open that here.',
  ]),
  help: Object.freeze({href: `${NATIVE_CAD_HELP_PATH}#autocad`, label: 'More on AutoCAD files'}),
})


/** @type {FormatGuidance} */
export const SOLIDWORKS = Object.freeze({
  header: 'SolidWorks file',
  lines: Object.freeze([
    'This is a native SolidWorks file. Share can\'t open SolidWorks files directly.',
    'In SolidWorks, use File → Save As and choose STEP AP214, then open the .step here.',
  ]),
  help: Object.freeze({href: `${NATIVE_CAD_HELP_PATH}#solidworks`, label: 'How to export STEP from SolidWorks'}),
})


/**
 * "Looks like", unlike the others: `.model` is CATIA V4's extension and the
 * one in the triage sample, but the name is generic enough that some other
 * program's `.model` will land here too.
 *
 * @type {FormatGuidance}
 */
export const CATIA = Object.freeze({
  header: 'CATIA file',
  lines: Object.freeze([
    'This looks like a native CATIA file. Share can\'t open CATIA files directly.',
    'In CATIA, use File → Save As and choose STEP, then open the .stp here.',
  ]),
  help: Object.freeze({href: `${NATIVE_CAD_HELP_PATH}#catia`, label: 'How to export STEP from CATIA'}),
})


/**
 * Every extension `findLoader` routes, from the same list it is built on, so
 * the claim can't fall behind a newly added format.
 */
const SUPPORTED_LIST = supportedTypes.map((t) => `.${t}`).join(', ')


/** @type {FormatGuidance} */
export const NOT_A_MODEL = Object.freeze({
  header: 'Not a 3D model',
  lines: Object.freeze([
    'This doesn\'t look like a 3D model.',
    `Share opens ${SUPPORTED_LIST}.`,
  ]),
  help: Object.freeze({href: `${NATIVE_CAD_HELP_PATH}#supported-formats`, label: 'Supported formats'}),
})


/**
 * A `.txt` reaches the unrecognized path whenever its first KiB sniffs as
 * none of the text formats `analyzeHeaderStr` knows (OBJ, XYZ, PDB, ASCII
 * STL, ...); most text does. Share#1087 is the Revit export's `.txt` sibling
 * opened in place of the `.ifc`, so that is the one case named.
 *
 * @type {FormatGuidance}
 */
export const TEXT_FILE = Object.freeze({
  header: 'Text file',
  lines: Object.freeze([
    'This is a text file, not a 3D model.',
    'If Revit wrote it next to an IFC export, open the .ifc file beside it instead.',
  ]),
  help: REVIT.help,
})


/**
 * Archives Share can't look inside. `.zip` is not here: opening a model
 * inside a zip is Share#2006's to decide, and until then a zip that isn't a
 * USDZ or SOG package gets the generic text.
 *
 * @type {FormatGuidance}
 */
export const ARCHIVE = Object.freeze({
  header: 'Compressed archive',
  lines: Object.freeze([
    'This is a compressed archive. Share can\'t open files inside it.',
    'Unpack it first, then open the model file from inside it.',
  ]),
})


/**
 * A Map, not an object literal: the key is derived from the user's file
 * name, and `uploadExtension('a.constructor')` is `constructor`, which a
 * plain object would answer with `Object.prototype.constructor`.
 *
 * @type {Map<string, FormatGuidance>}
 */
const GUIDANCE_BY_EXT = new Map([
  ['rvt', REVIT], ['rfa', REVIT], ['rte', REVIT],
  ['dwg', AUTOCAD], ['dwf', AUTOCAD], ['dwfx', AUTOCAD],
  ['sldprt', SOLIDWORKS], ['sldasm', SOLIDWORKS],
  ['catpart', CATIA], ['catproduct', CATIA], ['model', CATIA],
  ['png', NOT_A_MODEL], ['jpg', NOT_A_MODEL], ['jpeg', NOT_A_MODEL], ['gif', NOT_A_MODEL],
  ['pdf', NOT_A_MODEL], ['doc', NOT_A_MODEL], ['docx', NOT_A_MODEL],
  ['html', NOT_A_MODEL], ['htm', NOT_A_MODEL],
  ['txt', TEXT_FILE],
  ['rar', ARCHIVE], ['7z', ARCHIVE],
])


/**
 * The guidance for a rejected file's extension, or null for the generic
 * message.
 *
 * @param {string} ext An `unrecognizedFormatAlert`'s `ext`: lowercased,
 *   `.gz` looked through, or `none` / `other`
 * @return {FormatGuidance|null}
 */
export function formatGuidance(ext) {
  return GUIDANCE_BY_EXT.get(ext) ?? null
}


/**
 * Every extension that has guidance, for tests and for a caller that needs
 * the list (e.g. to check none of them is a format Share now opens).
 *
 * @return {Array<string>}
 */
export function guidedExtensions() {
  return [...GUIDANCE_BY_EXT.keys()]
}
