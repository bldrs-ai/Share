import {test, expect} from '@playwright/test'


// Constants from the About component
const ABOUT_MISSION = 'Build Every Thing Together'
const ABOUT_PAGE_TITLE = 'About — bldrs.ai'

/**
 * Migrated from cypress/e2e/home/about.cy.js
 *
 * @see https://github.com/bldrs-ai/Share/issues/1285
 */
test.describe('About Dialog', () => {
  test.describe('First-time user visits homepage', () => {
    test('about dialog is displayed', async ({page, context}) => {
      // Clear cookies to simulate first-time user
      await context.clearCookies()

      // Navigate to homepage
      await page.goto('/')

      // Check that the about dialog is visible
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog).toContainText(ABOUT_MISSION)

      // Check the page title
      await expect(page).toHaveTitle(ABOUT_PAGE_TITLE)
    })
  })

  test.describe('Returning user visits homepage', () => {
    test('about dialog is not displayed', async ({page, context}) => {
      // Set cookie to simulate returning user
      await context.addCookies([
        {
          name: 'isFirstTime',
          value: '1',
          domain: 'localhost',
          path: '/',
        },
      ])

      // Navigate to homepage
      await page.goto('/')

      // Check that the about dialog is not visible
      const dialog = page.getByRole('dialog')
      await expect(dialog).not.toBeVisible()
    })
  })
})
