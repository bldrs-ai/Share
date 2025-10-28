import {expect, test} from '@playwright/test'
import {
  auth0Login,
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
  setupAuthenticationIntercepts,
} from '../../tests/e2e/utils'
import {expectScreen} from '../../tests/screens'


const {beforeEach, describe} = test
/**
 * @see https://github.com/bldrs-ai/Share/issues/1052
 */
describe('Profile 100: Login with Github', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setupAuthenticationIntercepts(page)
    await returningUserVisitsHomepageWaitForModel(page)
  })

  test('Should only show Github login option - Screen', async ({page}) => {
    await page.getByTestId('control-button-profile').click()
    await page.getByTestId('menu-open-login-dialog').click()
    await expect(page.getByTestId('login-with-github')).toBeVisible()
    await expect(page.getByTestId('login-with-google')).toHaveCount(0)
    // Close login dialog
    await page.getByTestId('control-button-profile').click({force: true})
    // Login with Github
    await auth0Login(page, 'github')
    // Verify logged in
    await expectScreen(page, 'logged-in-github.png')
  })

  describe('Returning user visits homepage with Google OAuth feature flag, clicks ProfileControl', () => {
    beforeEach(async ({page}) => {
      await page.goto('/share/v/p/index.ifc?feature=googleOAuth2')
    })

    test('Login should include Google and Github options - Screen', async ({page}) => {
      await page.getByTestId('control-button-profile').click()
      await page.getByTestId('menu-open-login-dialog').click()
      await expect(page.getByTestId('login-with-github')).toBeVisible()
      await expect(page.getByTestId('login-with-google')).toBeVisible()
      await expectScreen(page, 'login-github-and-google.png')
    })

    test('Login with Google - Screen', async ({page}) => {
      await auth0Login(page, 'google')
      await expectScreen(page, 'logged-in-google.png')
    })
  })
})
