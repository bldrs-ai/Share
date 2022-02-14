/** If cond is true, do nothing.  Otherwise, throw error with msg. */
export function assert(cond, msg) {
  if (cond) {
    return
  }
  throw new Error(msg)
}


export function assertDefined(a, b, c) {
  for (let ndx in arguments) {
    const arg = arguments[ndx];
    assert(arg !== null && arg !== undefined, `Arg ${ndx} is not defined`);
  }
}
