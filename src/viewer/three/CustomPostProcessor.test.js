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
    // postprocessing >= 6.39.6: each ping-pong buffer owns a depth
    // texture; the scene can land in either, so both are pinned.
    for (const buffer of [composer.inputBuffer, composer.outputBuffer]) {
      expect(buffer.depthTexture?.isDepthTexture).toBe(true)
      expect(buffer.depthTexture.type).toBe(UnsignedShortType)
    }
    // The stable-depth copy passes sample from must match: it is filled by
    // a depth blit, which needs identical formats on both ends, and a
    // depth-consuming pass would otherwise read a different precision.
    expect(composer.stableDepthTexture.type).toBe(UnsignedShortType)
  })
})


describe('CustomPostProcessor ambient occlusion (look on, the default)', () => {
  const build = () => new CustomPostProcessor(fakeRenderer(), new Scene(), new Camera())

  it('builds N8AO before tone mapping and runs it, as the Neutral look asks', () => {
    const pp = build()
    const names = pp.getComposer.passes.map((p) => p.constructor.name)
    expect(pp.getAOMethod()).toBe('n8ao')
    expect(pp.getAOEnabled()).toBe(true)
    expect(pp.isAORunning()).toBe(true)
    // After the RenderPass, before the tone-mapping EffectPass: occlusion
    // darkens linear colour, then everything is tone-mapped together.
    const n8ao = pp.getComposer.passes.indexOf(pp._n8aoStage)
    expect(n8ao).toBeGreaterThan(names.indexOf('RenderPass'))
    expect(n8ao).toBeLessThan(pp.getComposer.passes.indexOf(pp._toneMappingPass))
  })

  it('suspends AO for motion without forgetting that it is enabled', () => {
    const pp = build()
    pp.setAOSuspended(true)
    expect(pp.isAORunning()).toBe(false)
    expect(pp.getAOEnabled()).toBe(true)
    pp.setAOSuspended(false)
    expect(pp.isAORunning()).toBe(true)
  })

  it('stays off after a resume when the look turned AO off', () => {
    const pp = build()
    pp.setAOEnabled(false)
    pp.setAOSuspended(true)
    pp.setAOSuspended(false)
    expect(pp.isAORunning()).toBe(false)
  })

  it('builds SSAO only when picked, inserted before N8AO, and runs one method at a time', () => {
    const pp = build()
    expect(pp._ssaoPass).toBeNull()
    pp.setAOMethod('ssao')
    const passes = pp.getComposer.passes
    expect(passes.indexOf(pp._ssaoStage)).toBeLessThan(passes.indexOf(pp._n8aoStage))
    expect(pp._ssaoStage.enabled).toBe(true)
    expect(pp._normalPass.enabled).toBe(true)
    expect(pp._n8aoStage.enabled).toBe(false)
    pp.setAOMethod('n8ao')
    expect(pp._ssaoStage.enabled).toBe(false)
    expect(pp._normalPass.enabled).toBe(false)
    expect(pp._n8aoStage.enabled).toBe(true)
  })
})


describe('CustomPostProcessor AO baked into the hover cache', () => {
  it('runs each AO pass in place: no swap, marked for the hover cache', () => {
    const pp = new CustomPostProcessor(fakeRenderer(), new Scene(), new Camera())
    pp.setAOMethod('ssao')
    for (const stage of [pp._n8aoStage, pp._ssaoStage]) {
      expect(stage.needsSwap).toBe(false)
      expect(stage.bakesIntoHoverCache).toBe(true)
    }
  })
})
