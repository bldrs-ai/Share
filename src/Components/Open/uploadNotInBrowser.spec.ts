import {expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {waitForModelReady} from '../../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../../tests/e2e/utils'


/**
 * Opening a `/share/v/new/<storageId>` link in a browser that doesn't hold the
 * upload explains itself and offers to open a file (#1955).
 *
 * An upload lives only in the OPFS of the browser that dropped it, but its URL
 * travels: Sentry's SHARE-1NR, the top hard-failure group, had one storage id
 * opened from 11 IPs and links arriving from Teams. Each of those showed the
 * worker's raw "Folder <id> not found: NotFoundError" under an Error header.
 * `homepageSetup` clears OPFS, so this page is exactly that recipient.
 */
// Synthetic, never written: the point is that this browser has no such entry.
const MISSING_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d.ifc'
// A distinctive slice of UPLOAD_NOT_IN_BROWSER_ALERT, which the spec can't
// import (it would pull the app's module graph into the test runner).
const ALERT_TEXT = 'It isn\'t in this browser, so it can\'t be shown here.'
// The alert arrives only after the OPFS worker boots and answers the read,
// like any model load; under parallel SwiftShader Chromiums that runs past
// expect's 5s default (seen locally at --workers=4, never at 1).
const ALERT_TIMEOUT_MS = 20000


describeMobileAndDesktop('Open 110: a local-file link opened in another browser', () => {
  test.beforeEach(async ({page, context}) => {
    await homepageSetup(page)
    await setIsReturningUser(context)
    await page.goto(`/share/v/new/${MISSING_ID}`, {waitUntil: 'domcontentloaded'})
    await expect(page.getByRole('dialog')).toBeVisible({timeout: ALERT_TIMEOUT_MS})
  })

  // Scoped to the dialog: the load snackbar repeats the message on its
  // "Load failed:" line, so a page-wide text match would find two.
  test('explains the file is not in this browser, not "Folder not found"', async ({page}) => {
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('File not in this browser')).toBeVisible()
    await expect(dialog.getByText(ALERT_TEXT)).toBeVisible()
    await expect(page.getByText(/Folder .* not found/)).toHaveCount(0)
  })

  test('"Open a file" lands on the home model with the Open dialog up', async ({page}) => {
    const action = page.getByRole('dialog').getByTestId('button-dialog-main-action')
    await expect(action).toHaveText('Open a file')
    await action.click()

    await expect(page).toHaveURL(/\/share\/v\/p\/index\.ifc/)
    await expect(page.getByTestId('dialog-open-model-tabs-stack')).toBeVisible()
    await waitForModelReady(page)
    // Still up after the home model finished loading, i.e. the navigation
    // didn't close it on the way.
    await expect(page.getByTestId('dialog-open-model-tabs-stack')).toBeVisible()
  })
})
