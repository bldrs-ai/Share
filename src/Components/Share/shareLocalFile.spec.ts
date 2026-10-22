import {expect, test} from '@playwright/test'
import {clickGate} from '../../tests/e2e/export'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {waitForModelReady} from '../../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../../tests/e2e/utils'


/**
 * Share is gated for a model opened from the user's computer (#705).
 *
 * An upload is stored only in this browser's OPFS and served from
 * `/share/v/new/<id>`, so the link the Share dialog used to show opened
 * nowhere else. This walks the user's own path — Open › Local › Browse, then
 * Share — and checks the button explains itself instead of offering a link,
 * and that its action leads to the Open dialog (where GitHub and Google
 * Drive are). The hosted home model is checked first, so the gate is shown
 * to follow the upload rather than being on everywhere.
 */
// Any file the loader accepts; this one is small and already served.
const PICKED_FILE = 'public/index.ifc'
// A distinctive slice of ShareControl's MSG_LOCAL_SHARE_BODY, which the spec
// can't import (it would pull the app's module graph into the test runner).
const HELP_TEXT = 'a link to it won\'t open anywhere else'
// Two model loads (the home model, then the upload) in one test; the default
// 30s ran out on a loaded machine. Same budget as shareDisplay.spec.ts.
const TEST_TIMEOUT_MS = 90_000


describeMobileAndDesktop('Share 110: a model opened from a local file', () => {
  test.beforeEach(async ({page, context}) => {
    await homepageSetup(page)
    await setIsReturningUser(context)
    await page.goto('/share/v/p/index.ifc', {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
  })

  test('gates Share with an explanation and offers to open a file', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    // Hosted model: the ordinary, ungated Share button.
    await expect(page.getByTestId('control-button-share')).toBeVisible()
    await expect(page.getByTestId('gated-share')).toHaveCount(0)

    await page.getByTestId('control-button-open').click()
    await page.getByRole('tab', {name: 'Local'}).click()
    const chooserEvent = page.waitForEvent('filechooser')
    await page.getByTestId('button_open_file').click()
    await (await chooserEvent).setFiles(PICKED_FILE)
    await expect(page).toHaveURL(/\/share\/v\/new\/.+\.ifc/)
    await waitForModelReady(page)

    await expect(page.getByTestId('gated-share')).toBeVisible()
    // aria-disabled makes Playwright's own actionability check refuse the
    // click, so this goes through the shared gate helper (checks
    // aria-disabled, waits for the gate to be still and hit-testable, then
    // clicks).
    await clickGate(page, 'gated-share')

    const help = page.getByTestId('gated-help')
    await expect(help.getByText('Local files can\'t be shared yet')).toBeVisible()
    await expect(help.getByText(HELP_TEXT, {exact: false})).toBeVisible()
    // No link, no QR: the dialog that would show the local URL never opened.
    await expect(page.getByTestId('textfield-link')).toHaveCount(0)
    await expect(page.getByTestId('img-qrcode')).toHaveCount(0)

    await page.getByTestId('gated-help-action').click()
    await expect(page.getByTestId('dialog-open-model-tabs-stack')).toBeVisible()
  })
})
