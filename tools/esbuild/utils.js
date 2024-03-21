/** Wrapper for logging to allow disable from `jest test-tools`. */
export function log(msg) {
  if (process.env.NO_LOG === 'true') {
    return
  }
  // eslint-disable-next-line no-console
  console.log(msg)
}
