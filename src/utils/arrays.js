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
 * @param {Array} a
 * @param {Array} b
 * @return {Array|undefined}
 */
export function arrayDiff(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    const diff = a.concat(b).filter((e, i, array) => {
      // Check if the element is appearing only once
      return array.indexOf(e) === array.lastIndexOf(e)
    })
    return diff
  }
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
