import {test, expect, Locator} from '@playwright/test'
import {
  homepageSetup,
  setIsReturningUser,
  waitForModel,
  returningUserVisitsHomepageWaitForModel,
  LONG_TEST_TIMEOUT_SECONDS,
} from '../../tests/e2e/utils'


/**
 * Cutplane functionality tests - migrated from Cypress
 *
 * From https://github.com/bldrs-ai/Share/issues/1106
 */
test.describe('Cutplanes', () => {
  test.describe('Returning user visits homepage', () => {
    test.beforeEach(async ({page}) => {
      await homepageSetup(page)
      await returningUserVisitsHomepageWaitForModel(page)
    })

    test.describe('CutPlane menu active', () => {
      let controlButtonCutPlane: Locator
      let menuCutPlane: Locator
      let menuItemPlan: Locator
      let menuItemSection: Locator
      let menuItemElevation: Locator
      let menuItemClearAll: Locator
      test.beforeEach(async ({page}) => {
        controlButtonCutPlane = page.getByTestId('control-button-cut-plane')
        menuCutPlane = page.getByTestId('menu-cut-plane')
        menuItemPlan = page.getByTestId('menu-item-plan')
        menuItemSection = page.getByTestId('menu-item-section')
        menuItemElevation = page.getByTestId('menu-item-elevation')
        menuItemClearAll = page.getByTestId('menu-item-clear-all')
        await controlButtonCutPlane.click()
        await expect(menuCutPlane).toBeVisible()
      })


      test('All cut-planes added to model', async () => {
        test.setTimeout(LONG_TEST_TIMEOUT_SECONDS)

        // Activate plan plane
        await menuItemPlan.click()
        await expect(menuCutPlane).toBeHidden()

        // Activate section plane
        await controlButtonCutPlane.click()
        await menuItemSection.click()
        await expect(menuCutPlane).toBeHidden()

        // Activate elevation plane
        await controlButtonCutPlane.click()
        await menuItemElevation.click()
        await expect(menuCutPlane).toBeHidden()

        // check each plane item is checked
        const isChecked = async (elt: Locator, isExpected: boolean) => {
          await expect(elt).toHaveAttribute('aria-checked', isExpected ? 'true' : 'false')
        }
        await controlButtonCutPlane.click()
        await isChecked(menuItemPlan, true)
        await isChecked(menuItemSection, true)
        await isChecked(menuItemElevation, true)

        // Clear all cut-planes
        await menuItemClearAll.click()
        await expect(menuCutPlane).toBeHidden()

        // Reopen menu to verify all planes are cleared
        await controlButtonCutPlane.click()
        await expect(menuCutPlane).toBeVisible()
        await isChecked(menuItemPlan, false)
        await isChecked(menuItemSection, false)
        await isChecked(menuItemElevation, false)

        // Close menu
        await controlButtonCutPlane.click({force: true})
        await expect(menuCutPlane).toBeHidden()
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
        // TODO: Add screenshot/visual testing equivalent to cy.percySnapshot()
      })
    })
  })
})
