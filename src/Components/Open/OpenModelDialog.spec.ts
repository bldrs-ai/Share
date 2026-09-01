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
      await returningUserVisitsHomepageWaitForModel(page, {pauseRenderer: true})
      await page.getByTestId('control-button-open').click()
    })

    test('Sample tab to be selected and Momentum sample model card to be visible', async ({page}) => {
      await page.getByTestId('tab-samples').click()
      await expect(page.getByTestId('sample-model-card-0')).toContainText('Momentum')
      // The card carries a rendered thumbnail of the model plus a format
      // badge; both are the point of the Samples gallery, so assert them
      // rather than just the label.
      await expect(page.getByTestId('sample-model-card-0').locator('img')).toBeVisible()
      await expect(page.getByTestId('sample-model-card-0')).toContainText('IFC')
      await expectScreen(page, 'OpenModelDialog-samples-tab.png')
    })

    test('Open button is visible', async ({page}) => {
      await page.getByTestId('tab-local').click()
      await expect(page.getByTestId('button_open_file')).toContainText('Browse')
      await expectScreen(page, 'OpenModelDialog-local-tab.png')
    })
    // TODO(pablo): tried a bunch of approaches for testing the open file
    // w/system dialog but can't get it working in cypress.  Need to get the fix
    // checked in (#1361), so punting for now.
  })

  describe('DnD file appears in recently used', () => {
    // An upload's OPFS storage id is the blob UUID plus the type suffix;
    // the user's filename is only ever a display label. Keeping the two
    // distinct here is what makes this cover #1682 — an entry whose id
    // and name are the same string can't catch navigation by the wrong
    // field.
    const STORAGE_ID = 'ADD77535-D1B6-49A9-915B-41343B08BF83.ifc'

    /**
     * Simulate a completed file drop by writing a recent file entry to
     * localStorage, mirroring what handleFileDrop does via
     * addRecentFileEntry after saving to OPFS.
     */
    const seedRecent = (storageId: string) => {
      const entry = {
        id: storageId,
        source: 'local',
        name: 'box.ifc',
        lastModifiedUtc: null,
      }
      localStorage.setItem('bldrs:recent-files', JSON.stringify({version: 1, files: [entry]}))
    }

    test('dropped file is shown in Local tab recent list', async ({page}) => {
      await returningUserVisitsHomepageWaitForModel(page, {pauseRenderer: true})
      await page.evaluate(seedRecent, STORAGE_ID)

      // Open dialog and verify the filename appears in the Local tab recent list
      await page.getByTestId('control-button-open').click()
      await page.getByTestId('tab-local').click()
      await expect(page.getByText('box.ifc')).toBeVisible()
    })

    test('opening a recent navigates to its OPFS storage id, not its display name', async ({page}) => {
      await returningUserVisitsHomepageWaitForModel(page, {pauseRenderer: true})
      await page.evaluate(seedRecent, STORAGE_ID)

      await page.getByTestId('control-button-open').click()
      await page.getByTestId('tab-local').click()
      await page.getByTestId(`link-open-recent-${STORAGE_ID}`).click()

      // /v/new/box.ifc would miss OPFS entirely and fetch the SPA
      // catch-all from the origin — the #1682 crash.
      await expect(page).toHaveURL(new RegExp(`/v/new/${STORAGE_ID}$`))
    })
  })

  describe('Returning user visits homepage logged in', () => {
    beforeEach(async ({page}) => {
      await returningUserVisitsHomepageWaitForModel(page, {pauseRenderer: true})
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
      await page.getByTestId('button-browse-github').click()
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
