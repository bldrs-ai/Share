import {expect, test} from '@playwright/test'
import {
  auth0Login,
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
} from '../../tests/e2e/utils'
import {setupVirtualPathIntercept, waitForModelReady} from '../../tests/e2e/models'
import {expectScreen} from '../../tests/screens'


const {beforeEach, describe} = test

/**
 * Tests for Open model dialog functionality.
 * Tests the dialog for opening models from different sources (samples, local, GitHub).
 *
 * Migrated from cypress/e2e/open/100/open-model-dialog.cy.js
 *
 * @see https://github.com/bldrs-ai/Share/issues/1159
 */
describe('Open 100: Open model dialog', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
  })

  describe('First time user visits homepage not logged in', () => {
    beforeEach(async ({page}) => {
      await returningUserVisitsHomepageWaitForModel(page)
      await page.getByTestId('control-button-open').click()
    })

    test('Sample tab to be selected and Momentum sample model chip to be visible', async ({page}) => {
      await page.getByTestId('tab-samples').click()
      await expect(page.getByTestId('sample-model-chip-0').locator('.MuiChip-label')).toContainText('Momentum')
      await expectScreen(page, 'OpenModelDialog-samples-tab.png')
    })

    test('Open button is visible', async ({page}) => {
      await page.getByTestId('tab-local').click()
      await expect(page.getByTestId('button_open_file')).toContainText('Browse files...')
      await expectScreen(page, 'OpenModelDialog-local-tab.png')
    })
    // TODO(pablo): tried a bunch of approaches for testing the open file
    // w/system dialog but can't get it working in cypress.  Need to get the fix
    // checked in (#1361), so punting for now.
  })

  describe('Returning user visits homepage logged in', () => {
    beforeEach(async ({page}) => {
      await returningUserVisitsHomepageWaitForModel(page)
      await setupVirtualPathIntercept(
        page,
        '/share/v/gh/cypresstester/test-repo/main/window.ifc',
        '/index.ifc',
      )
      await auth0Login(page)
      await page.getByTestId('control-button-open').click()
    })

    test.skip('GitHub controls are visible', async ({page}) => {
      await page.getByTestId('tab-github').click()
      await expectScreen(page, 'OpenModelDialog-github-tab.png')
    })

    test.skip('Choose the path to the model on GitHub -> model is loaded into the scene', async ({page}) => {
      await page.getByTestId('tab-github').click()
      await page.getByText('Browse files on Github').click()
      await page.getByRole('textbox', {name: 'Organization'}).click()
      await page.getByText('@cypresstester').click()
      await page.getByRole('textbox', {name: 'Repository'}).first().click()
      await page.getByText('test-repo').click()
      await page.getByRole('textbox', {name: 'File'}).first().click()
      await page.getByText('window.ifc').click()
      await page.getByTestId('button-openfromgithub').click()
      await waitForModelReady(page)
      await expectScreen(page, 'OpenModelDialog-github-model-loaded.png')
    })
  })
})
