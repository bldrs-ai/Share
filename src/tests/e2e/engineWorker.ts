import {Page, expect} from '@playwright/test'


/**
 * Watch a page for which engine ran its model (engine-worker.md §7 step 3),
 * so a spec's "engine worker" leg fails if the load quietly ran anywhere but
 * in the worker. Three signals, because the in-process fallback
 * (spawnEngine.js) runs the SAME handler and pump on the main thread, and
 * would otherwise pass any check that only looks at the pump:
 *   - the loaded model's engine session is a worker one
 *     (`engineSession.kind === 'worker'`): the decisive check;
 *   - no `[engine] worker engine failed to start` line (the fallback's);
 *   - a Worker is created from `/Engine.worker.js`, and the main-thread
 *     pump's own line (`[conwayDirect] demand pump:`) never prints.
 * Call before `page.goto`; await `expectWorkerEngine()` once the model is
 * at its index or ready.
 *
 * @param page
 * @return `expectWorkerEngine()`
 */
export function watchEngineWorker(page: Page): {expectWorkerEngine: () => Promise<void>} {
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
  }
}
