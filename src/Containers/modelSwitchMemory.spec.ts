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
 * It also asserts that A's model object is garbage-collected, and on the
 * kill-switch path (`?feature=disableEngineWorker`) A's main-thread IfcAPI,
 * the whole WASM engine: a `WeakRef` to each is cleared after a forced GC
 * (CDP `HeapProfiler.collectGarbage`). Each retainer the heap snapshots found
 * on the way has its own unit test where it was cut: PlaceMark (#2017),
 * IfcIsolator#dispose, TooltipIconButton, ResidencyControl's per-model
 * remount, the disposed camera's listeners and the disposed viewer's IFC
 * loader (#2019; design/new/in-app-model-switch.md §2.4). A switch while A
 * is still loading is queued behind A's load until step A of #2011, and is
 * #2023's later case.
 */
const ENGINE_WORKER_SUFFIX = '/Engine.worker.js'
// Two model loads, plus the GLB writer after each.
const TWO_LOADS_TIMEOUT_MS = 90_000
// `terminate()` runs when the next viewer is built; give the target's
// teardown a moment to reach Playwright.
const WORKER_CLOSE_TIMEOUT_MS = 10_000


// Forced GCs before giving up on a WeakRef. One usually does it; a few
// cover what a GC finalizes only on the next (V8 clears a WeakRef only after
// the task that last dereferenced it).
const GC_ROUNDS = 5
const GC_PAUSE_MS = 100


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


/**
 * Hold A's model, and its main-thread IfcAPI when it has one, weakly, as
 * `window.__leftWeakRefs`, so the spec itself keeps neither alive.
 *
 * @param page
 */
async function rememberLeftModelWeakly(page: Page) {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const model = w.store.getState().model
    const ifcAPI = model?.ifcManager?.ifcAPI
    // The repo's TS lib predates WeakRef; the browser has it.
    w.__leftWeakRefs = {model: new w.WeakRef(model)}
    if (ifcAPI && !ifcAPI.engineSession) {
      w.__leftWeakRefs.ifcAPI = new w.WeakRef(ifcAPI)
    }
  })
}


/**
 * Force GCs until every WeakRef rememberLeftModelWeakly made is cleared, or
 * GC_ROUNDS pass.
 *
 * @param page
 * @return the names of the ones still set
 */
async function stillReachableAfterGc(page: Page): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page)
  // DevTools' console store keeps whatever the page logged, and the load
  // logs the model; that would be a retainer only while CDP is attached.
  await cdp.send('Runtime.enable')
  await cdp.send('Runtime.discardConsoleEntries')
  let held: string[] = []
  for (let i = 0; i < GC_ROUNDS; i++) {
    await cdp.send('HeapProfiler.collectGarbage')
    await page.waitForTimeout(GC_PAUSE_MS)
    held = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const refs = (window as any).__leftWeakRefs as Record<string, {deref: () => unknown}>
      return Object.keys(refs).filter((name) => refs[name].deref() !== undefined)
    })
    if (held.length === 0) {
      break
    }
  }
  await cdp.detach()
  return held
}


/**
 * Load A, switch in-app to B, and wait for B: the part both engines share.
 *
 * @param page
 * @param features the `?feature=` list
 */
async function switchInApp(page: Page, features: string) {
  await page.goto(`${HOME_PATH}?feature=${features}`, {waitUntil: 'domcontentloaded'})
  await waitForModelSettled(page)
  await rememberShownModel(page, 'A')
  await rememberLeftModelWeakly(page)
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__sameDocument = true
  })
  await openBoxFromSearchBar(page)
  await waitForModelOtherThan(page, 'A')
  // A page load would free everything of the old document too, so nothing
  // below proves anything unless the switch stayed in this one.
  expect(await page.evaluate(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__sameDocument === true), 'the switch must not load a page').toBe(true)
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

  test('A\'s model is collected', async ({page}) => {
    await switchInApp(page, 'spaModelNav')
    expect(await stillReachableAfterGc(page), 'A\'s model must be garbage-collected').toEqual([])
  })

  // The kill switch keeps the engine on the main thread, so nothing
  // terminates it: A's IfcAPI and its WASM heap go only once nothing reaches
  // them.
  test('on the main-thread engine, A\'s model and its IfcAPI are collected', async ({page}) => {
    await switchInApp(page, 'spaModelNav,disableEngineWorker')
    expect(await page.evaluate(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.keys((window as any).__leftWeakRefs)), 'A ran on a main-thread IfcAPI').toEqual(['model', 'ifcAPI'])
    expect(await stillReachableAfterGc(page), 'A\'s model and IfcAPI must be garbage-collected').toEqual([])
  })
})
