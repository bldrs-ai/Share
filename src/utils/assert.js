/**
 * If cond is true, do nothing.  Otherwise, throw error with msg.
 *
 * @param {boolean} cond Test condition.
 * @param {string} msg path to the button icon.
 * @throws If the condition is false.
 */
export function assert(cond, msg) {
  if (cond) {
    return
  }
  throw new Error(msg)
}


/**
 * @param {any} value Value to test
 * @return {boolean} True if value is defined and not null
 */
export function isDefinedAndNotNull(value) {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (!isDefinedAndNotNull(value[i])) {
        return false
      }
    }
  }

  return value !== null && value !== undefined
}


/**
 * @param {any} args Variable length arguments to assert are defined and not null.
 * @return {boolean} True if all arguments are defined and not null.
 */
export function areDefinedAndNotNull(...args) {
  for (const ndx in args) {
    if (Object.prototype.hasOwnProperty.call(args, ndx)) {
      const arg = args[ndx]
      if (!isDefinedAndNotNull(arg)) {
        return false
      }
    }
  }
  return true
}


/**
 * Equivalent to calling assertDefined on each parameter.
 *
 * @param {any} args Variable length arguments to assert are defined.
 * @return {any} args That was passed in
 * @throws If any argument is not defined.
 */
export function assertDefined(...args) {
  for (const ndx in args) {
    if (Object.prototype.hasOwnProperty.call(args, ndx)) {
      const arg = args[ndx]
      if (!isDefinedAndNotNull(arg)) {
        throw new Error(`Arg ${ndx} is not defined or is null (zero-based index)`)
      }
    }
  }
  return true
}


/**
 * @param {boolean} arg Value to test
 * @return {boolean} The argument
 * @throws If the argument is not a boolean
 */
export function assertDefinedBoolean(arg) {
  if (arg === undefined) {
    throw new Error('Argument must be defined')
  }
  if (arg === null) {
    throw new Error('Argument must be not null')
  }
  if (typeof arg !== 'boolean') {
    throw new Error('Argument must be a boolean')
  }
  return arg
}


/**
 * @param {any} arrays Variable length arguments to assert are defined.
 * @return {Array<Array<any>>} The arrays
 */
export function assertArraysEqualLength(...arrays) {
  if (arrays.length <= 1) {
    throw new Error('Expected multiple arrays')
  }
  const arrLength = arrays[0].length
  for (const ndx in arrays) {
    if (Object.prototype.hasOwnProperty.call(arrays, ndx)) {
      const array = arrays[ndx]
      assertDefined(array)
      assert(arrLength === array.length, `Array ${ndx} has unexpected length != ${array.length}`)
    }
  }
  return arrays
}


/**
 * Argument must have typeof(n) === 'number' && isFinite(n)
 *
 * @param {number} n
 */
export function assertNumber(n) {
  if (!(typeof(n) === 'number' && isFinite(n))) {
    throw new Error(`Argument must be a number and finite (for ${n})`)
  }
}


/**
 * Argument must have typeof(o) === 'object'
 *
 * @param {object} o
 */
export function assertObject(o) {
  if (typeof(o) !== 'object') {
    throw new Error('Argument must be an object')
  }
}


/**
 * Argument must have typeof(arg) === 'string'
 *
 * @param {string} s
 */
export function assertString(s) {
  if (typeof(s) !== 'string') {
    throw new Error('Argument must be a string')
  }
}


/**
 * String must be defined and not the empty string.
 *
 * @param {string} str
 */
export function assertStringNotEmpty(str) {
  if (str === undefined || str === null || str === '') {
    throw new Error('String must be defined and not empty')
  }
}


/**
 * Checks that each named param is defined and returns the object for chaining.
 *
 * @param {any} obj Variable length arguments to assert are defined.
 * @param {Array<string>} keys That was passed in
 * @return {any} obj That object that was passed in, if valid
 * @throws If any argument is not defined.
 */
export function assertValues(obj, keys) {
  const undefinedKeys = keys.filter((key) => obj[key] === undefined)
  if (undefinedKeys.length > 0) {
    throw new Error(`The following keys are undefined:
      ${undefinedKeys.join(', ')}`)
  }
  return obj
}
