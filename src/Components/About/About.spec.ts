import {expect, test} from '@playwright/test'
import {
  clearState,
  returningUserVisitsHomepageWaitForModel,
  visitHomepageWaitForModel,
} from '../../tests/e2e/utils'
import {ABOUT_MISSION, ABOUT_PAGE_TITLE} from './component'


const {beforeEach, describe} = test
/**
 * Migrated from cypress/e2e/home/about.cy.js
 *
 * @see https://github.com/bldrs-ai/Share/issues/1285
 */
describe('View 100: About Dialog', () => {
  beforeEach(async ({page}) => {
    await clearState(page.context())
  })

  describe('First time user visits homepage', () => {
    beforeEach('First time user visits homepage', async ({page}) => {
      await visitHomepageWaitForModel(page)
    })
    test('about dialog is displayed', async ({page}) => {
      // Check that the about dialog is visible
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog).toContainText(ABOUT_MISSION)
      // Check the page title
      await expect(page).toHaveTitle(ABOUT_PAGE_TITLE)
    })
  })

  describe('Returning user visits homepage', () => {
    beforeEach('First time user visits homepage', async ({page}) => {
      await returningUserVisitsHomepageWaitForModel(page)
    })
    test('about dialog is not displayed', async ({page}) => {
      // Check that the about dialog does not exist
      await expect(page.getByRole('dialog')).toHaveCount(0)
    })
  })
})
