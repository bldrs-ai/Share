/**
 * Delete all properties defined in the given object.
 *
 * @param {object} obj The object whose properties to delete.
 */
export function deleteProperties(obj) {
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      delete obj[key]
    }
  }
}


/**
 * @param {object} obj
 * @return {boolean} True iff val is an object
 */
export function isObject(obj) {
  // Search for Daan in:
  // https://stackoverflow.com/questions/8511281/check-if-a-value-is-an-object-in-javascript
  return obj === Object(obj) && Object.prototype.toString.call(obj) !== '[object Array]'
}


/**
 * @param {Array} array
 * @param {string} key
 * @return {Array} array sorted according to the key
 */
export function sortObjectsByKey(array, key) {
  return array.sort(function(a, b) {
    const x = a[key]
    const y = b[key]
    return ((x < y) ? -1 : ((x > y) ? 1 : 0))
  })
}
