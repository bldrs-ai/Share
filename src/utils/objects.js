/**
  * TODO: pablo to confirm
  * Delete properties
  * @param {Object} target index of the element in the set
  */
export function deleteProperties(target) {
  for (const key in target) {
    if (Object.prototype.hasOwnProperty.call(target, key)) {
      delete target[key]
    }
  }
}
