import GUI from 'three/examples/jsm/libs/lil-gui.module.min.js'
import {ToneMappingMode} from 'postprocessing'


// Tone-mapping operators offered in the dropdown (label → enum value). The
// filmic operators (ACES, AgX) compress HDR through an S-curve; Neutral is
// the Khronos PBR-neutral operator (preserves hue/saturation, the strongest
// choice for product/CAD viz); Linear is effectively "off" (no curve).
const TONE_MODES = {
  'ACES Filmic': ToneMappingMode.ACES_FILMIC,
  'AgX': ToneMappingMode.AGX,
  'Neutral': ToneMappingMode.NEUTRAL,
  'Linear (none)': ToneMappingMode.LINEAR,
  'Reinhard': ToneMappingMode.REINHARD,
  'Cineon': ToneMappingMode.CINEON,
}


// Baseline shown on the env-blur slider — mirrors ShareViewer's
// ENV_MAP_BLUR. The live env texture doesn't expose its build sigma, so the
// slider tracks intent from this baseline rather than reading it back.
const DEFAULT_ENV_BLUR = 0.04


// GUI slider ranges + steps, and fallback light intensities used when the
// scene lights can't be read. Named to satisfy no-magic-numbers and to keep
// the slider definitions readable.
const ENV_INTENSITY_MAX = 3
const ENV_INTENSITY_STEP = 0.01
const ENV_BLUR_MAX = 0.3
const ENV_BLUR_STEP = 0.005
const LIGHT_MAX = 5
const AMBIENT_MAX = 3
const LIGHT_STEP = 0.05
const MATERIAL_MAX = 1
const MATERIAL_STEP = 0.01
const FALLBACK_KEY_LIGHT = 1.5
const FALLBACK_FILL_LIGHT = 1.0
const FALLBACK_AMBIENT = 0.1
const AO_STRENGTH_STEP = 0.05
const FALLBACK_SHADOW_OPACITY = 0.35


// Panel inset so the GUI rides inside the app chrome instead of lil-gui's
// default flush top:0/right:0 — which overlaps the top-right control buttons
// (OperationsGroup: profile/apps/share + the notes column down the right
// edge). Top clears the control row; right clears the right-edge column.
// Tune if the toolbar geometry changes.
const PANEL_INSET_TOP = '64px'
const PANEL_INSET_RIGHT = '64px'


// IBL environment sources offered in the dropdown (label → ShareViewer type).
const ENV_TYPES = {
  'Gradient studio': 'gradient',
  'Room': 'room',
  'None': 'none',
}


// Named look presets. Each is a full set of tunable values; selecting one
// drives every bound control via `controller.setValue`, which both updates
// the slider display and fires its apply `onChange`. `envBlur` is omitted on
// purpose — switching presets shouldn't pay the PMREM-rebuild cost.
const PRESETS = {
  'ACES (dim)': {
    toneMapping: ToneMappingMode.ACES_FILMIC, envIntensity: 0.4,
    keyLight: 1.5, fillLight: 1.0, ambient: 0.1, roughness: 0.8, metalness: 0,
  },
  'Neutral CAD': {
    toneMapping: ToneMappingMode.NEUTRAL, envIntensity: 0.6,
    keyLight: 1.2, fillLight: 0.6, ambient: 0.2, roughness: 0.7, metalness: 0,
  },
  'AgX': {
    toneMapping: ToneMappingMode.AGX, envIntensity: 0.5,
    keyLight: 1.5, fillLight: 0.8, ambient: 0.15, roughness: 0.8, metalness: 0,
  },
  'Flat (legacy-ish)': {
    toneMapping: ToneMappingMode.LINEAR, envIntensity: 0.0,
    keyLight: 1.5, fillLight: 1.0, ambient: 0.5, roughness: 1.0, metalness: 0,
  },
}


/**
 * LightingGui — a lil-gui overlay for live-tuning the §6e filmic look
 * (tone-mapping operator, IBL environment source/intensity/blur, ambient
 * occlusion, the three scene lights, model material roughness/metalness,
 * background). It exists because the
 * look has to be judged visually in a real browser on a GPU — the deploy
 * preview is blocked from the dev sandbox and CI runs software GL — so
 * iterating by pushing constants is slow. With this panel a reviewer dials
 * the values in real time, then hits "Log settings" to dump a JSON snapshot
 * to paste back so the chosen numbers can be baked in as the new defaults.
 *
 * Opt-in only: ShareViewer code-splits this module in behind `?feature=look`
 * (see `_initLookGui`), so lil-gui never ships in the default bundle. The
 * continuous render loop (context.js `setAnimationLoop`) repaints every
 * frame, so control changes show immediately — no manual render trigger.
 */
export default class LightingGui {
  /**
   * @param {object} viewer the ShareViewer instance — for its `context`
   *   (scene + loaded models), `postProcessor` (tone mapping), and
   *   `setEnvironmentBlur`.
   */
  constructor(viewer) {
    this._viewer = viewer
    this._scene = viewer.context.getScene()
    this._postProcessor = viewer.postProcessor
    const scene = this._scene
    const postProcessor = this._postProcessor

    this._params = {
      toneMapping: postProcessor?.getToneMappingMode?.() ?? ToneMappingMode.NEUTRAL,
      envIntensity: scene?.environmentIntensity ?? 1,
      envBlur: DEFAULT_ENV_BLUR,
      keyLight: scene?.getObjectByName('keyLight')?.intensity ?? FALLBACK_KEY_LIGHT,
      fillLight: scene?.getObjectByName('fillLight')?.intensity ?? FALLBACK_FILL_LIGHT,
      ambient: scene?.getObjectByName('ambientLight')?.intensity ?? FALLBACK_AMBIENT,
      roughness: 0.8,
      metalness: 0,
      background: `#${scene?.background?.getHexString?.() ?? 'a9a9a9'}`,
      envType: viewer._envType ?? 'gradient',
      aoEnabled: postProcessor?.getAOEnabled?.() ?? true,
      aoStrength: postProcessor?.getAOStrength?.() ?? 1,
      shadowEnabled: viewer._shadowEnabled ?? true,
      shadowOpacity: viewer._groundPlane?.material?.opacity ?? FALLBACK_SHADOW_OPACITY,
    }
    const params = this._params

    const gui = new GUI({title: 'Look — §6e filmic'})
    this._gui = gui
    // Inset the auto-placed panel inside the app chrome (below the top
    // control row, clear of the right-edge buttons); scroll if it runs tall.
    gui.domElement.style.top = PANEL_INSET_TOP
    gui.domElement.style.right = PANEL_INSET_RIGHT
    gui.domElement.style.maxHeight = `calc(100dvh - ${PANEL_INSET_TOP} - 24px)`
    gui.domElement.style.overflowY = 'auto'

    const tone = gui.addFolder('Tone mapping')
    tone.add(params, 'toneMapping', TONE_MODES).name('operator')
      .onChange((v) => postProcessor?.setToneMappingMode(Number(v)))

    const env = gui.addFolder('Environment (IBL)')
    env.add(params, 'envType', ENV_TYPES).name('source')
      .onChange((v) => viewer.setEnvironmentType(v))
    env.add(params, 'envIntensity', 0, ENV_INTENSITY_MAX, ENV_INTENSITY_STEP).name('intensity')
      .onChange((v) => {
        if (scene) {
          scene.environmentIntensity = v
        }
      })
    env.add(params, 'envBlur', 0, ENV_BLUR_MAX, ENV_BLUR_STEP).name('blur (sigma, Room)')
      .onChange((v) => viewer.setEnvironmentBlur(v))

    const ao = gui.addFolder('Ambient occlusion')
    ao.add(params, 'aoEnabled').name('enabled')
      .onChange((v) => postProcessor?.setAOEnabled(v))
    ao.add(params, 'aoStrength', 0, MATERIAL_MAX, AO_STRENGTH_STEP).name('strength')
      .onChange((v) => postProcessor?.setAOStrength(v))

    const shadow = gui.addFolder('Contact shadow')
    shadow.add(params, 'shadowEnabled').name('enabled')
      .onChange((v) => viewer.setShadowEnabled(v))
    shadow.add(params, 'shadowOpacity', 0, MATERIAL_MAX, AO_STRENGTH_STEP).name('opacity')
      .onChange((v) => viewer.setShadowOpacity(v))

    const lights = gui.addFolder('Lights')
    lights.add(params, 'keyLight', 0, LIGHT_MAX, LIGHT_STEP).name('key')
      .onChange((v) => this._setLightIntensity('keyLight', v))
    lights.add(params, 'fillLight', 0, LIGHT_MAX, LIGHT_STEP).name('fill')
      .onChange((v) => this._setLightIntensity('fillLight', v))
    lights.add(params, 'ambient', 0, AMBIENT_MAX, LIGHT_STEP).name('ambient')
      .onChange((v) => this._setLightIntensity('ambientLight', v))

    const materials = gui.addFolder('Model materials')
    materials.add(params, 'roughness', 0, MATERIAL_MAX, MATERIAL_STEP)
      .onChange((v) => this._applyToModelMaterials((m) => {
        m.roughness = v
      }))
    materials.add(params, 'metalness', 0, MATERIAL_MAX, MATERIAL_STEP)
      .onChange((v) => this._applyToModelMaterials((m) => {
        m.metalness = v
      }))

    const sceneFolder = gui.addFolder('Scene')
    sceneFolder.addColor(params, 'background')
      .onChange((v) => {
        if (scene?.background?.set) {
          scene.background.set(v)
        }
      })

    const presetActions = {}
    for (const name of Object.keys(PRESETS)) {
      presetActions[name] = () => this._applyPreset(PRESETS[name])
    }
    const presets = gui.addFolder('Presets')
    for (const name of Object.keys(PRESETS)) {
      presets.add(presetActions, name)
    }

    const actions = {'Log settings to console': () => this._logSettings()}
    gui.add(actions, 'Log settings to console')
  }


  /**
   * Set a named scene light's intensity. No-op if the light is missing
   * (renderer-less contexts, or before `setupLights` ran).
   *
   * @param {string} name the light's `.name` (keyLight/fillLight/ambientLight)
   * @param {number} value new intensity
   */
  _setLightIntensity(name, value) {
    const light = this._scene?.getObjectByName(name)
    if (light) {
      light.intensity = value
    }
  }


  /**
   * Run `fn` against every roughness-bearing material (Standard/Physical)
   * on the currently-loaded models. Resolved at call time so materials of
   * models loaded after the GUI opened are still covered.
   *
   * @param {Function} fn invoked with each material
   */
  _applyToModelMaterials(fn) {
    const models = this._viewer.context?.getLoadedModels?.() ?? []
    for (const model of models) {
      model.traverse((obj) => {
        const material = obj.material
        if (!material) {
          return
        }
        const list = Array.isArray(material) ? material : [material]
        for (const m of list) {
          if (typeof m.roughness === 'number') {
            fn(m)
          }
        }
      })
    }
  }


  /**
   * Apply a named preset by driving each bound controller's `setValue`
   * (updates the display and fires its `onChange`, so the scene updates).
   *
   * @param {object} preset a map of control property → value
   */
  _applyPreset(preset) {
    const controllers = this._gui.controllersRecursive()
    for (const [prop, value] of Object.entries(preset)) {
      const controller = controllers.find((c) => c.property === prop)
      if (controller) {
        controller.setValue(value)
      }
    }
  }


  /**
   * Dump the current settings (tone-map operator resolved to its label) as
   * JSON to the console and, where available, the clipboard — so a reviewer
   * can paste the chosen look back to be baked in as defaults.
   */
  _logSettings() {
    const p = this._params
    const toneLabel = Object.keys(TONE_MODES)
      .find((k) => TONE_MODES[k] === Number(p.toneMapping)) ?? String(p.toneMapping)
    const snapshot = {
      toneMapping: toneLabel,
      envType: p.envType,
      envIntensity: p.envIntensity,
      envBlur: p.envBlur,
      aoEnabled: p.aoEnabled,
      aoStrength: p.aoStrength,
      shadowEnabled: p.shadowEnabled,
      shadowOpacity: p.shadowOpacity,
      keyLight: p.keyLight,
      fillLight: p.fillLight,
      ambient: p.ambient,
      roughness: p.roughness,
      metalness: p.metalness,
      background: p.background,
    }
    const json = JSON.stringify(snapshot, null, 2)
    // eslint-disable-next-line no-console
    console.log(`[look] current settings:\n${json}`)
    if (navigator?.clipboard?.writeText) {
      // Clipboard may be denied (no user gesture / insecure ctx); the
      // console copy above is the fallback, so swallow the rejection.
      navigator.clipboard.writeText(json).catch(() => undefined)
    }
  }


  /** Remove the panel from the DOM. */
  dispose() {
    this._gui?.destroy?.()
    this._gui = null
  }
}
