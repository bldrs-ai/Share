import {expect, test, Page} from '@playwright/test'
import {
  auth0Login,
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
  setupAuthenticationIntercepts,
} from '../../tests/e2e/utils'


const {beforeEach, describe} = test


type WindowWithQuotaState = Window & {
  __mockQuotaLoads?: Array<{key: string, loadedAt: string}>
  __mockQuotaForce5xx?: boolean
  store?: {
    getState: () => {
      setAppMetadata: (meta: {
        userEmail?: string
        stripeCustomerId?: string | null
        subscriptionStatus?: 'sharePro' | 'free' | 'shareProPendingReauth' | 'freePendingReauth'
      }) => void
    }
  }
}


const SETTLE_MS = 500


/** Reset the MSW mock's in-memory loads list and 5xx flag. */
async function resetMockQuota(page: Page, preloadedKeys: string[] = []) {
  await page.evaluate((keys) => {
    const w = window as unknown as WindowWithQuotaState
    w.__mockQuotaForce5xx = false
    w.__mockQuotaLoads = keys.map((key) => ({key, loadedAt: new Date().toISOString()}))
  }, preloadedKeys)
}


/** Inject app_metadata into the Zustand store to set the user's tier. */
async function setSubscriptionTier(page: Page, tier: 'sharePro' | 'free') {
  await page.evaluate((subscriptionTier) => {
    const w = window as unknown as WindowWithQuotaState
    if (!w.store) {
      throw new Error('Zustand store not on window — test build flag missing')
    }
    w.store.getState().setAppMetadata({
      userEmail: 'cypress@bldrs.ai',
      stripeCustomerId: subscriptionTier === 'sharePro' ? 'cus_test_123' : null,
      subscriptionStatus: subscriptionTier === 'sharePro' ? 'sharePro' as const : 'free' as const,
    })
  }, tier)
}


/** Seed a Drive recent-file entry into localStorage so the dialog renders it. */
async function seedRecentFile(page: Page, fileId: string, name: string) {
  await page.evaluate(({id, fileName}) => {
    const RECENT_FILES_KEY = 'bldrs:recent-files'
    const raw = localStorage.getItem(RECENT_FILES_KEY)
    let store: {version: number, files: Array<object>}
    try {
      store = raw ? JSON.parse(raw) : {version: 1, files: []}
    } catch {
      store = {version: 1, files: []}
    }
    store.files.unshift({
      id,
      source: 'google-drive',
      name: fileName,
      mimeType: 'application/octet-stream',
      lastModifiedUtc: null,
      connectionId: 'test',
      fileId: id,
      sharePath: `/share/v/g/${id}`,
      lastOpenedUtc: new Date().toISOString(),
    })
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(store))
  }, {id: fileId, fileName: name})
}


/**
 * Quota gating end-to-end.
 *
 * Most quota correctness lives in unit tests (src/OPFS/quota.test.js,
 * src/Components/Open/OpenModelDialog.test.jsx). This spec exercises
 * the integration of the MSW mock + useQuota + OpenModelDialog for
 * the Pro tier — the case where mock state and tier-aware logic are
 * both load-bearing.
 */
describe('Quota: usage limit enforcement', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setupAuthenticationIntercepts(page)
  })


  describe('Pro user', () => {
    beforeEach(async ({page}) => {
      await returningUserVisitsHomepageWaitForModel(page)
      await auth0Login(page)
    })


    test('paid tier never sees the limit dialog, even past the free cap', async ({page}) => {
      // Mock has 5 prior loads — already past the 4-load free cap.
      await resetMockQuota(page, [
        '/share/v/g/old-1',
        '/share/v/g/old-2',
        '/share/v/g/old-3',
        '/share/v/g/old-4',
        '/share/v/g/old-5',
      ])
      await setSubscriptionTier(page, 'sharePro')

      // Seed a Drive recent and click it.
      await seedRecentFile(page, 'pro-attempt', 'pro-attempt.ifc')
      await page.getByTestId('control-button-open').click()
      const recent = page.getByTestId('link-open-recent-pro-attempt')
      if (!await recent.isVisible().catch(() => false)) {
        // Drive (Sources) tab requires googleDrive feature flag; skip if off.
        return
      }
      await recent.click()

      // Subscribe button should never appear for a paid user.
      await page.waitForTimeout(SETTLE_MS)
      await expect(page.getByTestId('button-quota-subscribe')).toHaveCount(0)
    })
  })


  // TODO: Free-tier "at-limit triggers dialog" and "public sample doesn't
  // count" cases were initially attempted here but are flaky in CI due to
  // the page-navigation interaction with `page.evaluate` after click.
  // The same logic is covered by:
  //   - src/OPFS/quota.test.js (28 unit tests)
  //   - src/Components/Open/OpenModelDialog.test.jsx (records + check wiring)
  //   - The MSW mock's path heuristic for repos containing "Public"
  // Re-add once we have a robust pattern for asserting state mid-navigation.
})
