import {expect, test, Request, Response} from '@playwright/test'
import {
  auth0Login,
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
} from '../../tests/e2e/utils'
import {expectScreen} from '../../tests/screens'
import {setupGithubPathIntercept} from '../../tests/e2e/models'


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
    })

    // TODO(https://github.com/bldrs-ai/Share/issues/1269): fix and re-enable
    // Assumes this flow's file exists cypress/e2e/open/100/open-model-from-gh-ui.cy.js
    test('Save index.ifc to new name, that overwrites existing other file', async ({page}) => {
      // Setup intercept for GitHub API calls to save the model
      // Note: MSW intercepts these requests, but Playwright can still see them via request/response listeners
      const capturedRequests: Request[] = []
      const capturedResponses: Response[] = []
      const HTTP_OK = 200
      // Match GitHub API calls with proxy prefix: /p/gh/repos/... or /repos/...
      const githubApiPattern = /\/repos\/cypresstester\/test-repo\/git\//

      // Listen to all requests (MSW intercepts them, but Playwright still sees them)
      page.on('request', (request: Request) => {
        if (githubApiPattern.test(request.url())) {
          capturedRequests.push(request)
        }
      })

      // Listen to all responses (including MSW-handled ones)
      page.on('response', (response: Response) => {
        if (githubApiPattern.test(response.url())) {
          capturedResponses.push(response)
        }
      })

      // Wait for the final updateRef call which indicates the save completed
      // actual network req:
      // https://git.bldrs.dev.msw/p/gh/repos/cypresstester/test-repo/git/refs/heads%2Fmain
      const updateRefResponsePromise = page.waitForResponse(
        (response: Response) =>
          response.url().includes('/p/gh/repos/cypresstester/test-repo/git/refs/heads') &&
          response.request().method() === 'PATCH',
      )

      // setup a
      // https://rawgit.bldrs.dev/r/cypresstester/test-repo/main/folder/test.ifc
      const ghModelWait = await setupGithubPathIntercept(
        page,
        '/cypresstester/test-repo/main/folder/test.ifc',
        '/share/v/gh/cypresstester/test-repo/main/folder/test.ifc',
        'test-models/ifc/misc/box.ifc',
      )

      await expect(page.getByTitle('Save')).toBeVisible({timeout: 5000})
      await page.getByTitle('Save').click({force: true})

      await page.getByRole('combobox', {name: 'Organization'}).click()
      await page.getByText('@cypresstester').click()
      await page.getByRole('combobox', {name: 'Repository'}).first().click()
      await page.getByText('test-repo').click()
      await page.getByRole('combobox', {name: 'Branch'}).first().click()
      await page.getByText('main').click()
      await page.getByRole('combobox', {name: 'Folder'}).first().click()
      await page.getByText('folder', {exact: true}).click()
      await page.getByRole('textbox', {name: 'Enter file name'}).click()
      await page.getByRole('textbox', {name: 'Enter file name'}).fill('window.ifc')
      await page.getByTestId('button-dialog-main-action').click()

      // Wait for the save operation to complete
      const updateRefResponse = await updateRefResponsePromise
      await ghModelWait()

      // Verify the save API call was made correctly
      expect(updateRefResponse.status()).toBe(HTTP_OK)

      // Verify the request body contains the expected file path
      const updateRefRequest = capturedRequests.find(
        (req) => req.url().includes('/git/refs/heads') && req.method() === 'PATCH',
      )
      expect(updateRefRequest).toBeDefined()

      // Verify other key API calls were made
      const createBlobRequest = capturedRequests.find(
        (req) => req.url().includes('/git/blobs') && req.method() === 'POST',
      )
      expect(createBlobRequest).toBeDefined()

      const createCommitRequest = capturedRequests.find(
        (req) => req.url().includes('/git/commits') && req.method() === 'POST',
      )
      expect(createCommitRequest).toBeDefined()

      await expectScreen(page, 'EditModel-overwrite-save.png')
    })
  })
})
