import {expect, test} from '@playwright/test'
import {
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
} from '../../tests/e2e/utils'
import {setupGithubPathIntercept} from '../../tests/e2e/models'


const {beforeEach, describe} = test
/**
 * Sample models tests - migrated from:
 * - cypress/e2e/ifc-model/load-sample-model.cy.js
 * - cypress/e2e/open/100/open-sample-model.cy.js
 *
 * @see https://github.com/bldrs-ai/Share/issues/757
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

    test('should display the sample models dialog', async ({page}) => {
      await page.getByTestId('control-button-open').click()
      await expect(page.getByRole('dialog')).toContainText('Samples')
    })

    test('should load the Momentum model when selected', async ({page}) => {
      const waitForModelReadyCallback = await setupGithubPathIntercept(
        page,
        '/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc',
        '/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc',
        'test-models/ifc/Momentum.ifc',
      )
      await waitForModelReadyCallback()

      await page.getByTestId('control-button-open').click()
      await page.getByRole('tab', {name: 'Samples'}).click()

      // Wait for listbox to appear and select Momentum
      const samplesGrid = page.getByTestId('dialog-open-model-samples')
      await expect(samplesGrid).toBeVisible()

      await samplesGrid.getByTestId('sample-model-chip-0').click()

      // Wait for canvas data-model-ready attribute to be true
      await expect(page.getByTestId('cadview-dropzone')).toHaveAttribute('data-model-ready', 'true')

      // Open NavTree
      await page.getByTestId('control-button-navigation').click()

      // Wait for NavTree to appear
      await expect(page.getByTestId('SideDrawerPanel-Paper-Navigation')).toBeVisible()

      // Verify specific text appears (from the loaded model)
      await expect(page.getByText('Momentum / KNIK v3')).toBeVisible()
    })
  })
})
