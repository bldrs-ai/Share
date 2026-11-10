/**
 * Schedules the hover pick — `ShareViewer#highlightIfcItem`, a raycast and a
 * preselection repaint — off the window's mousemove events.
 *
 * Mousemove fires at the pointer's rate (60-120 Hz, more on some mice), and a
 * hover pick on a large batched model was the main thread's largest cost
 * while the pointer moved (a trace of PSB on a GLB cache hit: 1.7 s of
 * mousemove handlers in 16 s, one of them 99 ms). The instance tree
 * (`ifc/batchedInstanceBvh.js`) takes most of a pick's cost away once it is
 * built; this bounds what is left, and what a pick costs before it is:
 *
 *  - **Not while dragging.** A drag orbits the camera, and nothing hovered
 *    survives it.
 *  - **Not when the pointer hasn't moved over the canvas.** The canvas
 *    position the ray is cast from only changes on the CANVAS's mousemove
 *    (`three/context/mouse.js`), while this listens on the window, so
 *    moving over a drawer or the NavTree re-cast the same ray, at the same
 *    cost, for the same answer.
 *  - **At most once per `MIN_INTERVAL_MS`, and less often when picks
 *    are dear.** After each pick the interval becomes `COST_FACTOR`
 *    times what it took (capped at `MAX_INTERVAL_MS`), so hover can
 *    take at most about 1 / (1 + COST_FACTOR) of the main thread however
 *    slow a pick is, and the frames between picks are left to the renderer.
 *  - **With a trailing pick.** A move that lands inside the interval is
 *    picked when it ends, so the highlight settles on where the pointer
 *    stopped rather than where it was one interval earlier.
 */


/** The fastest hover is sampled: 30 a second, as before. */
export const MIN_INTERVAL_MS = 33

/** The slowest: a pick that slow is a bug, but hover should still answer. */
export const MAX_INTERVAL_MS = 500

/** Interval as a multiple of the last pick's cost (see module doc). */
export const COST_FACTOR = 4


/**
 * @param {object} deps
 * @param {Function} deps.pick `() => void`, the hover pick
 * @param {Function} deps.isDragging `() => boolean`
 * @param {Function} deps.pointer `() => ({x, y})|null`, the canvas's
 *   normalized pointer; null when the viewer has none, in which case every
 *   event counts as a move
 * @param {Function} [deps.now] ms clock
 * @param {Function} [deps.setTimer] `(fn, ms) => handle`
 * @param {Function} [deps.clearTimer] `(handle) => void`
 * @return {{onMove: Function, dispose: Function}} `onMove` is the
 *   mousemove listener; `dispose` drops a pending trailing pick
 */
export function createHoverPicker({
  pick,
  isDragging,
  pointer,
  now = () => performance.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (handle) => clearTimeout(handle),
}) {
  let lastPickAt = -Infinity
  let interval = MIN_INTERVAL_MS
  let lastX = NaN
  let lastY = NaN
  let trailing = null

  /** @return {boolean} whether the pointer is where the last pick saw it */
  function unmoved() {
    const p = pointer()
    return p !== null && p !== undefined && p.x === lastX && p.y === lastY
  }

  /** Pick now, and time it. */
  function run() {
    const p = pointer()
    lastX = p?.x ?? NaN
    lastY = p?.y ?? NaN
    const start = now()
    lastPickAt = start
    try {
      pick()
    } finally {
      const cost = now() - start
      interval = Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, cost * COST_FACTOR))
    }
  }

  /** The trailing pick, when its interval is up. */
  function onTrailing() {
    trailing = null
    if (!isDragging() && !unmoved()) {
      run()
    }
  }

  return {
    onMove() {
      if (isDragging() || unmoved()) {
        return
      }
      const wait = interval - (now() - lastPickAt)
      if (wait > 0) {
        if (trailing === null) {
          trailing = setTimer(onTrailing, wait)
        }
        return
      }
      if (trailing !== null) {
        clearTimer(trailing)
        trailing = null
      }
      run()
    },
    dispose() {
      if (trailing !== null) {
        clearTimer(trailing)
        trailing = null
      }
    },
  }
}
