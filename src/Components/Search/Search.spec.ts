import {test, expect} from '@playwright/test'
import {
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
  setIsReturningUser,
} from '../../tests/e2e/utils'
import {waitForModelReady, setupVirtualPathIntercept} from '../../tests/e2e/models'
import {SEARCH_BAR_PLACEHOLDER_TEXT} from './component'


const {describe, beforeEach} = test
/**
 * Migrated from cypress/e2e/search/100/permalink.cy.js
 *
 * @see https://github.com/bldrs-ai/Share/issues/1180
 */
describe('Search 100', () => {
  describe('returning user visits permalink, waits for model', () => {
    beforeEach(async ({page}) => {
      await homepageSetup(page)
      await setIsReturningUser(page.context())
      await page.goto('/share/v/p/index.ifc?q=together#n:;s:')
      await waitForModelReady(page)
    })

    test('Sees "Together" search, items highlighted in tree and scene - Screen', async ({page}) => {
      const searchInput = page.getByPlaceholder(SEARCH_BAR_PLACEHOLDER_TEXT)
      await expect(searchInput).toBeVisible()
      await expect(searchInput).toHaveValue('together')
      await expect(page).toHaveScreenshot('search-together-permalink.png')
    })
  })

  describe('returning user visits homepage, waits for model', () => {
    beforeEach('clicks Search control button, enters "together" query and presses Enter', async ({page}) => {
      await returningUserVisitsHomepageWaitForModel(page)
    })

    test('"Together" items highlighted in tree and scene - Screen', async ({page}) => {
      // Wait for search interface to open and interact with it
      await page.getByTestId('control-button-search').click()
      const searchInput = page.getByPlaceholder(SEARCH_BAR_PLACEHOLDER_TEXT)
      await expect(searchInput).toBeVisible()
      await searchInput.fill('together')
      await searchInput.press('Enter')

      await expect(searchInput).toBeHidden()
      await expect(page).toHaveURL(/q=together/)
      await expect(page).toHaveScreenshot('search-together-highlighted.png')
    })

    describe('with GitHub link to box.ifc', () => {
      beforeEach(async ({page}) => {
        await setupVirtualPathIntercept(
          page,
          '/share/v/gh/bldrs-ai/test-models/main/ifc/misc/box.ifc',
          'box.ifc',
        )
        await page.getByTestId('control-button-search').click()
        const searchInput = page.getByPlaceholder(SEARCH_BAR_PLACEHOLDER_TEXT)
        await searchInput.fill('https://github.com/bldrs-ai/test-models/main/ifc/misc/box.ifc')
        await searchInput.press('Enter')
      })

      test('box.ifc loads - Screen', async ({page}) => {
        await waitForModelReady(page)
        await expect(page).toHaveScreenshot('box-github-link-loaded.png')
      })
    })
  })
})
