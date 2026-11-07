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
    await page.goto(`${MODEL}?feature=engineWorker`)
    const line = await engineSourceLine(page)
    expect(line).toMatch(/^Engine source I\/O: OPFS sync access handle, [1-9]\d* reads/)
    await engine.expectWorkerEngine()
  })

  test('with the kill switch the same worker load reads through the Blob store, and still opens', async ({page}) => {
    const engine = watchEngineWorker(page)
    await page.goto(`${MODEL}?feature=engineWorker,disableEngineSyncHandle`)
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
    await page.goto('/share/v/p/index.step?feature=engineWorker')
    const line = await engineSourceLine(page, STEP_TEST_TIMEOUT_MS)
    expect(line).toMatch(/^Engine source I\/O: OPFS sync access handle, [1-9]\d* reads/)
    await engine.expectWorkerEngine()
  })
})
