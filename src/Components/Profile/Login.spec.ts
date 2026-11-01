import {Page, expect, test} from '@playwright/test'
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
 * Sign out through `signOut`, then check the round trip every sign-out in the
 * app makes (Share#1923): the browser goes through Auth0's /v2/logout with
 * `returnTo` = the app's origin, comes back there signed out, and sign-in
 * works again from that state.
 *
 * The Playwright build's mock provider navigates to /v2/logout under the
 * real SDK's option rules (src/Auth0/mockLogout.js), and
 * setupAuthenticationIntercepts answers it the way Auth0 does, redirecting
 * only to an allowed `returnTo`. What this cannot show is the next sign-in
 * asking for credentials again: the mock's sign-in never talks to an Auth0
 * server, so there is no server session for it to find or miss.
 *
 * @param page
 * @param baseURL the config's, whose origin is the one allowed returnTo
 * @param signOut clicks whichever control signs out
 */
async function expectSignOutRoundTrip(page: Page, baseURL: string | undefined, signOut: () => Promise<void>) {
  const appOrigin = new URL(baseURL as string).origin
  const logoutRequest = page.waitForRequest(/\/v2\/logout(\?|$)/)
  await signOut()

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
}


describeMobileAndDesktop('Profile 100: Log out', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setupAuthenticationIntercepts(page)
    await returningUserVisitsHomepageWaitForModel(page)
    await auth0Login(page, 'github')
  })

  test('Log out goes through Auth0 /v2/logout and back signed out, then Log in works again', async ({page, baseURL}) => {
    await expectSignOutRoundTrip(page, baseURL, async () => {
      await page.getByTestId('control-button-profile').click()
      await page.getByTestId('menu-open-logout-dialog').click()
    })
  })

  // GitHub is the account's Auth0 identity, so the Open dialog's GitHub
  // Remove is a full sign-out too (OpenModelDialog.jsx handleGithubRemove).
  test('Open dialog GitHub Remove goes through Auth0 /v2/logout and back signed out', async ({page, baseURL}) => {
    await expectSignOutRoundTrip(page, baseURL, async () => {
      await page.getByTestId('control-button-open').click()
      await page.getByRole('tab', {name: 'GitHub'}).click()
      await expect(page.getByTestId('github-account-footer')).toBeVisible()
      await page.getByTestId('button-github-account-settings').click()
      await page.getByTestId('menu-item-github-remove').click()
    })
  })
})
