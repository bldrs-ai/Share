import {
  addHashParams,
  getHashParams,
  getObjectParams,
  removeHashParams,
} from '../../utils/location'
import {ColorMode} from '../../viewer/display/colorMode'
import {ShadingMode} from '../../viewer/display/shadingMode'


/**
 * displayHash — the `#d:` permalink token for view-140 display state (S7,
 * design/new/model-display-controls.md §6).
 *
 * Follows the `cp:` convention (keyed `k=v` pairs joined by `,`, tokens by
 * `;`, via utils/location). This slice serializes the **model-scope** axes
 * that exist today — color (Auto/Source) and shading (Shaded/Wireframe):
 *
 *   #d:color=src        whole model in its source colors
 *   #d:wire=1           whole model wireframe
 *   #d:color=src,wire=1 both
 *
 * Only NON-default terms serialize, so a model in its default display
 * contributes no token at all and the common share link stays as short as it
 * is today (§6.1). "Default" here is the app's default *display*: a colorless
 * model auto-colors, so `color=auto` is the default and only `color=src` is
 * ever written; `shaded` is the default and only `wire=1` is written.
 *
 * FORWARD COMPAT (not yet emitted): §6.1's grammar also has scoped terms
 * (`e<id>=…`, `o<pathKey>=…`, `m<idx>=…`) and a `hide=` list (#1250). They
 * slot into the same `d:` token as extra comma-separated entries when S5 (the
 * scoped overrides) and the hidden-list work land — this module widens then,
 * no grammar change for what's written today.
 */


/** The prefix for the display-state token. */
export const HASH_PREFIX_DISPLAY = 'd'


/**
 * The non-default model-scope params for a color + shading pair, or an empty
 * object when both are at their defaults.
 *
 * @param {string} colorMode a {@link ColorMode}
 * @param {string} shadingMode a {@link ShadingMode}
 * @return {object} params like `{color: 'src', wire: '1'}`
 */
export function modelDisplayParams(colorMode, shadingMode) {
  const params = {}
  if (colorMode === ColorMode.SOURCE) {
    params.color = 'src'
  }
  if (shadingMode === ShadingMode.WIREFRAME) {
    params.wire = '1'
  }
  return params
}


/**
 * Write (or clear) the `#d:` token for the current model-scope display state.
 * Clears the whole token when everything is default, so the hash never
 * carries an empty `d:`.
 *
 * @param {object} location window.location
 * @param {string} colorMode a {@link ColorMode}
 * @param {string} shadingMode a {@link ShadingMode}
 */
export function writeModelDisplayHash(location, colorMode, shadingMode) {
  const params = modelDisplayParams(colorMode, shadingMode)
  if (Object.keys(params).length === 0) {
    removeHashParams(location, HASH_PREFIX_DISPLAY)
  } else {
    // includeNames: emit `k=v`, matching the cp: token shape.
    addHashParams(location, HASH_PREFIX_DISPLAY, params, true)
  }
}


/**
 * Parse the model-scope appearance out of the current `#d:` token. Unknown or
 * malformed values are dropped (an axis simply stays unset), so a
 * hand-edited or future-versioned token degrades to "apply what I understand"
 * rather than throwing.
 *
 * @param {object} location window.location
 * @return {object} appearance patch, e.g. `{color, shading}` (may be empty)
 */
export function readModelDisplayHash(location) {
  const token = getHashParams(location, HASH_PREFIX_DISPLAY)
  if (!token) {
    return {}
  }
  const obj = getObjectParams(token)
  const appearance = {}
  if (obj.color === 'src') {
    appearance.color = ColorMode.SOURCE
  } else if (obj.color === 'auto') {
    appearance.color = ColorMode.AUTO
  }
  if (obj.wire === '1') {
    appearance.shading = ShadingMode.WIREFRAME
  } else if (obj.wire === '0') {
    appearance.shading = ShadingMode.SHADED
  }
  return appearance
}
