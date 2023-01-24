import {floatStrTrim} from './strings'

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


/**
 * @param {number} x X coordinate
 * @param {number} y y coordinate
 * @param {number} z Z coordinate
 * @param {number} numDigits Number of digits to round to, default = 0
 * @return {Array<number>} Array of [x, y, z]
 */
export function roundCoord(x, y, z, numDigits = 3) {
  return [x, y, z].map((n) => floatStrTrim(n, numDigits))
}
