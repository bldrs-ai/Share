import {ColorMode, activeColorMode, hasAutoColor, setColorMode} from './colorMode'
import {resolveAppearance} from './overrideStack'


/**
 * DisplayController — turns the resolved override stack (overrideStack.js)
 * into scene mutations on a loaded model.
 *
 * S3 wires exactly one axis, model scope: **color** (Auto/Source), delegating
 * to colorMode. Shading (S4), scoped application (S5), and residency (S6) add
 * axes and per-scope targets here; the stack + resolver already carry them, so
 * each is a new branch in `applyModelAppearance` / a new per-target pass, not
 * a new state mechanism.
 *
 * Stateless by design — the model's own tables (`instanceColors` /
 * `instanceSourceColors`) hold the truth, and the override map lives in the
 * store. So this is plain functions over `(model, overrides)`, not a
 * lifecycle object like ResidencyController (which precomputes per-instance
 * geometry it must own). If a future axis needs owned precomputation, that's
 * the point to introduce a class.
 *
 * @see overrideStack — the resolver these functions consume.
 * @see design/new/model-display-controls.md §2
 */


/**
 * Apply the model-scope resolution of an override map to the model.
 *
 * Only the whole-model target is resolved in S3; scoped targets (sub-tree /
 * element / mesh) arrive with S5. Missing axes are left as the model already
 * renders them — `applyDisplayOverrides` never forces a default, so a model
 * with no color override keeps whatever it loaded with.
 *
 * @param {object} model BatchedMesh or Group
 * @param {Array<{scope: object, appearance: object}>} overrides
 */
export function applyDisplayOverrides(model, overrides) {
  if (!model) {
    return
  }
  const appearance = resolveAppearance(overrides, {})
  if (appearance.color !== undefined) {
    setColorMode(model, appearance.color)
  }
}


/**
 * The model-scope color the stack currently resolves to, or — when no color
 * override is set — the mode the model is actually displaying. Lets the UI
 * show the live state on a freshly loaded model without the store having to
 * seed an override first.
 *
 * @param {object} model BatchedMesh or Group
 * @param {Array<{scope: object, appearance: object}>} overrides
 * @return {string} a {@link ColorMode}
 */
export function resolvedColorMode(model, overrides) {
  const appearance = resolveAppearance(overrides, {})
  if (appearance.color !== undefined) {
    return appearance.color
  }
  return model ? activeColorMode(model) : ColorMode.AUTO
}


/**
 * Whether the model exposes a color choice worth showing — i.e. the synthetic
 * palette actually applies (a colorless multi-part model). Thin pass-through
 * so call-sites depend on the display layer, not colorMode directly.
 *
 * @param {object} model BatchedMesh or Group
 * @return {boolean}
 */
export function modelHasColorChoice(model) {
  return model ? hasAutoColor(model) : false
}
