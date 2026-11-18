import {isWebGLUnavailableError} from './webglUnavailable'


describe('viewer/webglUnavailable', () => {
  // The three messages three r187's WebGLRenderer constructor throws when it
  // has no usable context (SHARE-1DZ is the first).
  it.each([
    'THREE.WebGLRenderer: Error creating WebGL context.',
    'THREE.WebGLRenderer: Error creating WebGL context with your selected attributes.',
    'THREE.WebGLRenderer: WebGL 1 is not supported since r163.',
  ])('recognises %s', (message) => {
    expect(isWebGLUnavailableError(new Error(message))).toBe(true)
  })

  // Anything else still reaches the error boundary and Sentry.
  it.each([
    ['another renderer error', new Error('THREE.WebGLRenderer: Attached DepthTexture is initialized to the incorrect size.')],
    ['an unrelated error', new Error('Cannot read properties of undefined')],
    ['a non-Error', 'Error creating WebGL context'],
    ['nothing', undefined],
  ])('does not recognise %s', (_, thrown) => {
    expect(isWebGLUnavailableError(thrown)).toBe(false)
  })
})
