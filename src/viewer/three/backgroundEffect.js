import {Color} from 'three'
import {BlendFunction, Effect, EffectAttribute} from 'postprocessing'


// Where nothing was drawn, the depth buffer still holds its clear value, 1.0
// (the 16-bit depth texture's top code, CustomPostProcessor). The raw sample
// is read rather than postprocessing's `depth` argument: under the log-depth
// buffer that one is reconstructed through pow/log2 and lands only near 1.
const FRAGMENT = `
uniform vec3 backgroundColor;
uniform bool hasBackground;

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  bool isBackground = hasBackground && texture2D(depthBuffer, uv).r >= 1.0;
  outputColor = isBackground ? vec4(backgroundColor, inputColor.a) : inputColor;
}
`


/**
 * Restores the scene's background colour after tone mapping, so the colour
 * the theme or the Render panel set is the colour on screen.
 *
 * The §6e look tone-maps the whole frame (ToneMappingEffect, Khronos PBR
 * Neutral). The background is in that frame, and Neutral compresses
 * everything above ~0.76: the day theme's white came out ~94% grey (#2167).
 * In its own EffectPass after the tone-mapping one (an EffectPass tone-maps
 * its whole merged result, so sharing that pass tone-mapped this colour too),
 * it writes `scene.background` back over every pixel no geometry covered.
 * The frame is converted from linear to sRGB once, at the last pass, so a
 * background set from `#ffffff` lands at #ffffff.
 *
 * Read from the scene on each frame (`update`), so a theme change or a
 * Render-panel edit (which only sets `scene.background`) needs nothing
 * else. With no Color background (none, or a texture), it passes through.
 */
export class BackgroundEffect extends Effect {
  /** @param {object} scene a three Scene */
  constructor(scene) {
    super('BackgroundEffect', FRAGMENT, {
      blendFunction: BlendFunction.SET,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map([
        ['backgroundColor', {value: new Color()}],
        ['hasBackground', {value: false}],
      ]),
    })
    this.scene = scene
  }


  /** Copy this frame's background into the uniforms. */
  update() {
    const background = this.scene?.background
    const isColor = background?.isColor === true
    this.uniforms.get('hasBackground').value = isColor
    if (isColor) {
      this.uniforms.get('backgroundColor').value.copy(background)
    }
  }
}
