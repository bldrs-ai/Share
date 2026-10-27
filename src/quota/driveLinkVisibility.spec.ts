import {readFile} from 'fs/promises'
import {resolve} from 'path'
import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {waitForModelReady} from '../tests/e2e/models'
import {
  auth0Login,
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
  setupAuthenticationIntercepts,
} from '../tests/e2e/utils'


// FREE_PRIVATE_MODEL_LIMIT in src/quota/limits.js, which the MSW record-load
// mock enforces. A spec can't import app modules, so it's restated here. The
// removed anonymous tier's lifetime cap was the same number.
const LIMIT = 2

// Any id routes/google.ts accepts (25-44 URL-safe chars); its download is
// routed to the demo model below.
const DRIVE_FILE_ID = 'bldrsMockDriveIfcFixture0000002'
const DIRECT_LINK = `/share/v/g/${DRIVE_FILE_ID}`

const TEST_TIMEOUT_MS = 90_000
const HTTP_OK = 200
const FIXTURE_IFC = resolve(process.cwd(), 'src/tests/fixtures/index.ifc')
const RECORD_LOAD_PATH = '/.netlify/functions/record-load'
// How long to watch for a meter call or event that must NOT happen. The
// meter runs right after the model is ready; before this change its call and
// event landed well inside this.
const ABSENCE_WAIT_MS = 2000


type QuotaWindow = Window & {
  __mockQuotaLoads?: Array<{key: string, loadedAt: string}>
}


/**
 * GA events as gtag queued them: with the GA loader skipped in tests, every
 * gtagEvent lands in window.dataLayer (as directLinkSoftGate.spec.ts reads
 * them).
 *
 * @param page
 * @param name GA event name
 * @return Matching events' params
 */
async function gaEvents(page: Page, name: string): Promise<Array<Record<string, unknown>>> {
  return await page.evaluate((eventName) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dataLayer: any[] = (window as any).dataLayer || []
    return dataLayer
      .filter((entry) => entry?.[0] === 'event' && entry?.[1] === eventName)
      .map((entry) => JSON.parse(JSON.stringify(entry[2] ?? {})))
  }, name)
}


/** @return OPFS `quota.json` as stored, or null when it was never written */
async function opfsQuota(page: Page): Promise<unknown> {
  return await page.evaluate(async () => {
    try {
      const root = await navigator.storage.getDirectory()
      const file = await (await root.getFileHandle('quota.json')).getFile()
      return JSON.parse(await file.text())
    } catch {
      return null
    }
  })
}


/**
 * Serve the Drive download a `/share/v/g/<id>` link makes with no Drive
 * connection (CadView#loadModel's API-key path) as the demo model. On the
 * context, after homepageSetup's real-network guard, so it wins (as
 * routes/routes.spec.ts serves Drive ids). That path only succeeds for a
 * file shared "Anyone with the link", which is what makes it public.
 *
 * @param page
 */
async function serveLinkSharedDriveFile(page: Page) {
  const fixtureBytes = await readFile(FIXTURE_IFC)
  await page.context().route(new RegExp(`^https://www\\.googleapis\\.com/drive/v3/files/${DRIVE_FILE_ID}\\?`),
    (route) => route.fulfill({status: HTTP_OK, body: fixtureBytes, contentType: 'application/octet-stream'}))
}


/**
 * Count record-load calls from here on.
 *
 * @param page
 * @return a getter for the count
 */
function countRecordLoads(page: Page): () => number {
  let count = 0
  page.on('request', (req) => {
    if (new URL(req.url()).pathname === RECORD_LOAD_PATH) {
      count++
    }
  })
  return () => count
}


/**
 * A Drive file shared "Anyone with the link" is public, like a public
 * GitHub repo, so opening it is never metered (design/new/quotas.md §"Drive
 * visibility"). Opened from a pasted link with no Drive connection, it
 * downloads with the API key, which only a link-shared file allows.
 *
 * Signed out: the anonymous quota tier is gone, so nothing is metered at
 * all. This browser still holds that tier's OPFS ledger, full at its old
 * lifetime cap; before the change the link was refused against it and
 * quota_soft_limit_exceeded {tier: 'anonymous'} was sent.
 */
describeMobileAndDesktop('Quota: a link-shared Drive file opened signed out', () => {
  test.beforeEach(async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await homepageSetup(page)
    await serveLinkSharedDriveFile(page)
    await returningUserVisitsHomepageWaitForModel(page, {pauseRenderer: true})
  })

  test('opens, records nothing and sends no soft-limit event', async ({page}) => {
    const anonymousLedger = {
      tier: 'anonymous',
      loads: Array.from({length: LIMIT}, (_, i) => ({key: `/share/v/g/old-${i}`, loadedAt: new Date().toISOString()})),
    }
    await page.evaluate(async (ledger) => {
      const root = await navigator.storage.getDirectory()
      const writable = await (await root.getFileHandle('quota.json', {create: true})).createWritable()
      await writable.write(JSON.stringify(ledger))
      await writable.close()
    }, anonymousLedger)
    const recordLoads = countRecordLoads(page)

    await page.goto(DIRECT_LINK, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
    await expect(page.getByTestId('control-button-profile-icon-authenticated')).toHaveCount(0)
    expect(new URL(page.url()).pathname).toBe(DIRECT_LINK)

    await page.waitForTimeout(ABSENCE_WAIT_MS)
    expect(await gaEvents(page, 'quota_soft_limit_exceeded')).toEqual([])
    expect(await gaEvents(page, 'quota_limit_reached')).toEqual([])
    expect(await opfsQuota(page)).toEqual(anonymousLedger)
    expect(recordLoads()).toBe(0)
  })
})


/**
 * Signed in, a free user already at the limit pastes the same link. It is
 * public, so record-load is never asked; before the change it was, refused
 * with 403, and the soft-limit event was sent.
 */
describeMobileAndDesktop('Quota: a link-shared Drive file opened by a free user at the limit', () => {
  test.beforeEach(async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    // The link is a full page load, which resets the mock's in-page ledger,
    // so an init script seeds it on every document.
    await page.addInitScript((limit) => {
      const w = window as unknown as QuotaWindow
      const loadedAt = new Date().toISOString()
      w.__mockQuotaLoads = Array.from({length: limit}, (_, i) => ({key: `/share/v/g/seeded-${i}`, loadedAt}))
    }, LIMIT)
    await homepageSetup(page)
    await serveLinkSharedDriveFile(page)
    await setupAuthenticationIntercepts(page)
    await returningUserVisitsHomepageWaitForModel(page, {pauseRenderer: true})
    await auth0Login(page)
  })

  test('opens without being counted or flagged', async ({page}) => {
    const recordLoads = countRecordLoads(page)

    await page.goto(DIRECT_LINK, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
    await expect(page.getByTestId('control-button-profile-icon-authenticated')).toBeVisible()

    await page.waitForTimeout(ABSENCE_WAIT_MS)
    expect(await gaEvents(page, 'quota_soft_limit_exceeded')).toEqual([])
    expect(recordLoads()).toBe(0)
    const serverLoads = await page.evaluate(() => (window as unknown as QuotaWindow).__mockQuotaLoads?.length)
    expect(serverLoads).toBe(LIMIT)
  })
})
