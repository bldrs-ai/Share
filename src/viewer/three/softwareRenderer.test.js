import {isSoftwareRenderer} from './softwareRenderer'


// WebGL's RENDERER enum.
const RENDERER = 0x1F01


/**
 * @param {string} renderer what RENDERER reports
 * @param {string|null} [unmasked] what the debug extension reports, or null
 *   when the extension is missing
 * @return {object} a WebGL context stand-in
 */
function glReporting(renderer, unmasked = null) {
  return {
    RENDERER,
    getExtension: (name) => (name === 'WEBGL_debug_renderer_info' && unmasked !== null ? {} : null),
    getParameter: (p) => (p === RENDERER ? renderer : unmasked),
  }
}


describe('viewer/three/softwareRenderer', () => {
  it('spots SwiftShader and llvmpipe, from either string', () => {
    expect(isSoftwareRenderer(glReporting('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'))).toBe(true)
    expect(isSoftwareRenderer(glReporting('WebKit WebGL', 'llvmpipe (LLVM 15.0.7, 256 bits)'))).toBe(true)
  })

  it('passes a GPU', () => {
    expect(isSoftwareRenderer(glReporting('ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)'))).toBe(false)
    expect(isSoftwareRenderer(glReporting('WebKit WebGL', 'NVIDIA GeForce RTX 3080'))).toBe(false)
  })

  it('is false without a context, or when asking throws', () => {
    expect(isSoftwareRenderer(null)).toBe(false)
    expect(isSoftwareRenderer({getParameter: () => {
      throw new Error('lost')
    }})).toBe(false)
  })
})
