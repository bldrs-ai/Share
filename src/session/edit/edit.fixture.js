/* eslint-disable no-magic-numbers */
/**
 * Shared test helpers for `src/viewer/edit/`.
 */


/**
 * A deterministic byte source for `mintGlobalId({randomBytes})`: mulberry32
 * over a 32-bit seed, so a test that mints gets the same ids every run.
 *
 * @param {number} seed
 * @return {function(number): Uint8Array}
 */
export function seededRandomBytes(seed) {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) & 0xFF
  }
  return (length) => {
    const out = new Uint8Array(length)
    for (let i = 0; i < length; i++) {
      out[i] = next()
    }
    return out
  }
}
