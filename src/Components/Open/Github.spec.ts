import {expect, test} from '@playwright/test'
import {
  auth0Login,
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
  setIsReturningUser,
  visitHomepageWaitForModel,
} from '../../tests/e2e/utils'
import {setupVirtualPathIntercept, waitForModelReady} from '../../tests/e2e/models'
import {expectScreen} from '../../tests/screens'


const {beforeEach, describe} = test

/**
 * Tests for GitHub integration functionality.
 * Tests opening models from GitHub via UI and direct links.
 *
 * Migrated from:
 * - cypress/e2e/open/100/open-project-from-gh-link.cy.js
 * - cypress/e2e/open/100/open-model-from-gh-ui.cy.js
 *
 * @see https://github.com/bldrs-ai/Share/issues/765
 * @see https://github.com/bldrs-ai/Share/issues/1159
 */
describe('Open 100: GitHub Integration', () => {
  describe('Open Project From GitHub Link', () => {
    beforeEach(async ({page}) => {
      await homepageSetup(page)
    })

    describe('Returning user visits homepage, enters Model URL into search', () => {
      const interceptTag = 'ghModelLoad'

      beforeEach(async ({page}) => {
        await setIsReturningUser(page.context())
        await visitHomepageWaitForModel(page)
        await page.getByTestId('control-button-search').click()
        await setupVirtualPathIntercept(
          page,
          '/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc',
          '/Momentum.ifc',
        )
        // Note this includes {enter} at end to simulate Enter keypress
        await page.getByTestId('textfield-search-query')
          .fill('https://github.com/Swiss-Property-AG/Momentum-Public/blob/main/Momentum.ifc')
        await page.getByTestId('textfield-search-query').press('Enter')
      })

      // TODO(https://github.com/bldrs-ai/Share/issues/1269): fix and re-enable
      test.skip('Model loads - Screen', async ({page}) => {
        await waitForModelReady(page)
        await expectScreen(page, 'Github-link-model-loaded.png')
      })
    })
  })

  describe('Open model from GitHub via UI', () => {
    beforeEach(async ({page}) => {
      await homepageSetup(page)
    })

    describe('Returning user visits homepage, logs in', () => {
      const interceptTag = 'ghOpenModelLoad'

      beforeEach(async ({page}) => {
        await returningUserVisitsHomepageWaitForModel(page)
        await auth0Login(page)
        // set up initial index.ifc load
        await setupVirtualPathIntercept(
          page,
          '/share/v/gh/cypresstester/test-repo/main/window.ifc',
          '/index.ifc',
        )
      })

      // TODO(https://github.com/bldrs-ai/Share/issues/1269): fix and re-enable
      test.skip('Opens a model from Github via the UI - Screen', async ({page}) => {
        await page.getByTestId('control-button-open').click()
        await page.getByText('Github').click()
        await page.getByRole('textbox', {name: 'Organization'}).click()
        await page.getByText('@cypresstester').click()
        await page.getByRole('textbox', {name: 'Repository'}).first().click()
        await page.getByText('test-repo').click()
        await page.getByRole('textbox', {name: 'File'}).first().click()
        await page.getByText('window.ifc').click()
        await page.getByTestId('button-openfromgithub').click()
        await waitForModelReady(page)
        await expect(page.getByTestId('dialog-open')).toHaveCount(0)
        await expectScreen(page, 'Github-ui-model-loaded.png')
      })
    })
  })
})
