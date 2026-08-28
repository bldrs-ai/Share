// Test-side half of `src/utils/logSink.js`.
//
// A clean load — and a clean test run — should leave a quiet console
// (conway #301 §6). Subsystems that log by design emit through a swappable
// channel; under jest we install a capturing sink per channel so the lines
// land in a buffer instead of printing, and specs assert the ones they
// expect (turning would-be console noise into positive coverage).
//
// One capture per channel: `glbLogCapture.js`, `conwayDirectLogCapture.js`.


/**
 * Stringify one sink arg for buffer matching. Errors keep their message;
 * objects fall back to a safe tag rather than throwing on a cyclic value.
 *
 * @param {*} arg
 * @return {string}
 */
function argToText(arg) {
  if (arg instanceof Error) {
    return arg.message
  }
  if (arg === null || arg === undefined || typeof arg !== 'object') {
    return String(arg)
  }
  try {
    return JSON.stringify(arg)
  } catch {
    return '[object]'
  }
}


/**
 * Build the install/clear/get trio for one log channel.
 *
 * @param {function(?function(string, Array<*>): void): void} setSink The
 *   channel's sink setter, e.g. `setGlbLogSink`.
 * @return {{install: function(): void, clear: function(): void,
 *   get: function(): Array<{level: string, text: string}>}}
 */
export function createLogCapture(setSink) {
  /** @type {Array<{level: string, text: string}>} */
  const captured = []

  return {
    install: () => setSink((level, args) => {
      captured.push({level, text: args.map(argToText).join(' ')})
    }),
    clear: () => {
      captured.length = 0
    },
    get: () => captured.slice(),
  }
}
