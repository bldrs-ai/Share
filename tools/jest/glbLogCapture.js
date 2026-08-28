// Test capture for the `[glb]` pipeline logs.
//
// The GLB loader/writer emit `[glb]` milestone and error-path diagnostics
// through `src/loader/glbLog.js`; in the app those go to the console, but
// under jest we divert them into a buffer instead of printing. Tests that
// exercise an error path assert the diagnostic fired via `getGlbLogs()`
// (turning would-be console noise into positive coverage); everything else
// stays silent.
//
// Wired up globally in `setupTests.js` (install once, clear before each test).
// Import the getters directly in a spec to assert:
//
//   import {getGlbLogs} from '../../tools/jest/glbLogCapture'
//   expect(getGlbLogs().some((l) => l.text.includes('out-of-range'))).toBe(true)
import {setGlbLogSink} from '../../src/loader/glbLog'
import {createLogCapture} from './logCapture'


const capture = createLogCapture(setGlbLogSink)


/** Install the capturing sink. Idempotent; call once from global setup. */
export function installGlbLogCapture() {
  capture.install()
}


/** Drop everything captured so far (call before each test). */
export function clearGlbLogs() {
  capture.clear()
}


/**
 * @return {Array<{level: string, text: string}>} a copy of the captured
 *   `[glb]` log entries since the last clear.
 */
export function getGlbLogs() {
  return capture.get()
}
