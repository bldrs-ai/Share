// What the GPU is, as WebGL reports it. Chrome returns the unmasked renderer
// string from `RENDERER` now; `WEBGL_debug_renderer_info` is the older way to
// ask and is kept as the fallback.
const UNMASKED_RENDERER_WEBGL = 0x9246
const SOFTWARE_RENDERERS = /swiftshader|llvmpipe|software/i


/**
 * Whether WebGL is running on a software rasteriser rather than a GPU:
 * SwiftShader (headless Chromium, so CI, and Chrome's fallback on a machine
 * whose GPU it blocklists) or Mesa's llvmpipe.
 *
 * @param {object|null} gl a WebGL rendering context
 * @return {boolean}
 */
export function isSoftwareRenderer(gl) {
  if (!gl?.getParameter) {
    return false
  }
  try {
    const debugInfo = gl.getExtension?.('WEBGL_debug_renderer_info')
    const name = [
      gl.getParameter(gl.RENDERER),
      debugInfo ? gl.getParameter(UNMASKED_RENDERER_WEBGL) : '',
    ].join(' ')
    return SOFTWARE_RENDERERS.test(name)
  } catch {
    return false
  }
}
