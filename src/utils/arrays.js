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

/**
 * check if two arrays are equal.
 *
 * @param {object[]} array
 * @param {object} element to remove
 * @return {object[]} new array after removing the element
 */
export function arrayRemove(arr, element) {
  return arr.filter(function(ele) {
    return ele !== element
  })
}
