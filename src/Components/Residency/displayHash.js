import {
  getHashParams,
  getObjectParams,
  removeHashParams,
  setHashParams,
} from '../../utils/location'
import {ColorMode} from '../../viewer/display/colorMode'
import {
  RESIDENCY_DEFAULT,
  RESIDENCY_FULL,
  isDefaultResidency,
  residencyOrDefault,
} from '../../viewer/display/residencyMode'
import {ShadingMode} from '../../viewer/display/shadingMode'
import {ResidencyMetric} from '../../viewer/residency/ResidencyController'


/**
 * displayHash — the `#d:` permalink token for view-140 display state (S7,
 * design/new/model-display-controls.md §6).
 *
 * Follows the `cp:` convention (keyed `k=v` pairs joined by `,`, tokens by
 * `;`, via utils/location). This slice serializes the **model-scope** axes
 * that exist today — every setting the Display menu offers:
 *
 *   #d:color=src           whole model in its source colors
 *   #d:wire=1              whole model wireframe
 *   #d:res=40              40% resident, default (occupancy) priority
 *   #d:res=40.memory       40% resident, memory-budget priority
 *   #d:res=100.distance    fully resident, distance priority
 *   #d:color=src,wire=1,res=40   all three
 *
 * `res` follows §6.1's `res=<pct>[.<metric>]`: the metric is appended only
 * when it isn't the default, and spelled out (`memory`, not `m`) so parsing
 * is a membership test against {@link ResidencyMetric} and a hand-edited
 * token is readable. The `.` separator is free here — `,` separates terms and
 * `=` separates key from value, so neither is available.
 *
 * Only NON-default terms serialize, so a model in its default display
 * contributes no token at all and the common share link stays as short as it
 * is today (§6.1). "Default" here is the app's default *display*: a colorless
 * model auto-colors, so `color=auto` is the default and only `color=src` is
 * ever written; `shaded` is the default and only `wire=1` is written; 100% +
 * occupancy is the default residency and neither half is written alone.
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
 * The non-default model-scope params for an appearance, or an empty object
 * when every axis is at its default.
 *
 * Takes the whole appearance rather than one positional argument per axis so
 * it stays symmetric with {@link readModelDisplayHash} (which returns one) and
 * so the next axis — opacity, `hidden` (#1250) — widens the object instead of
 * the signature.
 *
 * @param {object} [appearance] `{color?, shading?, residency?}`
 * @return {object} params like `{color: 'src', wire: '1', res: '40.memory'}`
 */
export function modelDisplayParams(appearance = {}) {
  const params = {}
  if (appearance.color === ColorMode.SOURCE) {
    params.color = 'src'
  }
  if (appearance.shading === ShadingMode.WIREFRAME) {
    params.wire = '1'
  }
  if (!isDefaultResidency(appearance.residency)) {
    const {percent, metric} = residencyOrDefault(appearance.residency)
    // Values are STRINGS deliberately: getEncodedParam emits a bare key for a
    // falsy value, so a numeric 0 percent would serialize as `res` with no
    // `=0` and read back as "no residency term".
    params.res = metric === RESIDENCY_DEFAULT.metric ?
      `${percent}` :
      `${percent}.${metric}`
  }
  return params
}


/**
 * Write (or clear) the `#d:` token for the current model-scope display state.
 * Clears the whole token when everything is default, so the hash never
 * carries an empty `d:`.
 *
 * @param {object} location window.location
 * @param {object} [appearance] `{color?, shading?, residency?}`
 */
export function writeModelDisplayHash(location, appearance = {}) {
  const params = modelDisplayParams(appearance)
  if (Object.keys(params).length === 0) {
    removeHashParams(location, HASH_PREFIX_DISPLAY)
  } else {
    // setHashParams (remove-then-add), NOT addHashParams: add merges into
    // the existing token, so an axis returning to its default (which stops
    // being emitted) would survive from the previous write — e.g.
    // Source+Wireframe -> Auto+Wireframe kept a stale `color=src` and the
    // shared URL restored a different display than the sender saw. The
    // whole token is the value; replace it. includeNames: emit `k=v`,
    // matching the cp: token shape.
    setHashParams(location, HASH_PREFIX_DISPLAY, params, true)
  }
}


/**
 * Parse the residency term out of a `#d:` token's params.
 *
 * @param {object} obj decoded token params
 * @return {object|undefined} `{percent?, metric?}`, or undefined when there's
 *   nothing usable
 */
function readResidency(obj) {
  // A bare `res` with no `=` decodes to the NUMBER 0 in getObjectParams; the
  // typeof guard is what keeps that from reading as "0% resident", i.e. an
  // entirely evicted model from a token that said nothing.
  if (typeof obj.res !== 'string') {
    return undefined
  }
  const [percentPart, metricPart] = obj.res.split('.')
  const residency = {}
  const percent = Number(percentPart)
  if (percentPart !== '' && Number.isFinite(percent) &&
      percent >= 0 && percent <= RESIDENCY_FULL) {
    residency.percent = Math.round(percent)
  }
  if (Object.values(ResidencyMetric).includes(metricPart)) {
    residency.metric = metricPart
  }
  return Object.keys(residency).length > 0 ? residency : undefined
}


/**
 * Parse the model-scope appearance out of the current `#d:` token. Unknown or
 * malformed values are dropped (an axis simply stays unset), so a
 * hand-edited or future-versioned token degrades to "apply what I understand"
 * rather than throwing. That tolerance is per-half within `res` too: a good
 * percent with a junk metric keeps the percent.
 *
 * @param {object} location window.location
 * @return {object} appearance patch, e.g. `{color, shading, residency}` (may
 *   be empty, and `residency` may itself be partial)
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
  const residency = readResidency(obj)
  if (residency) {
    appearance.residency = residency
  }
  return appearance
}
