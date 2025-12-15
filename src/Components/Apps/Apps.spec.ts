import {expect, test} from '@playwright/test'
import {assertDefined} from 'src/utils/assert'
import {
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
} from '../../tests/e2e/utils'
import {TITLE_NOTES} from '../Notes/component'
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

    test('resizing Notes drawer does not push Apps off-screen', async ({page}) => {
      // Open both Notes and Apps.
      await page.getByTestId('control-button-notes').click()
      await page.getByTestId('control-button-apps').click()

      // Sanity: both titles visible.
      await expect(page.getByTestId(`PanelTitle-${TITLE_NOTES}`)).toBeVisible()
      await expect(page.getByTestId(`PanelTitle-${TITLE_APPS}`)).toBeVisible()

      const notesDrawer = page.getByTestId('NotesAndPropertiesDrawer')
      const appsDrawer = page.getByTestId('AppsDrawer')

      const handle = notesDrawer.getByTestId('resize-handle-x')
      const handleBox = assertDefined(await handle.boundingBox())

      // Drag left to widen Notes (this used to push Apps out of view).
      await page.mouse.move(
        handleBox.x + (handleBox.width / 2),
        handleBox.y + (handleBox.height / 2),
      )
      await page.mouse.down()
      const dragDistance = 250
      await page.mouse.move(handleBox.x - dragDistance, handleBox.y + (handleBox.height / 2))
      await page.mouse.up()

      // Apps should remain visible and inside the viewport.
      await expect(page.getByTestId(`PanelTitle-${TITLE_APPS}`)).toBeVisible()

      const appsBox = assertDefined(await appsDrawer.boundingBox())
      const vw = await page.evaluate(() => window.innerWidth)
      expect(appsBox.x).toBeGreaterThanOrEqual(0)
      expect(appsBox.x + (appsBox.width)).toBeLessThanOrEqual(vw + 1)
    })
  })
})
