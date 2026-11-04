import {Locator, Page, expect, test} from '@playwright/test'
import {watchEngineWorker} from '../../tests/e2e/engineWorker'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {setupVirtualPathIntercept, waitForModelReady} from '../../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../../tests/e2e/utils'


/**
 * Share#2063: selecting an IfcGrid with the Properties panel open replaced the
 * whole app with "Oh no!". The grid's UAxes / VAxes are references to
 * IfcGridAxis entities, which have no GlobalId, so deref resolves each to an
 * entity object, and the panel handed that array to React as children (React
 * #31), which the root ErrorBoundary turned into the application error page.
 * Engine-independent; first seen under `?feature=engineWorker` on a large
 * model. The fixture is box.ifc plus one two-axis grid.
 */
const MODEL = '/share/v/gh/bldrs-ai/test-models/main/ifc/misc/grid-axes.ifc'
const GRID_ID = 9010
const GRID_PATH = `/100/500/${GRID_ID}`
const APP_ERROR_TEXT = 'Oh no!'
// The grid's own rows, and one of the box proxy's that the grid has not.
const GRID_AXIS_TYPE = 'Gridaxis'
const PROXY_ONLY_TEXT = 'sample proxy'
const ENGINES = [
  {name: 'main-thread engine', query: ''},
  {name: 'engine worker', query: '?feature=engineWorker'},
]


/**
 * @param page
 * @return the page errors seen from now on
 */
function collectPageErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  return errors
}


/**
 * Hold the geometry pump from the first page script on (the seam
 * navTreeAtIndex.spec.ts documents), so clicks can be fired while the load is
 * at its index and again as it ends.
 *
 * @param page
 */
async function holdGeometry(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>
    w.__bldrsTestHoldGeometryPump = () => new Promise<void>((resolve) => {
      w.__bldrsTestReleaseGeometryPump = resolve
    })
  })
}


/**
 * Expand the mounted tree, one toggle per settle (in-page clicks: the rows
 * sit over a live canvas that keeps Playwright's actionability wait busy).
 *
 * @param panel
 */
async function expandTree(panel: Locator) {
  const MAX_EXPAND_CLICKS = 20
  const EXPAND_SETTLE_MS = 150
  for (let click = 0; click < MAX_EXPAND_CLICKS; click++) {
    const next = panel.locator(
      '[data-node-label][data-is-expanded="false"] [data-testid="NavTreeNodeToggle"]').first()
    if (await next.count() === 0) {
      break
    }
    await next.evaluate((e) => (e as HTMLElement).click())
    await panel.page().waitForTimeout(EXPAND_SETTLE_MS)
  }
}


describeMobileAndDesktop('Properties: an element whose references resolve to entities', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await setupVirtualPathIntercept(page, MODEL, '')
  })

  for (const {name, query} of ENGINES) {
    test(`${name}: the selected grid's properties open in the panel, and the app stays up`, async ({page}) => {
      const errors = collectPageErrors(page)
      const engine = watchEngineWorker(page)
      await page.goto(`${MODEL}${GRID_PATH}${query}`)
      await waitForModelReady(page)
      await page.getByTestId('control-button-properties').click()

      const panel = page.getByTestId('PropertiesPanel')
      await expect(panel).toBeVisible()
      // An axis is its own nested table: its type, and its tag.
      await expect(panel.getByText(GRID_AXIS_TYPE).first()).toBeVisible()
      await expect(panel.getByText('A', {exact: true}).first()).toBeVisible()
      await expect(page.getByText(APP_ERROR_TEXT)).toHaveCount(0)
      expect(errors).toEqual([])
      if (query) {
        await engine.expectWorkerEngine()
      }
    })
  }

  // Share#2070: under the worker each engine read is a round trip that waits
  // behind a page frame, and the panel made one per reference (and one per
  // property of each property set). It now asks for each table whole
  // (`propertyTables`, resolved next to the engine by propertyTable.js), so
  // the grid's panel is a fixed handful of requests however many axes the
  // grid has. Counted at the session, from the click that opens the panel.
  test('engine worker: the grid\'s tables cost one request each, not one per reference', async ({page}) => {
    const errors = collectPageErrors(page)
    const engine = watchEngineWorker(page)
    await page.goto(`${MODEL}${GRID_PATH}?feature=engineWorker`)
    await waitForModelReady(page)
    await engine.expectWorkerEngine()
    await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const w = window as any
      const session = w.store.getState().model.ifcManager.ifcAPI.engineSession
      w.__bldrsTestOps = []
      const request = session.request.bind(session)
      session.request = (op: string, args: any, ...rest: unknown[]) => {
        w.__bldrsTestOps.push(op === 'props' ? `props ${args.ids.join(',')}` : op)
        return request(op, args, ...rest)
      }
      /* eslint-enable @typescript-eslint/no-explicit-any */
    })
    await page.getByTestId('control-button-properties').click()
    const panel = page.getByTestId('PropertiesPanel')
    await expect(panel.getByText(GRID_AXIS_TYPE).first()).toBeVisible()
    await expect(panel.getByText('A', {exact: true}).first()).toBeVisible()
    // The panel's last request for the grid is its property sets (it has
    // none, so no tables follow): every read the panel made is in by then.
    await page.waitForFunction(() =>
      (window as unknown as Record<string, string[]>).__bldrsTestOps.includes('propertySets'))
    const ops: string[] = await page.evaluate(() =>
      (window as unknown as Record<string, string[]>).__bldrsTestOps)
    // The only `props` reads are of the grid itself (the panel's effect can
    // run more than once as it mounts, and each run fetches the selection);
    // its references are read inside `propertyTables`. Per reference, each of
    // the grid's two axes was a `props` round trip of its own.
    const reads = ops.filter((op) => op.startsWith('props'))
    expect(reads.length, ops.join(', ')).toBeGreaterThanOrEqual(1)
    expect(new Set(reads), ops.join(', ')).toEqual(new Set([`props ${GRID_ID}`]))
    expect(ops, ops.join(', ')).toContain('propertyTables')
    await expect(page.getByText(APP_ERROR_TEXT)).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test('engine worker (smoke): rapid NavTree clicks across the end of the load leave the LAST selection\'s properties', async ({page}) => {
    const TEST_TIMEOUT = 90_000
    test.setTimeout(TEST_TIMEOUT)
    const errors = collectPageErrors(page)
    const engine = watchEngineWorker(page)
    await holdGeometry(page)
    await page.goto(`${MODEL}?feature=engineWorker`)
    await page.waitForFunction(() =>
      typeof (window as unknown as Record<string, unknown>).__bldrsTestReleaseGeometryPump === 'function')

    await page.getByTestId('control-button-navigation').click()
    const navTree = page.getByTestId('NavTreePanel')
    await expect(navTree.locator('[data-node-label]').first()).toBeVisible()
    await expandTree(navTree)
    await expect(navTree.locator('[data-node-label="Grid"]')).toHaveCount(1)
    // The Properties control appears once something is selected.
    const building = navTree.locator('[data-node-label="Test Building"]')
    await building.getByTestId('NavTreeNodeLabel').first().evaluate((e) => (e as HTMLElement).click())
    await expect(building.first()).toHaveAttribute('data-is-selected', 'true')
    await page.getByTestId('control-button-properties').click()
    await expect(page.getByTestId('PropertiesPanel')).toBeVisible()
    // On a phone the panels share one tabbed drawer and Properties took the
    // front; the burst clicks rows, so bring the tree's tab back.
    const isTabbed = !(await navTree.isVisible())
    if (isTabbed) {
      await page.getByRole('tab', {name: 'Nav'}).click()
      await expect(navTree.locator('[data-node-label="Grid"]')).toHaveCount(1)
    }

    // In-page clicks, so a burst is not paced by Playwright's actionability
    // waits (the rows sit over a live canvas).
    const clickRows = async (labels: string[], releaseAfter: number, paced = true) => {
      await page.evaluate(async ({rows, release, pace}) => {
        const w = window as unknown as Record<string, () => void>
        const tick = () => (pace ? new Promise((resolve) => setTimeout(resolve, 0)) : Promise.resolve())
        for (let i = 0; i < rows.length; i++) {
          const row = document.querySelector(`[data-testid="NavTreePanel"] [data-node-label="${rows[i]}"]`)
          const target = row?.querySelector('[data-testid="NavTreeNodeLabel"]') as HTMLElement | null
          if (!target) {
            throw new Error(`no NavTree row ${rows[i]}`)
          }
          target.click()
          if (i === release) {
            w.__bldrsTestReleaseGeometryPump()
          }
          await tick()
        }
      }, {rows: labels, release: releaseAfter, pace: paced})
    }

    // 1. Across the end of the load: the grid and the proxy back and forth,
    // with the geometry let in mid-burst, so answers from the indexed
    // model's facade are in flight while it is swapped for the finished
    // model (whose effect re-run then reads the current selection again).
    const NO_RELEASE = -1
    const RELEASE_AFTER = 3
    await clickRows(['Grid', 'P-1', 'Grid', 'P-1', 'Grid', 'P-1'], RELEASE_AFTER)
    await waitForModelReady(page)

    // 2. Then the grid and, in the same task, the building, with the panel
    // open. This is a SMOKE test of the hand-off and of rapid selection
    // under the worker engine: no page error, no "Oh no!", and the last
    // selection's properties on screen. It does not prove Properties.jsx's
    // isStale guard. It still passes with every isStale check removed,
    // because the worker answers in order and the next selection always
    // lands before the earlier chain's first answer, so nothing arrives out
    // of order. The guard's own test is Properties.test.jsx ("a slow answer
    // for an earlier selection…"), which holds an earlier answer back on
    // purpose.
    await clickRows(['Grid', 'Test Building'], NO_RELEASE, false)
    if (isTabbed) {
      await page.getByRole('tab', {name: 'Props'}).click()
    }

    const panel = page.getByTestId('PropertiesPanel')
    await expect(panel.getByText('Test Building', {exact: true}).first()).toBeVisible()
    // Settle: give any late answer for an earlier selection time to land.
    const LATE_ANSWER_MS = 1500
    await page.waitForTimeout(LATE_ANSWER_MS)
    await expect(panel.getByText('Test Building', {exact: true}).first()).toBeVisible()
    await expect(panel.getByText(GRID_AXIS_TYPE)).toHaveCount(0)
    await expect(panel.getByText(PROXY_ONLY_TEXT)).toHaveCount(0)
    await expect(page.getByText(APP_ERROR_TEXT)).toHaveCount(0)
    expect(errors).toEqual([])
    await engine.expectWorkerEngine()
  })
})
