/**
 * Delete all properties defined in the given object.
 *
 * @param {Object<any, any>} obj The object whose properties to delete.
 */
export function deleteProperties(obj) {
  Object.keys(obj).forEach((key) => delete obj[key])
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
