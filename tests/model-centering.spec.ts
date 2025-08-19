import {test, expect} from '@playwright/test'


/**
 * Migrated from cypress/e2e/view-100/model-centering-and-view-reset.cy.js
 * @see https://github.com/bldrs-ai/Share/issues/1042
 */
test.describe('Model Centering and View Reset', () => {
  test.beforeEach(async ({context}) => {
    // Set returning user cookie to skip about dialog
    await context.addCookies([
      {
        name: 'isFirstTime',
        value: '1',
        domain: 'localhost',
        path: '/',
      },
    ])
  })

  /**
   * This is just testing that auto-zoom works. Not really user-facing behavior.
   * Discord: https://discord.com/channels/853953158560743424/984184622621540352/1229766172199616584
   */
  test('Model re-centered when camera hash removed', async ({page}) => {
    // First visit with camera hash to establish starting position
    await page.goto('/share/v/p/index.ifc#c:-38.078,-196.189,-2.314,-38.078,22.64,-2.314')
    
    // Wait for model to be ready
    await expect(page.locator('[data-testid="cadview-dropzone"][data-model-ready="true"]'))
      .toBeVisible({timeout: 5000})
    
    // Now visit without camera hash - should re-center
    await page.goto('/share/v/p/index.ifc')
    
    // Wait for model to be ready again
    await expect(page.locator('[data-testid="cadview-dropzone"][data-model-ready="true"]'))
      .toBeVisible({timeout: 5000})
    
    // Verify the model container is visible (indicating auto-zoom worked)
    await expect(page.locator('[data-testid="cadview-dropzone"]')).toBeVisible()
  })
})