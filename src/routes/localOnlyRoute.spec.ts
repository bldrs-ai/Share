import {readFileSync} from 'fs'
import {expect, Page, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {waitForModelReady} from '../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../tests/e2e/utils'


/**
 * The local-only route (#1959). A file opened from the user's computer lives
 * at `/share/v/local-only/<uuid>.<ext>`; until #1959 it was `/v/new/…`, which
 * read like a universal share link (#1955). Old `/v/new/` URLs — recents,
 * bookmarks, links already pasted into chats — redirect to the new form.
 *
 * This spec runs with OPFS. The no-OPFS arm (the file is held in page memory,
 * and a reload explains it is gone) is `Components/Open/noOpfsUpload.spec.ts`,
 * which asserts the same `/v/local-only/` URL.
 */
const PICKED_FILE = 'public/index.ifc'
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
// Optional query: the legacy-redirect test carries `?feature=look` through.
const LOCAL_ONLY_URL = new RegExp(`/share/v/local-only/${UUID}\\.ifc(?:\\?[^#]*)?$`)
// Synthetic, never written: this browser has no such upload.
const MISSING_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d.ifc'
// Each test loads at least two models (home, then the upload) and some boot
// the app a third time.
const MULTI_LOAD_TIMEOUT_MS = 120_000
// The "not in this browser" alert waits on the OPFS worker's answer; under
// parallel SwiftShader Chromiums that can run past expect's 5s default
// (uploadNotInBrowser.spec.ts).
const ALERT_TIMEOUT_MS = 20_000


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
 * The local-only model loaded and the page is still on it. A failed load
 * alerts and then redirects to the home model, which also ends model-ready,
 * so the URL is checked on both sides of the wait, and no alert may be up.
 * The title takes the `Local-only: ` form only once that model has loaded.
 *
 * @param page
 */
async function expectLocalOnlyOpened(page: Page) {
  await expect(page).toHaveURL(LOCAL_ONLY_URL)
  await waitForModelReady(page)
  await expect(page).toHaveTitle(/^Local-only: /)
  await expect(page).toHaveURL(LOCAL_ONLY_URL)
  await expect(page.getByRole('dialog')).toHaveCount(0)
}


describeMobileAndDesktop('Open 120: the local-only route', () => {
  test.beforeEach(async ({page, context}) => {
    test.setTimeout(MULTI_LOAD_TIMEOUT_MS)
    await homepageSetup(page)
    await setIsReturningUser(context)
  })

  test.describe('with a file opened in this browser', () => {
    test.beforeEach(async ({page}) => {
      await page.goto('/share/v/p/index.ifc', {waitUntil: 'domcontentloaded'})
      await waitForModelReady(page)
      await dropPickedFile(page)
      await expectLocalOnlyOpened(page)
      // The leave-page prompt the Loader arms for uploads would hold any
      // navigation away; accepting it is what a user who goes anyway does.
      page.on('dialog', (dialog) => dialog.accept())
    })

    // The beforeEach already opened it and checked the URL; this is the
    // named case, plus the recent it left behind pointing at the same path.
    test('opening a local file lands on /v/local-only/', async ({page}) => {
      await expect(page).toHaveURL(LOCAL_ONLY_URL)
      const recentPaths = await page.evaluate(() => {
        const store = JSON.parse(localStorage.getItem('bldrs:recent-files') ?? '{"files":[]}')
        return store.files
          .filter((f: {source: string}) => f.source === 'local')
          .map((f: {sharePath: string}) => f.sharePath)
      })
      expect(recentPaths).toEqual([new URL(page.url()).pathname])
    })

    test('reloading reopens it from this browser', async ({page}) => {
      const url = page.url()
      await page.reload({waitUntil: 'domcontentloaded'})
      await expectLocalOnlyOpened(page)
      expect(page.url()).toBe(url)
    })

    test('an old /v/new/ URL for it redirects to /v/local-only/ and opens it', async ({page}) => {
      const localOnly = new URL(page.url())
      const legacyPath = localOnly.pathname.replace('/v/local-only/', '/v/new/')
      const historyBefore = await page.evaluate(() => history.length)
      await page.goto(`${legacyPath}?feature=look`, {waitUntil: 'domcontentloaded'})

      await expectLocalOnlyOpened(page)
      expect(new URL(page.url()).pathname).toBe(localOnly.pathname)
      // Search survives the redirect.
      expect(new URL(page.url()).search).toBe('?feature=look')
      // replaceState, not pushState: the goto added the one history entry,
      // and the redirect rewrote it in place rather than pushing a second
      // (which would leave a /v/new/ entry for Back to bounce off).
      expect(await page.evaluate(() => history.length)).toBe(historyBefore + 1)
    })
  })

  test('an old /v/new/ link to a file this browser lacks redirects, then explains', async ({page}) => {
    await page.goto(`/share/v/new/${MISSING_ID}`, {waitUntil: 'domcontentloaded'})
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({timeout: ALERT_TIMEOUT_MS})
    await expect(page).toHaveURL(new RegExp(`/share/v/local-only/${MISSING_ID}$`))
    await expect(dialog.getByText('File not in this browser')).toBeVisible()
    await expect(dialog.getByText('This is a local-only link')).toBeVisible()
  })
})
