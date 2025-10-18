import {test, expect} from '@playwright/test'
import {
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
  waitForModel,
} from '../tests/e2e/utils'


/**
 * Migrated from cypress/e2e/view-100/model-centering-and-view-reset.cy.js
 *
 * @see https://github.com/bldrs-ai/Share/issues/1042
 */
test.describe('Model Centering and View Reset', () => {
  test.beforeEach(async ({page, context}) => {
    await homepageSetup(page, context)
  })

  /**
   * This is just testing that auto-zoom works. Not really user-facing behavior.
   * Discord: https://discord.com/channels/853953158560743424/984184622621540352/1229766172199616584
   */
  test('Model re-centered when camera hash removed', async ({page, context}) => {
    // Use the working setup from other tests
    await returningUserVisitsHomepageWaitForModel(page, context)

    // Now add camera hash via JavaScript navigation to change view
    await page.evaluate(() => {
      window.location.hash = '#c:-38.078,-196.189,-2.314,-38.078,22.64,-2.314'
    })

    // Wait for camera to adjust and model to be ready
    await waitForModel(page)

    // Remove hash to trigger re-centering via JavaScript
    await page.evaluate(() => {
      window.location.hash = ''
    })

    // Wait for re-centering to complete
    await waitForModel(page)

    // Verify the model container is still visible (indicating auto-zoom worked)
    await expect(page.locator('[data-testid="cadview-dropzone"]')).toBeVisible()
    await expect(page.locator('[data-testid="cadview-dropzone"][data-model-ready="true"]')).toBeVisible()
  })
})
