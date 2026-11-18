import {expect, Page, test, Worker} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {setupVirtualPathIntercept} from '../tests/e2e/models'
import {
  BOX_PATH,
  HOME_PATH,
  openBoxFromSearchBar,
  rememberShownModel,
  waitForModelOtherThan,
  waitForModelSettled,
} from '../tests/e2e/modelSwitch'
import {homepageSetup, setIsReturningUser} from '../tests/e2e/utils'


/**
 * What an in-app model switch frees (open-205 Phase 1a step 0, #2023).
 *
 * Under `?feature=spaModelNav` opening a model no longer loads the page, so
 * nothing frees the model left but the viewer's teardown
 * (Containers/viewer.js#initViewer → ShareViewer#dispose → ShareIfc#dispose,
 * which closes the registered model's engine session). This loads A, lets it
 * finish (the idle GLB writer included), opens B in-app, and asserts that
 * A's engine worker was terminated while B's runs. On the worker path that
 * is the engine collected: `terminate()` frees the whole WASM instance at
 * once (design/new/engine-worker.md §3). Playwright's `Worker` 'close' event
 * is the signal; it fires when the dedicated worker's target goes away.
 *
 * What this does NOT assert yet, because it does not hold today: that A's
 * model object, and on the kill-switch path (`?feature=disableEngineWorker`)
 * A's main-thread IfcAPI, are garbage-collected. A WeakRef to either stays
 * set after a forced GC. The heap-snapshot retainer paths are recorded on the
 * issues that own them, which take the assertion when they land: PlaceMark
 * bound to the first model (#2017), and closures from the renders before the
 * switch, still held by mounted components (#2019). Two smaller retainers
 * found on the way are fixed with their own unit tests (IfcIsolator#dispose,
 * TooltipIconButton). A switch while A is still loading is queued behind A's
 * load until step A of #2011, and is #2023's later case.
 */
const ENGINE_WORKER_SUFFIX = '/Engine.worker.js'
// Two model loads, plus the GLB writer after each.
const TWO_LOADS_TIMEOUT_MS = 90_000
// `terminate()` runs when the next viewer is built; give the target's
// teardown a moment to reach Playwright.
const WORKER_CLOSE_TIMEOUT_MS = 10_000


type EngineWorker = {closed: boolean}


/**
 * Record every engine worker the page starts, in order, and whether it has
 * closed. Call before `page.goto`.
 *
 * @param page
 * @return the list, kept current
 */
function watchEngineWorkers(page: Page): EngineWorker[] {
  const workers: EngineWorker[] = []
  page.on('worker', (worker: Worker) => {
    if (!worker.url().endsWith(ENGINE_WORKER_SUFFIX)) {
      return
    }
    const entry = {closed: false}
    workers.push(entry)
    worker.on('close', () => {
      entry.closed = true
    })
  })
  return workers
}


describeMobileAndDesktop('open-205: an in-app model switch frees the engine it left', () => {
  test.beforeEach(async ({page, context}) => {
    test.setTimeout(TWO_LOADS_TIMEOUT_MS)
    await homepageSetup(page)
    await setIsReturningUser(context)
    await setupVirtualPathIntercept(page, BOX_PATH, 'box.ifc')
  })

  test('A\'s engine worker is terminated, and B\'s runs', async ({page}) => {
    const workers = watchEngineWorkers(page)
    await page.goto(`${HOME_PATH}?feature=spaModelNav`, {waitUntil: 'domcontentloaded'})
    await waitForModelSettled(page)
    const sessionKind = await page.evaluate(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).store.getState().model?.ifcManager?.ifcAPI?.engineSession?.kind ?? null)
    expect(sessionKind, 'A must have loaded in a worker engine').toBe('worker')
    expect(workers.length, 'A started one engine worker').toBe(1)
    expect(workers[0].closed).toBe(false)
    await rememberShownModel(page, 'A')
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__sameDocument = true
    })

    await openBoxFromSearchBar(page)
    await waitForModelOtherThan(page, 'A')

    // A page load would close every worker of the old document too, so A's
    // worker closing proves nothing unless the switch stayed in this one.
    expect(await page.evaluate(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__sameDocument === true), 'the switch must not load a page').toBe(true)

    expect(workers.length, 'B started an engine worker of its own').toBe(2)
    await expect.poll(() => workers[0].closed, {
      message: 'A\'s engine worker must be terminated', timeout: WORKER_CLOSE_TIMEOUT_MS,
    }).toBe(true)
    expect(workers[1].closed, 'B\'s engine worker must still run').toBe(false)
  })
})
