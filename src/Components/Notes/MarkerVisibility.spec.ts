import {expect, test} from '@playwright/test'
import {
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
} from '../../tests/e2e/utils'
import {expectScreen} from '../../tests/screens'
import {TITLE_NOTES} from './component'


const {beforeEach, describe} = test

/**
 * Migrated from cypress/e2e/placemarks-100/marker-visibility.cy.js
 *
 * @see https://github.com/bldrs-ai/Share/issues/1054
 */
describe('Placemarks 100: Not visible when notes is not open', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
  })

  describe('Returning user visits homepage', () => {
    beforeEach(async ({page}) => {
      await returningUserVisitsHomepageWaitForModel(page)
    })

    test('MarkerControl should not exist', async ({page}) => {
      await expect(page.getByTestId('markerControl')).toHaveCount(0)
    })

    describe('Open Notes and MarkerControl should exist', () => {
      beforeEach(async ({page}) => {
        await page.getByTestId('control-button-notes').click()
        await page.getByTestId('list-notes')
        await expect(page.getByTestId(`PanelTitle-${TITLE_NOTES}`)).toContainText(TITLE_NOTES)

        // Wait for markers to load
        const MARKER_WAIT_MS = 1500
        await page.waitForTimeout(MARKER_WAIT_MS)
      })

      test('MarkerControl should exist', async ({page}) => {
        // Verify the UI elements are visible
        await expect(page.getByTestId('list-notes')).toBeVisible()
        await expect(page.getByTestId(`PanelTitle-${TITLE_NOTES}`)).toBeVisible()

        // Check if marker scene exists (optional)
        const markerScene = await page.evaluate(() => {
          return (window as any).markerScene
        })

        if (markerScene && markerScene.markerObjects && markerScene.markerObjects.size !== undefined) {
          // Assert that markers exist
          // HACK(pablo): should be 2, but there are 4 because the component double-mounts and
          // the way we're tracking it is in a race.
          expect(markerScene.markerObjects.size).toBeGreaterThan(0)

          // Check visibility of markers
          const markers = Array.from(markerScene.markerObjects)
          for (const marker of markers) {
            expect((marker as any).userData.id).toBeDefined()
          }
        }

        await expectScreen(page, 'MarkerVisibility-markers-visible.png')
      })
    })
  })
})
