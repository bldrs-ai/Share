import {readFileSync} from 'fs'
import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {waitForModelReady} from '../../tests/e2e/models'
import {homepageSetup, returningUserVisitsHomepageWaitForModel} from '../../tests/e2e/utils'


/**
 * Local files are free and unmetered (Share#1966): a signed-out user can
 * open as many files from their computer as they like, with quota
 * enforcement ON. The pricing page promises it ("your files never leave
 * your computer"; no local-file limit) and tools/marketing/pricingTiers.test.js
 * keeps the copy from contradicting it.
 *
 * Signed out is where this used to bite hardest: the anonymous tier (since
 * removed: signed-out users are never metered) had a lifetime cap of 2, and
 * local drops counted against it, so the 3rd drop of a first visit opened
 * QuotaLimitDialog. DROPS is one past that old cap.
 */
const DROPPED_FILE = 'public/index.ifc'
const DROPS = 3
const LOCAL_ONLY_URL = /\/share\/v\/local-only\/[0-9a-f-]{36}\.ifc/
// Each drop is a full page load of the upload (navigateToModel), and the
// home model loads first.
const DROPS_TIMEOUT_MS = 180_000


/**
 * Drop DROPPED_FILE on the viewer the way a user's drag would — through
 * ViewerContainer's dropzone and handleFileDrop's quota wiring.
 *
 * @param page Playwright page
 */
async function dropLocalFile(page: Page) {
  const bytes = [...readFileSync(DROPPED_FILE)]
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


/** @return The loads in OPFS `quota.json`, the local quota ledger */
async function opfsQuotaLoads(page: Page): Promise<number> {
  return await page.evaluate(async () => {
    try {
      const root = await navigator.storage.getDirectory()
      const file = await (await root.getFileHandle('quota.json')).getFile()
      return (JSON.parse(await file.text()).loads ?? []).length
    } catch {
      return 0 // never written: nothing was ever counted
    }
  })
}


describeMobileAndDesktop('Local files are unmetered', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    // Signed out. `?feature=quotas` turns enforcement on whatever the flag's
    // default, and survives each navigation (navigate.js#withCurrentSearch).
    await returningUserVisitsHomepageWaitForModel(page, {search: '?feature=quotas'})
  })

  test('opening several local files signed out never shows the limit dialog', async ({page}) => {
    test.setTimeout(DROPS_TIMEOUT_MS)
    const opened = new Set<string>()
    for (let i = 0; i < DROPS; i++) {
      const before = page.url()
      await dropLocalFile(page)
      // A refused drop never navigates, so each drop must reach a NEW upload.
      await page.waitForURL((url) => url.href !== before && LOCAL_ONLY_URL.test(url.pathname))
      await waitForModelReady(page)
      opened.add(new URL(page.url()).pathname)
      await expect(page.getByTestId('button-quota-subscribe')).toHaveCount(0)
    }
    expect(opened.size).toBe(DROPS)
    expect(new URL(page.url()).search).toContain('feature=quotas')
    // Not refused AND not counted: the local ledger is untouched.
    expect(await opfsQuotaLoads(page)).toBe(0)
  })
})
