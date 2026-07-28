import {expect, test} from '@playwright/test'
import {
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
} from '../tests/e2e/utils'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {visitWithWorkspace} from '../tests/e2e/workspace'


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
    await expect(page.getByTestId('topbar-breadcrumb-model')).toHaveText('index.ifc')
  })

  test('search from the TopBar sets the query param', async ({page}) => {
    await visitWithWorkspace(page)

    const searchInput = page.getByTestId('topbar-search').locator('input')
    await expect(searchInput).toBeVisible()
    await searchInput.fill('together')
    await searchInput.press('Enter')

    await expect(page).toHaveURL(/q=together/)
    // Still in the workspace shell: the search must not strip the flag.
    expect(page.url()).toContain('feature=workspace')
  })
})
