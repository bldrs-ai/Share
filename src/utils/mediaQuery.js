import {isObject} from './objects'


/**
 * Recursively replace MOBILE_WIDTH in object with its given value.
 *
 * @param {number} mobileWidth
 * @param {object} obj
 * @return {object} The same object, potentially with some properties changed.
 */
export function preprocessMediaQuery(mobileWidth, obj) {
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      let val = obj[key]
      if (isObject(val)) {
        // Depth-first recursion
        val = preprocessMediaQuery(mobileWidth, val)
      }
      const keyStr = `${key }`
      if (keyStr.includes('MOBILE_WIDTH')) {
        delete obj[key]
        const newKey = key.replace('MOBILE_WIDTH', `${mobileWidth }px`)
        obj[newKey] = val
      }
    }
  }
  return obj
}
