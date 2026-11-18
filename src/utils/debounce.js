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


/**
 * The page's current history entry, as react-router's history (v5) keys it:
 * `history.state.key`, which `replaceState(history.state, …)` keeps
 * (utils/location.js#replaceHashParams) and every push or pop changes. Null
 * for an entry nothing keyed (a bare `location.hash =` write, a page
 * without the router).
 *
 * @return {string|null}
 */
export function currentHistoryEntryKey() {
  try {
    return window.history.state?.key ?? null
  } catch {
    return null
  }
}


/**
 * A `debounce` for a value streamed into the page's URL in place (the live
 * camera, a dragged cut plane): the call runs only if the history entry it
 * was made in is still the page's when it fires (or is flushed). Otherwise it
 * is dropped.
 *
 * Why: the write goes to whatever URL is the page's when it lands
 * (replaceHashParams reads `window.location` then), and a debounce lands
 * `waitMs` after the gesture. A Back, a Forward or an in-app open of another
 * model in that window (open-205, #2021: with `?feature=spaModelNav` they all
 * stay in this document, and the viewer that streams is disposed only a few
 * renders after the URL has changed) made the PREVIOUS entry's camera or
 * planes the new entry's: the link to B carried A's pose, and Back to B later
 * applied it. Within one entry nothing changes: each call re-reads the entry,
 * so a gesture still lands where the user is.
 *
 * @param {Function} fn
 * @param {number} waitMs
 * @param {function(): (string|null)} [entryKey] the current entry, for tests
 * @return {Function} the debounced function, with `cancel()` and `flush()`
 */
export function debounceInHistoryEntry(fn, waitMs, entryKey = currentHistoryEntryKey) {
  let entry = null
  const debounced = debounce((...args) => {
    if (entryKey() === entry) {
      fn(...args)
    }
  }, waitMs)
  const inEntry = (...args) => {
    entry = entryKey()
    debounced(...args)
  }
  inEntry.cancel = debounced.cancel
  inEntry.flush = debounced.flush
  return inEntry
}
