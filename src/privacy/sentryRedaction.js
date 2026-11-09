/**
 * What Share withholds from Sentry that the browser console still shows.
 *
 * Sentry's default breadcrumbs integration records console output and the
 * attributes of clicked elements, so text that names the user's file reached
 * every event captured after it:
 *
 * - The load report's model line, `Model: <header FILE_NAME> — <schema>,
 *   <size>, <originating system> (<preprocessor>)`, written by conway's
 *   formatModelLine and echoed by `loader/loadProgress.js#addReportLine`. The
 *   header text is whatever the exporter wrote, and has included a full UNC
 *   path to a company file share (SHARE-1MT, 2026-11-03).
 * - Console lines that name a file the user handed Share, such as the drop
 *   path's rejected-upload warning (`utils/dragAndDrop.js`, test-models#69)
 *   and the no-model-in-archive warning (`loader/modelArchive.js`). They name
 *   it through {@link consoleFileName}, and every console line of that shape
 *   has the quoted name withheld here, so a new producer that follows the
 *   convention is covered without a pattern of its own.
 * - Click breadcrumbs, whose element path carries `title`, `aria-label`,
 *   `alt` and `name` values. Share puts file names in some of them (the
 *   recent-files list's `title`, the projects drawer's remove button).
 *
 * - OPFS worker error replies, logged by `OPFS/utils.js` as `Error from worker`
 *   lines, and the loader's "OPFS path failed" fallback warning. The worker's
 *   text interpolates the cache key, the original file path or the file name
 *   (Share#2107). Sentry keeps the line's structured `condition`/`status`
 *   (see {@link workerErrorLabel}) and loses the text.
 *
 * The console and the page keep all of it, since there the user is reading
 * their own file's details; only what Sentry records is rewritten. The load
 * report's Sentry context has its own copy for the same reason
 * (LoadProgressReporter#sentryModelLine), and the load reporter's console tee
 * runs teed text through {@link redactConsoleMessage}.
 */


/**
 * How a model line starts wherever Sentry sees it, in place of
 * `Model: <header FILE_NAME>`.
 */
export const SENTRY_MODEL_LINE_PREFIX = 'Model: (name withheld)'

const WITHHELD_NAME = 'file (name withheld)'
const WITHHELD_VALUE = '(withheld)'
// Past this, a click breadcrumb's element path is withheld whole rather than
// scanned: the attribute pattern below is quadratic on a pathological run of
// unclosed `[title="`, and no real element path of Share's gets near it.
const MAX_ELEMENT_PATH_CHARS = 4096

const MODEL_LINE = /^Model: /
// `<prefix>: file "<name>"<rest>`, as consoleFileName writes it, where the
// prefix is a code identifier such as `handleFileDrop` or `modelArchive`. The
// `file ` marker keeps ordinary library warnings out (three.js writes
// `THREE.Sprite: "Raycaster.camera" needs to be set`). Greedy on the name, so
// a quote inside it can't end the match early: at worst a quote in <rest>
// withholds some of <rest> too, which over-redacts rather than leaks.
const QUOTED_FILE_NAME = /^([A-Za-z_$][\w$.#-]*): file "(.*)"(.*)$/s
// Sentry serializes a clicked element and its ancestors as CSS-like text,
// `p.MuiTypography-root[title="Tower.ifc"]`, without escaping quotes in the
// value; the lazy match up to `"]` takes a value with quotes in it whole,
// and `s` takes one with a newline in it.
// `Error from worker[ [condition=<c> status=<n>]]: <text>`, the shape
// workerErrorLabel writes. The bracket is built only from the worker's own
// condition constants and an HTTP status, so it is safe to keep.
const WORKER_ERROR_LINE = /^(Error from worker(?: \[condition=[\w-]+(?: status=\d+)?\])?):/
const OPFS_FALLBACK_LINE = /^Loader#load: OPFS path failed \(/
const OPFS_FALLBACK_REDACTED = 'Loader#load: OPFS path failed (details withheld); falling back to direct fetch.'
const NAMED_ATTRIBUTE = /\[(title|aria-label|alt|name)=".*?"\]/gs


/**
 * How a console line names a file the user handed Share, so that
 * {@link redactConsoleMessage} can withhold it from Sentry. Write the line as
 * `` `<prefix>: ${consoleFileName(name)} <rest>` ``.
 *
 * @param {string} name the user's file name
 * @return {string} `file "<name>"`
 */
export function consoleFileName(name) {
  return `file "${name}"`
}


/**
 * The label of a console line that logs an OPFS worker error reply, so that
 * {@link redactConsoleMessage} can keep the reply's structured fields and
 * withhold its text. Write the line as `console.error(workerErrorLabel(data), data.error)`.
 *
 * @param {object} data the worker's reply, with its optional `condition` and `status`
 * @return {string} the label: with the condition and status when the reply has
 *   them, else just `Error from worker:`
 */
export function workerErrorLabel(data) {
  // Only a plain condition identifier and a numeric status are echoed, so a
  // producer that put free text in `condition` can't smuggle it into the
  // label (and past the redaction's own pattern).
  const condition = typeof data?.condition === 'string' && /^[\w-]+$/.test(data.condition) ? data.condition : ''
  if (!condition) {
    return 'Error from worker:'
  }
  const status = Number.isInteger(data.status) ? ` status=${data.status}` : ''
  return `Error from worker [condition=${condition}${status}]:`
}


/**
 * Sentry `beforeBreadcrumb`: rewrite a console or click breadcrumb that names
 * the user's file, and pass every other breadcrumb through unchanged.
 *
 * The console integration keeps the call's raw arguments in
 * `data.arguments` beside the joined `message`, so a rewritten console
 * breadcrumb gets both replaced and keeps only the redacted message.
 *
 * @param {object} breadcrumb
 * @return {object} the breadcrumb to record
 */
export function redactBreadcrumb(breadcrumb) {
  if (typeof breadcrumb?.message !== 'string') {
    return breadcrumb
  }
  if (breadcrumb.category === 'console') {
    const redacted = redactConsoleMessage(breadcrumb.message)
    if (redacted === breadcrumb.message) {
      return breadcrumb
    }
    return {...breadcrumb, message: redacted, data: {...breadcrumb.data, arguments: [redacted]}}
  }
  if (typeof breadcrumb.category === 'string' && breadcrumb.category.startsWith('ui.')) {
    const redacted = breadcrumb.message.length > MAX_ELEMENT_PATH_CHARS ?
      WITHHELD_VALUE :
      breadcrumb.message.replace(NAMED_ATTRIBUTE, `[$1="${WITHHELD_VALUE}"]`)
    return redacted === breadcrumb.message ? breadcrumb : {...breadcrumb, message: redacted}
  }
  return breadcrumb
}


/**
 * One console line as Sentry may see it: a model line reduced to its prefix,
 * a quoted file name withheld, anything else unchanged.
 *
 * @param {string} message a console line, or a breadcrumb's joined message
 * @return {string} the message with any file name withheld, or unchanged
 */
export function redactConsoleMessage(message) {
  if (MODEL_LINE.test(message)) {
    // Nothing on the line is safe to keep without re-deriving it, and the
    // report context already carries the safe fields; the prefix alone says
    // where in the load this breadcrumb fell.
    return SENTRY_MODEL_LINE_PREFIX
  }
  const worker = WORKER_ERROR_LINE.exec(message)
  if (worker) {
    return `${worker[1]}: (details withheld)`
  }
  if (OPFS_FALLBACK_LINE.test(message)) {
    return OPFS_FALLBACK_REDACTED
  }
  const quoted = QUOTED_FILE_NAME.exec(message)
  if (quoted) {
    return `${quoted[1]}: ${WITHHELD_NAME}${quoted[3]}`
  }
  return message
}
