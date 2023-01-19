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
      assert(arg !== null && arg !== undefined, `Arg ${ndx} is not defined`)
    }
  }
  if (args.length === 1) {
    return args[0]
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
