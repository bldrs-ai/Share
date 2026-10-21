import {readFileSync} from 'fs'
import {expect, Page, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {waitForModelReady} from '../../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../../tests/e2e/utils'


/**
 * Opening a file from the user's computer in a browser without OPFS (Firefox
 * private windows, some embeds), #1906.
 *
 * With OPFS an upload is stored there and loaded back after
 * `navigateToModel`'s full page load. Without it, the file is held in the
 * page's memory (`loader/inMemoryUploads.js`) and opened by an in-app
 * navigation instead, since a page load would drop it. A reload then can't
 * recover the file, and says so.
 */
const PICKED_FILE = 'public/index.ifc'
// The upload's id, `<uuid>.ifc`, under the `/v/new/` route.
const UPLOAD_URL = /\/share\/v\/new\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.ifc$/
// A distinctive slice of IN_MEMORY_UPLOAD_GONE_ALERT, which the spec can't
// import (it would pull the app's module graph into the test runner).
const GONE_TEXT = 'opened from your computer in a previous page and is no longer available'
// Every test here loads a model at least twice (the home model, then the
// upload), and the reload test boots the app a third time.
const TWO_LOADS_TIMEOUT_MS = 90_000
// A reload boots the whole app (OPFS probe, viewer init) before CadView
// can raise the alert; the default 5s expect is not always enough.
const APP_BOOT_TIMEOUT_MS = 15_000


/**
 * Make OPFS look missing the way it does in a private window: the entry point
 * rejects, so `checkOPFSAvailability` resolves false and the store follows.
 *
 * @param page Playwright page, before its first navigation
 */
async function disableOpfs(page: Page) {
  await page.addInitScript(() => {
    navigator.storage.getDirectory = () =>
      Promise.reject(new DOMException('The operation is insecure.', 'SecurityError'))
  })
}


/** @return Ids of the `local` recents in localStorage */
function storedLocalIds(): string[] {
  const store = JSON.parse(localStorage.getItem('bldrs:recent-files') ?? '{"files":[]}')
  return store.files
    .filter((f: {source: string}) => f.source === 'local')
    .map((f: {id: string}) => f.id)
}


/**
 * Drop `PICKED_FILE` on the viewer the way a user's drag would.
 *
 * @param page
 */
async function dropPickedFile(page: Page) {
  const bytes = [...readFileSync(PICKED_FILE)]
  await page.evaluate((bytesArg) => {
    const dropzone = document.querySelector('[data-testid="cadview-dropzone"]')
    if (!dropzone) {
      throw new Error('Drop target not found')
    }
    const dt = new DataTransfer()
    dt.items.add(new File([new Uint8Array(bytesArg)], 'index.ifc'))
    dropzone.dispatchEvent(new DragEvent('drop', {bubbles: true, cancelable: true, dataTransfer: dt}))
  }, bytes)
}


/**
 * The upload loaded and the page is still on it.
 *
 * A failed load raises an alert and then redirects to the home model, which
 * also ends model-ready, so neither "a model is ready" nor "the URL changed"
 * proves anything alone. What does: the page title takes the uploaded
 * model's `New: ` form only once that model has loaded, the URL is still the
 * upload's, and no dialog (the alert) is up.
 *
 * @param page
 */
async function expectUploadOpened(page: Page) {
  await expect(page).toHaveURL(UPLOAD_URL)
  await waitForModelReady(page)
  await expect(page).toHaveTitle(/^New: /)
  await expect(page).toHaveURL(UPLOAD_URL)
  await expect(page.getByRole('dialog')).toHaveCount(0)
}


describeMobileAndDesktop('Open 100: opening a local file without OPFS', () => {
  test.beforeEach(async ({page, context}) => {
    test.setTimeout(TWO_LOADS_TIMEOUT_MS)
    await homepageSetup(page)
    await setIsReturningUser(context)
    await disableOpfs(page)
    await page.goto('/share/v/p/index.ifc', {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
  })

  test('Browse opens the picked file', async ({page}) => {
    await page.getByTestId('control-button-open').click()
    await page.getByRole('tab', {name: 'Local'}).click()
    const chooser = page.waitForEvent('filechooser')
    await page.getByTestId('button_open_file').click()
    await (await chooser).setFiles(PICKED_FILE)

    await expectUploadOpened(page)
    // Nothing is stored, so there is nothing for a recent to reopen.
    expect(await page.evaluate(storedLocalIds)).toEqual([])
  })

  test('drag-and-drop opens the dropped file', async ({page}) => {
    await dropPickedFile(page)

    await expectUploadOpened(page)
    expect(await page.evaluate(storedLocalIds)).toEqual([])
  })

  test('reloading an opened file explains it is no longer available', async ({page}) => {
    await dropPickedFile(page)
    await expectUploadOpened(page)

    // The leave-page prompt the Loader arms for uploads would hold the
    // reload; accepting it is what a user who reloads anyway does.
    page.on('dialog', (dialog) => dialog.accept())
    await page.reload({waitUntil: 'domcontentloaded'})

    await expect(page.getByText('File no longer available')).toBeVisible({timeout: APP_BOOT_TIMEOUT_MS})
    await expect(page.getByText(GONE_TEXT)).toBeVisible()
  })
})
