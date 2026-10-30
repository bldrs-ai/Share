import path from 'path'
import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {
  auth0Login,
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
  setupAuthenticationIntercepts,
} from '../tests/e2e/utils'


// Same fakes QuotaLimitDialog.spec.ts and GoogleDriveConnect.spec.ts use:
// GIS OAuth and the Picker, so connecting grants immediately and nothing
// reaches Google.
const GOOGLE_APIS_FAKE_PATH = path.resolve(process.cwd(), 'src/Components/Connections/googleApisFake.js')

// GoogleDriveProvider's token key prefix and persistence.ts's connections key.
const DRIVE_TOKEN_PREFIX = 'bldrs:gdrive-token:'
const CONNECTIONS_KEY = 'bldrs:connections'


/**
 * What this browser still holds of Google Drive: persisted Drive connections
 * and stored Drive access tokens.
 *
 * @param page
 * @return counts of each
 */
async function driveLeftovers(page: Page): Promise<{connections: number, tokens: number}> {
  return await page.evaluate(({tokenPrefix, connectionsKey}) => {
    let connections = 0
    try {
      const list = JSON.parse(localStorage.getItem(connectionsKey) || '[]')
      connections = list.filter((c: {providerId: string}) => c.providerId === 'google-drive').length
    } catch {
      connections = -1
    }
    let tokens = 0
    for (let i = 0; i < localStorage.length; i++) {
      if (localStorage.key(i)?.startsWith(tokenPrefix)) {
        tokens++
      }
    }
    return {connections, tokens}
  }, {tokenPrefix: DRIVE_TOKEN_PREFIX, connectionsKey: CONNECTIONS_KEY})
}


/**
 * Signing out of Bldrs forgets Google Drive. A private model needs a Bldrs
 * sign-in AND the provider's authorization (design/new/quotas.md §"What
 * counts"); Drive's token lives in localStorage and would otherwise outlive
 * the Auth0 session, letting a signed-out user (never metered) keep opening
 * restricted Drive files (codex P1 on Share#1977). It is also what a shared
 * computer needs: the next person doesn't inherit a working Drive.
 * connections/useSignedOutDriveCleanup.js does it on the settled signed-out
 * state, so every way of signing out is covered; this drives the Profile
 * menu's Log out, the one a user reaches for.
 */
describeMobileAndDesktop('Signing out forgets Google Drive', () => {
  test.beforeEach(async ({page}) => {
    await page.addInitScript({path: GOOGLE_APIS_FAKE_PATH})
    await homepageSetup(page)
    await setupAuthenticationIntercepts(page, {connection: 'google'})
    await returningUserVisitsHomepageWaitForModel(page, {pauseRenderer: true})
    await auth0Login(page, 'google')
  })

  test('Log out clears the Drive token and connection', async ({page}) => {
    await page.getByTestId('control-button-open').click()
    await page.getByRole('tab', {name: 'Google'}).click()
    await page.getByTestId('button-connect-google-drive').click()
    await expect(page.getByTestId('sources-tab')).toBeVisible()
    // Connected: the connection is persisted and its token stored.
    await expect.poll(() => driveLeftovers(page)).toEqual({connections: 1, tokens: 1})
    await page.keyboard.press('Escape')

    await page.getByTestId('control-button-profile').click()
    await page.getByTestId('menu-open-logout-dialog').click()
    await expect(page.getByTestId('control-button-profile-icon-authenticated')).toHaveCount(0)

    await expect.poll(() => driveLeftovers(page)).toEqual({connections: 0, tokens: 0})
    // And the Open dialog offers to connect again rather than a Drive source.
    await page.getByTestId('control-button-open').click()
    await page.getByRole('tab', {name: 'Google'}).click()
    await expect(page.getByTestId('button-connect-google-drive')).toBeVisible()
    await expect(page.getByTestId('sources-tab')).toHaveCount(0)
  })
})
