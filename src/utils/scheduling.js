// Small helpers for cooperating with the browser's event loop.
//
// Used by long-running pipelines (the GLB cache writer especially) to
// yield between phases so hover-pick / camera-controls / DOM repaint
// can interleave. Each helper resolves on the *next* event-loop turn,
// not synchronously; the caller awaits.


/**
 * Resolve on the next macrotask. The simplest "yield to the browser"
 * primitive — gives the event loop a chance to drain the queued
 * pointermove / keydown / requestAnimationFrame callbacks before our
 * next sync block of work starts.
 *
 * Why `setTimeout(0)` and not `MessageChannel` or `queueMicrotask`:
 *   - `queueMicrotask` runs in the SAME task; it doesn't actually
 *     yield. Pointer events queued via the browser's task queue stay
 *     waiting.
 *   - `MessageChannel` would yield at a similar granularity but with
 *     no observable benefit and slightly worse cross-browser support.
 *   - Modern browsers may eventually expose `scheduler.yield()`; when
 *     it ships everywhere, this is the seam to swap.
 *
 * @return {Promise<void>}
 */
export function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
