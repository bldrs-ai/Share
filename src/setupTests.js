// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Needed for async test
import 'regenerator-runtime/runtime'

// Disable debug logging
// eslint-disable-next-line import/newline-after-import
import {disableDebug} from './utils/debug'
disableDebug()

// Enable fetch() in test environment
require('isomorphic-fetch')

// Hook our mocked server (and its routes) into our environment
// eslint-disable-next-line import/newline-after-import
import {mockedServer} from './__mocks__/server'

// Establish API mocking before all tests.
beforeAll(() => mockedServer.listen())

// Reset any request handlers that we may add during the tests,
// so they don't affect other tests.
afterEach(() => mockedServer.resetHandlers())

// Clean up after the tests are finished.
afterAll(() => mockedServer.close())
