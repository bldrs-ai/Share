import {Page, expect, test} from '@playwright/test'
import {
  auth0Login,
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
  setIsReturningUser,
  setupAuthenticationIntercepts,
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

  /**
   * Exercises the GitHub file browser's Selector UI (PRs #1624 / #1625):
   * paginated dropdown selection, live text filtering, and the cascading
   * clear (×). These assert on picker state only and never click Open, so
   * they steer clear of the model-load flake tracked by #1269. All traffic
   * (orgs, repos, branches, contents) is served by the MSW handlers.
   */
  describe('File browser Selector UI', () => {
    /**
     * Log in and reveal the GitHub file browser inside the Open dialog.
     *
     * @param page - Playwright page object
     */
    async function openGithubBrowser(page: Page) {
      await homepageSetup(page)
      await setupAuthenticationIntercepts(page)
      await returningUserVisitsHomepageWaitForModel(page)
      await page.goto('/share/v/p/index.ifc', {waitUntil: 'domcontentloaded'})
      await auth0Login(page)
      await page.getByTestId('control-button-open').click()
      await page.getByRole('tab', {name: 'GitHub'}).click()
      await page.getByTestId('button-browse-github').click()
      await expect(page.getByTestId('openOrganization')).toBeVisible()
    }

    /**
     * Open a Selector's dropdown and click the option with the given name.
     *
     * @param page - Playwright page object
     * @param testId - the Selector root data-testid
     * @param optionName - the option's accessible name
     */
    async function pickOption(page: Page, testId: string, optionName: string) {
      // force: MUI's Select renders a zero-opacity native <input> over the
      // combobox, so a normal click fails the actionability hit-test. MUI opens
      // the menu on mousedown regardless, so a forced click is both safe and
      // sufficient here (same reason for the other combobox opens below).
      const combobox = page.getByTestId(testId).getByRole('combobox')
      await combobox.click({force: true})
      const option = page.getByRole('option', {name: optionName, exact: true})
      await option.waitFor({state: 'visible'})
      await option.click()
      // Confirm the pick landed on the field itself (position-independent, so
      // it doesn't race the private-repo opt-in's layout insertion).
      await expect(combobox).toContainText(optionName)
    }

    /**
     * Select the org and wait for its repos (and the opt-in they trigger) to
     * settle, so later field interactions happen against a stable layout.
     *
     * @param page - Playwright page object
     */
    async function selectOrgSettled(page: Page) {
      await pickOption(page, 'openOrganization', '@cypresstester')
      // The opt-in only renders once the repo list is back — waiting on it
      // pins the layout before we open the next menu.
      await expect(page.getByTestId('enable-private-repos')).toBeVisible()
    }

    test('selects org → repo → file through the dropdowns', async ({page}) => {
      await openGithubBrowser(page)

      await selectOrgSettled(page)
      await pickOption(page, 'openRepository', 'test-repo')
      await pickOption(page, 'openFile', 'window.ifc')

      // File chosen → Open is enabled (we stop here, no model load).
      await expect(page.getByTestId('button-openfromgithub')).toBeEnabled()
    })

    test('filters repositories with the live text input', async ({page}) => {
      await openGithubBrowser(page)
      await selectOrgSettled(page)

      // Switch the Repository field into "Enter name..." text mode and type.
      await page.getByTestId('openRepository').getByRole('combobox').click({force: true})
      const enterName = page.getByRole('option', {name: 'Enter name...', exact: true})
      await enterName.waitFor({state: 'visible'})
      await enterName.click()
      await page.getByTestId('openRepository').getByRole('textbox').fill('test')

      const matches = page.getByTestId('selector-matches-repository')
      await expect(matches).toBeVisible()
      const match = matches.getByText('test-repo', {exact: true})
      await match.waitFor({state: 'visible'})
      await match.click()
      // Confirm the async repo selection registered before opening File —
      // otherwise the file list hasn't loaded yet and the assertion races it.
      await expect(page.getByTestId('openRepository').getByRole('combobox')).toContainText('test-repo')

      // Selecting the filtered match drives the downstream file listing.
      await page.getByTestId('openFile').getByRole('combobox').click({force: true})
      await expect(page.getByRole('option', {name: 'window.ifc', exact: true})).toBeVisible()
    })

    test('clearing the organization cascades to clear the repository', async ({page}) => {
      await openGithubBrowser(page)
      await selectOrgSettled(page)
      await pickOption(page, 'openRepository', 'test-repo')

      // Both fields hold a value → both show a clear ×.
      await expect(page.getByTestId('selector-clear-select-repository')).toBeVisible()

      await page.getByTestId('selector-clear-select-organization').click()

      // Cascade wiped the repo selection, so its × is gone.
      await expect(page.getByTestId('selector-clear-select-repository')).toHaveCount(0)
    })
  })
})
