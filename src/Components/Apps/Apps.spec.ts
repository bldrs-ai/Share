import {expect, test} from '@playwright/test'
import {
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
} from '../../tests/e2e/utils'
import {TITLE_APPS} from './component'


const {beforeEach, describe} = test
/**
 * Migrated from cypress/e2e/apps/apps.cy.js
 *
 * @see https://github.com/bldrs-ai/Share/issues/1282
 */
describe('AppsSideDrawer', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
  })

  describe('Returning user visits homepage', () => {
    beforeEach(async ({page}) => {
      await returningUserVisitsHomepageWaitForModel(page)
    })

    test('Apps button should be present', async ({page}) => {
      await expect(page.getByRole('button', {name: TITLE_APPS})).toBeVisible()
      await expect(page.getByRole('heading', {name: TITLE_APPS})).toHaveCount(0)
    })

    describe('User clicks Apps button', () => {
      beforeEach(async ({page}) => {
        await page.getByTestId('control-button-apps').click()
      })

      test('should show apps drawer', async ({page}) => {
        await expect(page.getByRole('heading', {name: TITLE_APPS})).toBeVisible()
      })

      test('should expand the apps window full screen on double click', async ({page}) => {
        // Simulate a double click on the HorizonResizerButton within AppsDrawer
        const appsDrawer = page.getByTestId('AppsDrawer')
        await appsDrawer.getByTestId('resize-handle-x').dblclick()

        // Verify the apps drawer is full screen (width should be close to viewport width)
        const width = await appsDrawer.evaluate((el) => getComputedStyle(el).width)
        const MIN_FULLSCREEN_WIDTH = 1000
        expect(parseInt(width)).toBeGreaterThan(MIN_FULLSCREEN_WIDTH)
      })
    })
  })
})
