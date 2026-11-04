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
const GRID_PATH = '/100/500/9010'
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

  test('engine worker: rapid NavTree clicks across the end of the load leave the LAST selection\'s properties', async ({page}) => {
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
    await page.getByTestId('control-button-properties').click()
    await expect(page.getByTestId('PropertiesPanel')).toBeVisible()

    // One burst, in page: select the grid and the proxy back and forth, let
    // the geometry in mid-burst, and end on the grid. Each selection is an
    // engine round trip to the worker, so their answers come back in a pile
    // around the handover from the indexed model to the finished one.
    await page.evaluate(async () => {
      const w = window as unknown as Record<string, () => void>
      const click = (label: string) => {
        const row = document.querySelector(`[data-testid="NavTreePanel"] [data-node-label="${label}"]`)
        const target = row?.querySelector('[data-testid="NavTreeNodeLabel"]') as HTMLElement | null
        if (!target) {
          throw new Error(`no NavTree row ${label}`)
        }
        target.click()
      }
      const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
      for (const label of ['Grid', 'P-1', 'Grid', 'P-1']) {
        click(label)
        await tick()
      }
      w.__bldrsTestReleaseGeometryPump()
      for (const label of ['Grid', 'P-1', 'Test Building', 'P-1', 'Grid']) {
        click(label)
        await tick()
      }
    })
    await waitForModelReady(page)

    const panel = page.getByTestId('PropertiesPanel')
    await expect(panel.getByText(GRID_AXIS_TYPE).first()).toBeVisible()
    await expect(panel.getByText(PROXY_ONLY_TEXT)).toHaveCount(0)
    await expect(page.getByText(APP_ERROR_TEXT)).toHaveCount(0)
    expect(errors).toEqual([])
    await engine.expectWorkerEngine()
  })
})
