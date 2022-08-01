/**
 * Convert string to integer.
 * @param {string} s Input string.
 * @return {Number} integer.
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
 * @param {string} str To convert
 * @return {string} The converted result
 */
export function toKey(str) {
  return str.replace(/[^a-zA-Z0-9]+/, '')
}


/**
 * @param {string} str
 * @return {array} url matches or null if no matches
 */
export function findUrls(str) {
  // TODO(pablo): maybe support example.com/asdf
  const urlRegex = new RegExp(/https?:\/\/[^/ ()]+(?:\/[^ ()]*)?/gi)
  return str.match(urlRegex)
}
