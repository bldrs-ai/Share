import {readFileSync} from 'fs'
import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {
  auth0Login,
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
  setupAuthenticationIntercepts,
} from '../../tests/e2e/utils'


// FREE_PRIVATE_MODEL_LIMIT in src/quota/limits.js, which the MSW record-load
// mock enforces (src/__mocks__/api-handlers.js). Restated, as in
// Open/QuotaLimitDialog.spec.ts: the spec can't import the app's modules.
const FREE_LIMIT = 2
const DROPPED_FILE = 'public/index.ifc'
// An upload's OPFS entry: a root-level folder named for its storage id
// (OPFS.worker.js#writeModelToOPFS).
const UPLOAD_ENTRY = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.[a-z0-9]+$'

type WindowWithStore = Window & {
  __mockQuotaLoads?: Array<{key: string, loadedAt: string}>
  __mockQuotaForce5xx?: boolean
  store?: {getState: () => {setAppMetadata: (meta: object) => void}}
}


/**
 * A signed-in free user who already holds FREE_LIMIT private-model slots on
 * the record-load mock's ledger, so the next counted load is refused.
 *
 * @param page Playwright page
 */
async function becomeFreeUserAtTheLimit(page: Page) {
  await page.evaluate((limit) => {
    const w = window as unknown as WindowWithStore
    if (!w.store) {
      throw new Error('Zustand store not on window — test build flag missing')
    }
    w.store.getState().setAppMetadata({userEmail: 'cypress@bldrs.ai', stripeCustomerId: null, subscriptionStatus: 'free'})
    w.__mockQuotaForce5xx = false
    w.__mockQuotaLoads = Array.from({length: limit}, (_, i) => ({
      key: `/share/v/g/seeded-${i}`,
      loadedAt: new Date().toISOString(),
    }))
  }, FREE_LIMIT)
}


/**
 * Drop DROPPED_FILE on the onboarding overlay the way a user's drag would,
 * through the overlay's own drop handler and handleFileDrop's quota wiring.
 *
 * @param page Playwright page
 */
async function dropOnOverlay(page: Page) {
  const bytes = [...readFileSync(DROPPED_FILE)]
  await page.evaluate((bytesArg) => {
    const overlay = document.querySelector('[data-testid="onboarding-overlay"]')
    if (!overlay) {
      throw new Error('Onboarding overlay not found')
    }
    const dt = new DataTransfer()
    dt.items.add(new File([new Uint8Array(bytesArg)], 'index.ifc'))
    overlay.dispatchEvent(new DragEvent('drop', {bubbles: true, cancelable: true, dataTransfer: dt}))
  }, bytes)
}


/**
 * @param page Playwright page
 * @return The names of the uploads in this origin's OPFS
 */
async function opfsUploads(page: Page): Promise<string[]> {
  return await page.evaluate(async (pattern) => {
    const root = await navigator.storage.getDirectory()
    const names: string[] = []
    // @ts-expect-error: entries() is on FileSystemDirectoryHandle, missing from this lib's types
    for await (const [name, handle] of root.entries()) {
      if (handle.kind === 'directory' && new RegExp(pattern).test(name)) {
        names.push(name)
      }
    }
    return names
  }, UPLOAD_ENTRY)
}


/** @return The record-load mock's ledger keys */
async function ledgerKeys(page: Page): Promise<string[]> {
  return await page.evaluate(() =>
    ((window as unknown as WindowWithStore).__mockQuotaLoads ?? []).map((l) => l.key))
}


/**
 * bldrs-ai/ops#39 item 1. With the `meterLocalFiles` abuse switch on, a
 * signed-in free user at the limit drops a file on the onboarding overlay
 * (opened from Help). The drop is refused, and QuotaLimitDialog says so.
 * It used to show nothing: the overlay closes itself, which unmounts it, and
 * the dialog it kept in its own state went with it. Help doesn't open over
 * the dialog, the model doesn't open, and the refused upload is not left in
 * OPFS, where its /v/local-only/ URL would still open it (item 2).
 *
 * `?feature=quotas,meterLocalFiles` turns both on whatever their defaults;
 * the MSW record-load mock reads the same flag for the server's side.
 */
describeMobileAndDesktop('Onboarding overlay over the local-file quota', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setupAuthenticationIntercepts(page)
    await returningUserVisitsHomepageWaitForModel(page, {search: '?feature=quotas,meterLocalFiles', pauseRenderer: true})
    await auth0Login(page)
    await becomeFreeUserAtTheLimit(page)
  })

  test('a refused drop on the overlay shows the limit dialog', async ({page}) => {
    const urlBefore = page.url()
    const uploadsBefore = await opfsUploads(page)

    await page.getByTestId('control-button-help').click()
    await expect(page.getByTestId('onboarding-overlay')).toBeVisible()
    await dropOnOverlay(page)

    await expect(page.getByTestId('button-quota-subscribe')).toBeVisible()
    await expect(page.getByText(`limit of ${FREE_LIMIT} private models`)).toBeVisible()
    await expect(page.getByTestId('onboarding-overlay')).toHaveCount(0)
    await expect(page.getByText('Study the model using standard sections')).toHaveCount(0)
    expect(page.url()).toBe(urlBefore)
    expect(await ledgerKeys(page)).toEqual(['/share/v/g/seeded-0', '/share/v/g/seeded-1'])
    // The delete isn't awaited by the drop, so poll for it.
    await expect.poll(() => opfsUploads(page)).toEqual(uploadsBefore)
  })
})
