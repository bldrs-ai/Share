/**
 * Delete all properties defined in the given object.
 * @param {Object} obj The object whose properties to delete.
 */
export function deleteProperties(obj) {
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      delete obj[key]
    }
  }
}
