/**
 * @param {number} num Number to convert to float
 * @return {number} The number as a float
 */
export function numToFloat(num) {
  return parseFloat(num);
}

/**
 * @param {number} num Number to round
 * @param {number} numDigits Number of digits to round to, default = 0
 * @return {number} The rounded number
 */
export function round(num, numDigits = 0) {
  return numToFloat(numToFloat(num).toFixed(numDigits));
}

/**
 * @param {number} x X coordinate
 * @param {number} y y coordinate
 * @param {number} z Z coordinate
 * @param {number} numDigits Number of digits to round to, default = 0
 * @return {Array} Array of [x, y, z]
 */
export function roundCoord(x, y, z, numDigits = 0) {
  return [x, y, z].map((n) => round(n, numDigits));
}
