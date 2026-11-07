import {Page, expect, test} from '@playwright/test'
import {watchEngineWorker} from '../tests/e2e/engineWorker'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {waitForModelReady} from '../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../tests/e2e/utils'


/**
 * engine-worker.md §7 step 9: the engine worker is on by default, and
 * engine/engineRoute.js keeps a load on the main-thread engine for the
 * kill switch and the two legacy consumers that read that engine directly.
 * Each leg loads a real model and checks WHICH engine parsed it
 * (watchEngineWorker), and each main-thread leg checks the load report says
 * why, so a route that quietly sent everything one way fails here.
 *
 * The last leg is the in-process fallback (§7.2 item 6): a worker that
 * cannot start leaves the load running the same handler on this thread,
 * through the same protocol, and the model still opens.
 */
const MODEL = '/share/v/p/index.ifc'
const NOTE_PREFIX = 'Engine: main thread'


/**
 * @param page
 * @return the finished load's `Engine: main thread (…)` report line, or null
 */
async function mainThreadNote(page: Page): Promise<string | null> {
  return await page.evaluate((prefix) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lines = (window as any).store.getState().loadReportLines as string[]
    return lines.find((line) => line.startsWith(prefix)) ?? null
  }, NOTE_PREFIX)
}


describeMobileAndDesktop('Engine route: worker by default, main thread where asked', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  test('a plain load runs in the engine worker, with no flag in the URL', async ({page}) => {
    const engine = watchEngineWorker(page)
    await page.goto(MODEL)
    await waitForModelReady(page)
    await engine.expectWorkerEngine()
    expect(await mainThreadNote(page)).toBeNull()
  })

  for (const {name, query, note} of [
    {name: 'the kill switch', query: '?feature=disableEngineWorker',
      note: 'Engine: main thread (?feature=disableEngineWorker)'},
    // The legacy view rules style elements through the main-thread engine
    // (IfcViewsManager), so a `?view=` link keeps working there.
    {name: 'a ?view= rule set', query: '?view=ch.sia380-1.heatmap',
      note: 'Engine: main thread (?view= rules need the main-thread engine)'},
    // The legacy chat's eval reads the main-thread engine (§8 item 7).
    {name: 'the legacy ?feature=bot chat', query: '?feature=bot',
      note: 'Engine: main thread (the legacy ?feature=bot chat needs the main-thread engine)'},
  ]) {
    test(`${name} loads on the main-thread engine, and the report says why`, async ({page}) => {
      const engine = watchEngineWorker(page)
      await page.goto(`${MODEL}${query}`)
      await waitForModelReady(page)
      await engine.expectMainThreadEngine()
      expect(await mainThreadNote(page)).toBe(note)
      // Nothing tells the user the view rules are unavailable: here they are.
      await expect(page.getByText('View rules (?view=) need the main-thread engine')).toHaveCount(0)
    })
  }

  test('a worker that cannot start leaves the load on the in-process engine, and the model opens', async ({page}) => {
    // Only the engine's worker fails: the module-worker probe (a blob URL),
    // the OPFS and GLB-writer workers construct as usual, so this is the
    // "this worker's script would not start" path of spawnEngine.js, not
    // "this browser has no module workers".
    await page.addInitScript(() => {
      const RealWorker = window.Worker
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      window.Worker = function(url: any, options?: WorkerOptions) {
        if (String(url).endsWith('/Engine.worker.js')) {
          throw new Error('test: engine worker blocked')
        }
        return new RealWorker(url, options)
      } as unknown as typeof Worker
    })
    const fallbackLines: string[] = []
    page.on('console', (msg) => {
      if (msg.text().includes('[engine] worker engine failed to start')) {
        fallbackLines.push(msg.text())
      }
    })
    await page.goto(MODEL)
    await waitForModelReady(page)
    const kind = await page.evaluate(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).store.getState().model?.ifcManager?.ifcAPI?.engineSession?.kind ?? null)
    expect(kind).toBe('inProcess')
    expect(fallbackLines.length).toBe(1)
    expect(fallbackLines[0]).toContain('test: engine worker blocked')
    // It is a real model, read through the in-process session.
    const vertices = await page.evaluate(() => {
      let count = 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).store.getState().model.traverse((o: any) => {
        count += o.geometry?.attributes?.position?.count ?? 0
      })
      return count
    })
    expect(vertices).toBeGreaterThan(0)
  })
})
