import {expect, test} from '@playwright/test'
import {
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
  waitForModel,
} from '../tests/e2e/utils'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {HOME_MODEL, WORKSPACE_FLAG, visitWithWorkspace} from '../tests/e2e/workspace'


const {beforeEach} = test


/**
 * Happy path for the workspace TopBar (story #1663, plan
 * `conversational-cad.md` §2.3 / §3.1 slice 1): the ToolbarPaper
 * placeholder becomes a real bar with the model breadcrumb and the
 * relocated SearchBar. The scope mechanic and provider seam are later
 * slices (#1669/#1699) with their own specs.
 */
describeMobileAndDesktop('TopBar (?feature=workspace)', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  test('flag gates the bar, and the breadcrumb names the model', async ({page}) => {
    await visitHomepageWaitForModel(page)
    await expect(page.getByTestId('TopBar')).toHaveCount(0)

    await visitWithWorkspace(page)
    await expect(page.getByTestId('TopBar')).toBeVisible()
    // The loader-extracted model name, not the filename — the filename
    // lives in the crumb's tooltip.
    await expect(page.getByTestId('topbar-breadcrumb-model')).toHaveText('Bldrs')

    // Regression: the bar is absolutely positioned, and with a
    // statically-positioned center pane it resolved against the
    // viewport — width:100% then overflowed the window by the
    // ProjectsDrawer's width, pushing the search field off-screen.
    const viewportWidth = page.viewportSize()?.width ?? 0
    const barBox = await page.getByTestId('TopBar').boundingBox()
    expect((barBox?.x ?? 0) + (barBox?.width ?? 0)).toBeLessThanOrEqual(viewportWidth)
    await page.getByTestId('topbar-search-open').click()
    const searchBox = await page.getByTestId('topbar-search').boundingBox()
    expect((searchBox?.x ?? 0) + (searchBox?.width ?? 0)).toBeLessThanOrEqual(viewportWidth)
  })

  test('element permalinks put the selection on the breadcrumb', async ({page}) => {
    // 'Together' (IfcBuildingElementProxy, expressID 396) in the home
    // model — the crumb reads model / element, with the element name
    // rather than its expressID.
    await page.goto(`${HOME_MODEL}/89/112/139/154/396${WORKSPACE_FLAG}`, {waitUntil: 'domcontentloaded'})
    await waitForModel(page)

    await expect(page.getByTestId('topbar-breadcrumb-element')).toHaveText('Together')
    await expect(page.getByTestId('topbar-breadcrumb-model')).not.toHaveText('396')
  })

  test('search opens from its anchor icon and closes on Escape', async ({page}) => {
    await visitWithWorkspace(page)

    // Closed by default — the icon on the leaf crumb is the affordance.
    await expect(page.getByTestId('topbar-search')).toHaveCount(0)
    await expect(page.getByTestId('topbar-search-open')).toBeVisible()
    await page.getByTestId('topbar-search-open').click()

    const searchInput = page.getByTestId('topbar-search').locator('input')
    await expect(searchInput).toBeFocused()
    await searchInput.press('Escape')

    await expect(page.getByTestId('topbar-search')).toHaveCount(0)
    await expect(page.getByTestId('topbar-search-open')).toBeVisible()
  })

  test('search from the TopBar sets the query param', async ({page}) => {
    await visitWithWorkspace(page)
    await page.getByTestId('topbar-search-open').click()

    const searchInput = page.getByTestId('topbar-search').locator('input')
    await expect(searchInput).toBeVisible()
    await searchInput.fill('together')
    await searchInput.press('Enter')

    await expect(page).toHaveURL(/q=together/)
    // Still in the workspace shell: the search must not strip the flag.
    expect(page.url()).toContain('feature=workspace')
  })
})
