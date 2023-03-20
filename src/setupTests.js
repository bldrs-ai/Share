// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'
// Needed for async test
import 'regenerator-runtime/runtime'
import {disableDebug} from './utils/debug'
import {server} from './__mocks__/server'


// TODO(pablo): this is somehow implicitly referenced in all tests,
// but wasn't included when we added it in #633.  This is a quick fixup.
// eslint-disable-next-line
import {Canvas} from 'canvas'


disableDebug()


// Establish API mocking before all tests.
beforeAll(() => server.listen())

// Reset any request handlers that we may add during the tests,
// so they don't affect other tests.
afterEach(() => server.resetHandlers())

// Clean up after the tests are finished.
afterAll(() => server.close())
