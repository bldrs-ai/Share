import {readFile} from 'node:fs/promises'
import {Page, expect, test} from '@playwright/test'
import {
  EXPORT_TEST_TIMEOUT_MS,
  GLTF_MAGIC,
  loadModelAndWaitForArtifact,
  openShareDialog,
  routeProModule,
  setSubscriptionTier,
} from '../../tests/e2e/export'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {
  auth0Login,
  clearOpfs,
  homepageSetup,
  setIsReturningUser,
  setupAuthenticationIntercepts,
} from '../../tests/e2e/utils'


/**
 * "My Exports" in the Profile menu (share-140 S3, #1834).
 *
 * What only an E2E can show here: that the history a user sees is the one
 * the export actually wrote. The row comes back through the whole chain —
 * `useExport` → `exportHistory.recordExport` → the `record-export` MSW gate
 * (which reads the tier off the store exactly as the real function reads
 * `app_metadata`) → the `exports.json` mirror in OPFS → the dialog. And
 * "Download again" then re-runs the premium module against the artifact the
 * FIRST export left in the cache, with no model reload in between, which is
 * the claim the local-only `cacheKeyArgs` exist to support.
 *
 * Shared setup lives in `src/tests/e2e/export.ts`, with `exportGlb.spec.ts`.
 */


/**
 * Open the Profile menu and pick "My Exports".
 *
 * @param page Playwright page
 */
async function openMyExports(page: Page) {
  await page.getByTestId('control-button-profile').click()
  await page.getByTestId('my-exports').click()
  await expect(page.getByTestId('exports-dialog')).toBeVisible()
}


/**
 * Sign the returning user in as Pro on the loaded model.
 *
 * @param page Playwright page
 */
async function signInAsPro(page: Page) {
  await setSubscriptionTier(page, 'sharePro')
  await auth0Login(page)
}


describeMobileAndDesktop('Share 140: My Exports', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setupAuthenticationIntercepts(page)
    await setIsReturningUser(page.context())
    // OPFS is partitioned per context and each test gets a fresh one; this
    // covers a run interrupted mid-write, which no afterEach could clean up.
    await clearOpfs(page)
  })

  test('lists an export and re-downloads it from the cache', async ({page}) => {
    test.setTimeout(EXPORT_TEST_TIMEOUT_MS)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))
    await routeProModule(page)

    await loadModelAndWaitForArtifact(page)
    await signInAsPro(page)

    await openShareDialog(page)
    const firstDownload = page.waitForEvent('download')
    await page.getByTestId('export-glb-button').click()
    await firstDownload
    await page.getByTestId('button-close-dialog-share').click()

    await openMyExports(page)
    const rows = page.getByTestId('exports-row')
    await expect(rows).toHaveCount(1)
    // The title the hook records is the model's own source filename, and the
    // chip is the registry's label for the format that was run.
    await expect(rows.first()).toContainText('index.ifc')
    await expect(rows.first()).toContainText('GLB')

    // The artifact the first export read is still in OPFS, so this row can
    // be re-downloaded without reopening the model.
    const secondDownload = page.waitForEvent('download')
    await page.getByTestId('exports-download-again').click()
    const download = await secondDownload

    expect(download.suggestedFilename()).toBe('index.glb')
    const bytes = await readFile(await download.path())
    expect(bytes.subarray(0, GLTF_MAGIC.length).toString('ascii')).toBe(GLTF_MAGIC)
    expect(bytes.byteLength).toBeGreaterThan(0)
  })

  test('a Pro user who has exported nothing sees the empty state', async ({page}) => {
    test.setTimeout(EXPORT_TEST_TIMEOUT_MS)

    await loadModelAndWaitForArtifact(page)
    await signInAsPro(page)

    await openMyExports(page)

    await expect(page.getByTestId('exports-empty')).toBeVisible()
    await expect(page.getByTestId('exports-row')).toHaveCount(0)
  })
})
