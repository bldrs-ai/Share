import {expect, test} from '@playwright/test'
import {
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
} from '../../tests/e2e/utils'


const {beforeEach, describe} = test
/**
 * Migrated from cypress/e2e/hide-feat/hide-feat.cy.js
 *
 * @see https://github.com/bldrs-ai/Share/issues/1282
 */
describe('Ifc Hide/Unhide E2E test suite', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
  })

  describe('Hide icon toggle', () => {
    beforeEach(async ({page}) => {
      await returningUserVisitsHomepageWaitForModel(page)
    })

    test('should toggle hide icon when clicked', async ({page}) => {
      // Click the Navigation button to open the navigation panel
      await page.getByTestId('control-button-navigation').click()
      await expect(page.getByTestId('NavTreePanel')).toBeVisible()

      // Find and click the hide icon
      await page.getByTestId('hide-icon').click()

      // Verify the unhide icon appears and hide icon disappears
      await expect(page.getByTestId('unhide-icon')).toBeVisible()
      await expect(page.getByTestId('hide-icon')).toHaveCount(0)
    })
  })
})
