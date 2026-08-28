// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'
// Needed for async test
import 'regenerator-runtime/runtime'
import {disableDebug} from '../../src/utils/debug'
import {getAndExportEnvVars} from './vars.jest'
import {installGlbLogCapture, clearGlbLogs} from './glbLogCapture'
import {installConwayDirectLogCapture, clearConwayDirectLogs} from './conwayDirectLogCapture'


const {initServer} = require('../../src/__mocks__/server')


disableDebug()

// Divert the GLB pipeline's `[glb]` diagnostics and the Conway-direct IFC
// pipeline's `[conwayDirect]` diagnostics into buffers so a test run leaves a
// quiet console; specs assert on them via getGlbLogs() / getConwayDirectLogs().
// Cleared before each test in the beforeEach below.
installGlbLogCapture()
installConwayDirectLogCapture()

const server = initServer(getAndExportEnvVars())

// Establish API mocking before all tests.
beforeAll(() => {
  server.listen({
    onUnhandledRequest: 'error', // Warns about unhandled requests
  })
})

// Start each test with empty capture buffers.
beforeEach(() => {
  clearGlbLogs()
  clearConwayDirectLogs()
})

// Reset any request handlers that we may add during the tests,
// so they don't affect other tests.
afterEach(() => server.resetHandlers())

// Clean up after the tests are finished.
afterAll(() => server.close())

// Like cypress
global.context = describe

// Mock scrollIntoView for tests since it's not available in jsdom
// Only mock if we're in a DOM environment (not in Web Workers)
if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView = jest.fn()
}

// jsdom implements neither canvas method below: calling them routes through
// jsdom's "not implemented" path, which logs a noisy Error via its
// VirtualConsole (console.error) before returning a falsy value. App code that
// draws to a canvas (PerfMonitor's 2d overlay, screenshot capture) already
// treats a missing context / empty data URL as "headless — skip", so return
// those directly. Same runtime values the code already sees under jsdom, minus
// the per-call error spam in the test logs. A test that needs a real context
// still overrides these on its own canvas object (e.g. CustomPostProcessor).
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = jest.fn(() => null)
  // Return null (not ''), matching the value jsdom's un-implemented toDataURL
  // already yielded — snapshots recorded against a headless canvas (svg sprite
  // texture `url`) expect null, and callers treat a falsy data URL as "none".
  HTMLCanvasElement.prototype.toDataURL = jest.fn(() => null)
}

// three stamps window.__THREE__ on first import to detect genuinely duplicate
// copies, and warns "Multiple instances of Three.js being imported." when it's
// already set. Under jest that is a false positive: the viewer test harness
// resets the module registry and re-imports three (jest.mock / requireActual)
// within a file, and a worker reuses its jsdom window across files, so three
// re-initialises against an already-set flag even though there is a single
// real copy (no nested node_modules/three). Swallow only that one line — every
// other console.warn passes through untouched. Plain reassignment (not
// jest.spyOn) so it survives module resets and stays installed as the base
// console.warn for the whole worker (a spec's own jest.spyOn(console,'warn')
// wraps this, so it still only ever sees the filtered stream). Two honest
// limits: a spec that BOTH spies console.warn AND itself re-imports three
// mid-test could observe the warning before it reaches this filter (no such
// spec exists today); and the filter matches on message text, so it would
// also mute a genuine RUNTIME duplicate. The install-on-disk duplicate case —
// the one that actually ships — is caught instead by the static
// src/viewer/three/singleThreeInstance.test.js.
const realConsoleWarn = console.warn
console.warn = function threeDupFilteredWarn(...args) {
  if (typeof args[0] === 'string' && args[0].includes('Multiple instances of Three.js')) {
    return
  }
  return realConsoleWarn.apply(this, args)
}
