/**
 * If cond is true, do nothing.  Otherwise, throw error with msg.
 * @param {string} cond path to the button icon
 * @param {string} msg path to the button icon
 */
export function assert(cond, msg) {
  if (cond) {
    return
  }
  throw new Error(msg)
}
