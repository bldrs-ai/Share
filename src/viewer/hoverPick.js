/**
 * Schedules the hover pick — `ShareViewer#highlightIfcItem`, a raycast and a
 * preselection recolour — so the highlight follows the pointer at the
 * display's rate without the pick taking the main thread from the renderer.
 *
 * **Frame-aligned (the default, `createFrameHoverPicker`).** The window's
 * mousemove only marks the pointer dirty; the pick runs once per animation
 * frame, inside the viewer's own render loop, after the camera has moved and
 * before the frame's paint decision (`ThreeContext#onFrame`, which under
 * render-on-demand runs every component before the renderer:
 * `IfcContext#updateAllComponents`). The recolour the pick makes
 * (`setColorAt`, which asks for a paint through renderDemandHooks.js) is so
 * painted in the frame whose input moved the pointer — between loads. While
 * a load holds a RenderDemand scope open, that ask is a background one and
 * paints on the load's frame budget, as it did with the timer scheduler. Chrome dispatches
 * mousemove once per frame, ahead of that frame's rAF callbacks, so a move
 * and the highlight it causes land in the same frame: the browser's own floor.
 *
 * The timer scheduler this replaced (`createTimerHoverPicker`, kept as the
 * `disableFrameHover` rollback) picked in the event handler at most once per
 * 33 ms, with a `setTimeout` trailing pick. At 60 Hz that is a pick every
 * other frame, 0–33 ms of waiting, and a trailing pick that isn't
 * frame-aligned, so its repaint waited for the frame after it: the lag the
 * owner still saw after #2127 made the pick itself cheap. Headless
 * before/after numbers are in design/new/glb-export-premium.md §1.1d
 * "What a hover pick costs after it".
 *
 * Both schedulers bound the pick the same ways:
 *
 *  - **Not while dragging.** A drag orbits the camera, and nothing hovered
 *    survives it. `Containers/viewer.js` calls `onMove` again on mouseup, so
 *    a pick skipped while the button was down is made where it let go.
 *  - **Not when the pointer hasn't moved over the canvas.** The canvas
 *    position the ray is cast from only changes on the CANVAS's mousemove
 *    (`three/context/mouse.js`), while this listens on the window, so
 *    moving over a drawer or the NavTree would re-cast the same ray, at the
 *    same cost, for the same answer. An unmoved pointer picks nothing and so
 *    asks for no paint: an idle viewer's hover costs nothing.
 *  - **Less often when picks are dear.** The interval after a pick is
 *    `COST_FACTOR` times the median of the last `COST_SAMPLES` picks' cost
 *    (capped at `MAX_INTERVAL_MS`), so hover's own synchronous work takes at
 *    most about 1 / (1 + COST_FACTOR) of the main thread however slow a pick
 *    is. That is the instance tree not built yet (`ifc/deferredBatchedBvh.js`
 *    builds it after the model is on screen), or a model that has none. The
 *    frame scheduler drops the interval altogether while the median is at or
 *    under `CHEAP_PICK_MS` — well under a frame, which with the tree is every
 *    pick on PSB (#2127: a median 0.2 ms) — and picks on every frame the
 *    pointer moved. Its interval is read on the frame clock, so a dear pick
 *    waits for the first frame at or after it, and the frame that ends the
 *    wait is the "pointer stopped" pick: no trailing timer.
 *
 * **Fast moves over an expensive paint (frame scheduler only).** The owner's
 * preview of the above: instant on Momentum, "a little better" on PSB, the
 * lag growing with model size. There the repaint is what's slow (GPU-bound),
 * not the pick, and a sweep queued a repaint per frame for highlights the
 * pointer had left before they showed, so the one it stopped on waited
 * behind them. While the last paint cost more than `EXPENSIVE_PAINT_MS`
 * (three/renderDemand.js, two 60 Hz frames) AND the pointer moves faster than
 * `FAST_POINTER_PX_PER_MS`, the pick and its recolour are skipped and the
 * move stays pending. The first frame the pointer is slower, or hasn't moved
 * since the last frame, picks: the highlight it rests on is never lost, and
 * the GPU is idle when that pick's paint is queued. The canvas pointermove's
 * settle window is skipped on the same paint cost (renderDemandHooks.js
 * #attachSessionNets), or it would repaint the unchanged picture every frame
 * of the sweep anyway. With cheap paints (Momentum) neither engages.
 */


import {EXPENSIVE_PAINT_MS} from './three/renderDemand'


/**
 * Timer scheduler only (the `disableFrameHover` rollback): the fastest hover
 * is sampled, 30 a second, as before the frame scheduler. The frame scheduler
 * has no floor; the frame is its unit.
 */
export const MIN_INTERVAL_MS = 33

/** The slowest: a pick that slow is a bug, but hover should still answer. */
export const MAX_INTERVAL_MS = 500

/** Interval as a multiple of the recent pick cost (see module doc). */
export const COST_FACTOR = 4

/**
 * How many recent picks the cost is the median of. A median, not the last
 * pick: one slow pick (a GC pause, the trace's 99 ms outlier among ~7 ms
 * picks) would otherwise stall hover for 4× its cost, then let it jump.
 */
export const COST_SAMPLES = 5

/**
 * Frame scheduler: at or under this median cost a pick is cheap enough to run
 * on every frame the pointer moved, a 60 Hz frame being ~16.7 ms and a 120 Hz
 * one ~8.3 ms. Above it the `COST_FACTOR` back-off applies.
 */
export const CHEAP_PICK_MS = 2

export {EXPENSIVE_PAINT_MS}

/**
 * Frame scheduler: a pointer faster than this, in CSS px per ms, is
 * sweeping, not aiming: 25 px a 60 Hz frame, a 1280 px canvas crossed in
 * under a second, and 50 px or more between the frames of a paint over
 * `EXPENSIVE_PAINT_MS`, enough to cross several elements of a dense model
 * between two highlights. Aiming at an element is slower than this, so the
 * gate (module doc) only drops highlights the user isn't looking at.
 */
export const FAST_POINTER_PX_PER_MS = 1.5


/**
 * The median of the last `COST_SAMPLES` pick costs.
 *
 * @return {{record: Function, median: Function}} `record(ms)` adds one
 *   pick's cost; `median()` is NaN before the first
 */
function createCostWindow() {
  const costs = []
  return {
    record(ms) {
      costs.push(ms)
      if (costs.length > COST_SAMPLES) {
        costs.shift()
      }
    },
    median() {
      if (costs.length === 0) {
        return NaN
      }
      const sorted = [...costs].sort((a, b) => a - b)
      return sorted[sorted.length >> 1]
    },
  }
}


/**
 * Where the last pick saw the pointer, so a pointer that hasn't moved over
 * the canvas since isn't picked again.
 *
 * @param {Function} pointer `() => ({x, y})|null`
 * @return {{unmoved: Function, note: Function}}
 */
function createPointerMemo(pointer) {
  let lastX = NaN
  let lastY = NaN
  return {
    /** @return {boolean} whether the pointer is where the last pick saw it */
    unmoved() {
      const p = pointer()
      return p !== null && p !== undefined && p.x === lastX && p.y === lastY
    },
    /** Record where the pick about to run sees the pointer. */
    note() {
      const p = pointer()
      lastX = p?.x ?? NaN
      lastY = p?.y ?? NaN
    },
  }
}


/**
 * The default hover scheduler: the pick runs in the render loop's frame,
 * before its paint (module doc).
 *
 * @param {object} deps
 * @param {Function} deps.pick `() => void`, the hover pick
 * @param {Function} deps.isDragging `() => boolean`
 * @param {Function} deps.pointer `() => ({x, y})|null`, the canvas's
 *   normalized pointer; null when the viewer has none, in which case every
 *   marked move counts as a move
 * @param {Function} [deps.now] ms clock
 * @param {Function} [deps.paintCostMs] `() => number`, the last paint's cost
 *   (RenderDemand#paintCostMs); without one paints count as cheap and fast
 *   moves are never skipped
 * @return {{onMove: Function, onFrame: Function, dispose: Function}}
 *   `onMove(event?)` is the mousemove (and mouseup) listener and only marks
 *   the pointer dirty, noting where and when a mouse event put it;
 *   `onFrame` is the per-frame hook, which picks when it should and returns
 *   whether it did; `dispose` stops both
 */
export function createFrameHoverPicker({
  pick,
  isDragging,
  pointer,
  now = () => performance.now(),
  paintCostMs = () => 0,
}) {
  const memo = createPointerMemo(pointer)
  const cost = createCostWindow()
  let isPending = false
  let isDisposed = false
  let lastPickAt = -Infinity
  let interval = 0
  // The latest mouse event's client position and time, and the one that was
  // latest at the previous frame: the pointer's speed between two frames.
  let lastMove = null
  let moveAtLastFrame = null

  /**
   * @return {number} px/ms the pointer moved between the previous frame and
   *   this one; 0 when no mouse event came in between
   */
  function frameSpeed() {
    const from = moveAtLastFrame
    moveAtLastFrame = lastMove
    if (lastMove === null || from === null || lastMove === from) {
      return 0
    }
    const ms = lastMove.t - from.t
    const px = Math.hypot(lastMove.x - from.x, lastMove.y - from.y)
    return ms > 0 ? px / ms : 0
  }

  return {
    onMove(event) {
      if (isDisposed) {
        return
      }
      isPending = true
      if (Number.isFinite(event?.clientX) && Number.isFinite(event?.timeStamp)) {
        lastMove = {x: event.clientX, y: event.clientY, t: event.timeStamp}
      }
    },
    onFrame() {
      // Every frame, pending or not, so a move's speed is always measured
      // against the frame before it, never against one seconds ago.
      const speed = frameSpeed()
      // The idle case, every frame the pointer didn't move: one branch.
      if (!isPending) {
        return false
      }
      // Dropped, not deferred: a drag's moves orbit the camera, and the
      // mouseup that ends it marks the pointer again (Containers/viewer.js).
      if (isDragging() || memo.unmoved()) {
        isPending = false
        return false
      }
      // A sweep over an expensive paint (module doc): deferred, so the first
      // slower or still frame picks where the pointer is then.
      if (speed > FAST_POINTER_PX_PER_MS && paintCostMs() > EXPENSIVE_PAINT_MS) {
        return false
      }
      // Dear picks only: still pending, so the first frame at or after the
      // interval picks where the pointer is then.
      const start = now()
      if (start - lastPickAt < interval) {
        return false
      }
      isPending = false
      memo.note()
      lastPickAt = start
      try {
        pick()
      } finally {
        cost.record(now() - start)
        const median = cost.median()
        interval = median <= CHEAP_PICK_MS ? 0 : Math.min(MAX_INTERVAL_MS, median * COST_FACTOR)
      }
      return true
    },
    dispose() {
      isDisposed = true
      isPending = false
    },
  }
}


/**
 * The timer scheduler #2127 shipped, kept as the `?feature=disableFrameHover`
 * rollback (FeatureFlags.js): the pick runs in the mousemove handler, at most
 * once per `MIN_INTERVAL_MS`, with a `setTimeout` trailing pick.
 *
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
export function createTimerHoverPicker({
  pick,
  isDragging,
  pointer,
  now = () => performance.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (handle) => clearTimeout(handle),
}) {
  const memo = createPointerMemo(pointer)
  const cost = createCostWindow()
  let lastPickAt = -Infinity
  let interval = MIN_INTERVAL_MS
  let trailing = null

  /** Pick now, and time it. */
  function run() {
    memo.note()
    const start = now()
    lastPickAt = start
    try {
      pick()
    } finally {
      cost.record(now() - start)
      interval = Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, cost.median() * COST_FACTOR))
    }
  }

  /** The trailing pick, when its interval is up. */
  function onTrailing() {
    trailing = null
    if (!isDragging() && !memo.unmoved()) {
      run()
    }
  }

  return {
    onMove() {
      if (isDragging() || memo.unmoved()) {
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
