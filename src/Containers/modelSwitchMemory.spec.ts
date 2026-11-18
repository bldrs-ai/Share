import {expect, Page, test, Worker} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {setupVirtualPathIntercept, waitForModelReady} from '../tests/e2e/models'
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
 * TooltipIconButton).
 *
 * The second describe is the switch while A is still loading (#2011 step A,
 * #2023's mid-load case). A's geometry pump is held at its index (the
 * conway loaders' `__bldrsTestHoldGeometryPump` seam), so A is reliably
 * mid-load whatever the runner's speed, with its tree, title and load report
 * up: the state a switch must not carry over. Under the flag the switch
 * aborts A (Containers/CadView.jsx#abortLoadInFlight): its engine worker is
 * terminated, B loads in the same document, and nothing of A is left in B's
 * store, NavTree root, page title or load report. Before step A the switch
 * was queued behind A's load, which the hold never lets end, so B never
 * loaded. IFC and STEP in the worker, and IFC on the main-thread engine
 * (the kill switch), whose open cannot be interrupted but whose pump stops.
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

  test('while B loads, the store holds nothing of A', async ({page}) => {
    // B held at its index: the stretch in which, before #2011 step A, the
    // store's `model` was still A (it changed only at B's `setModel`), and so
    // was everything rendered from it (in-app-model-switch.md §2.4).
    await holdLoadAtIndex(page, 2)
    await page.goto(`${HOME_PATH}?feature=spaModelNav`, {waitUntil: 'domcontentloaded'})
    await waitForModelSettled(page)
    const a = await shownState(page)
    expect(a.hasModel).toBe(true)
    expect(a.reportText).toContain('index.ifc')
    await rememberShownModel(page, 'A')

    await openBoxFromSearchBar(page)
    await waitForHeldLoad(page)
    await expect.poll(async () => (await shownState(page)).rootLabel, {
      message: 'B\'s tree must come up at its index', timeout: TWO_LOADS_TIMEOUT_MS,
    }).not.toBeNull()

    const held = await shownState(page)
    expect(held.isModelReady, 'B must still be loading').toBe(false)
    expect(await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any
      return w.store.getState().model === w.__shownModels.A.deref() && w.__shownModels.A.deref() !== undefined
    }), 'the store must not hold A\'s model while B loads').toBe(false)
    expect(held.hasModel, 'no model is shown until B\'s arrives').toBe(false)
    expect(held.rootLabel, 'the NavTree root is B\'s index tree').not.toBe(a.rootLabel)
    expect(held.reportText, 'the load report is B\'s').not.toContain('index.ifc')

    await page.evaluate(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__bldrsTestReleaseHeldPump())
    await waitForModelOtherThan(page, 'A')
    expect((await shownState(page)).reportText).toContain('box.ifc')
  })
})


/**
 * Hold the `nth` load's geometry pump (1 = the page's first) at its index
 * until the test lets it go (`window.__bldrsTestReleaseHeldPump`); every
 * other load passes straight through. The conway loaders await
 * `__bldrsTestHoldGeometryPump` between the deferred open and the first
 * batch, in the worker load too, whose engine then starts paused
 * (engine/engineModelLoad.js). Call before `page.goto`.
 *
 * @param page
 * @param nth
 */
async function holdLoadAtIndex(page: Page, nth: number) {
  await page.addInitScript((heldLoad) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    let loads = 0
    w.__bldrsTestHoldGeometryPump = () => {
      loads++
      if (loads !== heldLoad) {
        return Promise.resolve()
      }
      return new Promise<void>((resolve) => {
        w.__bldrsTestReleaseHeldPump = resolve
      })
    }
  }, nth)
}


/**
 * Wait until the held load is parked at its index.
 *
 * @param page
 */
async function waitForHeldLoad(page: Page) {
  await page.waitForFunction(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    typeof (window as any).__bldrsTestReleaseHeldPump === 'function')
}


/** What of the shown model the store and the page say, for the A/B checks. */
type ShownState = {
  isModelReady: boolean,
  hasModel: boolean,
  rootLabel: string | null,
  reportText: string,
  alert: string | null,
}


/**
 * @param page
 * @return the shown model's state, as the NavTree, the load report and the
 *   alert dialog read it from the store
 */
function shownState(page: Page): Promise<ShownState> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (window as any).store.getState()
    const root = s.rootElement
    const label = root ? String(root.Name?.value ?? root.LongName?.value ?? root.expressID ?? '') : null
    return {
      isModelReady: s.isModelReady === true,
      hasModel: Boolean(s.model),
      rootLabel: label,
      reportText: (s.loadReportLines ?? []).join('\n'),
      alert: s.alert ? String(s.alert.message ?? s.alert) : null,
    }
  })
}


describeMobileAndDesktop('open-205: a switch while the model is still loading aborts its load', () => {
  test.beforeEach(async ({page, context}) => {
    test.setTimeout(TWO_LOADS_TIMEOUT_MS)
    await homepageSetup(page)
    await setIsReturningUser(context)
    await setupVirtualPathIntercept(page, BOX_PATH, 'box.ifc')
    await holdLoadAtIndex(page, 1)
  })

  for (const {label, path, fileName, isWorker} of [
    {label: 'IFC in the engine worker', path: HOME_PATH, fileName: 'index.ifc', isWorker: true},
    {label: 'STEP in the engine worker', path: '/share/v/p/index.step', fileName: 'index.step', isWorker: true},
    {label: 'IFC on the main-thread engine', path: HOME_PATH, fileName: 'index.ifc', isWorker: false,
      feature: 'disableEngineWorker'},
  ].map((leg) => ({...leg, path: `${leg.path}?feature=spaModelNav${leg.feature ? `,${leg.feature}` : ''}`}))) {
    test(`${label}: A's load stops, B loads, and nothing of A is left`, async ({page}) => {
      const workers = watchEngineWorkers(page)
      // CadView's failure path logs the error it alerts and captures; an
      // abort must never take it (no alert, no Sentry, no load_failed).
      const failureLines: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error' && /abort|session closed/i.test(msg.text())) {
          failureLines.push(msg.text())
        }
      })
      await page.goto(path, {waitUntil: 'domcontentloaded'})

      // A at its index, held: tree, title and report up, not ready.
      await waitForHeldLoad(page)
      await expect.poll(async () => (await shownState(page)).rootLabel, {
        message: 'A\'s tree must come up at its index', timeout: TWO_LOADS_TIMEOUT_MS,
      }).not.toBeNull()
      const a = await shownState(page)
      expect(a.isModelReady, 'A must still be loading when the switch is made').toBe(false)
      expect(a.reportText, 'A\'s load report must be up').toContain(fileName)
      const aTitle = await page.title()
      if (isWorker) {
        expect(workers.length, 'A started one engine worker').toBe(1)
        expect(workers[0].closed).toBe(false)
      } else {
        expect(workers.length, 'the kill switch keeps A on the main thread').toBe(0)
      }
      await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__sameDocument = true
      })

      await openBoxFromSearchBar(page)
      await waitForModelReady(page, TWO_LOADS_TIMEOUT_MS)
      await expect.poll(async () => (await shownState(page)).reportText, {
        message: 'B\'s load report', timeout: TWO_LOADS_TIMEOUT_MS,
      }).toContain('box.ifc')

      expect(await page.evaluate(() =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__sameDocument === true), 'the switch must not load a page').toBe(true)
      if (isWorker) {
        await expect.poll(() => workers[0].closed, {
          message: 'A\'s engine worker must be terminated mid-load', timeout: WORKER_CLOSE_TIMEOUT_MS,
        }).toBe(true)
        expect(workers.length, 'B started an engine worker of its own').toBe(2)
        expect(workers[1].closed, 'B\'s engine worker must still run').toBe(false)
      }

      // Let A's held pump go. Its load was given up, so nothing may come of
      // it: an A that were still running would now stream and finish into
      // the store. B's state is pinned first, by identity, to compare after.
      await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any
        const {model, rootElement} = w.store.getState()
        w.__bShown = {model, rootElement}
        w.__bldrsTestReleaseHeldPump()
      })
      // eslint-disable-next-line no-magic-numbers
      await page.waitForTimeout(2_000)
      expect(await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any
        const {model, rootElement} = w.store.getState()
        // Not the report's lines: B's own can still gain one after its
        // Total (the deferred BVH's Health line); the text check below
        // covers A's.
        return {model: model === w.__bShown.model, rootElement: rootElement === w.__bShown.rootElement}
      }), 'nothing of A may land after B is shown').toEqual({model: true, rootElement: true})

      const b = await shownState(page)
      expect(b.isModelReady).toBe(true)
      expect(b.hasModel).toBe(true)
      expect(b.alert, 'aborting A must raise no alert').toBeNull()
      expect(failureLines, 'aborting A must not be handled as a failed load').toEqual([])
      expect(b.rootLabel, 'the NavTree root must be B\'s, not A\'s').not.toBe(a.rootLabel)
      expect(b.reportText, 'the load report must be B\'s').toContain('box.ifc')
      expect(b.reportText, 'no line of A\'s load report may be left').not.toContain(fileName)
      await expect(page, 'the title must be B\'s').not.toHaveTitle(aTitle)
      // The store's model is B's own: its engine (on the worker path) is
      // B's live worker session, not A's closed one.
      if (isWorker) {
        expect(await page.evaluate(() =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).store.getState().model?.ifcManager?.ifcAPI?.engineSession?.closed)).toBe(false)
      }
    })
  }
})


/**
 * Flip the theme from the profile menu, which re-creates the viewer
 * (CadView registers `initViewer` as a theme listener) and reloads the
 * model into the new one.
 *
 * @param page
 */
async function changeTheme(page: Page) {
  await page.getByTestId('control-button-profile').click()
  const night = page.getByTestId('control-button-profile-menu-item-theme-night')
  const isNight = (await night.getAttribute('aria-checked')) === 'true'
  await (isNight ? page.getByTestId('control-button-profile-menu-item-theme-day') : night).click()
  await page.keyboard.press('Escape')
}


describeMobileAndDesktop('open-205: a theme change while the model is still loading reloads it', () => {
  test.beforeEach(async ({page, context}) => {
    test.setTimeout(TWO_LOADS_TIMEOUT_MS)
    await homepageSetup(page)
    await setIsReturningUser(context)
    await holdLoadAtIndex(page, 1)
  })

  // The same model in a re-created viewer (#2011 step A): the load streaming
  // into the disposed viewer is aborted with it, its engine terminated, and
  // the model loaded again into the new one, with no failure reported.
  test('the first load\'s engine is terminated and the model loads in the new viewer', async ({page}) => {
    const workers = watchEngineWorkers(page)
    const failureLines: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' && /abort|session closed/i.test(msg.text())) {
        failureLines.push(msg.text())
      }
    })
    await page.goto(`${HOME_PATH}?feature=spaModelNav`, {waitUntil: 'domcontentloaded'})
    await waitForHeldLoad(page)
    expect((await shownState(page)).isModelReady).toBe(false)
    expect(workers.length).toBe(1)
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any
      w.__viewerBefore = new w.WeakRef(w.store.getState().viewer)
    })

    await changeTheme(page)
    await waitForModelReady(page, TWO_LOADS_TIMEOUT_MS)

    expect(await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any
      return w.store.getState().viewer !== w.__viewerBefore.deref()
    }), 'the model must be shown in the new viewer').toBe(true)
    await expect.poll(() => workers[0].closed, {
      message: 'the first load\'s engine worker must be terminated', timeout: WORKER_CLOSE_TIMEOUT_MS,
    }).toBe(true)
    expect(workers.length, 'the reload started an engine worker of its own').toBe(2)
    expect(workers[1].closed).toBe(false)
    const shown = await shownState(page)
    expect(shown.alert, 'the reload must raise no alert').toBeNull()
    expect(failureLines, 'the abort must not be handled as a failed load').toEqual([])
    expect(shown.reportText).toContain('index.ifc')
  })
})
