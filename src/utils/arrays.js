/**
 * check if two arrays are equal.
 *
 * @param {object[]} a
 * @param {object[]} b
 * @return {boolean}
 */
export function unsortedArraysAreEqual(a, b) {
  return a.length === b.length && a.every((x) => b.includes(x))
}

