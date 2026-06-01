import {expect, test, Page} from '@playwright/test'
import {
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
} from '../../tests/e2e/utils'
import {waitForModelReady} from '../../tests/e2e/models'


const {beforeEach, describe} = test


type StoreState = {
  selectedElements: string[]
  selectedInstanceIds: number[]
  setSelectedInstanceIds: (ids: number[]) => void
  viewer?: {getSelectedIds?: () => number[]}
}
type WindowWithStore = Window & {store?: {getState: () => StoreState}}


/**
 * The parent-level selection the store currently holds (stringified
 * expressIDs).
 *
 * @param page Playwright page
 * @return selectedElements
 */
function getSelectedElements(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    (window as unknown as WindowWithStore).store?.getState().selectedElements ?? [])
}

/**
 * The expressIDs actually highlighted in the 3D scene, read straight off
 * the viewer — the real proof the scene followed the selection.
 *
 * @param page Playwright page
 * @return selected expressIDs in the scene
 */
function getSceneSelectedIds(page: Page): Promise<number[]> {
  return page.evaluate(() =>
    (window as unknown as WindowWithStore).store?.getState().viewer?.getSelectedIds?.() ?? [])
}

/**
 * The Conway-direct per-instance highlight ids.
 *
 * @param page Playwright page
 * @return selectedInstanceIds
 */
function getSelectedInstanceIds(page: Page): Promise<number[]> {
  return page.evaluate(() =>
    (window as unknown as WindowWithStore).store?.getState().selectedInstanceIds ?? [])
}

/**
 * Walk the known index.ifc hierarchy down to its leaf elements. Selecting
 * a node auto-expands its ancestor path (CadView's selection effect), so
 * clicking labels in sequence reveals the next level — the same route the
 * IframeIntegration spec relies on. Leaves the `Together` leaves visible.
 *
 * Clicks are scoped to the Navigation panel: unscoped `getByText('Bldrs')`
 * also matches the `BLDRS.AI` page title (case-insensitive substring),
 * tripping Playwright strict mode.
 *
 * @param page Playwright page
 * @return the Navigation panel locator, for scoping leaf clicks
 */
async function openNavTreeToLeaves(page: Page) {
  await page.getByTestId('control-button-navigation').click()
  const navPanel = page.getByTestId('SideDrawerPanel-Paper-Navigation')
  await navPanel.getByText('Bldrs').click()
  await navPanel.getByText('Build').click()
  await navPanel.getByText('Every').click()
  await navPanel.getByText('Thing').click()
  return navPanel
}


/**
 * Bidirectional scene ↔ NavTree selection sync + element-path permalinks.
 *
 * Migrated and de-screenshotted from
 * cypress/e2e/view-100/synchronized-view-and-navtree.cy.js — it now
 * asserts observable store + URL state (via `window.store`) instead of
 * pixels, so it runs without golden images and pins the actual behaviour
 * the bug touched rather than a rendering snapshot.
 *
 * Epic view-100 (3D + NavTree + Properties), story #1046 Synchronized
 * View+NavTree. The permalink half is the selection slice of search-100
 * #1180 (Permalinks).
 *
 * @see https://github.com/bldrs-ai/Share/issues/1046
 */
describe('View 100: Synchronized View and NavTree', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  // The regressed direction: a NavTree click must drive the 3D scene.
  test('NavTree selection highlights the element in the scene and writes the element-path permalink', async ({page}) => {
    await visitHomepageWaitForModel(page)
    const navPanel = await openNavTreeToLeaves(page)
    await navPanel.getByText('Together').first().click()

    // The tree click drove a selection into the store...
    await expect.poll(async () => (await getSelectedElements(page)).length).toBeGreaterThan(0)
    const selected = await getSelectedElements(page)

    // ...the scene highlight followed it (nav → scene)...
    await expect.poll(async () => (await getSceneSelectedIds(page)).length).toBeGreaterThan(0)
    const sceneIds = (await getSceneSelectedIds(page)).map(String)
    expect(sceneIds).toEqual(expect.arrayContaining([selected[0]]))

    // ...and the element path is now in the URL as a shareable permalink.
    expect(page.url()).toMatch(/\/index\.ifc\/\d+/)
  })

  // Regression for the reported bug: a per-instance highlight left behind
  // by a prior scene pick must not survive a later NavTree selection.
  // Pre-fix the stale `selectedInstanceIds` was re-applied over the new
  // element, so the scene kept showing the old pick — the tree stopped
  // driving the scene.
  test('a NavTree selection clears a stale per-instance highlight from a prior scene pick', async ({page}) => {
    await visitHomepageWaitForModel(page)
    const navPanel = await openNavTreeToLeaves(page)

    // Simulate the residue of a Conway-direct scene pick AFTER navigating
    // (the navigation clicks above would otherwise have cleared it).
    const STALE_INSTANCE_ID = 999999
    await page.evaluate((id) => {
      (window as unknown as WindowWithStore).store?.getState().setSelectedInstanceIds([id])
    }, STALE_INSTANCE_ID)

    await navPanel.getByText('Together').first().click()

    // The selection funnel reset the per-instance highlight...
    await expect.poll(async () => (await getSelectedInstanceIds(page)).length).toBe(0)
    // ...so the scene reflects the newly-selected element, not the stale one.
    const selected = await getSelectedElements(page)
    const sceneIds = (await getSceneSelectedIds(page)).map(String)
    expect(sceneIds).toEqual(expect.arrayContaining([selected[0]]))
  })

  // A scene pick is the other half of "set its path as part of the link":
  // selecting in the scene must also produce a shareable permalink — and
  // the no-shift pick's per-instance highlight must survive the
  // self-induced navigation (the location-watch effect must not re-select
  // the element and reset selectedInstanceIds).
  test('a no-shift scene pick writes the permalink and keeps the per-instance highlight', async ({page}) => {
    await visitHomepageWaitForModel(page)

    // index.ifc is fit-to-frame and centered, so a center double-click
    // lands on geometry. The Conway-direct pick routes through the same
    // selection funnel as the NavTree, which writes the element path.
    await page.locator('canvas').first().dblclick()

    await expect.poll(async () => (await getSelectedElements(page)).length).toBeGreaterThan(0)
    expect(page.url()).toMatch(/\/index\.ifc\/\d+/)
    // The no-shift pick narrows the highlight to ONE PlacedGeometry; that
    // restriction must not be widened back to the whole element by the
    // navigation it just triggered.
    await expect.poll(async () => (await getSelectedInstanceIds(page)).length).toBe(1)
  })

  // The reverse: opening a permalink pre-selects the element in both the
  // scene and the store (and, by extension, the NavTree, which renders
  // from the same selectedElements).
  test('opening an element permalink selects it in the scene and store', async ({page}) => {
    // A known element path in the index.ifc fixture (shared with the
    // Conway-direct and Properties permalink specs): parent 81, leaf 621.
    const LEAF_ID = 621
    await page.goto(`/share/v/p/index.ifc/81/${LEAF_ID}`)
    await waitForModelReady(page)

    await expect.poll(() => getSelectedElements(page)).toContain(`${LEAF_ID}`)
    const sceneIds = await getSceneSelectedIds(page)
    expect(sceneIds).toContain(LEAF_ID)
  })
})
