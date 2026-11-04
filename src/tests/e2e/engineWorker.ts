import {Page, expect} from '@playwright/test'


/**
 * Watch a page for which engine ran its model (engine-worker.md §7 step 3),
 * so a spec's "engine worker" leg fails if the load quietly stayed on the
 * main thread. Two independent signals:
 *   - a Worker is created from `/Engine.worker.js`;
 *   - the main-thread pump's boundary line (`[conwayDirect] demand pump:`,
 *     printed only by conwayDirectIfcLoader.js#parseIfcWithConway) never
 *     appears.
 * Call before `page.goto`.
 *
 * @param page
 * @return `expectWorkerEngine()`, to call once the model is ready
 */
export function watchEngineWorker(page: Page): {expectWorkerEngine: () => void} {
  const workerUrls: string[] = []
  const pumpLines: string[] = []
  page.on('worker', (worker) => workerUrls.push(worker.url()))
  page.on('console', (msg) => {
    if (msg.text().includes('[conwayDirect] demand pump:')) {
      pumpLines.push(msg.text())
    }
  })
  return {
    expectWorkerEngine: () => {
      expect(workerUrls.some((url) => url.endsWith('/Engine.worker.js')), workerUrls.join(', ')).toBe(true)
      expect(pumpLines, 'the main-thread engine must not have pumped this model').toEqual([])
    },
  }
}
