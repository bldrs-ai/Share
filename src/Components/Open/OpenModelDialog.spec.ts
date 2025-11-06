import {expect, test} from '@playwright/test'
import {
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
} from '../../tests/e2e/utils'
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
})
