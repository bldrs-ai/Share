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


/**
 * Call the given visitorCb on each property in the object.
 * Recurse on a property's value if it is an object.
 *
 * @param {Object<any, any>} obj The object to visit
 * @param {Function} visitorCb Called with visitorCb(obj, propName, value)
 */
export function visitRecursive(obj, visitorCb, seen = new Set) {
  seen.add(obj)
  for (const prop in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, prop)) {
      const val = obj[prop]
      visitorCb(obj, prop, val)
      if (!seen.has(val)) {
        visitRecursive(val, visitorCb, seen)
      }
    }
  }
}


/**
 * Delete this property from the object, recursively.
 *
 * @param {Object<any, any>} obj The object to visit
 * @param {string} propName The property to delete
 */
export function deletePropertyRecursive(obj, propName) {
  visitRecursive(
      obj,
      /**
       * @param {Object<any, any>} o
       * @param {Object<any, any>} k
       * @param {Object<any, any>} v
       */
      (o, k, v) => {
        if (k === propName) {
          if (Array.isArray(o)) {
            o[k] = undefined
          } else {
            delete o[k]
          }
        }
      },
  )
}


/**
 * Delete matching string values from the object, recursively.
 *
 * @param {Object<any, any>} obj The object to visit
 * @param {RegExp} regex The regex to test values with
 */
export function deleteStringValueMatchRecursive(obj, regex) {
  visitRecursive(
      obj,
      /**
       * @param {Object<any, any>} o
       * @param {Object<any, any>} k
       * @param {Object<any, any>} v
       */
      (o, k, v) => {
        if (typeof v === 'string' && v.match(regex)) {
          if (Array.isArray(o)) {
            o[k] = undefined
          } else {
            delete o[k]
          }
        }
      },
  )
}


/**
 * Filter object
 *
 * @param {object} obj
 * @param {Function} callback
 * @return {object}
 */
export function filterObject(obj, callback) {
  return Object.fromEntries(Object.entries(obj).
      filter(([key, val]) => callback(val, key)))
}


/**
 * Clone object in depth
 *
 * @param {object} obj
 * @return {object}
 */
export function deepCloneObject(obj) {
  const clonedObj = JSON.parse(JSON.stringify(obj))
  return clonedObj
}
