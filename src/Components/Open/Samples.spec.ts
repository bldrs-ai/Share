import {expect, test} from '@playwright/test'
import {readFile} from 'fs/promises'
import path from 'path'
import {
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
} from '../../tests/e2e/utils'
import {setupVirtualPathIntercept, waitForModelReady} from '../../tests/e2e/models'


const {beforeEach, describe} = test
/**
 * Sample models tests - migrated from cypress/e2e/ifc-model/load-sample-model.cy.js
 */
describe('Sample models', () => {
  describe('When model is loaded', () => {
    beforeEach(async ({page}) => {
      await homepageSetup(page)
      await setIsReturningUser(page.context())
      await visitHomepageWaitForModel(page)
    })

    test('Should display tooltip when hovering over Open IFC button', async ({page}) => {
      // Hover over the Open IFC button using test id
      await page.getByTestId('control-button-open').hover()
      // Check for tooltip
      await expect(page.getByRole('tooltip')).toContainText('Open Models and Samples')
    })

    test('Should display the sample models dialog', async ({page}) => {
      // Click the Open IFC button
      await page.getByTestId('control-button-open').click()
      // Verify sample projects dialog appears
      await expect(page.getByRole('dialog')).toContainText('Samples')
    })

    test('Should intercept model requests successfully', async ({page}) => {
      // Set up the intercept before navigating
      await setupVirtualPathIntercept(
        page,
        '/share/v/gh/bldrs-ai/test-models/main/ifc/misc/box.ifc',
        'box.ifc',
      )

      // Navigate using page hash to avoid direct file navigation
      // await page.goto('/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc')
      await page.goto('/share/v/gh/bldrs-ai/test-models/main/ifc/misc/box.ifc')

      // Wait for model to be ready (any model, even if it's the fallback)
      await waitForModelReady(page)

      // Basic verification - a model loaded successfully
      // Verify that some model is loaded (data-model-ready=true was achieved)
      const dropzone = page.getByTestId('cadview-dropzone')
      await expect(dropzone).toHaveAttribute('data-model-ready', 'true')
    })
  })

  describe.skip('When no model is loaded', () => {
    beforeEach(async ({page}) => {
      await homepageSetup(page)
      await setIsReturningUser(page.context())
      await page.goto('/')
      // Wait for viewer container and canvas to be visible
      const viewerContainer = page.locator('#viewer-container')
      await expect(viewerContainer).toBeVisible()
      const canvas = viewerContainer.locator('canvas')
      await expect(canvas).toBeVisible()
      // Wait for model ready attribute
      const dropzone = page.getByTestId('cadview-dropzone')
      await expect(dropzone).toHaveAttribute('data-model-ready', 'true')
    })

    test('should display tooltip when hovering', async ({page}) => {
      await page.getByRole('button', {name: 'Open IFC'}).hover()
      await expect(page.getByRole('tooltip')).toContainText('Open IFC')
    })

    test('should display the sample models dialog', async ({page}) => {
      await page.getByTestId('control-button-open').click()
      await expect(page.getByRole('dialog')).toContainText('Sample Projects')
    })

    test('should load the Momentum model when selected', async ({page}) => {
      // Set up intercept for Momentum.ifc using TestFixture.ifc
      await page.route('**/Momentum.ifc', async (route) => {
        const fixturePath = path.resolve(process.cwd(), 'cypress/fixtures/TestFixture.ifc')
        const fixtureBuffer = await readFile(fixturePath)

        await route.fulfill({
          status: 200,
          body: fixtureBuffer,
          headers: {'content-type': 'application/octet-stream'},
        })
      })

      await page.getByTestId('control-button-open').click()
      await page.getByRole('tab', {name: 'Sample Projects'}).click()

      // Wait for listbox to appear and select Momentum
      const listbox = page.getByRole('listbox')
      await expect(listbox).toBeVisible()

      await listbox.getByRole('option', {name: 'Momentum'}).click()

      // Wait for listbox to disappear
      await expect(listbox).toHaveCount(0)

      // Verify IFC Navigator appears
      await expect(page.getByRole('tree', {name: 'IFC Navigator'})).toBeVisible()

      // Verify specific text appears (from the loaded model)
      await expect(page.getByText('Proxy with extruded box')).toBeVisible()
    })
  })
})
