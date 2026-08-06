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


const {initServer} = require('../../src/__mocks__/server')


disableDebug()

// Divert the GLB pipeline's `[glb]` diagnostics into a buffer so a test run
// leaves a quiet console; specs assert on them via getGlbLogs(). Cleared
// before each test in the beforeEach below.
installGlbLogCapture()

const server = initServer(getAndExportEnvVars())

// Establish API mocking before all tests.
beforeAll(() => {
  server.listen({
    onUnhandledRequest: 'error', // Warns about unhandled requests
  })
})

// Start each test with an empty `[glb]` capture buffer.
beforeEach(() => clearGlbLogs())

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
// jest.spyOn) so it survives module resets and outlives any per-test mock
// cleanup; the warning fires at three's import time, before a spec's own spies.
const realConsoleWarn = console.warn
console.warn = function threeDupFilteredWarn(...args) {
  if (typeof args[0] === 'string' && args[0].includes('Multiple instances of Three.js')) {
    return
  }
  return realConsoleWarn.apply(this, args)
}
