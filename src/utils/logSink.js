// Swappable console channels for subsystems that log by design.
//
// PLAYBOOK.md §"Keep the test console clean" (move 2): code that is
// *supposed* to log — the `[glb]` pipeline's milestones, the
// `[conwayDirect]` parse boundary — should neither spam the test console nor
// be silently swallowed. Each such subsystem owns a channel built here: in
// the app it writes to the console under its prefix; under jest the harness
// swaps in a capturing sink (`tools/jest/logCapture.js`) and specs assert on
// the buffered values, so the diagnostic becomes a tested signal instead of
// noise.
//
// Consumers: `src/loader/glbLog.js` (`[glb]`),
// `src/viewer/ifc/conwayDirectLog.js` (`[conwayDirect]`).


/**
 * @typedef {function(string, Array<*>): void} LogSink Receives (level, args),
 *   where `level` is a console method name ('info' | 'warn' | 'error').
 */


/**
 * Build a prefixed log channel whose sink can be swapped at runtime.
 *
 * The active sink lives on `globalThis` under `sinkKey`, not in a module
 * variable, so it survives `jest.resetModules()`: a harness that resets the
 * registry and re-imports the channel's module (e.g. GlbWriterService.test.js)
 * still shares the one sink the test setup installed — module state resets,
 * globals don't. A module-local sink would spring back to the console on
 * re-import, letting that path's lines both escape the capture buffer AND
 * print. Unset (i.e. in production) ⇒ the console sink.
 *
 * @param {string} prefix Tag prepended to every console line, e.g. '[glb]'.
 *   Passed as its own console arg, so a browser's `msg.text()` still reads
 *   `<prefix> <message>` — E2E specs grep for that joined form.
 * @param {string} sinkKey `globalThis` property holding the active sink. Must
 *   be unique per channel.
 * @return {{emit: function(string, Array<*>): void, setSink: function(?LogSink): void}}
 */
export function createLogChannel(prefix, sinkKey) {
  /**
   * @param {string} level
   * @param {Array<*>} args
   */
  function consoleSink(level, args) {
    // eslint-disable-next-line no-console
    console[level](prefix, ...args)
  }


  /**
   * @param {string} level
   * @param {Array<*>} args
   */
  function emit(level, args) {
    const sink = (typeof globalThis !== 'undefined' && globalThis[sinkKey]) || consoleSink
    sink(level, args)
  }


  /**
   * Passing null/undefined restores the console sink.
   *
   * @param {?LogSink} fn
   */
  function setSink(fn) {
    if (typeof globalThis !== 'undefined') {
      globalThis[sinkKey] = fn ?? undefined
    }
  }

  return {emit, setSink}
}
