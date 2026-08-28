import {Page, expect} from '@playwright/test'


/**
 * Capture the GLB pipeline's `[glb]` console lines into a buffer.
 *
 * The pipeline's observable state transitions — cache HIT/MISS, writer wrote,
 * reader hydrated an extension — are only reported through these lines, so a
 * cache round-trip spec asserts on them rather than racing on timing. See
 * `src/loader/glbLog.js` for the emit side.
 *
 * @param page the page to listen on
 * @return the buffer, filled as lines arrive
 */
export function captureGlbLogs(page: Page): string[] {
  const logs: string[] = []
  page.on('console', (msg) => {
    const text = msg.text()
    if (text.startsWith('[glb]')) {
      logs.push(text)
    }
  })
  return logs
}


// Marker pushed by {@link resetGlbLogs}, so a later `waitForGlbLog` can tell a
// line the current load emitted from one the previous load emitted late.
const RESET_MARKER = '[glb] --- spec: buffer reset ---'


/**
 * Drop everything captured so far, before driving the next load.
 *
 * Not simply `logs.length = 0`. There is no barrier between a wait resolving
 * and the navigation that follows, and Playwright keeps dispatching
 * `Runtime.consoleAPICalled` events that the old execution context already
 * queued — `opfsSourceByteStore.js`'s "source spill: released resident source
 * buffer" is emitted from the writer's `.finally`, i.e. strictly after the
 * `writer: wrote` a populate half waits on. So a stale line can land after the
 * clear, and any needle both loads can emit would then be satisfied by load 1.
 *
 * Pushing a marker and having {@link waitForGlbLog} search only past the LAST
 * marker closes that: a line racing in from the old context lands before the
 * marker and is not counted. Today's needles happen to be load-2-only, so this
 * is insurance against the next one that isn't (`writer: wrote` fires on both).
 *
 * @param logs buffer from {@link captureGlbLogs}
 */
export function resetGlbLogs(logs: string[]) {
  logs.length = 0
  logs.push(RESET_MARKER)
}


/**
 * Lines captured since the last {@link resetGlbLogs}, or all of them.
 *
 * @param logs buffer from {@link captureGlbLogs}
 * @return the slice after the last reset marker
 */
function sinceReset(logs: string[]): string[] {
  const at = logs.lastIndexOf(RESET_MARKER)
  return at === -1 ? logs : logs.slice(at + 1)
}


/**
 * Wait for a `[glb]` line containing `needle`.
 *
 * `expect.poll`, and NOT `page.waitForFunction(pred, {logs})`, for a reason
 * worth stating because the page-side form looks equivalent and is not:
 * `waitForFunction` serialises its argument into the page ONCE and re-invokes
 * the predicate against that frozen copy, so Node-side pushes into the array
 * never reach it. Every line these specs wait for arrives AFTER the wait
 * starts — `writer: wrote` fires from an idle callback well past
 * `data-model-ready` — so the page-side form could not succeed and burned its
 * full timeout by construction.
 *
 * That is what actually kept the cache-hit specs `fixme`'d, rather than the
 * OPFS/service-worker race they were annotated with (bldrs-ai/Share#1779).
 * Demonstrated directly: against an array appended at 1s, `waitForFunction`
 * times out at 4s where `expect.poll` resolves at 1.2s.
 *
 * The buffer dump goes in a `catch` rather than `expect.poll`'s `message`
 * option, because that option is a plain string evaluated at CALL time — it
 * would snapshot the buffer as it stood before the wait began and so exclude,
 * by construction, every line the wait window produced. That is the whole
 * diagnostic: most usefully `writer: skipped (threw)`, a writer-side exception
 * `exportAndCacheGlb` swallows and only logs.
 *
 * @param logs buffer from {@link captureGlbLogs}
 * @param needle substring to wait for
 * @param timeout ms to wait
 */
export async function waitForGlbLog(logs: string[], needle: string, timeout: number) {
  try {
    await expect.poll(() => sinceReset(logs).some((l) => l.includes(needle)), {timeout}).toBe(true)
  } catch {
    // `expect.poll`'s own message is only "expected true, received false", so
    // nothing is lost by replacing it rather than chaining it as a `cause`
    // (which is past this project's TS lib target anyway).
    const captured = sinceReset(logs).map((l) => `  ${l}`).join('\n') || '  (none)'
    throw new Error(
      `[glb] line matching "${needle}" never arrived within ${timeout}ms. Captured:\n${captured}`)
  }
}
