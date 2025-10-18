import {test, expect} from '@playwright/test'
import {
  homepageSetup,
  visitHomepageWaitForModel,
  returningUserVisitsHomepageWaitForModel,
} from '../../tests/e2e/utils'


/**
 * Migrated from cypress/e2e/home/about.cy.js
 *
 * @see https://github.com/bldrs-ai/Share/issues/1285
 */
test.describe('View 100: About Dialog', () => {
  test.beforeEach(async ({page, context}) => {
    await homepageSetup(page, context)
  })

  test.describe('First time user visits homepage', () => {
    test.beforeEach(async ({page}) => {
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

  test.describe('Returning user visits homepage', () => {
    test.beforeEach(async ({page, context}) => {
      await returningUserVisitsHomepageWaitForModel(page, context)
    })

    test('about dialog is not displayed', async ({page}) => {
      // Check that the about dialog is not visible
      const dialog = page.getByRole('dialog')
      await expect(dialog).not.toBeVisible()
    })
  })
})


// Constants from the About component
const ABOUT_MISSION = 'Build Every Thing Together'
const ABOUT_PAGE_TITLE = 'About — bldrs.ai'
