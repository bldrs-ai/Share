import {expect, test} from '@playwright/test'
import {
  auth0Login,
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
  setIsReturningUser,
  visitHomepageWaitForModel,
} from '../../tests/e2e/utils'
import {setupGithubPathIntercept, waitForModelReady} from '../../tests/e2e/models'
import {expectScreen} from '../../tests/screens'
import {GITHUB_SEARCH_BAR_PLACEHOLDER_TEXT} from './component'


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
      await setIsReturningUser(page.context())
      await visitHomepageWaitForModel(page)
    })

    describe('Returning user visits homepage, enters Model URL into search', () => {
      const githubPathname = '/bldrs-ai/test-models/main/ifc/misc/box.ifc'
      let waitForModelReadyCallback: () => Promise<void>
      beforeEach(async ({page}) => {
        waitForModelReadyCallback = await setupGithubPathIntercept(
          page,
          githubPathname,
          undefined, // we're initiating the navigation below, so no auto-navigate needed
          'test-models/ifc/misc/box.ifc',
        )
      })

      // TODO(https://github.com/bldrs-ai/Share/issues/1269): fix and re-enable
      test('Model loads - Screen', async ({page}) => {
        await page.getByTestId('control-button-open').click()
        // Note this includes {enter} at end to simulate Enter keypress
        const searchInput = page.getByRole('textbox', {name: GITHUB_SEARCH_BAR_PLACEHOLDER_TEXT})
        await searchInput.fill(`https://github.com${githubPathname}`)
        await waitForModelReadyCallback()
        await expectScreen(page, 'Github-link-model-loaded.png')
      })
    })
  })

  describe.skip('Open model from GitHub via UI', () => {
    beforeEach(async ({page}) => {
      await homepageSetup(page)
    })

    describe('Returning user visits homepage, logs in', () => {
      beforeEach(async ({page}) => {
        await returningUserVisitsHomepageWaitForModel(page)
        await auth0Login(page)
        // set up initial index.ifc load
        await setupGithubPathIntercept(
          page,
          '/bldrs-ai/test-models/main/ifc/misc/box.ifc',
          undefined, // we're initiating the navigation below, so no auto-navigate needed
          'box.ifc',
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
