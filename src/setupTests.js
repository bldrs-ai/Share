import React from 'react'
// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'
// Needed for async test
import 'regenerator-runtime/runtime'
import {disableDebug} from './utils/debug'


disableDebug()


// https://github.com/auth0/auth0-react/issues/248
jest.mock('@auth0/auth0-react', () => ({
  Auth0Provider: ({children}) => <>{children}</>,
}))

// jest.mock('env', () => ({
//   env: process.env,
// }))
