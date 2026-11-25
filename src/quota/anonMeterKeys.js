/**
 * Which model keys a signed-out visitor's remote-load meter counts
 * (design/new/quotas.md §"Anonymous metering"). THE ONE rule, used by the
 * page before it asks (`quota/anonMeter.js`), by the `meter` function, which
 * refuses to count anything else whatever the page sends, and by its MSW mock.
 *
 * A remote load is a model from GitHub (`/v/gh/`), Google Drive (`/v/g/`)
 * or a URL (`/v/u/`). Not metered: local files, the hosted demo and other
 * Bldrs-hosted models (`/v/p/`), and the sample models, which are GitHub
 * routes but are what a visitor is offered to try first.
 *
 * The key is the model's slot key (`modelSlotKey.js`: the GitHub path
 * without its element path, `<appPrefix>/v/g/<fileId>`, and for a URL a
 * SHA-256 digest, never the URL), so one model is one key however it was
 * opened. The server keeps only a keyed digest of it, to tell a reopen from
 * a new model; never the key.
 *
 * Dependency-free and imported with its `.js` extension by the functions,
 * which load under plain Node ESM, like `limits.js`.
 */
import {SAMPLE_MODELS} from '../Components/Open/sampleModelRoster.js'
import {ANON_METERED_ROUTE_KINDS} from './limits.js'


/** The longest key the meter accepts (`exportSlots.js#MODEL_KEY_MAX_LENGTH`'s bound). */
export const ANON_METER_KEY_MAX_LENGTH = 1024

/** The samples' keys: their share paths without the `#c:` camera. */
const SAMPLE_KEYS = new Set(SAMPLE_MODELS.map((sample) => sample.path.split('#')[0]))


/**
 * @param {*} key a model's slot key
 * @return {?string} its view-route kind, the segment after the FIRST `/v/`
 */
export function anonRouteKind(key) {
  if (typeof key !== 'string') {
    return null
  }
  return (/\/v\/([^/?#]+)\//.exec(key) || [])[1] ?? null
}


/**
 * @param {*} key a model's slot key
 * @return {boolean} whether a signed-out open of it counts as a remote load
 */
export function isAnonMeteredKey(key) {
  return typeof key === 'string' && key.length <= ANON_METER_KEY_MAX_LENGTH &&
    ANON_METERED_ROUTE_KINDS.includes(anonRouteKind(key)) && !isSampleKey(key)
}


/**
 * @param {string} key
 * @return {boolean} whether it is one of the Samples tab's models
 */
export function isSampleKey(key) {
  return SAMPLE_KEYS.has(key.split('#')[0])
}
