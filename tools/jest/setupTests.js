// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'
// Needed for async test
import 'regenerator-runtime/runtime'
import {disableDebug} from '../../src/utils/debug'
import {getAndExportEnvVars} from './vars.jest'


const {initServer} = require('../../src/__mocks__/server')


disableDebug()

const server = initServer(getAndExportEnvVars())

if (typeof global.Worker === 'undefined') {
  /**
   * A fake Worker implementation for testing purposes.
   *
   * This class simulates a Web Worker by recording calls to postMessage,
   * supporting termination, and allowing onmessage callbacks to be set.
   */
  class StubWorker {
    // eslint-disable-next-line no-useless-constructor, require-jsdoc, no-empty-function
    constructor() {}
    // eslint-disable-next-line no-empty-function, require-jsdoc
    postMessage() {}
    // eslint-disable-next-line no-empty-function, require-jsdoc
    terminate() {}
    // eslint-disable-next-line no-empty-function, require-jsdoc
    addEventListener() {}
    // eslint-disable-next-line no-empty-function, require-jsdoc
    removeEventListener() {}
  }
  global.Worker = StubWorker
}

if (!global.URL.createObjectURL) {
  global.URL.createObjectURL = () => 'blob:jest-mock'
}

// Establish API mocking before all tests.
beforeAll(() => {
  server.listen({
    onUnhandledRequest: 'error', // Warns about unhandled requests
  })
})

// Reset any request handlers that we may add during the tests,
// so they don't affect other tests.
afterEach(() => server.resetHandlers())

// Clean up after the tests are finished.
afterAll(() => server.close())

// Like cypress
global.context = describe
