/**
 * @param {number|string} num Number to round
 * @param {number} numDigits Number of digits to round to, default = 0
 * @return {number} The rounded number
 */
export function round(num, numDigits = 0) {
  /** @type {number} */
  let n
  if (typeof num === 'string') {
    n = parseFloat(num)
  } else {
    n = num
  }
  return parseFloat(n.toFixed(numDigits))
}


// Decimal places kept at building scale, and significant figures kept
// once a coordinate falls below that quantum. See roundCoordComponent.
export const COORD_DECIMALS = 3
export const COORD_SIG_DIGITS = 6


/**
 * Round one coordinate for URL serialization, at any model scale.
 *
 * Fixed-decimal rounding is an *absolute* quantization, and so is wrong
 * for the same reason an absolute camera near plane was (#1742): conway
 * emits true-scale geometry, so on a millimetre part every coordinate
 * sits inside the 3-decimal quantum. Camera position and target both
 * round to (0,0,0) and the permalink restores a degenerate camera;
 * cut-plane offsets all round to ~0 and the planes snap to the centre.
 *
 * Significant-digit rounding is scale-invariant, but on its own it
 * coarsens large site coordinates that fixed decimals used to keep
 * (12345.6789 -> 12345.7). So compute both and keep whichever landed
 * closer to the input: fixed decimals win at building scale — which
 * also keeps URLs short — and significant digits take over exactly
 * where fixed decimals would have collapsed the value.
 *
 * Degenerate inputs keep floatStrTrim's old contract (0/NaN/'' -> 0,
 * non-finite throws) so this stays a drop-in for the callers it
 * replaces.
 *
 * @param {number|string} num Coordinate to round
 * @param {number} numDigits Decimal places, default = COORD_DECIMALS
 * @param {number} sigDigits Significant figures, default = COORD_SIG_DIGITS
 * @return {number} The rounded coordinate
 */
export function roundCoordComponent(num, numDigits = COORD_DECIMALS, sigDigits = COORD_SIG_DIGITS) {
  const n = typeof num === 'string' ? parseFloat(num) : num
  if (!n) {
    return 0
  }
  if (!isFinite(n)) {
    throw new Error('Parameter is invalid.')
  }
  const fixed = Number(n.toFixed(numDigits))
  const significant = Number(n.toPrecision(sigDigits))
  return Math.abs(n - fixed) <= Math.abs(n - significant) ? fixed : significant
}


/**
 * @param {number} x X coordinate
 * @param {number} y y coordinate
 * @param {number} z Z coordinate
 * @param {number} numDigits Number of digits to round to, default = 3
 * @return {Array<number>} Array of [x, y, z]
 */
export function roundCoord(x, y, z, numDigits = COORD_DECIMALS) {
  return [x, y, z].map((n) => roundCoordComponent(n, numDigits))
}
