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
// mock enforces. A spec can't import app modules, so it's restated here.
const FREE_LIMIT = 2

// Any id routes/google.ts accepts (25-44 URL-safe chars); its download is
// routed to the demo model below.
const DRIVE_FILE_ID = 'bldrsMockDriveIfcFixture0000001'
const DIRECT_LINK = `/share/v/g/${DRIVE_FILE_ID}`

const TEST_TIMEOUT_MS = 90_000
const HTTP_FORBIDDEN = 403
const HTTP_OK = 200
const FIXTURE_IFC = resolve(process.cwd(), 'src/tests/fixtures/index.ifc')


type QuotaWindow = Window & {
  __mockQuotaLoads?: Array<{key: string, loadedAt: string}>
}


interface GaEvent {
  name: string,
  params: Record<string, unknown>,
}


/**
 * GA events as gtag queued them: with the GA loader skipped in tests, every
 * gtagEvent lands in window.dataLayer (as visibleGates.spec.ts and
 * QuotaLimitDialog.spec.ts read them).
 *
 * @param page
 * @param name GA event name
 * @return Matching events, params made serializable
 */
async function gaEvents(page: Page, name: string): Promise<GaEvent[]> {
  return await page.evaluate((eventName) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dataLayer: any[] = (window as any).dataLayer || []
    return dataLayer
      .filter((entry) => entry?.[0] === 'event' && entry?.[1] === eventName)
      .map((entry) => ({name: String(entry[1]), params: JSON.parse(JSON.stringify(entry[2] ?? {}))}))
  }, name)
}


/**
 * Direct links: a soft gate (design/new/quotas.md §"Direct links: soft
 * gate"). A signed-in free user who has already opened FREE_LIMIT private
 * models this window pastes a link to a third, a Drive file. Nothing in
 * the Open dialog runs. The route-load path records it; record-load (its
 * MSW mock) refuses with 403; and still the model opens, QuotaLimitDialog
 * stays away, and one quota_soft_limit_exceeded is sent, so the use of the
 * workaround is measured rather than blocked.
 *
 * The link is a full page load, as a pasted or clicked one is. That resets
 * the mock's in-page ledger, so an init script seeds it on every document
 * this test opens, and Auth0 restores the session by silent refresh
 * (setupAuthenticationIntercepts).
 *
 * `open_cid` rides along only where GA has a client id, which it never has
 * on localhost under automation; its attachment is pinned by
 * privacy/analytics.test.js, as for every gtagEventWithCid event.
 */
describeMobileAndDesktop('Quota: direct links are a soft gate', () => {
  test.beforeEach(async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await page.addInitScript((limit) => {
      const w = window as unknown as QuotaWindow
      const loadedAt = new Date().toISOString()
      w.__mockQuotaLoads = Array.from({length: limit}, (_, i) => ({key: `/share/v/g/seeded-${i}`, loadedAt}))
    }, FREE_LIMIT)
    await homepageSetup(page)
    // The Drive download a `/share/v/g/<id>` link makes with no Drive
    // connection (CadView#loadModel's API-key path), served as the demo
    // model. On the context, after homepageSetup's real-network guard, so it
    // wins (as routes/routes.spec.ts serves Drive ids).
    const fixtureBytes = await readFile(FIXTURE_IFC)
    await page.context().route(new RegExp(`^https://www\\.googleapis\\.com/drive/v3/files/${DRIVE_FILE_ID}\\?`),
      (route) => route.fulfill({status: HTTP_OK, body: fixtureBytes, contentType: 'application/octet-stream'}))
    await setupAuthenticationIntercepts(page)
    await returningUserVisitsHomepageWaitForModel(page, {pauseRenderer: true})
    await auth0Login(page)
  })

  test('a free user at the limit opens a private Drive link: it loads, unblocked, and is counted', async ({page}) => {
    const recordLoad = page.waitForResponse((r) => new URL(r.url()).pathname === '/.netlify/functions/record-load')
    await page.goto(DIRECT_LINK, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
    await expect(page.getByTestId('control-button-profile-icon-authenticated')).toBeVisible()

    // The server's answer was the refusal the Open dialog would have shown.
    const response = await recordLoad
    expect(response.status()).toBe(HTTP_FORBIDDEN)
    expect(JSON.parse(response.request().postData() ?? '{}')).toEqual({key: DIRECT_LINK})

    await expect.poll(() => gaEvents(page, 'quota_soft_limit_exceeded')).toHaveLength(1)
    const [softLimit] = await gaEvents(page, 'quota_soft_limit_exceeded')
    expect(softLimit.params).toEqual({tier: 'free', used: FREE_LIMIT, limit: FREE_LIMIT, route_kind: 'gdrive'})

    // Not blocked: still on the model, no limit dialog, and the dialog's own
    // event (which fires whenever it shows) never went out.
    expect(new URL(page.url()).pathname).toBe(DIRECT_LINK)
    await expect(page.getByTestId('cadview-dropzone')).toHaveAttribute('data-model-ready', 'true')
    await expect(page.getByTestId('button-quota-subscribe')).toHaveCount(0)
    expect(await gaEvents(page, 'quota_limit_reached')).toHaveLength(0)
    // A refused load is not written to the ledger.
    const serverLoads = await page.evaluate(() => (window as unknown as QuotaWindow).__mockQuotaLoads?.length)
    expect(serverLoads).toBe(FREE_LIMIT)
  })
})
