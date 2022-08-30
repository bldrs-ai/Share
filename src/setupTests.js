// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Needed for async test
import 'regenerator-runtime/runtime'

import {disableDebug} from './utils/debug'


disableDebug()


// TODO(pablo): This mock suppresses "WARNING: Multiple instances of
// Three.js being imported", but why is it being included if
// web-ifc-viewer is being mocked?
jest.mock('three')
