import {test, expect} from '@playwright/test'
import {
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
  waitForModel,
  waitForElementStable,
} from './helpers/utils'


/**
 * Cutplane functionality tests - migrated from Cypress
 * From https://github.com/bldrs-ai/Share/issues/1106
 */
test.describe('view 100: Cutplanes', () => {
  test.beforeEach(async ({page, context}) => {
    await homepageSetup(page, context)
  })

  test.describe('View model', () => {
    test.beforeEach(async ({page, context}) => {
      await setIsReturningUser(context)
      await visitHomepageWaitForModel(page)
    })

    test.describe('Click CutPlaneControl', () => {
      test.beforeEach(async ({page}) => {
        await page.getByTestId('control-button-cut-plane').click()
        await expect(page.getByTestId('menu-cut-plane')).toBeVisible()
      })

      test.only('Section menu visible', async ({page}) => {
        await expect(page.getByTestId('menu-cut-plane')).toBeVisible()
        // TODO: Add screenshot/visual testing equivalent to cy.percySnapshot()
      })

      test.describe('Select all cut-planes', () => {
        test.beforeEach(async ({page}) => {
          // Select plan (already open from parent beforeEach)
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
        })

        test('All cut-planes added to model', async ({page}) => {
          // Verify menu is not visible after all selections
          await expect(page.getByTestId('menu-cut-plane')).not.toBeVisible()
          // TODO: Add screenshot/visual testing equivalent to cy.percySnapshot()
        })

        test.describe('Clear all cut-planes', () => {
          test.beforeEach(async ({page}) => {
            // Wait for cut-planes to be applied
            await waitForElementStable(page, '[data-testid="cadview-dropzone"]')
            
            // Open menu and clear all
            await page.getByTestId('control-button-cut-plane').click()
            await expect(page.getByTestId('menu-cut-plane')).toBeVisible()
            await page.getByTestId('menu-item-clear-all').click()
            await expect(page.getByTestId('menu-cut-plane')).not.toBeVisible()
          })

          test('No cutplanes visible', async ({page}) => {
            // Wait for clearing to complete
            await waitForElementStable(page, '[data-testid="cadview-dropzone"]')
            // TODO: Add screenshot/visual testing equivalent to cy.percySnapshot()
          })
        })
      })
    })
  })

  test.describe('View cut-plane permalink', () => {
    test.beforeEach(async ({page, context}) => {
      await setIsReturningUser(context)
      await page.goto('/share/v/p/index.ifc#cp:y=17.077,x=-25.551,z=5.741;c:-133.022,131.828,161.85,-38.078,22.64,-2.314')
      await waitForModel(page)
    })

    test('Shows just vertical bar of b', async ({page}) => {
      // Verify the model is loaded with cut-plane applied
      await expect(page.locator('[data-testid="cadview-dropzone"]')).toBeVisible()
      await expect(page.locator('[data-model-ready="true"]')).toBeVisible()
      
      // Wait for cut-plane to be applied
      await waitForElementStable(page, '[data-testid="cadview-dropzone"]')
      
      // TODO: Add screenshot/visual testing equivalent to cy.percySnapshot()
    })
  })
})