import {Page, expect, test, Locator} from '@playwright/test'
import {waitForModelReady} from 'src/tests/e2e/models'
import {
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
  LONG_TEST_TIMEOUT_SECONDS,
  setIsReturningUser,
} from '../../tests/e2e/utils'


const {beforeEach, describe} = test
/**
 * Cutplane functionality tests - migrated from Cypress
 *
 * From https://github.com/bldrs-ai/Share/issues/1106
 */
describe('Cutplanes', () => {
  describe('Returning user visits homepage', () => {
    beforeEach(async ({page}) => {
      await homepageSetup(page)
      await returningUserVisitsHomepageWaitForModel(page)
    })

    describe('CutPlane menu active', () => {
      let controlButtonCutPlane: Locator
      let menuCutPlane: Locator
      let menuItemPlan: Locator
      let menuItemSection: Locator
      let menuItemElevation: Locator
      let menuItemClearAll: Locator
      beforeEach(async ({page}) => {
        controlButtonCutPlane = page.getByTestId('control-button-cut-plane')
        menuCutPlane = page.getByTestId('menu-cut-plane')
        menuItemPlan = page.getByTestId('menu-item-plan')
        menuItemSection = page.getByTestId('menu-item-section')
        menuItemElevation = page.getByTestId('menu-item-elevation')
        menuItemClearAll = page.getByTestId('menu-item-clear-all')
        await controlButtonCutPlane.click()
        await expect(menuCutPlane).toBeVisible()
      })


      test('All cut-planes added to model - Screen', async ({page}) => {
        test.setTimeout(LONG_TEST_TIMEOUT_SECONDS)

        // Activate plan plane
        await menuItemPlan.click()
        await expect(menuCutPlane).toBeHidden()
        await checkHashState(page, 'cp:y')

        // Activate section plane
        await controlButtonCutPlane.click()
        await menuItemSection.click()
        await expect(menuCutPlane).toBeHidden()
        await checkHashState(page, 'cp:y,x')

        // Activate elevation plane
        await controlButtonCutPlane.click()
        await menuItemElevation.click()
        await expect(menuCutPlane).toBeHidden()
        await checkHashState(page, 'cp:y,x,z')

        // check each plane item is checked
        const isChecked = async (elt: Locator, isExpected: boolean) => {
          await expect(elt).toHaveAttribute('aria-checked', isExpected ? 'true' : 'false')
        }
        await controlButtonCutPlane.click()
        await isChecked(menuItemPlan, true)
        await isChecked(menuItemSection, true)
        await isChecked(menuItemElevation, true)
        await expect(page).toHaveScreenshot('cut-planes-added.png')

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
        await expect(page).toHaveScreenshot('cut-planes-removed.png')
      })
    })
  })

  describe('View cut-plane permalink', () => {
    const cpHashState = 'cp:y=17.077,x=-25.551,z=5.741;c:-133.022,131.828,161.85,-38.078,22.64,-2.314'
    beforeEach(async ({page}) => {
      await homepageSetup(page)
      await setIsReturningUser(page.context())
      await page.goto(`/share/v/p/index.ifc#${cpHashState}`)
      await waitForModelReady(page)
    })

    test('Shows just vertical bar of b - Screen', async ({page}) => {
      await checkHashState(page, cpHashState)
      await expect(page).toHaveScreenshot('cut-plane-permalink.png')
    })
  })
})


/**
 * Check the hash state of the page
 *
 * @param page - The page to check
 * @param expectedHashState - The expected hash state
 */
async function checkHashState(page: Page, expectedHashState: string) {
  const hashState = page.url().split('#')[1]
  await expect(hashState).toBe(expectedHashState)
}
