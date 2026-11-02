import {Locator, Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {waitForModelReady} from '../../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../../tests/e2e/utils'


const {beforeEach} = test


// One click per settle: NavTreePanel's toggle handler reads the render-time
// expansion, so clicks dispatched in one task overwrite each other (see
// NavTree.cacheHit.spec.ts#expandTree for the whole story).
const MAX_EXPAND_CLICKS = 20
const EXPAND_SETTLE_MS = 150
const COLLAPSED_TOGGLE =
  '[data-node-label][data-is-expanded="false"] [data-testid="NavTreeNodeToggle"]'


/**
 * Hold the geometry pump from the first page script on: the conway loader
 * awaits `window.__bldrsTestHoldGeometryPump` between the deferred open and
 * the first batch (conwayDirectIfcLoader.js#holdGeometryPumpForTest), and this
 * one resolves only when the test calls `releaseGeometry`. Without the hold,
 * the bundled fixtures stream in well under a second and "before the geometry
 * finishes" would be a race the test could win or lose on runner speed.
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
 * Wait until the load is parked at the hold, i.e. indexed and not streaming.
 *
 * @param page
 */
async function waitForGeometryHeld(page: Page) {
  await page.waitForFunction(() =>
    typeof (window as unknown as Record<string, unknown>).__bldrsTestReleaseGeometryPump === 'function')
}


/**
 * Let the held pump run.
 *
 * @param page
 */
async function releaseGeometry(page: Page) {
  await page.evaluate(() =>
    ((window as unknown as Record<string, () => void>).__bldrsTestReleaseGeometryPump)())
}


/**
 * Expand the mounted tree, one toggle per settle. In-page clicks: the rows sit
 * over a live canvas that keeps Playwright's actionability wait busy.
 *
 * @param panel
 */
async function expandTree(panel: Locator) {
  for (let click = 0; click < MAX_EXPAND_CLICKS; click++) {
    const next = panel.locator(COLLAPSED_TOGGLE).first()
    if (await next.count() === 0) {
      break
    }
    await next.evaluate((e) => (e as HTMLElement).click())
    await panel.page().waitForTimeout(EXPAND_SETTLE_MS)
  }
}


/**
 * open-205 #2029: a Conway (IFC/STEP) load brings the NavTree, properties and
 * search up at the model's index, while geometry still streams, instead of
 * after the last mesh. Each test holds the geometry pump, does what a user
 * would with the tree — open it, expand it, select a row, read its properties
 * — and checks the model is still not ready throughout, so all of it happened
 * before the geometry finished. Then it lets the geometry in and checks the
 * load completes.
 *
 * Before the change this cannot pass: the tree arrived only once the load
 * resolved, which the hold prevents, and the loading overlay swallowed every
 * click until then.
 */
describeMobileAndDesktop('Open 205: NavTree usable before geometry finishes', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await holdGeometry(page)
  })

  for (const {format, path, row} of [
    {format: 'IFC', path: '/share/v/p/index.ifc', row: 'Together'},
    {format: 'STEP', path: '/share/v/p/index.step', row: null},
  ]) {
    test(`${format}: expand, select and read properties while geometry is held`, async ({page}) => {
      const TEST_TIMEOUT = 90_000
      test.setTimeout(TEST_TIMEOUT)
      await page.goto(path)
      await waitForGeometryHeld(page)

      const dropzone = page.getByTestId('cadview-dropzone')
      await expect(dropzone).toHaveAttribute('data-model-ready', 'false')

      await page.getByTestId('control-button-navigation').click()
      const navTreePanel = page.getByTestId('NavTreePanel')
      await expect(navTreePanel).toBeVisible()
      const rows = navTreePanel.locator('[data-node-label]')
      await expect(rows.first()).toBeVisible()
      await expandTree(navTreePanel)
      // More than the root came up: a real hierarchy, read at the index.
      expect(await rows.count()).toBeGreaterThan(1)

      // IFC: a named leaf of index.ifc. STEP: the deepest mounted row — one
      // occurrence of a part reused across the assembly, so its label repeats
      // and the row is told apart by position, which selection keys on too
      // (per occurrence, design/new/step-occurrence-selection.md).
      const labels = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-node-label')))
      const targetIndex = row === null ? labels.length - 1 : labels.indexOf(row)
      expect(targetIndex).toBeGreaterThanOrEqual(0)
      const target = rows.nth(targetIndex)
      await target.getByTestId('NavTreeNodeLabel').evaluate((e) => (e as HTMLElement).click())
      await expect(target).toHaveAttribute('data-is-selected', 'true')

      await page.getByTestId('control-button-properties').click()
      const propertiesPanel = page.getByTestId('PropertiesPanel')
      await expect(propertiesPanel).toBeVisible()
      await expect(propertiesPanel.locator('table').first()).toBeVisible()
      if (row !== null) {
        await expect(propertiesPanel).toContainText(row)
      }

      // All of the above happened with the geometry still held.
      await expect(dropzone).toHaveAttribute('data-model-ready', 'false')

      await releaseGeometry(page)
      await waitForModelReady(page)
      // The selection made while streaming survives the load's end. On a
      // phone the panels share one tabbed drawer and Properties took the
      // front; the tree is still open behind its own tab.
      if (!(await navTreePanel.isVisible())) {
        await page.getByRole('tab', {name: 'Nav'}).click()
      }
      await expect(rows.nth(targetIndex)).toHaveAttribute('data-is-selected', 'true')
      // ...and only it: a reused STEP part's other occurrences stay unselected.
      expect(await navTreePanel.locator('[data-is-selected="true"]').count()).toBe(1)
    })
  }
})
