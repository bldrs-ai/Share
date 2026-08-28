// Test capture for the `[conwayDirect]` IFC pipeline logs.
//
// `ShareIfcLoader#parse` emits a per-load parse summary and, on failure, the
// error — both by design (see `src/viewer/ifc/conwayDirectLog.js`). In the
// app they reach the console; under jest they land in this buffer instead, so
// `Loader.test.js` asserts the summary's element counts and `Loader.cover.test.js`
// asserts each induced failure, rather than either scrolling past.
//
// Wired up globally in `setupTests.js` (install once, clear before each test).
// Import the getter directly in a spec to assert:
//
//   import {getConwayDirectLogs} from '../../tools/jest/conwayDirectLogCapture'
//   expect(getConwayDirectLogs().map((l) => l.text)).toContain('parsed modelID=0 …')
import {setConwayDirectLogSink} from '../../src/viewer/ifc/conwayDirectLog'
import {createLogCapture} from './logCapture'


const capture = createLogCapture(setConwayDirectLogSink)


/** Install the capturing sink. Idempotent; call once from global setup. */
export function installConwayDirectLogCapture() {
  capture.install()
}


/** Drop everything captured so far (call before each test). */
export function clearConwayDirectLogs() {
  capture.clear()
}


/**
 * @return {Array<{level: string, text: string}>} a copy of the captured
 *   `[conwayDirect]` log entries since the last clear.
 */
export function getConwayDirectLogs() {
  return capture.get()
}
