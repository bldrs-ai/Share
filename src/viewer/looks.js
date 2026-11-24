/**
 * §6e render "looks" — named, user-selectable full render configurations,
 * toggled from the profile menu (ProfileControl) and persisted like the
 * day/night theme. Each entry is a complete set of values applied live by
 * `ShareViewer.applyLook`. Two ship today:
 *
 *   - `neutral` (default): the filmic/PBR look — Khronos PBR-neutral tone
 *     map, procedural gradient studio IBL, soft key+fill, a faint sheen.
 *   - `flat`: the legacy-ish unlit read — no tone curve, no IBL, flat bright
 *     lighting, fully matte — for users who prefer the old high-key look.
 *
 * This object is the SINGLE SOURCE of truth for the look values. The
 * construction-time constants that set the boot (pre-apply) state derive
 * from `neutral` here, so retuning Neutral is one edit:
 *   · lights → src/viewer/three/context/scene.js (imports LOOKS.neutral)
 *   · material roughness/metalness → src/viewer/ifc/flatMeshToBufferGeometry.js
 *   · env intensity → src/viewer/ShareViewer.js (ENV_MAP_INTENSITY)
 * `toneMapping` is a look key ('neutral' | 'linear'); CustomPostProcessor maps
 * it to a `ToneMappingMode`. Kept as a string (not the enum) so pure
 * geometry/scene code can import LOOKS without pulling in postprocessing.
 *
 * Scene background is deliberately NOT a look property — it follows the
 * day/night theme (theme/Palette.js `sceneBackground`: white / black).
 * Ambient occlusion IS part of a look (`ao`: on for Neutral, off for Flat;
 * the method and strength are tuned in the look panel). So is the contact
 * shadow (`shadow`: on for Neutral, off for Flat).
 */
export const LOOKS = {
  neutral: {
    label: 'Neutral',
    // The owner's tuning on the deploy previews (real GPU). #2167 picked the
    // look-GUI "Neutral CAD" preset with the gradient studio at 0.6 (the r184
    // tuning, env 2.56, key 1.25, fill 2.3, overexposed once three r187's
    // rewritten PMREMGenerator made the IBL contribute). The follow-up moved
    // env 0.6 → 0.75, key 1.2 → 1, fill 0.6 → 3, ambient 0.2 → 0.1,
    // metalness 0 → 0.5, and turned the contact shadow on.
    toneMapping: 'neutral',
    envType: 'gradient',
    envIntensity: 0.75,
    keyLight: 1,
    fillLight: 3,
    ambient: 0.1,
    roughness: 0.7,
    metalness: 0.5,
    // N8AO (CustomPostProcessor), dropped while the camera moves
    // (motionAO.js) so it costs nothing during an orbit.
    ao: true,
    // The contact shadow (ShareViewer#setShadowEnabled): the key light casts
    // onto a ShadowMaterial ground fitted under the model. Its darkness is
    // ShareViewer's DEFAULT_SHADOW_OPACITY, 0.35.
    shadow: true,
  },
  flat: {
    label: 'Flat',
    toneMapping: 'linear',
    envType: 'none',
    envIntensity: 0,
    keyLight: 1.5,
    fillLight: 2.4,
    ambient: 0.5,
    roughness: 1,
    metalness: 0,
    ao: false,
    shadow: false,
  },
}


/** Look applied when the user hasn't chosen one. Keys into LOOKS. */
export const DEFAULT_LOOK = 'neutral'


/**
 * Run `fn` against every "look-managed" standard material on a model — the
 * generated surfaces the look owns (IFC merged materials, tagged
 * `userData.isLookManaged` at creation in flatMeshToBufferGeometry), NOT
 * authored materials from glTF/GLB imports, whose authored PBR values must be
 * preserved. Used by `applyLook` and the `?feature=look` GUI so a look toggle
 * restyles only look-owned surfaces. `model.traverse` is optional-chained so
 * renderer-less test stubs (which pass a non-Object3D model) are safe.
 *
 * @param {object} model loaded model root (Object3D)
 * @param {Function} fn invoked with each look-managed MeshStandardMaterial
 */
export function forEachLookManagedMaterial(model, fn) {
  model?.traverse?.((obj) => {
    const material = obj.material
    if (!material) {
      return
    }
    const list = Array.isArray(material) ? material : [material]
    for (const m of list) {
      if (m?.userData?.isLookManaged && typeof m.roughness === 'number') {
        fn(m)
      }
    }
  })
}
