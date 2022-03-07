/**
 * @param {Number} num Number to convert to float
 * @return {Number} The number as a float
 */
export function numToFloat(num) {
  return parseFloat(num)
}


/**
 * @param {Number} num Number to round
 * @param {Number} numDigits Number of digits to round to, default = 0
 * @return {Number} The rounded number
 */
export function round(num, numDigits = 0) {
  return numToFloat(numToFloat(num).toFixed(numDigits))
}


/**
 * @param {Number} x X coordinate
 * @param {Number} y y coordinate
 * @param {Number} z Z coordinate
 * @param {Number} numDigits Number of digits to round to, default = 0
 * @return {Array} Array of [x, y, z]
 */
export function roundCoord(x, y, z, numDigits = 0) {
  return [x, y, z].map((n) => round(n, numDigits))
}
