import {test, expect, Locator} from '@playwright/test'
import {
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
} from '../../tests/e2e/utils'


const {describe, beforeEach} = test
/**
 * Profile 100: Theme
 *
 * {@link https://github.com/bldrs-ai/Share/issues/1070}
 */
describe('Profile 100: Theme', () => {
  describe('Returning user visits homepage', () => {
    beforeEach(async ({page}) => {
      await homepageSetup(page)
      await returningUserVisitsHomepageWaitForModel(page)
    })

    describe('Select ProfileControl', () => {
      let controlButtonProfile: Locator
      let menuItemThemeSystem: Locator
      let menuItemThemeDay: Locator
      let menuItemThemeNight: Locator
      const isChecked = async (elt: Locator, isExpected: boolean) => {
        await expect(elt).toHaveAttribute('aria-checked', isExpected ? 'true' : 'false')
      }
      beforeEach(async ({page}) => {
        const buttonId = 'control-button-profile'
        const menuItemPrefix = `${buttonId}-menu-item-theme`
        controlButtonProfile = page.getByTestId(buttonId)
        menuItemThemeSystem = page.getByTestId(`${menuItemPrefix}-system`)
        menuItemThemeDay = page.getByTestId(`${menuItemPrefix}-day`)
        menuItemThemeNight = page.getByTestId(`${menuItemPrefix}-night`)
        await controlButtonProfile.click()
        await expect(menuItemThemeSystem).toBeVisible()
        await expect(menuItemThemeDay).toBeVisible()
        await expect(menuItemThemeNight).toBeVisible()
      })


      test('System theme (default) active - Screen', async () => {
        await isChecked(menuItemThemeSystem, true)
        await isChecked(menuItemThemeDay, false)
        await isChecked(menuItemThemeNight, false)
        // TODO: Add screenshot/visual testing equivalent to cy.percySnapshot()
      })

      describe('Select ProfileControl > Day theme', () => {
        beforeEach(async () => {
          await menuItemThemeDay.click()
          await controlButtonProfile.click() // reopen
        })

        test('Makes day theme active - Screen', async () => {
          await isChecked(menuItemThemeSystem, false)
          await isChecked(menuItemThemeDay, true)
          await isChecked(menuItemThemeNight, false)
          // TODO: Add screenshot/visual testing equivalent to cy.percySnapshot()
        })
      })

      describe('Select ProfileControl > Night theme', () => {
        beforeEach(async () => {
          await menuItemThemeNight.click()
          await controlButtonProfile.click() // reopen
        })

        test('Makes night theme active - Screen', async () => {
          await isChecked(menuItemThemeSystem, false)
          await isChecked(menuItemThemeDay, false)
          await isChecked(menuItemThemeNight, true)
          // TODO: Add screenshot/visual testing equivalent to cy.percySnapshot()
        })
      })

      test('Theme persists after page reload - Screen', async ({page}) => {
        await menuItemThemeDay.click()
        await page.reload()
        await controlButtonProfile.click() // reopen
        await isChecked(menuItemThemeDay, true)
        await isChecked(menuItemThemeNight, false)
        await isChecked(menuItemThemeSystem, false)
        // TODO: Add screenshot/visual testing equivalent to cy.percySnapshot()
      })
    })
  })
})
