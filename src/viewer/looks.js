import {ToneMappingMode} from 'postprocessing'


/**
 * §6e render "looks" — named, user-selectable full render configurations,
 * toggled from the profile menu (RenderModeControl) and persisted like the
 * day/night theme. Each entry is a complete set of values applied by
 * `ShareViewer.applyLook`. Two ship today:
 *
 *   - `neutral` (default): the filmic/PBR look — Khronos PBR-neutral tone
 *     map, procedural gradient studio IBL, soft key+fill, a faint material
 *     sheen. These values are ALSO baked into the construction-time
 *     constants so the first paint is correct without any apply call:
 *       · lights → src/viewer/three/context/scene.js
 *       · material roughness/metalness → src/viewer/ifc/flatMeshToBufferGeometry.js
 *       · env intensity → src/viewer/ShareViewer.js (ENV_MAP_INTENSITY)
 *       · tone-mapping operator → src/viewer/three/CustomPostProcessor.js
 *     Keep those in sync with `neutral` below — this object is the runtime
 *     source of truth when toggling, the constants are the boot defaults.
 *     Scene background is deliberately NOT a look property — it follows the
 *     day/night theme (theme/Palette.js `sceneBackground`: white / black).
 *
 *   - `flat`: the legacy-ish unlit read — no tone curve, no IBL, flat bright
 *     lighting, fully matte — for users who prefer the old high-key look.
 *
 * Ambient occlusion + contact shadow are intentionally NOT part of either
 * look (both off in the values the user signed off on); they remain dev-only
 * `?feature=look` GUI tools, defaulting off.
 */
export const LOOKS = {
  neutral: {
    label: 'Neutral',
    toneMapping: ToneMappingMode.NEUTRAL,
    envType: 'gradient',
    envIntensity: 2.56,
    keyLight: 1.25,
    fillLight: 2.3,
    ambient: 0.25,
    roughness: 0.68,
    metalness: 0.16,
  },
  flat: {
    label: 'Flat',
    toneMapping: ToneMappingMode.LINEAR,
    envType: 'none',
    envIntensity: 0,
    keyLight: 1.5,
    fillLight: 2.4,
    ambient: 0.5,
    roughness: 1,
    metalness: 0,
  },
}


/** Look applied when the user hasn't chosen one. Keys into LOOKS. */
export const DEFAULT_LOOK = 'neutral'
