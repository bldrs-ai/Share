import {expect, test} from '@playwright/test'
import {
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
  setIsReturningUser,
} from '../../tests/e2e/utils'
import {setupGithubPathIntercept, setupGoogleDrivePathIntercept, waitForModelReady} from '../../tests/e2e/models'
import {SEARCH_BAR_PLACEHOLDER_TEXT} from './component'
import {expectScreen} from '../../tests/screens'


const {beforeEach, describe} = test
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
      await expectScreen(page, 'search-together-permalink.png')
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
      await expectScreen(page, 'search-together-highlighted.png')
    })

    describe('with GitHub link to box.ifc', () => {
      let waitForModelReadyCallback: () => Promise<void>
      beforeEach(async ({page}) => {
        waitForModelReadyCallback = await setupGithubPathIntercept(
          page,
          '/bldrs-ai/test-models/main/ifc/misc/box.ifc',
          undefined, // we're initiating the navigation below, so no auto-navigate needed
          'box.ifc',
        )
      })

      test('box.ifc loads - Screen', async ({page}) => {
        await page.getByTestId('control-button-search').click()
        const searchInput = page.getByPlaceholder(SEARCH_BAR_PLACEHOLDER_TEXT)
        await searchInput.fill('https://github.com/bldrs-ai/test-models/blob/main/ifc/misc/box.ifc')
        await searchInput.press('Enter') // initiate navigation
        await waitForModelReadyCallback()
        await expectScreen(page, 'box-github-link-loaded.png')
      })
    })

    describe('with Google Drive link', () => {
      const fileId = '1sWR7x4BZ-a8tIDZ0ICo0woR2KJ_rHCSO'
      let waitForModelReadyCallback: () => Promise<void>
      beforeEach(async ({page}) => {
        waitForModelReadyCallback = await setupGoogleDrivePathIntercept(
          page,
          fileId,
          undefined, // we're initiating the navigation below, so no auto-navigate needed
          'box.ifc',
        )
      })

      test('Google Drive URL navigates to /share/v/g/ path - Screen', async ({page}) => {
        await page.getByTestId('control-button-search').click()
        const searchInput = page.getByPlaceholder(SEARCH_BAR_PLACEHOLDER_TEXT)
        const userInputUrl = `https://drive.google.com/file/d/${fileId}/view`
        await searchInput.fill(userInputUrl)
        await searchInput.press('Enter')
        await waitForModelReadyCallback()
        await expect(page).toHaveURL(/\/share\/v\/g\//)
        await expectScreen(page, 'box-google-drive-link-loaded.png')
        await page.pause()
      })

      test.afterEach(async ({page}, testInfo) => {
        const failed = testInfo.status !== testInfo.expectedStatus // catches fail + unexpected pass
        if (failed) {
          console.warn(`⏸  Pausing on failure: ${testInfo.title}`)
          await page.pause() // keeps browser open; resume/step in Inspector
        }
      })
    })
  })
})
