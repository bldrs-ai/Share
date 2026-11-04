import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from './tests/e2e/formFactor'
import {waitForModelReady} from './tests/e2e/models'
import {homepageSetup, setIsReturningUser} from './tests/e2e/utils'


// Any id routes/google.ts accepts (25-44 URL-safe chars).
const DRIVE_FILE_ID = 'bldrsMockDriveMissingFile000001'
const DRIVE_LINK = `/share/v/g/${DRIVE_FILE_ID}`
const HOME_MODEL_PATH = '/share/v/p/index.ifc'
const DRIVE_DOWNLOAD = new RegExp(`^https://www\\.googleapis\\.com/drive/v3/files/${DRIVE_FILE_ID}\\?`)
const HTTP_NOT_FOUND = 404
const TEST_TIMEOUT_MS = 90_000
// The failed load waits for sign-in to settle before giving up on the Drive
// file (CadView#loadModelWithAuthRetry), so its alert is not immediate.
const ALERT_TIMEOUT_MS = 30_000


/**
 * Refuse the Drive download a `/share/v/g/<id>` link makes with no Drive
 * connection (CadView#loadModel's API-key path), so the load fails. On the
 * context, after homepageSetup's real-network guard, so it wins (as
 * quota/driveLinkVisibility.spec.ts serves Drive ids).
 *
 * @param page
 */
async function refuseDriveDownload(page: Page) {
  await page.context().route(DRIVE_DOWNLOAD,
    (route) => route.fulfill({status: HTTP_NOT_FOUND, body: 'not found'}))
}


/**
 * open-205 #2013. Share decides "a different model" with `modelIdentity`. It
 * used to compare `filepath` and `gitpath`, which a Drive route has neither
 * of, so the alert's Reset after a failed Drive load (`navToDefault`, an
 * in-app navigation to the home model) left the Drive model in the store:
 * the URL said index.ifc, and the remounted viewer downloaded the Drive file
 * again and failed again.
 */
describeMobileAndDesktop('Open 205: Reset after a Drive model fails to load', () => {
  test.beforeEach(async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  test('opens the home model instead of retrying the Drive file', async ({page}) => {
    await refuseDriveDownload(page)
    await page.goto(DRIVE_LINK, {waitUntil: 'domcontentloaded'})
    const reset = page.getByTestId('button-dialog-main-action')
    await expect(reset).toHaveText('Reset', {timeout: ALERT_TIMEOUT_MS})

    await reset.click()
    // Retrying the Drive file would fail again: the alert comes back and the
    // model never becomes ready.
    await waitForModelReady(page)
    expect(new URL(page.url()).pathname).toBe(HOME_MODEL_PATH)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    // The store holds the model the URL names, not the Drive file.
    const modelPathKind = await page.evaluate(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).store?.getState?.().modelPath?.kind)
    expect(modelPathKind).toBe('file')
  })
})
