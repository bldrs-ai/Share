/**
 * Z-fight probe flags (diagnostic previews only — see Share PR #1654).
 *
 * Captured once at module evaluation, NOT at call time: the router
 * rewrites the URL shortly after boot and strips unknown query params,
 * so a read at model-open time (batched builder construction, camera
 * fit) sees an empty search string and the flag silently never takes.
 * Bundle evaluation happens on the initial page load while the user's
 * original URL is still live.
 */

/**
 * @param {string} name query parameter name
 * @return {string|null} raw value, null when absent or no window (jest)
 */
function readParam(name) {
  try {
    return new URLSearchParams(window.location.search).get(name)
  } catch (e) {
    return null
  }
}

/**
 * ?bakeXforms=1 — bake placement transforms into per-instance geometry
 * copies (CPU double precision, identity instance matrices) in the
 * incremental batched builder. Also bypasses the GLB cache in the
 * loader: a cache HIT would swap to the GLB pipeline and the builder
 * (and this probe) would never run.
 */
export const ZFIGHT_BAKE_XFORMS = readParam('bakeXforms') === '1'

/**
 * ?nearMin=N — near-plane floor override for depth-strategy A/B tests
 * (meaningful with ?logDepth=0). Production floor when absent/invalid.
 */
const PROD_NEAR_FLOOR = 0.1
const parsedNearMin = Number(readParam('nearMin') ?? NaN)
export const ZFIGHT_NEAR_FLOOR =
  Number.isFinite(parsedNearMin) && parsedNearMin > 0 ? parsedNearMin : PROD_NEAR_FLOOR

/**
 * ?depth16=1 — force offscreen depth renderbuffers back to
 * DEPTH_COMPONENT16, the format three 0.135 allocated for the
 * postprocessing composer's target (measured: the May-era stable build
 * ran D16; the three 0.184 upgrade moved it to DEPTH_COMPONENT24).
 * Coarse quantization makes sub-mm coplanar interfaces tie uniformly
 * so draw order resolves them stably; D24 resolves fine enough that
 * per-fragment log-depth rounding noise picks a random winner per
 * pixel. Applied at module evaluation, before any GL context exists.
 */
export const ZFIGHT_DEPTH16 = readParam('depth16') === '1'
if (ZFIGHT_DEPTH16) {
  try {
    const DEPTH_COMPONENT24 = 0x81A6
    const DEPTH_COMPONENT16 = 0x81A5
    const proto = WebGL2RenderingContext.prototype
    const origSingle = proto.renderbufferStorage
    const origMulti = proto.renderbufferStorageMultisample
    const remap = (internalformat) => {
      if (internalformat === DEPTH_COMPONENT24) {
        // eslint-disable-next-line no-console
        console.log('[zfight-probe] depth16=1: DEPTH_COMPONENT24 -> DEPTH_COMPONENT16')
        return DEPTH_COMPONENT16
      }
      return internalformat
    }
    proto.renderbufferStorage = function(target, internalformat, width, height) {
      return origSingle.call(this, target, remap(internalformat), width, height)
    }
    proto.renderbufferStorageMultisample = function(target, samples, internalformat, width, height) {
      return origMulti.call(this, target, samples, remap(internalformat), width, height)
    }
  } catch (e) {
    console.warn('[zfight-probe] depth16 patch failed', e)
  }
}
