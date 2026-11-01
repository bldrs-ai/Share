import {expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
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
describe('Profile 100: Login', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setupAuthenticationIntercepts(page)
    await returningUserVisitsHomepageWaitForModel(page)
  })

  test('Login dialog shows GitHub and Google options - Screen', async ({page}) => {
    await page.getByTestId('control-button-profile').click()
    await page.getByTestId('menu-open-login-dialog').click()
    await expect(page.getByTestId('login-with-github')).toBeVisible()
    await expect(page.getByTestId('login-with-google')).toBeVisible()
    await expectScreen(page, 'login-github-and-google.png')
    // Close login dialog
    await page.getByTestId('control-button-profile').click({force: true})
    // Login with Github
    await auth0Login(page, 'github')
    // Verify logged in
    await expectScreen(page, 'logged-in-github.png')
  })

  test('Login with Google - Screen', async ({page}) => {
    await auth0Login(page, 'google')
    await expectScreen(page, 'logged-in-google.png')
  })
})


/**
 * Log out ends the Auth0 session, not just this page's token cache
 * (Share#1923). The SDK does that by navigating to Auth0's /v2/logout, which
 * the Playwright build's mock provider now does too, under the same option
 * rules (src/Auth0/mockLogout.js); setupAuthenticationIntercepts answers it
 * the way Auth0 does, redirecting only to an allowed `returnTo`.
 *
 * What this cannot show is the next sign-in asking for credentials again:
 * the mock's sign-in never talks to an Auth0 server, so there is no server
 * session for it to find or miss. It shows the app's half, that Log out sends
 * the browser through /v2/logout with a `returnTo` it comes back to, signed
 * out, and that sign-in then works from there.
 */
describeMobileAndDesktop('Profile 100: Log out', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setupAuthenticationIntercepts(page)
    await returningUserVisitsHomepageWaitForModel(page)
    await auth0Login(page, 'github')
  })

  test('Log out goes through Auth0 /v2/logout and back signed out, then Log in works again', async ({page, baseURL}) => {
    const appOrigin = new URL(baseURL as string).origin
    const logoutRequest = page.waitForRequest(/\/v2\/logout(\?|$)/)
    await page.getByTestId('control-button-profile').click()
    await page.getByTestId('menu-open-logout-dialog').click()

    const logoutUrl = new URL((await logoutRequest).url())
    // The destination rides in logoutParams.returnTo; a top-level returnTo
    // would leave this null and Auth0 would pick the destination itself.
    expect(logoutUrl.searchParams.get('returnTo')).toBe(appOrigin)
    expect(logoutUrl.searchParams.get('client_id')).toBe('cypresstestaudience')

    // Back from Auth0 at the app, and the SPA has routed on from the origin.
    await page.waitForURL(`${appOrigin}/share/**`)
    await expect(page.getByTestId('AccountBoxOutlinedIcon')).toBeVisible()
    await expect(page.getByTestId('control-button-profile-icon-authenticated')).toHaveCount(0)

    await auth0Login(page, 'github')
  })
})
