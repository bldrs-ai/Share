/**
 * Convert string to integer.
 *
 * @param {string} s Input string.
 * @return {number} integer.
 */
export function stoi(s) {
  const i = parseInt(s)
  if (!isFinite(i)) {
    throw new Error(`Expected integer, got: ${s}`)
  }
  return i
}


/**
 * Create a simple key by removing any non alpha-numeric character
 *
 * @param {string} str To convert
 * @return {string} The converted result
 */
export function toKey(str) {
  return str.replace(/[^a-zA-Z0-9]+/, '')
}


/**
 * Check if the string is a number
 *
 * @param {string} str to check
 * @return {boolean} true if the string is a number
 */
export function isNumeric(str) {
  if (typeof str !== 'string') {
    throw new Error('Expected a string')
  }
  return !isNaN(parseFloat(str))
}


/**
 * @param {string} str
 * @return {Array<string>} url matches
 */
export function findUrls(str) {
  // TODO(pablo): maybe support example.com/asdf
  const urlRegex = new RegExp(/https?:\/\/[^/ ()]+(?:\/[^ ()]*)?/gi)
  const urls = str.match(urlRegex)
  if (urls === null) {
    return []
  }
  return urls.filter((url) => {
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  })
}


/**
 * Convert a string-encoded float to a truncated float, of fixed-length `len` or no decimal point expansion
 * - '0' -> 0
 * - '12.34567' -> 12.346
 * - '12.340' -> 12.34
 * - '12.300' -> 12.3
 * - '12.000' -> 12
 *
 * @param {string|number} str
 * @param {number} floatDigits
 * @return {number} float
 */
export function floatStrTrim(str, floatDigits = 3) {
  let floatStr
  if (typeof str === 'string') {
    floatStr = parseFloat(str)
  } else {
    floatStr = str
  }
  if (!floatStr) {
    floatStr = 0
  }
  const val = Number(floatStr.toFixed(floatDigits))
  if (!isFinite(val)) {
    throw new Error('Parameter is invalid.')
  }
  return val
}
