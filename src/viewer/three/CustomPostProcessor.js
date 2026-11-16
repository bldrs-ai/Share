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
import {WebGLRenderer, Scene, Camera, UnsignedShortType} from 'three'
import {isFeatureEnabled} from '../../FeatureFlags'
import {patchOutlineForBatchedMeshes} from './outlineBatching'


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

// N8AO defaults, the alternative AO method the `?feature=look` GUI can switch
// to (`setAOMethod('n8ao')`). Radius is in SCREEN pixels
// (`screenSpaceRadius`), not world units: one rig has to work from a unit GLB
// to a kilometre-scale site IFC, and N8AO's world-unit radius would need
// retuning per model. 32 px is mid-range of N8AO's own 16-64 recommendation;
// `distanceFalloff` is a ratio of that radius in screen-space mode. `intensity`
// is the exponent N8AO applies (`pow(ao, intensity)`); AO strength in the GUI
// scales it.
const N8AO_RADIUS_PX = 32
const N8AO_DISTANCE_FALLOFF = 0.2
const N8AO_INTENSITY = 3
const N8AO_QUALITY = 'Medium'


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
  // `?feature=look` AO state. Method is 'ssao' (pmndrs SSAOEffect + NormalPass,
  // built eagerly under the flag) or 'n8ao' (N8AOPostPass, imported and built
  // on first selection, so the n8ao chunk only loads when someone picks it).
  _aoMethod = 'ssao'
  _aoEnabled = false
  _aoStrength = 1
  _n8aoPass = null
  _n8aoLoading = null
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
    // The scene depth-tests in this composer's input buffer, not the
    // canvas. Pin its depth attachment to 16 bits — the format three
    // 0.135 allocated here, which the 0.184 upgrade (#1514) silently
    // widened to 24-bit. BIM models author exactly-coincident interface
    // faces (haus.ifc: 758 coplanar pairs at 0-1.6µm separation); at
    // 16-bit those quantize to the same depth code everywhere and the
    // deterministic draw order picks one stable winner, while at 24-bit
    // the per-fragment log-depth rounding noise (~1e-7 of depth range)
    // crosses code boundaries and the per-pixel winner is random —
    // visible speckle/shimmer at soffits, rakes and ridges. 16-bit is
    // the depth resolution prod shipped for years (~1.4mm at 15m under
    // log depth); per-surface resolution of coincident interfaces
    // belongs in the engine (conway interface culling, tracked
    // separately). postprocessing >= 6.39.6 gives each ping-pong buffer
    // its OWN depth texture (6.39.1 had one shared `composer.depthTexture`
    // it re-attached to whichever buffer was the input each frame) plus a
    // stable-depth target that depth-consuming passes sample, filled by a
    // `blitFramebuffer` from the input buffer after a `needsDepthBlit`
    // pass (the RenderPass). A depth blit requires identical depth formats
    // on both ends, so all three textures are pinned together; three
    // rebinds changed depth textures and sizes them to their target, so
    // this one-time assignment survives resizes. createDepthTexture
    // defaults the type to FloatType (32-bit) and is what addPass would
    // call lazily for the first depth-needing pass; calling it up front
    // lets us re-type before anything is uploaded.
    if (renderer) {
      this._composer.createDepthTexture()
      this._composer.inputBuffer.depthTexture.type = UnsignedShortType
      this._composer.outputBuffer.depthTexture.type = UnsignedShortType
      this._composer.stableDepthTexture.type = UnsignedShortType
    }
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
   * Toggle ambient occlusion on/off for the current method. Used by the
   * `?feature=look` GUI. No-op without AO passes (renderer-less contexts).
   *
   * @param {boolean} enabled
   */
  setAOEnabled(enabled) {
    this._aoEnabled = enabled
    this._applyAOState()
  }

  /**
   * Set overall AO strength ([0,1], the GUI allows a little over). For SSAO
   * it's the effect's blend opacity, decoupled from SSAO's internal
   * `intensity`; for N8AO it scales the `intensity` exponent.
   *
   * @param {number} strength
   */
  setAOStrength(strength) {
    this._aoStrength = strength
    if (this._ssaoEffect) {
      this._ssaoEffect.blendMode.opacity.value = strength
    }
    if (this._n8aoPass) {
      this._n8aoPass.configuration.intensity = N8AO_INTENSITY * strength
    }
  }

  /** @return {boolean} whether AO is currently enabled. */
  getAOEnabled() {
    return this._ssaoPass || this._n8aoPass ? this._aoEnabled : false
  }

  /** @return {number} current AO strength, or 0 without an AO pass. */
  getAOStrength() {
    return this._ssaoPass || this._n8aoPass ? this._aoStrength : 0
  }

  /** @return {string} the current AO method, 'ssao' or 'n8ao'. */
  getAOMethod() {
    return this._aoMethod
  }

  /**
   * Switch the AO implementation (`?feature=look` GUI). 'n8ao' dynamic-imports
   * the n8ao package and builds its pass on first use, inserted where SSAO
   * sits (after the RenderPass/hover overlay, before tone mapping) so it
   * darkens linear colour the same way. N8AO reads the composer's stable
   * depth texture, needs no NormalPass (it reconstructs normals from depth),
   * and detects the log-depth buffer from `renderer.capabilities` itself.
   *
   * @param {string} method 'ssao' | 'n8ao'
   * @return {Promise<void>} resolves once the method is live
   */
  async setAOMethod(method) {
    if (!this._ssaoPass) {
      return
    }
    if (method === 'n8ao' && !this._n8aoPass) {
      this._n8aoLoading ??= import('n8ao').then(({N8AOPostPass}) => {
        if (!this._composer) {
          return // disposed while the chunk loaded
        }
        const {width, height} = this._composer.inputBuffer
        const pass = new N8AOPostPass(this._scene, this._camera, width, height)
        pass.setQualityMode(N8AO_QUALITY)
        Object.assign(pass.configuration, {
          screenSpaceRadius: true,
          aoRadius: N8AO_RADIUS_PX,
          distanceFalloff: N8AO_DISTANCE_FALLOFF,
          intensity: N8AO_INTENSITY * this._aoStrength,
        })
        pass.enabled = false
        this._composer.addPass(pass, this._composer.passes.indexOf(this._ssaoPass) + 1)
        this._n8aoPass = pass
      })
      await this._n8aoLoading
    }
    this._aoMethod = method === 'n8ao' && this._n8aoPass ? 'n8ao' : 'ssao'
    this._applyAOState()
  }

  /**
   * Enable exactly the passes the current method + toggle call for. The
   * NormalPass is SSAO's input only, so it's off whenever SSAO is.
   *
   * @private
   */
  _applyAOState() {
    const ssaoOn = this._aoEnabled && this._aoMethod === 'ssao'
    if (this._ssaoPass) {
      this._ssaoPass.enabled = ssaoOn
    }
    if (this._normalPass) {
      this._normalPass.enabled = ssaoOn
    }
    if (this._n8aoPass) {
      this._n8aoPass.enabled = this._aoEnabled && this._aoMethod === 'n8ao'
    }
  }

  /**
   * Creates a new outline effect and adds it to the composer
   *
   * @param {object} effectOpts The outline effect options
   * @return {OutlineEffect} the outline effect
   */
  createOutlineEffect(effectOpts) {
    const outlineEffect = new OutlineEffect(this._scene, this._camera, effectOpts)
    // Every outline effect gets the batching patch, not just the isolator's:
    // any selection that can contain a `THREE.BatchedMesh` hits the same
    // uncompilable mask shader. See outlineBatching.js for the failure mode.
    patchOutlineForBatchedMeshes(outlineEffect)
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
    this._n8aoPass = null
    this._toneMappingEffect = null
  }
}
