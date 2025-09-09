import {test, expect} from '@playwright/test'
import {
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
  waitForModel,
} from '../../../tests/helpers/utils'


/**
 * Profile 100: Theme - migrated from Cypress
 *
 * {@link https://github.com/bldrs-ai/Share/issues/1070}
 */
test.describe('Profile 100: Theme', () => {
  test.describe('Returning user visits homepage', () => {
    test.beforeEach(async ({page, context}) => {
      await homepageSetup(page, context)
      await returningUserVisitsHomepageWaitForModel(page, context)
    })

    test('Day theme active - Screen', async ({page}) => {
      // TODO: Add screenshot/visual testing equivalent to cy.percySnapshot()
      await expect(page.getByTestId('cadview-dropzone')).toBeVisible()
    })

    test.describe('Select ProfileControl > Night theme', () => {
      test.beforeEach(async ({page}) => {
        await page.getByTestId('control-button-profile').click()
        await page.getByTestId('change-theme-to-night').click()
        await waitForModel(page)
      })

      test('Night theme active - Screen', async ({page}) => {
        // TODO: Add screenshot/visual testing equivalent to cy.percySnapshot()
        await expect(page.getByTestId('cadview-dropzone')).toBeVisible()
        // Verify night theme is active by checking theme button
        await page.getByTestId('control-button-profile').click()
        await expect(page.getByTestId('change-theme-to-day')).toBeVisible()
      })

      test.describe('Select ProfileControl > Day theme', () => {
        test.beforeEach(async ({page}) => {
          await page.getByTestId('control-button-profile').click()
          await page.getByTestId('change-theme-to-day').click()
          await waitForModel(page)
        })

        test('Day theme active - Screen', async ({page}) => {
          // TODO: Add screenshot/visual testing equivalent to cy.percySnapshot()
          await expect(page.getByTestId('cadview-dropzone')).toBeVisible()
          // Verify day theme is active by checking theme button
          await page.getByTestId('control-button-profile').click()
          await expect(page.getByTestId('change-theme-to-night')).toBeVisible()
        })
      })
    })
  })
})
