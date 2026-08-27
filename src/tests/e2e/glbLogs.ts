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
 * On failure the message carries the whole captured buffer, which is the
 * diagnostic that matters — most usefully `writer: skipped (threw)`, a
 * writer-side exception `exportAndCacheGlb` swallows and only logs.
 *
 * @param logs buffer from {@link captureGlbLogs}
 * @param needle substring to wait for
 * @param timeout ms to wait
 */
export async function waitForGlbLog(logs: string[], needle: string, timeout: number) {
  await expect.poll(() => logs.some((l) => l.includes(needle)), {
    timeout,
    message: `[glb] line matching "${needle}" never arrived. Captured:\n` +
      `${logs.map((l) => `  ${l}`).join('\n') || '  (none)'}`,
  }).toBe(true)
}
