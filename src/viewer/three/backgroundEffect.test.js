import {EffectAttribute, ToneMappingMode} from 'postprocessing'
import {SceneToneMappingEffect} from './backgroundEffect'


describe('viewer/three/backgroundEffect', () => {
  it('reads depth and leaves the clear-depth pixels un-tone-mapped', () => {
    const effect = new SceneToneMappingEffect({mode: ToneMappingMode.NEUTRAL})
    expect(effect.isSkippingBackground).toBe(true)
    expect(effect.getAttributes() & EffectAttribute.DEPTH).toBeTruthy()
    const fragment = effect.getFragmentShader()
    expect(fragment).toContain('texture2D(depthBuffer,uv).r>=1.0){outputColor=inputColor;return;}')
    // The operator is still postprocessing's, switchable as before.
    expect(fragment).toContain('toneMapping(inputColor.rgb)')
    effect.mode = ToneMappingMode.AGX
    expect(effect.mode).toBe(ToneMappingMode.AGX)
  })
})
