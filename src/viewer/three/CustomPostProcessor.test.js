import {Camera, Scene, UnsignedShortType} from 'three'
import CustomPostProcessor from './CustomPostProcessor'


/**
 * Minimal WebGLRenderer stand-in satisfying EffectComposer.addPass
 * (drawing-buffer size + context attributes queries).
 *
 * @return {object}
 */
function fakeRenderer() {
  return {
    getSize: (v) => v.set(4, 4),
    getDrawingBufferSize: (v) => v.set(4, 4),
    getContext: () => ({getContextAttributes: () => ({alpha: true})}),
    capabilities: {},
    autoClear: true,
  }
}


describe('CustomPostProcessor', () => {
  it('pins the composer depth attachment to 16-bit (UnsignedShortType)', () => {
    // The z-fight fix: the scene depth-tests in the composer's input
    // buffer; an explicit 16-bit depth texture restores the pre-r184
    // format where coincident BIM interfaces tie uniformly and draw
    // order resolves them stably. See the constructor comment.
    const postProcessor = new CustomPostProcessor(fakeRenderer(), new Scene(), new Camera())
    const composer = postProcessor.getComposer
    expect(composer.depthTexture).not.toBeNull()
    expect(composer.depthTexture.isDepthTexture).toBe(true)
    expect(composer.depthTexture.type).toBe(UnsignedShortType)
    // The stable-depth copy passes sample from must match, or a
    // depth-consuming pass would silently read a different precision.
    expect(composer.depthRenderTarget.depthTexture.type).toBe(UnsignedShortType)
  })
})
