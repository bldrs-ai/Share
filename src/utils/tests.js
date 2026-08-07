import {act} from '@testing-library/react'


/**
 * General fix for act warnings.
 * See https://kentcdodds.com/blog/fix-the-not-wrapped-in-act-warning
 *
 * Kept microtask-based (a single `await Promise.resolve()` inside act) rather
 * than a `setTimeout(0)` macrotask so it stays timer-agnostic: under
 * `jest.useFakeTimers()` a real setTimeout never fires unless the clock is
 * advanced, which would hang every caller. Cascades that a single microtask
 * hop can't drain (a mocked async mount resolving on its own timers, mid-
 * `waitFor`) aren't reachable by flushing at all — use `suppressActWarnings`
 * for those, not a deeper drain here.
 */
export async function actAsyncFlush() {
  await act(async () => await Promise.resolve())
}


/**
 * Swallow React's "not wrapped in act(...)" console.error for the duration of
 * one test, passing every other console.error through untouched. Returns a
 * restore fn — call it (or `afterEach`) to un-patch.
 *
 * Reach for this ONLY when a component's update genuinely can't be awaited
 * from the test: an external, non-React-batched async (a mocked viewer/model
 * load resolving on its own timers) drives a React setState *during* a
 * `waitFor`, which RTL's act wrapper can't enclose. Prefer `actAsyncFlush()`
 * whenever the update is reachable — this is the escape hatch, not the norm.
 *
 * @return {function(): void} restore
 */
export function suppressActWarnings() {
  const originalError = console.error
  jest.spyOn(console, 'error').mockImplementation((...args) => {
    if (typeof args[0] === 'string' && args[0].includes('not wrapped in act')) {
      return
    }
    originalError(...args)
  })
  return () => console.error.mockRestore()
}
