import {
  EffectComposer,
  EffectPass,
  NormalPass,
  OutlineEffect,
  RenderPass,
  SSAOEffect,
  ToneMappingEffect,
  ToneMappingMode,
} from 'postprocessing'
import {WebGLRenderer, Scene, Camera} from 'three'
import {isFeatureEnabled} from '../../FeatureFlags'


// SSAO defaults (§6e). Screen-space ambient occlusion darkens crevices /
// contact areas so geometry reads with depth instead of flat. Quality-ish
// sample count; `radius` is relative to resolution (range [1e-6, 1]). Overall
// strength is the effect's blend opacity, live-tunable via the `?feature=look`
// GUI; these are the build-time starting points.
const AO_SAMPLES = 16
const AO_RINGS = 7
const AO_RADIUS = 0.1
const AO_INTENSITY = 2
const AO_LUMINANCE_INFLUENCE = 0.6


// Maps a look's `toneMapping` key (src/viewer/looks.js) to a postprocessing
// ToneMappingMode. Lives here so looks.js stays free of the postprocessing
// dependency; unknown keys fall back to NEUTRAL.
const TONE_MODE_BY_LOOK_KEY = {
  neutral: ToneMappingMode.NEUTRAL,
  linear: ToneMappingMode.LINEAR,
}


/** A custom post processor utility */
export default class CustomPostProcessor {
  _composer = null
  _scene = null
  _camera = null
  _toneMappingEffect = null
  _normalPass = null
  _ssaoEffect = null
  _ssaoPass = null
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
    // Ambient occlusion (§6e). SSAO needs a scene-normal buffer (NormalPass)
    // + the depth the composer already provides. Added before tone mapping so
    // occlusion darkens the linear lit color, then gets tone-mapped with
    // everything else. Its own pass so the GUI can toggle it via
    // `_ssaoPass.enabled`. Gated on `?feature=look`: AO is a dev-only tool,
    // off in both shipped looks, and NormalPass allocates a full-res render
    // target + SSAO compiles a shader — so only build it when the look GUI
    // (the only way to enable it) is present. Also skipped renderer-less
    // (the Jest context mock has none).
    if (renderer && isFeatureEnabled('look')) {
      this._normalPass = new NormalPass(scene, camera)
      this._composer.addPass(this._normalPass)
      this._ssaoEffect = new SSAOEffect(camera, this._normalPass.texture, {
        samples: AO_SAMPLES,
        rings: AO_RINGS,
        radius: AO_RADIUS,
        intensity: AO_INTENSITY,
        luminanceInfluence: AO_LUMINANCE_INFLUENCE,
      })
      this._ssaoPass = new EffectPass(camera, this._ssaoEffect)
      this._composer.addPass(this._ssaoPass)
      // Default OFF: AO is not part of either shipped look, only a dev-only
      // `?feature=look` GUI tool. Both passes start disabled (skipped at
      // render) until toggled, so they cost nothing in the default pipeline.
      this._normalPass.enabled = false
      this._ssaoPass.enabled = false
    }
    // Tone mapping (§6e). Gated on `?feature=look` (the whole §6e look is
    // behind it, default off): without the flag the composer is RenderPass +
    // outline only, matching main. The render path always runs through this
    // composer, so tone mapping must be a composer effect — `renderer.
    // toneMapping` is bypassed by postprocessing's pipeline (this is why a
    // naive `renderer.toneMapping = ACES` did nothing in 5e). Default is the
    // Khronos PBR-NEUTRAL operator: unlike ACES it preserves hue/saturation
    // and doesn't lift mid-tones, which reads cleaner for CAD/product viz.
    // Swap via the `?feature=look` GUI / `setToneMappingMode` (ACES / AgX /
    // ...). Persistent pass so it applies with or without a selection outline;
    // the outline composites after it.
    if (isFeatureEnabled('look')) {
      this._toneMappingEffect = new ToneMappingEffect({mode: ToneMappingMode.NEUTRAL})
      this._composer.addPass(new EffectPass(camera, this._toneMappingEffect))
    }
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
   * Set the tone-mapping operator from a look's `toneMapping` key
   * (src/viewer/looks.js). Resolves the key → ToneMappingMode here so looks.js
   * needn't import postprocessing. Used by `ShareViewer.applyLook`.
   *
   * @param {string} lookKey 'neutral' | 'linear'
   */
  setToneMappingForLook(lookKey) {
    this.setToneMappingMode(TONE_MODE_BY_LOOK_KEY[lookKey] ?? ToneMappingMode.NEUTRAL)
  }

  /**
   * @return {number|null} the current `ToneMappingMode`, or null when the
   *   effect isn't built (renderer-less test contexts).
   */
  getToneMappingMode() {
    return this._toneMappingEffect ? this._toneMappingEffect.mode : null
  }

  /**
   * Toggle the AO pass (and its NormalPass) on/off. Used by the
   * `?feature=look` GUI. No-op without an AO pass (renderer-less contexts).
   *
   * @param {boolean} enabled
   */
  setAOEnabled(enabled) {
    if (this._ssaoPass) {
      this._ssaoPass.enabled = enabled
    }
    if (this._normalPass) {
      this._normalPass.enabled = enabled
    }
  }

  /**
   * Set overall AO strength via the effect's blend opacity ([0,1]). Decouples
   * the user-facing "how much AO" knob from SSAO's internal `intensity`.
   *
   * @param {number} strength
   */
  setAOStrength(strength) {
    if (this._ssaoEffect) {
      this._ssaoEffect.blendMode.opacity.value = strength
    }
  }

  /** @return {boolean} whether the AO pass is currently enabled. */
  getAOEnabled() {
    return this._ssaoPass ? this._ssaoPass.enabled : false
  }

  /** @return {number} current AO strength (blend opacity), or 0 if no effect. */
  getAOStrength() {
    return this._ssaoEffect ? this._ssaoEffect.blendMode.opacity.value : 0
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


  /**
   * Free the composer and all its passes' GPU resources. Called by
   * `ShareViewer.dispose`; without it the composer + RenderPass / NormalPass /
   * SSAO / ToneMapping / outline render targets leak on every viewer
   * re-creation (CadView rebuilds the viewer on each day/night theme toggle).
   */
  dispose() {
    this._composer?.dispose?.()
    this._composer = null
    this._normalPass = null
    this._ssaoEffect = null
    this._ssaoPass = null
    this._toneMappingEffect = null
  }
}
