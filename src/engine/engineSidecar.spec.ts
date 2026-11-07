import {Page, expect, test} from '@playwright/test'
import {watchEngineWorker} from '../tests/e2e/engineWorker'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {captureGlbLogs, resetGlbLogs, waitForGlbLog} from '../tests/e2e/glbLogs'
import {waitForModelReady} from '../tests/e2e/models'
import {homepageSetup, pauseViewerRendering, resumeViewerRendering, setIsReturningUser} from '../tests/e2e/utils'


/**
 * engine-worker.md §7 step 8 and §11 (conway#756, #757): a worker load of a
 * model staged in OPFS saves conway's index sidecar for it, and the next
 * open of the same file comes up from that sidecar instead of parsing —
 * for STEP as for IFC, through the same calls.
 *
 * The signal is the load report's `Engine index:` line
 * (engine/engineModelLoad.js#indexLine): `parsed; sidecar saved` on the
 * first load, `from sidecar …, no parse` on the reopen. The model has to be
 * READY on the reopen as well, so the index-first model is the one that
 * renders, not one the line merely claims. The kill switch,
 * `disableEngineSidecar`, must parse on every open and save nothing.
 *
 * The reopen is a page reload: the OPFS copy, and the sidecar beside it,
 * survive it, as they do a browser restart. Since #2081 a worker load also
 * caches the GLB artifact, and a reload that finds it spawns no engine at
 * all, so the spec waits for that write and removes the artifact first.
 * That is the state the sidecar is for: a model whose artifact is gone
 * (evicted, cleared, or never written) reopening through its engine.
 */
const MODELS = [
  {name: 'STEP', path: '/share/v/p/index.step'},
  {name: 'IFC', path: '/share/v/p/index.ifc'},
]

const LOAD_TIMEOUT_MS = 90_000
const CACHE_TIMEOUT_MS = 60_000


/**
 * Wait for the idle GLB writer to land this load's artifact, then remove
 * every `.glb` artifact from OPFS, so the reload cannot be a cache hit. The
 * viewer is paused for the wait, as engineGlbCapture.spec.ts does: the
 * writer is idle-scheduled, and a painting page never goes idle under
 * SwiftShader.
 *
 * @param page
 * @param glbLogs the page's captured `[glb]` lines
 * @return how many artifacts were removed
 */
async function dropGlbArtifact(page: Page, glbLogs: string[]): Promise<number> {
  await pauseViewerRendering(page)
  await waitForGlbLog(glbLogs, 'writer: wrote', CACHE_TIMEOUT_MS)
  await resumeViewerRendering(page)
  return await page.evaluate(async () => {
    let removed = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const walk = async (dir: any) => {
      const names: string[] = []
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === 'directory') {
          await walk(handle)
        } else if (name.includes('.glb')) {
          names.push(name)
        }
      }
      for (const name of names) {
        await dir.removeEntry(name)
        removed++
      }
    }
    await walk(await navigator.storage.getDirectory())
    return removed
  })
}


/**
 * @param page
 * @return the `Engine index:` line of the finished load
 */
async function engineIndexLine(page: Page): Promise<string> {
  await waitForModelReady(page, LOAD_TIMEOUT_MS)
  await page.waitForFunction(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lines = (window as any).store.getState().loadReportLines as string[]
    return lines.some((line) => line.startsWith('Engine index:'))
  })
  return await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lines = (window as any).store.getState().loadReportLines as string[]
    return lines.find((line) => line.startsWith('Engine index:')) as string
  })
}


/**
 * @param page
 * @return the finished load's `Engine index:` lines (none on the main thread)
 */
async function indexLines(page: Page): Promise<string[]> {
  return await page.evaluate(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((window as any).store.getState().loadReportLines as string[]).filter((line) => line.startsWith('Engine index:')))
}


describeMobileAndDesktop('Engine worker: index sidecar reopen', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  for (const {name, path} of MODELS) {
    test(`a ${name} reopen comes up from the sidecar its first load saved`, async ({page}) => {
      test.setTimeout(3 * LOAD_TIMEOUT_MS)
      const glbLogs = captureGlbLogs(page)
      const first = watchEngineWorker(page)
      // The worker is the default engine (engine-worker.md §7 step 9).
      await page.goto(path)
      expect(await engineIndexLine(page)).toMatch(/^Engine index: parsed; sidecar saved \(\d+\.\d MB\)$/)
      await first.expectWorkerEngine()
      expect(await dropGlbArtifact(page, glbLogs), 'the worker load cached one artifact').toBe(1)

      resetGlbLogs(glbLogs)
      const reopen = watchEngineWorker(page)
      await page.reload()
      expect(await engineIndexLine(page)).toMatch(/^Engine index: from sidecar \(\d+\.\d MB\), no parse$/)
      await reopen.expectWorkerEngine()
      expect(glbLogs.some((line) => line.includes('cache MISS')), 'the reopen went to the engine').toBe(true)
    })
  }

  // The main-thread engine (the engine worker's kill switch) has no index
  // sidecar: each open parses, on that engine, and the report has no
  // `Engine index:` line, on the first load or on the reopen.
  for (const {name, path} of MODELS) {
    test(`a ${name} on the main-thread engine parses on every open and saves no sidecar`, async ({page}) => {
      test.setTimeout(3 * LOAD_TIMEOUT_MS)
      const glbLogs = captureGlbLogs(page)
      const first = watchEngineWorker(page)
      await page.goto(`${path}?feature=disableEngineWorker`)
      await waitForModelReady(page, LOAD_TIMEOUT_MS)
      await first.expectMainThreadEngine()
      expect(await indexLines(page)).toEqual([])
      expect(await dropGlbArtifact(page, glbLogs), 'the main-thread load cached one artifact').toBe(1)

      resetGlbLogs(glbLogs)
      const reopen = watchEngineWorker(page)
      await page.reload()
      await waitForModelReady(page, LOAD_TIMEOUT_MS)
      await reopen.expectMainThreadEngine()
      expect(await indexLines(page)).toEqual([])
      expect(glbLogs.some((line) => line.includes('cache MISS')), 'the reopen went to the engine').toBe(true)
    })
  }

  test('with the kill switch every open parses and nothing is saved', async ({page}) => {
    test.setTimeout(3 * LOAD_TIMEOUT_MS)
    const glbLogs = captureGlbLogs(page)
    await page.goto('/share/v/p/index.step?feature=disableEngineSidecar')
    await waitForModelReady(page, LOAD_TIMEOUT_MS)
    await dropGlbArtifact(page, glbLogs)
    await page.reload()
    await waitForModelReady(page, LOAD_TIMEOUT_MS)
    const lines = await page.evaluate(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).store.getState().loadReportLines as string[])
    expect(lines.some((line) => line.startsWith('Total:'))).toBe(true)
    expect(lines.filter((line) => line.startsWith('Engine index:'))).toEqual([])
  })
})
