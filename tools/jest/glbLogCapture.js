// Test capture for the `[glb]` pipeline logs.
//
// A clean load — and a clean test run — should leave a quiet console
// (conway #301 §6). The GLB loader/writer emit `[glb]` milestone and
// error-path diagnostics through `src/loader/glbLog.js`; in the app those go
// to the console, but under jest we divert them into a buffer instead of
// printing. Tests that exercise an error path assert the diagnostic fired via
// `getGlbLogs()` (turning would-be console noise into positive coverage);
// everything else stays silent.
//
// Wired up globally in `setupTests.js` (install once, clear before each test).
// Import the getters directly in a spec to assert:
//
//   import {getGlbLogs} from '../../../tools/jest/glbLogCapture'
//   expect(getGlbLogs().some((l) => l.text.includes('out-of-range'))).toBe(true)
import {setGlbLogSink} from '../../src/loader/glbLog'


/** @type {Array<{level: string, text: string}>} */
const captured = []


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


/** Install the capturing sink. Idempotent; call once from global setup. */
export function installGlbLogCapture() {
  setGlbLogSink((level, args) => {
    captured.push({level, text: args.map(argToText).join(' ')})
  })
}


/** Drop everything captured so far (call before each test). */
export function clearGlbLogs() {
  captured.length = 0
}


/**
 * @return {Array<{level: string, text: string}>} a copy of the captured
 *   `[glb]` log entries since the last clear.
 */
export function getGlbLogs() {
  return captured.slice()
}
