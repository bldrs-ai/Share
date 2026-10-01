import {readFileSync} from 'fs'
import {expect, Page, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {waitForModelReady} from '../../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../../tests/e2e/utils'


/**
 * Opening a file from the user's computer in a browser without OPFS (Firefox
 * private windows, some embeds) explains itself instead of failing.
 *
 * Uploads are stored in OPFS and loaded back after `navigateToModel`'s full
 * page load. Without OPFS the old blob-URL fallbacks could never open
 * anything, because the URL dies with the page that minted it. Until the
 * File is held across an in-app navigation (#1906), both ways in say so
 * (`OPFS/messages.js`) and leave the current model where it is.
 */
const MODEL_URL = '/share/v/p/index.ifc'
const PICKED_FILE = 'public/index.ifc'
// A distinctive slice of NO_OPFS_LOCAL_FILE_ALERT, which the spec can't
// import (it would pull the app's module graph into the test runner).
const ALERT_TEXT = 'needs browser storage, which isn\'t available here'


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


describeMobileAndDesktop('Open 100: opening a local file without OPFS', () => {
  test.beforeEach(async ({page, context}) => {
    await homepageSetup(page)
    await setIsReturningUser(context)
    await disableOpfs(page)
    await page.goto(MODEL_URL, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
  })

  test('Browse explains that local files need browser storage', async ({page}) => {
    await page.getByTestId('control-button-open').click()
    await page.getByRole('tab', {name: 'Local'}).click()
    // No chooser should open: there is nowhere for the file to go.
    let isChooserOpened = false
    page.on('filechooser', () => {
      isChooserOpened = true
    })
    await page.getByTestId('button_open_file').click()

    await expect(page.getByText(ALERT_TEXT)).toBeVisible()
    expect(isChooserOpened).toBe(false)
    await expect(page).toHaveURL(new RegExp(`${MODEL_URL}(#.*)?$`))
    expect(await page.evaluate(storedLocalIds)).toEqual([])
  })

  test('drag-and-drop explains that local files need browser storage', async ({page}) => {
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

    await expect(page.getByText(ALERT_TEXT)).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`${MODEL_URL}(#.*)?$`))
    expect(await page.evaluate(storedLocalIds)).toEqual([])
  })
})
