import {Page, expect} from '@playwright/test'


const MAIN_THREAD_PUMP_TIMEOUT_MS = 60_000


/**
 * Watch a page for which engine ran its model (engine-worker.md §7 steps 3
 * and 9), so a spec's leg fails if the load quietly ran on the other engine.
 * The worker is the default since step 9; `?feature=disableEngineWorker`,
 * a known `?view=` and the legacy `?feature=bot` keep a load on the
 * main-thread engine (engine/engineRoute.js). Call before `page.goto`; await
 * one of the two checks once the model is at its index or ready.
 *
 * `expectWorkerEngine()` — three signals, because the in-process fallback
 * (spawnEngine.js) runs the SAME handler and pump on the main thread, and
 * would otherwise pass any check that only looks at the pump:
 *   - the loaded model's engine session is a worker one
 *     (`engineSession.kind === 'worker'`): the decisive check;
 *   - no `[engine] worker engine failed to start` line (the fallback's);
 *   - a Worker is created from `/Engine.worker.js`, and the main-thread
 *     pump's own line (`[conwayDirect] demand pump:`) never prints.
 *
 * `expectMainThreadEngine()` — the mirror image, for the kill switch and the
 * legacy routes: the model has no engine session at all (its IfcAPI is the
 * viewer's own, not a facade over a session, worker or in-process), no
 * Worker was created from `/Engine.worker.js`, and the main-thread pump's
 * line printed, so the model really was pumped on this thread.
 *
 * @param page
 * @return the two checks
 */
export function watchEngineWorker(page: Page): {
  expectWorkerEngine: () => Promise<void>,
  expectMainThreadEngine: () => Promise<void>,
} {
  const workerUrls: string[] = []
  const pumpLines: string[] = []
  const fallbackLines: string[] = []
  page.on('worker', (worker) => workerUrls.push(worker.url()))
  page.on('console', (msg) => {
    const text = msg.text()
    if (text.includes('[conwayDirect] demand pump:')) {
      pumpLines.push(text)
    }
    if (text.includes('[engine] worker engine failed to start')) {
      fallbackLines.push(text)
    }
  })
  return {
    expectWorkerEngine: async () => {
      expect(fallbackLines, 'the worker engine must have started, not fallen back').toEqual([])
      // The finished model, or the model at its index when the spec stops
      // before the load ends: both hold the same IfcAPI facade, so the same
      // session.
      const kind = await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = (window as any).store.getState()
        return (s.model ?? s.indexedModel)?.ifcManager?.ifcAPI?.engineSession?.kind ?? null
      })
      expect(kind, 'the model must have been parsed by a worker engine').toBe('worker')
      expect(workerUrls.some((url) => url.endsWith('/Engine.worker.js')), workerUrls.join(', ')).toBe(true)
      expect(pumpLines, 'the main-thread engine must not have pumped this model').toEqual([])
    },
    expectMainThreadEngine: async () => {
      const engine = await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = (window as any).store.getState()
        const api = (s.model ?? s.indexedModel)?.ifcManager?.ifcAPI
        return {hasModel: Boolean(api), sessionKind: api?.engineSession?.kind ?? null}
      })
      expect(engine.hasModel, 'a model must be loaded (or at its index)').toBe(true)
      expect(engine.sessionKind, 'the model must have been parsed by the main-thread engine, not a session').toBe(null)
      expect(workerUrls.filter((url) => url.endsWith('/Engine.worker.js')), 'no engine worker may start').toEqual([])
      // The pump's line prints when its pump ends, which a spec that checks at
      // the index can be well ahead of; the session check above is the
      // decisive one, so give the pump the rest of the load.
      await expect.poll(() => pumpLines.length, {
        message: 'the main-thread engine must have pumped this model',
        timeout: MAIN_THREAD_PUMP_TIMEOUT_MS,
      }).toBeGreaterThan(0)
    },
  }
}
