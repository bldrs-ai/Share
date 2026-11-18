/**
 * How long a continuous gesture must pause before the URL hash is written
 * for it. One value for every permalink writer, so the camera and the cut
 * planes settle into the URL on the same beat: the live camera link
 * (Camera/liveCameraLink.js, after camera-controls' damping settles) and a
 * cut plane's drag (CutPlaneMenu.jsx, owner on #2171). Short enough that a
 * link copied a moment after the gesture carries it; long enough that a drag
 * or a wheel spin isn't a URL write per event. Both write in place
 * (utils/location.js#replaceHashParams), so it's not a history entry either.
 */
export const HASH_DEBOUNCE_WAIT_MS = 250


/**
 * Trailing-edge debounce: `fn` runs once, `waitMs` after the last call, with
 * that call's arguments.
 *
 * @param {Function} fn
 * @param {number} waitMs
 * @return {Function} the debounced function, with `cancel()` (drop a pending
 *   call) and `flush()` (run a pending call now)
 */
export function debounce(fn, waitMs) {
  let timer = null
  let pendingArgs = null
  const run = () => {
    timer = null
    const args = pendingArgs
    pendingArgs = null
    fn(...args)
  }
  const debounced = (...args) => {
    pendingArgs = args
    clearTimeout(timer)
    timer = setTimeout(run, waitMs)
  }
  debounced.cancel = () => {
    clearTimeout(timer)
    timer = null
    pendingArgs = null
  }
  debounced.flush = () => {
    if (timer !== null) {
      clearTimeout(timer)
      run()
    }
  }
  return debounced
}
