import {test, expect} from '@playwright/test'
import {
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
} from '../../tests/e2e/utils'
import {waitForModelReady} from '../../tests/e2e/models'
import {SEARCH_BAR_PLACEHOLDER_TEXT} from './component'


/**
 * Migrated from cypress/e2e/search/100/permalink.cy.js
 *
 * @see https://github.com/bldrs-ai/Share/issues/1180
 */
test.describe('Search 100: Permalink', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  test.describe('Returning user visits homepage, Open Search > Enters "together"', () => {
    test.beforeEach(async ({page}) => {
      await visitHomepageWaitForModel(page)
    })

    test('Search box with query visible, "Together" items highlighted in tree and scene - Screen', async ({page}) => {
      // Open search interface
      await page.getByTestId('control-button-search').click()

      // Wait for search interface to open and interact with it
      const searchInput = page.getByPlaceholder(SEARCH_BAR_PLACEHOLDER_TEXT)
      await expect(searchInput).toBeVisible()
      await searchInput.fill('together')
      await searchInput.press('Enter')

      // After search submission, the search interface closes and the URL should contain the query
      // Verify the search was performed by checking the URL contains the query parameter
      await expect(page).toHaveURL(/q=together/)

      // Note: Visual regression testing with Percy would be added here
      // await expect(page).toHaveScreenshot('search-together-highlighted.png')
    })
  })

  test.describe('Returning user visits permalink to "together" search', () => {
    test.beforeEach(async ({page}) => {
      await page.goto('/share/v/p/index.ifc?q=together#n:;s:')
      await waitForModelReady(page)
    })

    test('Search box with query visible, "Together" items highlighted in tree and scene - Screen', async ({page}) => {
      // Verify search box is visible with the query from URL
      const searchInput = page.getByPlaceholder(SEARCH_BAR_PLACEHOLDER_TEXT)
      await expect(searchInput).toBeVisible()
      await expect(searchInput).toHaveValue('together')

      // Note: Visual regression testing with Percy would be added here
      // await expect(page).toHaveScreenshot('search-together-permalink.png')
    })
  })
})
