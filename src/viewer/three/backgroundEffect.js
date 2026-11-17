import {EffectAttribute, ToneMappingEffect} from 'postprocessing'


// postprocessing's ToneMappingEffect fragment opens its mainImage with this
// line. The tone map below rewrites it to read depth and skip the background.
const MAIN_IMAGE = 'void mainImage(const in vec4 inputColor,const in vec2 uv,out vec4 outputColor){'

// Where nothing wrote depth, the buffer still holds its clear value, 1.0 (the
// 16-bit depth texture's top code, CustomPostProcessor). The raw sample is
// read, not postprocessing's `depth` argument: under the log-depth buffer
// that one is reconstructed through pow/log2 and lands only near 1.
const SKIP_BACKGROUND = `
void mainImage(const in vec4 inputColor,const in vec2 uv,const in float depth,out vec4 outputColor){
if(texture2D(depthBuffer,uv).r>=1.0){outputColor=inputColor;return;}`


/**
 * The look's tone map, applied only where the scene drew depth: the
 * background, and what blends over it without writing depth, is left as is.
 *
 * The §6e look tone-maps the frame (Khronos PBR Neutral), and the background
 * is in that frame: Neutral compresses everything above ~0.76, so the day
 * theme's white came out ~94% grey (#2167). Skipping tone mapping at the clear
 * depth leaves the background exactly `scene.background`, the theme's colour
 * or the Render panel's, once the last pass converts linear to sRGB.
 *
 * What draws over the background without writing depth keeps what it drew,
 * just not tone-mapped:
 *  - IFC glass (`depthWrite: false`, flatMeshToBatchedModel.js) against the
 *    sky (codex on #2169);
 *  - the contact shadow's ground (ShareViewer#_createGroundPlane, which turns
 *    its depth write off for this). The plane is invisible where there's no
 *    shadow, and the shadow darkens the background smoothly into it. With
 *    depth, the whole plane was tone-mapped and showed as a grey sheet against
 *    the white background (the owner's preview).
 *
 * A subclass, so the operator stays postprocessing's (`mode`, as before): the
 * one change is the head of its `mainImage`.
 */
export class SceneToneMappingEffect extends ToneMappingEffect {
  /** @param {object} [options] ToneMappingEffect's */
  constructor(options) {
    super(options)
    const fragment = this.getFragmentShader()
    if (!fragment.includes(MAIN_IMAGE)) {
      // A postprocessing upgrade changed the shader: tone-map everything,
      // as the plain effect does, rather than fail to compile.
      this.isSkippingBackground = false
      return
    }
    this.setFragmentShader(fragment.replace(MAIN_IMAGE, SKIP_BACKGROUND))
    this.setAttributes(this.getAttributes() | EffectAttribute.DEPTH)
    this.isSkippingBackground = true
  }
}
