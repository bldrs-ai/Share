import {act} from '@testing-library/react'


/**
 * General fix for act warnings.
 * See https://kentcdodds.com/blog/fix-the-not-wrapped-in-act-warning
 *
 * A macrotask tick (setTimeout 0) drains the whole microtask chain, not just
 * one hop — so a multi-`await` mount cascade (CadView: viewer init → model
 * load → selection effects) fully settles inside act. A single
 * `await Promise.resolve()` only advanced one link, leaving the tail
 * setStates (setSelectedElement, ViewerContainer) to fire after the test and
 * log "update not wrapped in act(...)".
 */
export async function actAsyncFlush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
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
