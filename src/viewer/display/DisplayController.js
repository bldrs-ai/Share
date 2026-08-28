import {ColorMode, activeColorMode, hasAutoColor, setColorMode} from './colorMode'
import {residencyOrDefault, setResidencyMode} from './residencyMode'
import {ShadingMode, activeShadingMode, modelSupportsShading, setShadingMode} from './shadingMode'
import {resolveAppearance} from './overrideStack'


/**
 * DisplayController — turns the resolved override stack (overrideStack.js)
 * into scene mutations on a loaded model.
 *
 * Three model-scope axes are wired: **color** (Auto/Source), **shading**
 * (Shaded/Wireframe), and **residency** (percent + priority metric), each
 * delegating to its own module. Scoped application (S5) adds per-scope
 * targets here; the stack + resolver already carry them, so that's a new
 * per-target pass, not a new state mechanism.
 *
 * Residency is applied through `applyResidencyOverrides`, NOT through
 * `applyDisplayOverrides`: its target is the `ResidencyController`, which the
 * model doesn't own and which outlives no model swap, so there is no way to
 * reach it from `(model, overrides)`. See residencyMode's header for why the
 * stack — rather than the scene — is the authority on that axis.
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
  if (appearance.shading !== undefined) {
    setShadingMode(model, appearance.shading)
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


/**
 * The model-scope shading the stack resolves to, or the model's live mode
 * when no shading override is set.
 *
 * @param {object} model
 * @param {Array<{scope: object, appearance: object}>} overrides
 * @return {string} a {@link ShadingMode}
 */
export function resolvedShadingMode(model, overrides) {
  const appearance = resolveAppearance(overrides, {})
  if (appearance.shading !== undefined) {
    return appearance.shading
  }
  return model ? activeShadingMode(model) : ShadingMode.SHADED
}


/**
 * Whether shading modes are worth offering for this model. Thin pass-through
 * to the shading layer.
 *
 * @param {object} model
 * @return {boolean}
 */
export function modelHasShadingChoice(model) {
  return model ? modelSupportsShading(model) : false
}


/**
 * The model-scope residency the stack resolves to, filled out with the
 * defaults for anything it doesn't set.
 *
 * No model argument, unlike the color/shading resolvers: there is no live
 * scene state to fall back to (residencyMode's header explains why), so an
 * unset axis simply resolves to "fully resident, occupancy-ordered".
 *
 * @param {Array<{scope: object, appearance: object}>} overrides
 * @return {{percent: number, metric: string}}
 */
export function resolvedResidency(overrides) {
  return residencyOrDefault(resolveAppearance(overrides, {}).residency)
}


/**
 * Apply the model-scope resolution of an override map to a residency
 * controller. No-ops without one, which is the normal state on a model that
 * has nothing to evict.
 *
 * @param {object} controller a ResidencyController, or null
 * @param {Array<{scope: object, appearance: object}>} overrides
 */
export function applyResidencyOverrides(controller, overrides) {
  setResidencyMode(controller, resolveAppearance(overrides, {}).residency)
}


/**
 * The whole model-scope appearance — every axis at once, for the callers that
 * need the complete picture rather than one axis: the `#d:` serializer and
 * the Share dialog's "Display settings" toggle.
 *
 * Per axis it's the stack's value if set, else what the model is actually
 * displaying — EXCEPT that an axis the model offers no choice on resolves to
 * its default. That exception is what keeps the token honest (displayHash
 * §6.1's only-non-defaults rule): `activeColorMode` reports SOURCE for every
 * model that shipped its own colors, since live === source there, so folding
 * it in unconditionally would stamp `color=src` onto the share link of every
 * colored IFC — a token asserting a choice the user was never offered. With
 * the gate, the token carries exactly the axes the Display menu shows.
 *
 * With no model there is nothing to gate on and the stack is the only truth,
 * so the gates open rather than suppressing everything.
 *
 * @param {object} model BatchedMesh or Group, may be null
 * @param {Array<{scope: object, appearance: object}>} overrides
 * @return {{color: string, shading: string, residency: object}}
 */
export function resolvedAppearance(model, overrides) {
  return {
    color: (!model || modelHasColorChoice(model)) ?
      resolvedColorMode(model, overrides) :
      ColorMode.AUTO,
    shading: (!model || modelHasShadingChoice(model)) ?
      resolvedShadingMode(model, overrides) :
      ShadingMode.SHADED,
    residency: resolvedResidency(overrides),
  }
}
