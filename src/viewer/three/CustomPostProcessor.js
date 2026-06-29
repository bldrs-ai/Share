import {EffectComposer, EffectPass, OutlineEffect, RenderPass, ToneMappingEffect, ToneMappingMode} from 'postprocessing'
import {WebGLRenderer, Scene, Camera} from 'three'


/** A custom post processor utility */
export default class CustomPostProcessor {
  _composer = null
  _scene = null
  _camera = null
  _toneMappingEffect = null
  static _instance = null

  /**
   * Instanciates a new CustomPostProcessor
   *
   * @param {WebGLRenderer} renderer The renderer
   * @param {Scene} scene Three.js scene
   * @param {Camera} camera The camera
   */
  constructor(renderer, scene, camera) {
    this._composer = new EffectComposer(renderer)
    this._composer.addPass(new RenderPass(scene, camera))
    // Tone mapping (§6e). The render path always runs through this
    // composer, so tone mapping must be a composer effect — `renderer.
    // toneMapping` is bypassed by postprocessing's pipeline (this is why a
    // naive `renderer.toneMapping = ACES` did nothing in 5e). Default is the
    // Khronos PBR-NEUTRAL operator: unlike ACES it preserves hue/saturation
    // and doesn't lift mid-tones, which reads cleaner for CAD/product viz
    // (ACES washed the matte IFC surfaces out). Swap via the `?feature=look`
    // GUI / `setToneMappingMode` (ACES / AgX / ...). Persistent pass so it
    // applies with or without a selection outline; the outline composites
    // after it.
    this._toneMappingEffect = new ToneMappingEffect({mode: ToneMappingMode.NEUTRAL})
    this._composer.addPass(new EffectPass(camera, this._toneMappingEffect))
    this._scene = scene
    this._camera = camera
  }

  /**
   * Gets the composer
   *
   * @return {EffectComposer} the composer
   */
  get getComposer() {
    return this._composer
  }

  /**
   * Swap the filmic tone-mapping operator at runtime. Used by the
   * `?feature=look` GUI (LightingGui) to compare ACES / AgX / Neutral /
   * Linear live. `postprocessing`'s ToneMappingEffect recompiles its
   * shader macro internally on assignment.
   *
   * @param {number} mode a `ToneMappingMode` enum value
   */
  setToneMappingMode(mode) {
    if (this._toneMappingEffect) {
      this._toneMappingEffect.mode = mode
    }
  }

  /**
   * @return {number|null} the current `ToneMappingMode`, or null when the
   *   effect isn't built (renderer-less test contexts).
   */
  getToneMappingMode() {
    return this._toneMappingEffect ? this._toneMappingEffect.mode : null
  }

  /**
   * Creates a new outline effect and adds it to the composer
   *
   * @param {object} effectOpts The outline effect options
   * @return {OutlineEffect} the outline effect
   */
  createOutlineEffect(effectOpts) {
    const outlineEffect = new OutlineEffect(this._scene, this._camera, effectOpts)
    const selectionOutlinePass = new EffectPass(this._camera, outlineEffect)
    this._composer.addPass(selectionOutlinePass)
    return outlineEffect
  }
}
