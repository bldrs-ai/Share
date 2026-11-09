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
 * Mechanism matters here, and specifically NOT `setTimeout(0)`:
 * Chrome throttles timers in HIDDEN tabs to ~1/second, so a
 * long-running pipeline that yields via setTimeout crawls the moment
 * the user switches tabs. Measured on the PSB model's GLB property
 * capture (~10M iterations / ~2000 yields): 49–65s with the tab
 * visible vs 555s backgrounded — pure timer throttling. Neither
 * `scheduler.yield()` (Chrome 129+, the purpose-built API) nor
 * `MessageChannel` messages are timer-throttled, and both still yield
 * a real event-loop turn (unlike `queueMicrotask`, which stays in the
 * same task and yields nothing). Foreground bonus: no 4ms nested-
 * timeout clamp, so ~2000 yields cost ~0s instead of ~10–50s.
 * `setTimeout` remains as the last-resort fallback for environments
 * with neither (none of our supported browsers/test envs today).
 *
 * @return {Promise<void>}
 */
export function yieldToBrowser() {
  if (typeof globalThis.scheduler?.yield === 'function') {
    return globalThis.scheduler.yield()
  }
  if (typeof MessageChannel === 'function') {
    return new Promise((resolve) => {
      const channel = new MessageChannel()
      channel.port1.onmessage = () => {
        channel.port1.close()
        channel.port2.close()
        resolve()
      }
      channel.port2.postMessage(null)
    })
  }
  return new Promise((resolve) => setTimeout(resolve, 0))
}


/**
 * Resolve once the browser has had a chance to paint what is on the page
 * now, before a long synchronous block starts.
 *
 * {@link yieldToBrowser} ends the task, but a frame is not drawn between
 * every two tasks, so a status line set just before a multi-second
 * synchronous step can still sit unpainted behind it: the load snackbar
 * showed "Hashing model" through PSB's whole 4 s "Applying model fixups"
 * stage, which is synchronous (Share#2101). Waiting for an animation frame
 * and then one more task gets past that frame's paint.
 *
 * A hidden tab runs no animation frames, and there is nothing to paint, so
 * there it is just {@link yieldToBrowser}; `maxWaitMs` bounds the wait
 * anywhere else rAF does not come (a throttled iframe).
 *
 * @param {object} [opts]
 * @param {number} [opts.maxWaitMs]
 * @return {Promise<void>}
 */
export function yieldForPaint({maxWaitMs = 100} = {}) {
  const raf = globalThis.requestAnimationFrame
  if (typeof raf !== 'function' || globalThis.document?.visibilityState === 'hidden') {
    return yieldToBrowser()
  }
  return new Promise((resolve) => {
    let settled = false
    const settle = () => {
      if (!settled) {
        settled = true
        resolve()
      }
    }
    const timer = setTimeout(settle, maxWaitMs)
    raf(() => {
      yieldToBrowser().then(() => {
        clearTimeout(timer)
        settle()
      })
    })
  })
}
