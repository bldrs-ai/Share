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
 * Tests for editing a specific version of a model.
 * Tests saving a model with a new name that overwrites an existing file.
 *
 * Migrated from cypress/e2e/versions-100/edit-a-model.cy.js
 *
 * @see https://github.com/bldrs-ai/Share/issues/1160
 */
describe('Versions 100: Edit a specific version', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
  })

  describe('Returning user visits homepage, logs in', () => {
    beforeEach(async ({page}) => {
      await returningUserVisitsHomepageWaitForModel(page)
      await auth0Login(page)
      await setupVirtualPathIntercept(
        page,
        '/share/v/gh/cypresstester/test-repo/main/window.ifc',
        '/Momentum.ifc',
      )
    })

    // TODO(https://github.com/bldrs-ai/Share/issues/1269): fix and re-enable
    // Assumes this flow's file exists cypress/e2e/open/100/open-model-from-gh-ui.cy.js
    test.skip('Save index.ifc to new name, that overwrites existing other file', async ({page}) => {
      await expect(page.getByTitle('Save')).toBeVisible({timeout: 5000})
      await page.getByTitle('Save').click({force: true})

      await page.getByRole('textbox', {name: 'Organization'}).click()
      await page.getByText('@cypresstester').click()
      await page.getByRole('textbox', {name: 'Repository'}).first().click()
      await page.getByText('test-repo').click()
      await page.getByRole('textbox', {name: 'Enter file name'}).click()
      await page.getByRole('textbox', {name: 'Enter file name'}).fill('window.ifc')
      await page.getByRole('button', {name: 'Save model'}).click()

      await waitForModelReady(page)
      await expectScreen(page, 'EditModel-overwrite-save.png')
    })
  })
})
