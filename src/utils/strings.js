/**
 * Convert string to integer.
 * @param {string} s srtring.
 * @return {Number} integer.
 */
export function stoi(s) {
  const i = parseInt(s)
  if (!isFinite(i)) {
    throw new Error('Expected integer, got: ' + s)
  }
  return i
}
