import {expect, test} from '@playwright/test'
import {
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
  waitForModel,
} from '../tests/e2e/utils'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {HOME_MODEL, WORKSPACE_FLAG, ensureProjectsDrawerOpen, visitWithWorkspace} from '../tests/e2e/workspace'


const {beforeEach} = test


/**
 * Happy path for the workspace TopBar (story #1663, plan
 * `conversational-cad.md` §2.3 / §3.1 slice 1): the ToolbarPaper
 * placeholder becomes a real bar with the model breadcrumb and the
 * relocated SearchBar. The scope mechanic and provider seam are later
 * slices (#1669/#1699) with their own specs.
 */
describeMobileAndDesktop('TopBar (?feature=workspace)', (ff) => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  test('flag gates the bar, and the breadcrumb names the model', async ({page}) => {
    await visitHomepageWaitForModel(page, {pauseRenderer: true})
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

  // #1992: the bar carries the controls that used to float into it —
  // Open / Save at its left end, Profile / Apps / Share at its right —
  // so they move out of the floating groups rather than being doubled.
  test('the bar carries Open / Save and Share, out of the floating groups', async ({page}) => {
    await visitWithWorkspace(page)
    const bar = page.getByTestId('TopBar')
    await expect(bar.getByTestId('control-button-open')).toBeVisible()
    await expect(bar.getByTestId('control-button-share')).toBeVisible()
    await expect(page.getByTestId('control-button-open')).toHaveCount(1)
    await expect(page.getByTestId('control-button-share')).toHaveCount(1)

    // Apps sits on the page's right border, after Share.
    const share = await bar.getByTestId('control-button-share').boundingBox()
    const apps = await bar.getByTestId('control-button-apps').boundingBox()
    expect(apps?.x ?? 0).toBeGreaterThan(share?.x ?? 0)
  })

  if (!ff.isMobile) {
    // #1992: one header band — the drawer header's hairline and the bar's
    // land on the same pixel row.
    test('the bar and the drawer header end on the same row', async ({page}) => {
      await visitWithWorkspace(page)
      await ensureProjectsDrawerOpen(page)
      const band = await page.getByTestId('projects-header-band').boundingBox()
      const bar = await page.getByTestId('TopBar').boundingBox()
      expect((bar?.y ?? 0) + (bar?.height ?? 0)).toBe((band?.y ?? 1) + (band?.height ?? 1))
    })

    // #1992: side drawers open beneath the bar, and Notes leads the way
    // the ProjectsDrawer's list does. (On a phone Notes is the bottom
    // sheet, unchanged.)
    test('Notes opens beneath the bar, led by New note and a NOTES label', async ({page}) => {
      await visitWithWorkspace(page)
      await page.getByTestId('control-button-notes').click()

      const drawer = await page.getByTestId('NotesAndPropertiesDrawer').boundingBox()
      const bar = await page.getByTestId('TopBar').boundingBox()
      expect(drawer?.y ?? 0).toBeGreaterThanOrEqual((bar?.y ?? 0) + (bar?.height ?? 0))

      await expect(page.getByTestId('notes-new-button')).toBeVisible()
      await expect(page.getByTestId('notes-section-label')).toHaveText('Notes')
      await expect(page.getByTestId('PanelTitle-Notes')).toHaveCount(0)

      // New note scrolls away with the list rather than staying pinned.
      const before = await page.getByTestId('notes-new-button').boundingBox()
      const scrolled = await page.getByTestId('NotesPanel').evaluate((el) => {
        el.scrollTop = 120
        return el.scrollTop
      })
      expect(scrolled).toBeGreaterThan(0)
      await expect.poll(async () => (await page.getByTestId('notes-new-button').boundingBox())?.y)
        .toBeLessThan((before?.y ?? 0) - (scrolled / 2))
      await page.getByTestId('NotesPanel').evaluate((el) => {
        el.scrollTop = 0
      })

      // Create mode: signed out, the form's place shows the login prompt,
      // and the lead-in gives way to the back row.
      await page.getByTestId('notes-new-button').click()
      await expect(page.getByText('Please login to create notes.')).toBeVisible()
      await expect(page.getByTestId('notes-nav-row')).toBeVisible()
      await expect(page.getByTestId('notes-new-button')).toHaveCount(0)
    })
  }

  test('element permalinks put the selection on the breadcrumb', async ({page}) => {
    // 'Together' (IfcBuildingElementProxy, expressID 396) in the home
    // model — the crumb reads model / element, with the element name
    // rather than its expressID.
    await page.goto(`${HOME_MODEL}/89/112/139/154/396${WORKSPACE_FLAG}`, {waitUntil: 'domcontentloaded'})
    await waitForModel(page, {pauseRenderer: true})

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

  // Regression: moving the anchor while the field was open blurred the
  // input, and the blur-dismiss fired after the click — the field
  // reappeared at the new crumb and then vanished.
  test('moving the anchor mid-search keeps the field open', async ({page}) => {
    await page.goto(`${HOME_MODEL}/89/112/139/154/396${WORKSPACE_FLAG}`, {waitUntil: 'domcontentloaded'})
    await waitForModel(page, {pauseRenderer: true})
    // The element crumb resolves asynchronously; without it there is no
    // separator to swap and nothing to move the anchor from.
    await expect(page.getByTestId('topbar-breadcrumb-element')).toBeVisible()

    await page.getByTestId('topbar-search-open').click()
    await expect(page.getByTestId('topbar-search')).toBeVisible()

    // Hover the model crumb; its separator becomes the anchor icon.
    await page.getByTestId('topbar-breadcrumb-model').hover()
    await page.getByTestId('topbar-search-open').click()

    // Field moved up a level and stayed open.
    await expect(page.getByTestId('topbar-search')).toBeVisible()
    await expect(page.getByTestId('topbar-breadcrumb-element')).toHaveCount(0)
    await expect(page.getByTestId('topbar-breadcrumb-model')).toBeVisible()
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
