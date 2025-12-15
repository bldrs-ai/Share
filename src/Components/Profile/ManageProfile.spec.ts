import {expect, test, Page} from '@playwright/test'
import {
  auth0Login,
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
  setupAuthenticationIntercepts,
} from '../../tests/e2e/utils'
import {expectScreen} from '../../tests/screens'


const {beforeEach, describe} = test

/**
 * Open the Manage Profile dialog
 *
 * @param page - Playwright page object
 * @param connection - The connection to login with
 */
async function openManageProfile(page: Page, connection: 'github' | 'google' = 'github') {
  await auth0Login(page, connection) // mocked login
  await page.getByTestId('control-button-profile').click()
  await page.getByTestId('manage-profile').click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

/**
 * Migrated from cypress/e2e/profile-100/manage-profile.cy.js
 *
 * @see https://github.com/bldrs-ai/Share/issues/1282
 */
describe('ManageProfile modal', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setupAuthenticationIntercepts(page)
  })

  describe('When only GitHub is linked', () => {
    beforeEach(async ({page}) => {
      // user with GitHub identity only
      await returningUserVisitsHomepageWaitForModel(page)
    })

    test('shows "Authorize" for Google', async ({page}) => {
      await openManageProfile(page)

      const authorizeButton = page.getByTestId('authorize-google-oauth2')
      await expect(authorizeButton).toContainText('Authorize')
      await expect(authorizeButton).toBeVisible()

      await expectScreen(page, 'ManageProfile-GitHub-linked-only.png')
    })
  })

  describe.skip('When only Google is linked', () => {
    beforeEach(async ({page}) => {
      // user with Google identity only
      await returningUserVisitsHomepageWaitForModel(page)
    })

    test('shows "Authorize" for Github', async ({page}) => {
      await openManageProfile(page, 'google')

      const authorizeButton = page.getByTestId('authorize-github')
      await expect(authorizeButton).toContainText('Authorize')
      await expect(authorizeButton).toBeVisible()

      await expectScreen(page, 'ManageProfile-Google-linked-only.png')
    })
  })

  describe('Links accounts after Authorize is clicked', () => {
    beforeEach(async ({page}) => {
      await returningUserVisitsHomepageWaitForModel(page)
    })

    test('refreshes tokens and marks Google as Connected', async ({page}) => {
      // open and click Authorize
      await openManageProfile(page)
      await page.getByTestId('authorize-google-oauth2').click()

      // UI now shows unlink button
      await expect(page.getByTestId('unlink-google-oauth2')).toBeVisible()

      await expectScreen(page, 'ManageProfile-Both-providers-linked.png')
    })
  })

  describe('Modal Close button', () => {
    beforeEach(async ({page}) => {
      await returningUserVisitsHomepageWaitForModel(page)
    })

    test('hides the dialog when Close clicked', async ({page}) => {
      await openManageProfile(page)
      await page.getByTestId('button-close-dialog-manage-profile').click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
    })
  })
})
