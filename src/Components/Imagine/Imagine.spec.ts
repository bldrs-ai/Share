import {expect, test} from '@playwright/test'
import {
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
  waitForModel,
} from '../../tests/e2e/utils'
import {expectScreen} from '../../tests/screens'
import {readFile} from 'fs/promises'


const {beforeEach, describe} = test

/**
 * Tests for Imagine functionality - AI-powered rendering feature.
 * This feature allows users to generate 3D renders from text descriptions.
 *
 * Migrated from cypress/e2e/create-100/imagine.cy.js
 *
 * @see https://github.com/bldrs-ai/Share/issues/1077
 * @see https://github.com/bldrs-ai/Share/issues/1269
 */
describe.skip('create-100: Imagine', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  describe('Returning user visits homepage, clicks ImagineControlButton', () => {
    beforeEach(async ({page}) => {
      await visitHomepageWaitForModel(page)
      await page.getByTestId('control-button-rendering').click()
    })

    test('Shows screenshot - Screen', async ({page}) => {
      await expect(page).toHaveTitle('Imagine')
      await expectScreen(page, 'Imagine-dialog-opens.png')
    })

    describe('Description entered', () => {
      const HTTP_OK = 200

      beforeEach(async ({page}) => {
        // Set up API interception for image generation
        const imageData = await readFile('src/tests/fixtures/candy-cane-bldrs.png', 'base64')

        await page.route('**/generate', async (route) => {
          await route.fulfill({
            status: HTTP_OK,
            json: [{
              // Already base64 encoded
              img: imageData,
            }],
          })
        })

        await page.getByTestId('text-field-render-description').fill('candy cane')
        await page.getByText('Create').click()
      })

      test('Shows candy cane render - Screen', async ({page}) => {
        // Wait for the API call to complete
        await page.waitForResponse('**/generate')

        // Verify the rendered image is displayed
        await expect(page.getByTestId('img-rendered')).toBeVisible()
        await expectScreen(page, 'Imagine-candy-cane-render.png')
      })

      // For bug https://github.com/bldrs-ai/Share/issues/1068
      describe('Reopen dialog', () => {
        beforeEach(async ({page}) => {
          await page.getByTestId('button-close-dialog').click()
          await page.getByTestId('control-button-rendering').click()
        })

        test('Shows screenshot - Screen', async ({page}) => {
          await expect(page).toHaveTitle('Imagine')
          await expectScreen(page, 'Imagine-dialog-reopened.png')
        })
      })
    })
  })

  describe('Returning user visits imagine permalink', () => {
    beforeEach(async ({page}) => {
      // TODO(pablo): tried having a nice camera, but still can't detect animation at rest yet
      await page.goto('/share/v/p/index.ifc#imagine:')
      await waitForModel(page)
    })

    test('Imagine dialog and model screenshot visible - Screen', async ({page}) => {
      await expectScreen(page, 'Imagine-permalink-view.png')
    })
  })
})
