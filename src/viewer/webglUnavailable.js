/*
 * A browser that can't give three a WebGL 2 context (SHARE-1DZ): no GPU,
 * hardware acceleration switched off, a blocklisted driver, a VM or a
 * headless crawler. three's WebGLRenderer throws from its constructor, which
 * ShareViewer runs inside CadView's viewer init. Uncaught, that took the whole
 * app down into the error boundary and sent a Sentry error for a state of the
 * client nobody can fix in Share.
 *
 * Now CadView catches it (initViewerCb), shows Components/WebglUnavailable
 * in place of the viewer to say what to try, and counts it once per session
 * as a client capability (privacy/clientCapabilities.js, condition
 * `webgl_unavailable`), which is its one sink: no Sentry event, no `alert` GA
 * event.
 */


export const WEBGL_UNAVAILABLE_TITLE = '3D view not available'

export const WEBGL_UNAVAILABLE_TEXT =
  'Your browser couldn\'t start WebGL, which Share needs to show 3D models. ' +
  'Turn on hardware acceleration in your browser\'s settings, update your graphics driver, ' +
  'or try another browser.'

/**
 * What three r187 throws when it can't get a usable context
 * (three.module.js, WebGLRenderer's constructor): no context at all, none
 * with the attributes asked for, or only WebGL 1, which three dropped in r163.
 */
const WEBGL_UNAVAILABLE_MESSAGE =
  /^THREE\.WebGLRenderer: (Error creating WebGL context|WebGL 1 is not supported)/


/**
 * @param {*} err anything thrown while creating the viewer
 * @return {boolean} true when it is three failing to get a WebGL context
 */
export function isWebGLUnavailableError(err) {
  return typeof err?.message === 'string' && WEBGL_UNAVAILABLE_MESSAGE.test(err.message)
}

