import {Color} from 'three'
import {BlendFunction, Effect, EffectAttribute} from 'postprocessing'


// How close a pixel's linear colour must be to the background's to count as
// untouched background: the half-float buffer's step near 1 is 1/1024.
const UNTOUCHED_TOLERANCE = '0.002'

// Where nothing was drawn, the depth buffer still holds its clear value, 1.0
// (the 16-bit depth texture's top code, CustomPostProcessor). The raw sample
// is read rather than postprocessing's `depth` argument: under the log-depth
// buffer that one is reconstructed through pow/log2 and lands only near 1.
//
// Depth alone isn't enough: glass (`depthWrite: false`, flatMeshToBatched
// Model.js) blends its colour over the background and leaves depth at 1.0.
// So a pixel is background only if its colour is also still the background's,
// exactly as cleared, before the tone map. The mark rides in alpha, which the
// ToneMappingEffect passes through.
const MARK_FRAGMENT = `
uniform vec3 backgroundColor;
uniform bool hasBackground;

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  vec3 off = abs(inputColor.rgb - backgroundColor);
  bool isUntouched = hasBackground && texture2D(depthBuffer, uv).r >= 1.0 &&
    max(off.r, max(off.g, off.b)) < ${UNTOUCHED_TOLERANCE};
  outputColor = vec4(inputColor.rgb, isUntouched ? 0.0 : inputColor.a);
}
`

const RESTORE_FRAGMENT = `
uniform vec3 backgroundColor;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  outputColor = inputColor.a < 0.5 ? vec4(backgroundColor, 1.0) : inputColor;
}
`


/**
 * Copies the scene's background colour into an effect's uniforms.
 *
 * @param {object} scene
 * @param {Map} uniforms
 */
function followBackground(scene, uniforms) {
  const background = scene?.background
  const isColor = background?.isColor === true
  uniforms.get('hasBackground').value = isColor
  if (isColor) {
    uniforms.get('backgroundColor').value.copy(background)
  }
}


/**
 * Marks untouched background pixels, before the tone map: no geometry wrote
 * depth there and nothing blended over the cleared colour. The mark is alpha
 * 0, read by {@link BackgroundEffect} after the tone map. Put it in the
 * tone-mapping EffectPass, ahead of the ToneMappingEffect.
 */
export class BackgroundMarkEffect extends Effect {
  /** @param {object} scene a three Scene */
  constructor(scene) {
    super('BackgroundMarkEffect', MARK_FRAGMENT, {
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
    followBackground(this.scene, this.uniforms)
  }
}


/**
 * Restores the scene's background colour after tone mapping, so the colour
 * the theme or the Render panel set is the colour on screen.
 *
 * The §6e look tone-maps the whole frame (ToneMappingEffect, Khronos PBR
 * Neutral). The background is in that frame, and Neutral compresses
 * everything above ~0.76: the day theme's white came out ~94% grey (#2167).
 * In its own EffectPass after the tone-mapping one (an EffectPass tone-maps
 * its whole merged result, so sharing that pass tone-mapped this colour too),
 * it writes `scene.background` back over every pixel
 * {@link BackgroundMarkEffect} marked, and puts alpha back to 1. The frame
 * is converted from linear to sRGB once, at the last pass, so a background
 * set from `#ffffff` lands at #ffffff.
 *
 * Read from the scene on each frame (`update`), so a theme change or a
 * Render-panel edit (which only sets `scene.background`) needs nothing
 * else. With no Color background (none, or a texture), nothing is marked and
 * it passes through.
 */
export class BackgroundEffect extends Effect {
  /** @param {object} scene a three Scene */
  constructor(scene) {
    super('BackgroundEffect', RESTORE_FRAGMENT, {
      blendFunction: BlendFunction.SET,
      uniforms: new Map([
        ['backgroundColor', {value: new Color()}],
        ['hasBackground', {value: false}],
      ]),
    })
    this.scene = scene
  }


  /** Copy this frame's background into the uniforms. */
  update() {
    followBackground(this.scene, this.uniforms)
  }
}
