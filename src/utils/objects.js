/**
  * TODO: pablo to confirm
  * Delete all properties defined in the given object.
  * @param {Object} obj index of the element in the set
  */
export function deleteProperties(obj) {
  for (const key in target) {
    if (Object.prototype.hasOwnProperty.call(target, key)) {
      delete target[key]
    }
  }
}
