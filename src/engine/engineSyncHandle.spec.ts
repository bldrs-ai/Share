import {Page, expect, test} from '@playwright/test'
import {watchEngineWorker} from '../tests/e2e/engineWorker'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {waitForModelReady} from '../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../tests/e2e/utils'


/**
 * engine-worker.md §7 step 4: a worker engine reads its OPFS-staged source
 * through a READ-ONLY sync access handle, not the Blob store, in a real
 * Chromium. The load report says which, on its `Engine source I/O:` line
 * (engine/engineModelLoad.js#sourceIoLine); that line is the signal, because
 * the two stores give the same model and differ only in how fast the bytes
 * come.
 *
 * The kill switch, `disableEngineSyncHandle`, must put the same load back on
 * the Blob store, and the model must still open: the fallback is not a
 * failure. Both legs check the load ran in the WORKER (watchEngineWorker):
 * the in-process fallback prints the same `Blob store (disabled)` line.
 */
const MODEL = '/share/v/p/index.ifc'


/**
 * @param page
 * @param timeoutMs how long the load may take (waitForModelReady's default)
 * @return the engine source line of the finished load
 */
async function engineSourceLine(page: Page, timeoutMs?: number): Promise<string> {
  await waitForModelReady(page, timeoutMs)
  await page.waitForFunction(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lines = (window as any).store.getState().loadReportLines as string[]
    return lines.some((line) => line.startsWith('Engine source I/O:'))
  })
  return await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lines = (window as any).store.getState().loadReportLines as string[]
    return lines.find((line) => line.startsWith('Engine source I/O:')) as string
  })
}


describeMobileAndDesktop('Engine worker: OPFS sync access handle', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  test('the worker reads the staged model through a read-only sync access handle', async ({page}) => {
    const engine = watchEngineWorker(page)
    // The worker is the default engine (engine-worker.md §7 step 9).
    await page.goto(MODEL)
    const line = await engineSourceLine(page)
    expect(line).toMatch(/^Engine source I\/O: OPFS sync access handle, [1-9]\d* reads/)
    await engine.expectWorkerEngine()
  })

  test('with the kill switch the same worker load reads through the Blob store, and still opens', async ({page}) => {
    const engine = watchEngineWorker(page)
    // With the Blob store's whole-file read off too (Share#2092), so this is
    // still the windowed Blob path: what a source over the store's ceiling
    // takes, and the A/B against the whole-file read (engineSidecar.spec.ts
    // covers that one).
    await page.goto(`${MODEL}?feature=disableEngineSyncHandle,disableEngineResidentSource`)
    // engineSourceLine waits for the model to be ready: it opened.
    const line = await engineSourceLine(page)
    expect(line).toMatch(/^Engine source I\/O: Blob store \(disabled\), [1-9]\d* reads/)
    await engine.expectWorkerEngine()
  })

  test('a STEP worker load reads through the same read-only sync access handle', async ({page}) => {
    // conway#757 (engine-worker.md §11): a STEP staged in OPFS opens
    // windowed in the worker, as an IFC does. AP214's extraction reads
    // synchronously, so conway faults missing windows in through the store's
    // `readSync`, which the sync access handle has — the same handle, the
    // same lock, the same `Engine source I/O:` line as an IFC load.
    const STEP_TEST_TIMEOUT_MS = 90_000
    test.setTimeout(STEP_TEST_TIMEOUT_MS)
    const engine = watchEngineWorker(page)
    await page.goto('/share/v/p/index.step')
    const line = await engineSourceLine(page, STEP_TEST_TIMEOUT_MS)
    expect(line).toMatch(/^Engine source I\/O: OPFS sync access handle, [1-9]\d* reads/)
    await engine.expectWorkerEngine()
  })

  // The main-thread engine (the kill switch) reads its source through the
  // page's own Blob store and has no source store of the worker's: the same
  // models open there, and no `Engine source I/O:` line is printed.
  for (const {name, path} of [
    {name: 'IFC', path: MODEL},
    {name: 'STEP', path: '/share/v/p/index.step'},
  ]) {
    test(`an ${name} load on the main-thread engine opens, with no worker source line`, async ({page}) => {
      const MAIN_TEST_TIMEOUT_MS = 90_000
      test.setTimeout(MAIN_TEST_TIMEOUT_MS)
      const engine = watchEngineWorker(page)
      await page.goto(`${path}?feature=disableEngineWorker`)
      await waitForModelReady(page, MAIN_TEST_TIMEOUT_MS)
      await engine.expectMainThreadEngine()
      const lines = await page.evaluate(() =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).store.getState().loadReportLines as string[])
      expect(lines.some((line) => line.startsWith('Total:')), lines.join('\n')).toBe(true)
      expect(lines.filter((line) => line.startsWith('Engine source I/O:'))).toEqual([])
    })
  }
})
