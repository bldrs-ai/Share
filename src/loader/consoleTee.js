// The page's one console patch for load reports (open-t200 slice R,
// design/tracks/open-t200/layering.md §4.4).
//
// A load report counts the page's `console.warn` / `console.error` lines and
// the entries conway's static Logger logs during its load (the diagnostics
// block below Total, the data-defect join, the GA severity tally). Both are
// page-wide: there is one console and, on the main thread, one Logger. So
// there is one tee, and it routes to whichever reporter holds it: the
// foreground load's (loadProgress.js#LoadReporter, `isForeground`).
//
// Why one owner and not each reporter's own saved originals, as before
// slice R: a reporter saved `console.warn` when it began and wrote it back
// when it ended. That was safe only while the next load's begin disposed
// the previous reporter first. With a reporter per load, a left load that
// ends late (a mesh parse that cannot be stopped, a remount's unwinding
// view) would write back the console it saved and strip the next load's
// tee, and the next report's warnings line and diagnostics count would go
// missing with no error. Here the true originals are saved once, at the
// first take, and put back only when the reporter holding the tee gives it
// up; a reporter giving it up after another has taken it does nothing.
//
// Our own report lines use console.info, so they are not captured.

// Conway's static Logger, for the data-defect marker (conway#712) on the
// entries it logs (loadProgress.js#LoadReporter#recordLogEntry). This is the
// SAME module instance the engine logs through: `@bldrs-ai/conway/web-ifc`
// (ShareIfc's import) resolves to compiled/src/compat/web-ifc/index.js,
// whose ifc_api.js imports ../../logging/logger.js — the file this
// `./src/*` subpath resolves to — so esbuild bundles one Logger, not two.
import Logger from '@bldrs-ai/conway/src/logging/logger'


/**
 * The reporter the tee routes to, or null. Duck-typed: anything with
 * `captureConsole(args, level)` and `recordLogEntry(entry)`.
 */
let holder = null

// While the patch is on: the console methods it replaced and the Logger
// proxy it added. Null while it is off.
let installed = null


/**
 * Route the page's console and conway's Logger to `reporter` from now on.
 * Patches them if no reporter holds the tee; otherwise takes it over from
 * the one that does, which keeps its report but captures no more.
 *
 * @param {object} reporter `{captureConsole(args, level), recordLogEntry(entry)}`
 */
export function takeConsoleTee(reporter) {
  if (installed === null) {
    installed = install()
  }
  holder = reporter
}


/**
 * Give the tee up, if `reporter` still holds it: the console methods and
 * the Logger are put back as they were before the first take. A no-op for a
 * reporter another has since taken it from.
 *
 * @param {object} reporter
 */
export function releaseConsoleTee(reporter) {
  if (holder !== reporter || installed === null) {
    return
  }
  holder = null
  console.warn = installed.warn
  console.error = installed.error
  Logger.removeProxy(installed.proxy)
  installed = null
}


/** @return {object|null} the reporter holding the tee, for tests */
export function consoleTeeHolder() {
  return holder
}


/**
 * Patch console.warn / console.error and add the Logger proxy. Each patched
 * method captures first, then calls the method it replaced, so the real
 * console still prints every line.
 *
 * Why a Logger proxy, and not `Logger.getDataDefects()` when the load
 * reports: conway's `StreamAllMeshes` / `StreamAllMeshesAsync` end with
 * `Logger.clearLogs()`, so the buffer that call reads is already empty by
 * then, and a demand-geometry load keeps logging after that point into a
 * fresh buffer. A proxy is handed every entry synchronously as it is logged
 * (`Logger.log` echoes to the console sink first, then calls the proxies).
 *
 * @return {{warn: Function, error: Function, proxy: object}} what to put back
 */
function install() {
  const warn = console.warn
  const error = console.error
  console.warn = (...args) => {
    holder?.captureConsole(args, 'warning')
    warn.apply(console, args)
  }
  console.error = (...args) => {
    holder?.captureConsole(args, 'error')
    error.apply(console, args)
  }
  const proxy = {log: (entry) => holder?.recordLogEntry(entry)}
  Logger.addProxy(proxy)
  return {warn, error, proxy}
}
