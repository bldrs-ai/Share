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
