import {test, expect, Page} from '@playwright/test'
import {
  homepageSetup,
  setIsReturningUser,
  waitForModel,
  waitForElementStable,
  returningUserVisitsHomepageWaitForModel,
} from '../../tests/e2e/utils'


/**
 * Cutplane functionality tests - migrated from Cypress
 *
 * From https://github.com/bldrs-ai/Share/issues/1106
 */
test.describe('Cutplanes', () => {
  // Flatten setup to reduce timing issues
  /**
   *
   */
  async function setupModelWithCutplanes(page: Page) {
    await homepageSetup(page)
    await returningUserVisitsHomepageWaitForModel(page)
  }

  test('Section menu visible', async ({page}) => {
    await setupModelWithCutplanes(page)

    // Click cut-plane control and verify menu
    await page.getByTestId('control-button-cut-plane').click()
    await expect(page.getByTestId('menu-cut-plane')).toBeVisible()
  })

  test('All cut-planes added to model', async ({page}) => {
    await setupModelWithCutplanes(page)

    // Open cut-plane menu and select plan
    await page.getByTestId('control-button-cut-plane').click()
    await expect(page.getByTestId('menu-cut-plane')).toBeVisible()
    await page.getByTestId('menu-item-plan').click()
    await expect(page.getByTestId('menu-cut-plane')).not.toBeVisible()

    // Open menu again and select section
    await page.getByTestId('control-button-cut-plane').click()
    await expect(page.getByTestId('menu-cut-plane')).toBeVisible()
    await page.getByTestId('menu-item-section').click()
    await expect(page.getByTestId('menu-cut-plane')).not.toBeVisible()

    // Open menu again and select elevation
    await page.getByTestId('control-button-cut-plane').click()
    await expect(page.getByTestId('menu-cut-plane')).toBeVisible()
    await page.getByTestId('menu-item-elevation').click()

    // Verify menu is not visible after all selections
    await expect(page.getByTestId('menu-cut-plane')).not.toBeVisible()
  })

  test('No cutplanes visible after clear all', async ({page}) => {
    await setupModelWithCutplanes(page)

    // Add all cut-planes first
    await page.getByTestId('control-button-cut-plane').click()
    await page.getByTestId('menu-item-plan').click()
    await page.getByTestId('control-button-cut-plane').click()
    await page.getByTestId('menu-item-section').click()
    await page.getByTestId('control-button-cut-plane').click()
    await page.getByTestId('menu-item-elevation').click()

    // Wait for cut-planes to be applied
    await waitForElementStable(page, '[data-testid="cadview-dropzone"]')

    // Open menu and clear all
    await page.getByTestId('control-button-cut-plane').click()
    await expect(page.getByTestId('menu-cut-plane')).toBeVisible()
    await page.getByTestId('menu-item-clear-all').click()
    await expect(page.getByTestId('menu-cut-plane')).not.toBeVisible()

    // Wait for clearing to complete
    await waitForElementStable(page, '[data-testid="cadview-dropzone"]')
  })

  test.describe('View cut-plane permalink', () => {
    test.beforeEach(async ({page, context}) => {
      await setIsReturningUser(context)
      await page.goto('/share/v/p/index.ifc#cp:y=17.077,x=-25.551,z=5.741;c:-133.022,131.828,161.85,-38.078,22.64,-2.314')
      await waitForModel(page)
    })

    test.skip('Shows just vertical bar of b', async ({page}) => {
      // Verify the model is loaded with cut-plane applied
      await expect(page.locator('[data-testid="cadview-dropzone"]')).toBeVisible()
      await expect(page.locator('[data-model-ready="true"]')).toBeVisible()

      // Wait for cut-plane to be applied
      await waitForElementStable(page, '[data-testid="cadview-dropzone"]')

      // TODO: Add screenshot/visual testing equivalent to cy.percySnapshot()
    })
  })
})
