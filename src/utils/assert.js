/**
 * If cond is true, do nothing.  Otherwise, throw error with msg.
 *
 * @param {string} cond path to the button icon.
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
 * Equivalent to calling assertDefined on each parameter.
 * @param {array} args Variable length arguments to assert are defined.
 * @return {array} args That was passed in
 *
 * @throws If any argument is not defined.
 */
export function assertDefined(...args) {
  for (const ndx in args) {
    if (Object.prototype.hasOwnProperty.call(args, ndx)) {
      const arg = args[ndx]
      assert(arg !== null && arg !== undefined, `Arg ${ndx} is not defined`)
    }
  }
  return args
}


/**
 * @param {boolean} arg Value to test
 * @return {boolean} The argument
 */
export function assertDefinedBoolean(arg) {
  if (arg) {
    return true
  }
  return false
}
