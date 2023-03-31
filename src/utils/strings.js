import {getHashParamsFromHashStr} from './location'

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
 * Check if the value is a number
 *
 * @param {any} value to check
 * @return {boolean} true if the value is a number
 */
export function isNumber(value) {
  value = value.toString()
  const strNumericValue = parseFloat(value).toString()
  return strNumericValue === value && strNumericValue !== 'NaN'
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
 * @param {string} str
 * @param {string} prefix
 * @return {Array<string>} url matches
 */
export function findMarkdownUrls(str, prefix) {
  const markdownUrls = findUrls(str)
      .filter((url) => {
        if (url.indexOf('#') === -1) {
          return false
        }
        const encoded = getHashParamsFromHashStr(
            url.substring(url.indexOf('#') + 1),
            prefix)
        return !!encoded
      })
  return markdownUrls
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


export const UUID_REGEX = new RegExp(/[0-9A-Z]+-[0-9A-Z]+-[0-9A-Z]+-[0-9A-Z]+-[0-9A-Z]+/)


/**
 * @param {string} str The string to match
 * @return {boolean} True iff str looks like ADD77535-D1B6-49A9-915B-41343B08BF83
 */
export function matchUuid(str) {
  return str.match(UUID_REGEX) !== null
}
