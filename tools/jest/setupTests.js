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
