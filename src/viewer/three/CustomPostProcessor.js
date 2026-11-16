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
import {N8AOPostPass} from 'n8ao'
import {WebGLRenderer, Scene, Camera, UnsignedShortType} from 'three'
import {gtagEvent} from '../../privacy/analytics'
import {isLookOn} from '../lookMode'
import {LOOKS, DEFAULT_LOOK} from '../looks'
import {patchOutlineForBatchedMeshes} from './outlineBatching'


// SSAO defaults (§6e), the alternative AO method the look panel can switch to
// (`setAOMethod('ssao')`). `radius` is relative to resolution (range
// [1e-6, 1]); overall strength is the effect's blend opacity. On Momentum at
// these settings it darkens at most 10/255 (viewer-replacement.md §6e), which
// is why N8AO is the default.
const AO_SAMPLES = 16
const AO_RINGS = 7
const AO_RADIUS = 0.1
const AO_INTENSITY = 2
const AO_LUMINANCE_INFLUENCE = 0.6

// N8AO defaults, the default AO method with the look on. Radius is in SCREEN
// pixels
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
  // AO state (§6e, look on). `_aoMethod` is 'n8ao' (N8AOPostPass, the
  // default, built with the composer) or 'ssao' (pmndrs SSAOEffect +
  // NormalPass, built the first time the look panel picks it). `_aoEnabled`
  // is the look's / the user's choice; `_aoSuspended` is motionAO.js dropping
  // AO while the camera moves. A pass runs only when enabled and not
  // suspended.
  _aoMethod = 'n8ao'
  _aoEnabled = false
  _aoSuspended = false
  _aoStrength = 1
  _n8aoPass = null
  _toneMappingPass = null
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
    this._scene = scene
    this._camera = camera
    // Ambient occlusion (§6e), with the look on. N8AO reconstructs normals
    // from the composer's stable depth (no NormalPass) and detects the
    // log-depth buffer itself. Added before tone mapping so occlusion darkens
    // the linear lit colour, then gets tone-mapped with everything else.
    // Skipped renderer-less (the Jest context mock has none).
    if (renderer && isLookOn()) {
      this._n8aoPass = this._buildN8ao()
      if (this._n8aoPass) {
        this._composer.addPass(this._n8aoPass)
      }
      this._aoEnabled = LOOKS[DEFAULT_LOOK].ao === true
      this._applyAOState()
    }
    // Tone mapping (§6e), with the look on; off, the composer is RenderPass +
    // outline only, the pre-§6e pipeline. The render path always runs through
    // this composer, so tone mapping must be a composer effect — `renderer.
    // toneMapping` is bypassed by postprocessing's pipeline (this is why a
    // naive `renderer.toneMapping = ACES` did nothing in 5e). Default is the
    // Khronos PBR-NEUTRAL operator: unlike ACES it preserves hue/saturation
    // and doesn't lift mid-tones, which reads cleaner for CAD/product viz.
    // Swap via the look panel / `setToneMappingMode` (ACES / AgX / ...).
    // Persistent pass so it applies with or without a selection outline; the
    // outline composites after it.
    if (isLookOn()) {
      this._toneMappingEffect = new ToneMappingEffect({mode: ToneMappingMode.NEUTRAL})
      this._toneMappingPass = new EffectPass(camera, this._toneMappingEffect)
      this._composer.addPass(this._toneMappingPass)
    }
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
   * Toggle ambient occlusion for the current method: the look's `ao`
   * (`ShareViewer.applyLook`) and the look panel's toggle. No-op without an
   * AO pass (look off, renderer-less contexts).
   *
   * @param {boolean} enabled
   */
  setAOEnabled(enabled) {
    this._aoEnabled = enabled === true
    this._applyAOState()
  }

  /**
   * Drop AO while the camera moves (motionAO.js), independent of whether
   * it's enabled: resuming restores whatever the look/panel chose. The pass
   * is skipped outright while suspended, so a moving frame costs what it
   * would with AO off, and that is the frame motion residency's Auto
   * measures before it decides to cut geometry.
   *
   * @param {boolean} suspended
   */
  setAOSuspended(suspended) {
    this._aoSuspended = suspended === true
    this._applyAOState()
  }

  /**
   * Set overall AO strength ([0,1], the panel allows a little over). For
   * N8AO it scales the `intensity` exponent; for SSAO it's the effect's
   * blend opacity, decoupled from SSAO's internal `intensity`.
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

  /** @return {boolean} whether AO is enabled (suspension aside). */
  getAOEnabled() {
    return this._hasAOPass() ? this._aoEnabled : false
  }

  /** @return {boolean} whether an AO pass will run on the next paint. */
  isAORunning() {
    return Boolean(this._n8aoPass?.enabled || this._ssaoPass?.enabled)
  }

  /** @return {number} current AO strength, or 0 without an AO pass. */
  getAOStrength() {
    return this._hasAOPass() ? this._aoStrength : 0
  }

  /** @return {string} the current AO method, 'n8ao' or 'ssao'. */
  getAOMethod() {
    return this._aoMethod
  }

  /**
   * Switch the AO implementation (look panel). SSAO is built on first pick
   * (its NormalPass allocates a full-res target and renders the scene a
   * second time, so nobody pays for it until they ask), inserted where N8AO
   * sits, before tone mapping.
   *
   * @param {string} method 'n8ao' | 'ssao'
   */
  setAOMethod(method) {
    if (!this._hasAOPass() && !this._toneMappingPass) {
      return // look off: no AO pipeline to switch
    }
    if (method === 'ssao' && !this._ssaoPass) {
      this._buildSsao()
    }
    if (method === 'n8ao' && !this._n8aoPass) {
      return // N8AO failed to build (GA `ao_unavailable`); keep what runs
    }
    this._aoMethod = method === 'ssao' ? 'ssao' : 'n8ao'
    this._applyAOState()
  }

  /**
   * @return {object|null} a configured N8AOPostPass, or null when it can't
   *   be built on this device (reported to GA as `ao_unavailable`: a
   *   capability limit, the picture is simply without AO)
   * @private
   */
  _buildN8ao() {
    try {
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
      return pass
    } catch (e) {
      console.warn('N8AO unavailable, rendering without AO:', e)
      gtagEvent('ao_unavailable', {method: 'n8ao', error: e?.name ?? 'unknown'})
      return null
    }
  }

  /** @private */
  _buildSsao() {
    const passes = this._composer.passes
    const anchor = this._n8aoPass ?? this._toneMappingPass
    const at = anchor ? passes.indexOf(anchor) : passes.length
    this._normalPass = new NormalPass(this._scene, this._camera)
    this._ssaoEffect = new SSAOEffect(this._camera, this._normalPass.texture, {
      samples: AO_SAMPLES,
      rings: AO_RINGS,
      radius: AO_RADIUS,
      intensity: AO_INTENSITY,
      luminanceInfluence: AO_LUMINANCE_INFLUENCE,
    })
    this._ssaoEffect.blendMode.opacity.value = this._aoStrength
    this._ssaoPass = new EffectPass(this._camera, this._ssaoEffect)
    this._normalPass.enabled = false
    this._ssaoPass.enabled = false
    this._composer.addPass(this._normalPass, at)
    this._composer.addPass(this._ssaoPass, at + 1)
  }

  /** @return {boolean} @private */
  _hasAOPass() {
    return Boolean(this._n8aoPass || this._ssaoPass)
  }

  /**
   * Enable exactly the passes the method, toggle and motion call for. The
   * NormalPass is SSAO's input only, so it's off whenever SSAO is.
   *
   * @private
   */
  _applyAOState() {
    const on = this._aoEnabled && !this._aoSuspended
    const ssaoOn = on && this._aoMethod === 'ssao'
    if (this._ssaoPass) {
      this._ssaoPass.enabled = ssaoOn
    }
    if (this._normalPass) {
      this._normalPass.enabled = ssaoOn
    }
    if (this._n8aoPass) {
      this._n8aoPass.enabled = on && this._aoMethod === 'n8ao'
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
    this._toneMappingPass = null
  }
}
