/**
 * What Share withholds from Sentry that the browser console still shows.
 *
 * Two console lines name the user's file, and Sentry's default breadcrumbs
 * integration records console output, so every event captured after one of
 * them carried it as a breadcrumb:
 *
 * - The load report's model line, `Model: <header FILE_NAME> — <schema>,
 *   <size>, <originating system> (<preprocessor>)`, written by conway's
 *   formatModelLine and echoed by `loader/loadProgress.js#addReportLine`. The
 *   header text is whatever the exporter wrote, and has included a full UNC
 *   path to a company file share (SHARE-1MT, 2026-11-03).
 * - The drop path's `handleFileDrop: "<name>" (<n> bytes) is not a recognized
 *   model format` (`utils/dragAndDrop.js`, test-models#69).
 *
 * Both stay on the console, where the user reads their own file's details;
 * only the breadcrumb is rewritten. The load report's Sentry context has its
 * own copy for the same reason (LoadProgressReporter#sentryModelLine).
 */


/**
 * How a model line starts wherever Sentry sees it, in place of
 * `Model: <header FILE_NAME>`.
 */
export const SENTRY_MODEL_LINE_PREFIX = 'Model: (name withheld)'


const MODEL_LINE = /^Model: /
const DROP_WARNING = /^handleFileDrop: "/
// Greedy on the name so a `"` inside it can't end the match early; the
// tail is the fixed text dragAndDrop writes after the name.
const DROP_WARNING_TAIL = /" (\(\d+ bytes\) is not a recognized model format)$/s
const DROP_PREFIX = 'handleFileDrop: (file name withheld)'


/**
 * Sentry `beforeBreadcrumb`: rewrite a console breadcrumb that names the
 * user's file, and pass every other breadcrumb through unchanged.
 *
 * The console integration keeps the call's raw arguments in
 * `data.arguments` beside the joined `message`, so both are replaced; a
 * rewritten one keeps only the redacted message.
 *
 * @param {object} breadcrumb
 * @return {object} the breadcrumb to record
 */
export function redactBreadcrumb(breadcrumb) {
  if (breadcrumb?.category !== 'console' || typeof breadcrumb.message !== 'string') {
    return breadcrumb
  }
  const redacted = redactConsoleMessage(breadcrumb.message)
  if (redacted === breadcrumb.message) {
    return breadcrumb
  }
  return {...breadcrumb, message: redacted, data: {...breadcrumb.data, arguments: [redacted]}}
}


/**
 * @param {string} message a console breadcrumb's joined message
 * @return {string} the message with any file name withheld, or unchanged
 */
function redactConsoleMessage(message) {
  if (MODEL_LINE.test(message)) {
    // Nothing on the line is safe to keep without re-deriving it, and the
    // report context already carries the safe fields; the prefix alone says
    // where in the load this breadcrumb fell.
    return SENTRY_MODEL_LINE_PREFIX
  }
  if (DROP_WARNING.test(message)) {
    const tail = DROP_WARNING_TAIL.exec(message)
    return tail ? `${DROP_PREFIX} ${tail[1]}` : DROP_PREFIX
  }
  return message
}
