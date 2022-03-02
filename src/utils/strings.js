/**
 * Convert string to integer.
 * @param {string} s Input string.
 * @return {Number} integer.
 */
export function stoi(s) {
  const i = parseInt(s)
  if (!isFinite(i)) {
    throw new Error('Expected integer, got: ' + s)
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
