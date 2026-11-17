import {Color, Texture} from 'three'
import {BackgroundEffect} from './backgroundEffect'


describe('viewer/three/backgroundEffect', () => {
  it('takes the scene\'s background colour on each frame', () => {
    const scene = {background: new Color('#336699')}
    const effect = new BackgroundEffect(scene)
    effect.update()
    expect(effect.uniforms.get('hasBackground').value).toBe(true)
    expect(effect.uniforms.get('backgroundColor').value.getHexString()).toBe('336699')

    // A Render-panel or theme change only sets scene.background.
    scene.background.set('#ffffff')
    effect.update()
    expect(effect.uniforms.get('backgroundColor').value.getHexString()).toBe('ffffff')
  })

  it('passes through when the background is not a colour', () => {
    const scene = {background: null}
    const effect = new BackgroundEffect(scene)
    effect.update()
    expect(effect.uniforms.get('hasBackground').value).toBe(false)
    scene.background = new Texture()
    effect.update()
    expect(effect.uniforms.get('hasBackground').value).toBe(false)
  })
})
