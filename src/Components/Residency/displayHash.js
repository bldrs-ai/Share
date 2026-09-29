import {
  getHashParams,
  getObjectParams,
  removeHashParams,
  setParamsToHash,
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
 * The token is shared: visibilityHash.js writes the hide / isolate terms
 * (`hide=`, `show=`, `iso=`, #1250) into it too. Each writer owns its keys and
 * goes through {@link mergeDisplayTerms}, which leaves every other key as it
 * found it, so a Display-menu click doesn't drop the hidden list and a hide
 * doesn't drop the colors.
 *
 * FORWARD COMPAT (not yet emitted): §6.1's grammar also has scoped terms
 * (`e<id>=…`, `o<pathKey>=…`, `m<idx>=…`). They slot into the same `d:` token
 * as extra comma-separated entries when S5 (the scoped overrides) lands.
 */


/** The prefix for the display-state token. */
export const HASH_PREFIX_DISPLAY = 'd'


// The order terms are written in, so a token reads the same whichever writer
// touched it last. Keys a newer writer added follow these, as found.
const TERM_ORDER = ['color', 'wire', 'res', 'hide', 'show', 'iso']

// The keys `writeModelDisplayHash` owns.
const MODEL_DISPLAY_KEYS = ['color', 'wire', 'res']


/**
 * Set or drop some of the `#d:` token's terms, keeping the rest. The token is
 * removed once it has no terms, and the hash is only assigned when it
 * actually changes (each assignment is a browser history entry).
 *
 * @param {object} location window.location
 * @param {object} terms key → value string, or null / '' to drop the key
 */
export function mergeDisplayTerms(location, terms) {
  const token = getHashParams(location, HASH_PREFIX_DISPLAY)
  const next = {}
  for (const [key, value] of Object.entries(token ? getObjectParams(token) : {})) {
    // A bare key decodes to 0 and a bare number to an index; neither is a
    // term any writer emits, and re-encoding either would change it.
    if (typeof value === 'string' && !/^\d+$/.test(key)) {
      next[key] = value
    }
  }
  for (const [key, value] of Object.entries(terms)) {
    if (typeof value === 'string' && value !== '') {
      next[key] = value
    } else {
      delete next[key]
    }
  }
  const rank = (key) => {
    const i = TERM_ORDER.indexOf(key)
    return i === -1 ? TERM_ORDER.length : i
  }
  const ordered = Object.fromEntries(
    Object.entries(next).sort(([a], [b]) => rank(a) - rank(b)))
  if (Object.keys(ordered).length === 0) {
    if (token) {
      removeHashParams(location, HASH_PREFIX_DISPLAY)
    }
    return
  }
  // includeNames: emit `k=v`, matching the cp: token shape.
  const hash = setParamsToHash(location.hash, HASH_PREFIX_DISPLAY, ordered, true)
  if (hash !== location.hash) {
    location.hash = hash
  }
}


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
 * Write (or clear) the `#d:` token's model-scope display terms. The token
 * goes once nothing is left in it, so the hash never carries an empty `d:`.
 *
 * @param {object} location window.location
 * @param {object} [appearance] `{color?, shading?, residency?}`
 */
export function writeModelDisplayHash(location, appearance = {}) {
  const params = modelDisplayParams(appearance)
  // Every model-display key is set or dropped, not merged: an axis returning
  // to its default stops being emitted, and a merge would keep it from the
  // previous write — Source+Wireframe -> Auto+Wireframe kept a stale
  // `color=src` and the shared URL restored a different display than the
  // sender saw. Only the other writers' keys (hide / show / iso) are kept.
  mergeDisplayTerms(location, Object.fromEntries(
    MODEL_DISPLAY_KEYS.map((key) => [key, params[key] ?? null])))
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
