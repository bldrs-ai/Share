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
