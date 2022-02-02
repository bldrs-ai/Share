/** If cond is true, do nothing.  Otherwise, throw error with msg. */
export function assert(cond, msg) {
  if (cond) {
    return;
  }
  throw new Error(msg);
}
