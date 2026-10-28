import path from 'path'
import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {
  auth0Login,
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
  setupAuthenticationIntercepts,
} from '../../tests/e2e/utils'


// A `+` is the case the subscribe URL's encodeURIComponent exists for: left
// raw, URLSearchParams on the subscribe page decodes it as a space and
// prefills the wrong address (subscriptionNav#goToSubscription).
const USER_EMAIL = 'cypress+quota@bldrs.ai'

// A GA4 client id, as the `_ga` cookie carries it after `GA1.1.`.
const GA_CLIENT_ID = '1871520000.1754700000'

// FREE_PRIVATE_MODEL_LIMIT in src/quota/limits.js, which the MSW record-load
// mock enforces (src/__mocks__/api-handlers.js). The spec can't import it
// (it would pull the app's module graph into the runner), so the dialog's
// own copy is asserted against this too: if the limit moves, this fails.
const FREE_LIMIT = 2

// ROLLING_WINDOW_DAYS in src/quota/limits.js (owner, 2026-10-26; was 30),
// restated for the same reason. The mock prunes its ledger to it, as the
// real record-load does.
const WINDOW_DAYS = 7
const DAY_MS = 86_400_000
// SIGNED_OUT_FEATURES in src/quota/tierCopy.js, restated for the same reason.
const SIGNED_OUT_LINE_COUNT = 4
const HTTP_OK = 200

// Same fakes GoogleDriveConnect.spec.ts uses: GIS OAuth and the Picker,
// replaced so no popup or Google request happens.
const GOOGLE_APIS_FAKE_PATH = path.resolve(process.cwd(), 'src/Components/Connections/googleApisFake.js')


type FunnelEvent = {name: string, params: Record<string, unknown>}

type WindowWithStore = Window & {
  __mockQuotaLoads?: Array<{key: string, loadedAt: string}>
  __mockQuotaForce5xx?: boolean
  __lastPicker?: {_callback?: (data: {action: string, docs: object[]}) => void}
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


/**
 * A signed-in free user who has never been a Stripe customer: no
 * stripeCustomerId is what sends goToSubscription to checkout, not the
 * portal. The record-load mock reads the tier from this same store.
 *
 * @param page Playwright page
 */
async function setFreeUserMetadata(page: Page) {
  await page.evaluate((email) => {
    const w = window as unknown as WindowWithStore
    if (!w.store) {
      throw new Error('Zustand store not on window — test build flag missing')
    }
    w.store.getState().setAppMetadata({userEmail: email, stripeCustomerId: null, subscriptionStatus: 'free'})
  }, USER_EMAIL)
}


/**
 * Give the record-load mock (the server's stand-in) `count` distinct private
 * models this user already opened inside the 7-day window — Drive keys,
 * which count whatever `meterLocalFiles` says. `daysAgo` dates them, one
 * entry per model (default: all just now).
 *
 * @param page Playwright page
 * @param count How many prior private models
 * @param daysAgo How long ago each was opened, in days
 */
async function seedServerLoads(page: Page, count: number, daysAgo: number[] = []) {
  await page.evaluate(({n, ages, dayMs}) => {
    const w = window as unknown as WindowWithStore
    w.__mockQuotaForce5xx = false
    const now = Date.now()
    w.__mockQuotaLoads = Array.from({length: n}, (_, i) => ({
      key: `/share/v/g/seeded-${i}`,
      loadedAt: new Date(now - ((ages[i] ?? 0) * dayMs)).toISOString(),
    }))
  }, {n: count, ages: daysAgo, dayMs: DAY_MS})
}


/**
 * Connect Google Drive from the Open dialog's Google tab (the fake GIS
 * grants immediately), leaving the dialog on the connected Sources view.
 *
 * @param page Playwright page
 */
async function connectDrive(page: Page) {
  await page.getByTestId('control-button-open').click()
  await page.getByRole('tab', {name: 'Google'}).click()
  await page.getByTestId('button-connect-google-drive').click()
  await expect(page.getByTestId('sources-tab')).toBeVisible()
}


/**
 * Pick a Drive file through the (fake) Google Picker: the private load whose
 * record() call meets the server's answer — OpenModelDialog#handlePickerSelect.
 *
 * @param page Playwright page
 * @param fileId Drive file id
 */
async function pickDriveFile(page: Page, fileId: string) {
  await page.locator('[data-testid^="button-browse-drive-"]').click()
  await page.waitForFunction(() => !!(window as unknown as WindowWithStore).__lastPicker)
  await page.evaluate((id) => {
    const picker = (window as unknown as WindowWithStore).__lastPicker
    if (!picker?._callback) {
      throw new Error('Fake picker has no callback')
    }
    picker._callback({
      action: 'PICKED',
      docs: [{id, name: `${id}.ifc`, url: `https://drive.google.com/file/d/${id}`, mimeType: 'application/x-step', parentId: ''}],
    })
  }, fileId)
}


/**
 * Funnel events as gtag queued them. index.html's inline
 * `gtag(){dataLayer.push(arguments)}` runs even with the GA loader skipped
 * in tests, so every gtagEvent lands in window.dataLayer (same reading as
 * Containers/realModelOpen.spec.ts). The mock subscribe page is written
 * into this document with document.open/write, which keeps the window —
 * and its dataLayer — rather than replacing it, so this still reads after
 * the click.
 *
 * @param page Playwright page
 * @param name GA event name
 * @return Matching events, params made serializable
 */
async function funnelEvents(page: Page, name: string): Promise<FunnelEvent[]> {
  return await page.evaluate((eventName) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dataLayer: any[] = (window as any).dataLayer || []
    return dataLayer
      .filter((entry) => entry?.[0] === 'event' && entry?.[1] === eventName)
      .map((entry) => ({name: String(entry[1]), params: JSON.parse(JSON.stringify(entry[2] ?? {}))}))
  }, name)
}


/**
 * The free tier's limit, met where it is enforced: a signed-in free user
 * who has opened FREE_LIMIT distinct private models in the window picks a
 * third from Drive, record-load (here its MSW mock) refuses it with 403, and
 * QuotaLimitDialog shows instead of the model opening.
 *
 * The trigger used to be a local-file drop. Local files are free and
 * unmetered now (Share#1966; localFilesUnmetered.spec.ts proves a signed-out
 * user can drop past the cap), so the limit is reached on a Drive pick.
 *
 * QuotaLimitDialog's Subscribe button goes through the shared upgrade door,
 * subscriptionNav#goToSubscription (#1912), instead of building its own
 * `/subscribe/` URL. The user-visible result for a free user with no Stripe
 * customer id is the checkout page, keeping theme and the (encoded) email;
 * the analytics result is one quota_limit_reached when the dialog shows and
 * one begin_checkout {from: 'quota'} on the click
 * (design/new/quotas.md §"Funnel analytics").
 *
 * The search param turns the `quotas` gate on whatever its default. In this
 * build `useMock` is on, so the checkout page is the MSW stub fetched and
 * written into the document (Profile/Subscription.spec.ts asserts it the
 * same way) — the request URL is the only place the theme and email are
 * observable.
 */
describeMobileAndDesktop('QuotaLimitDialog', () => {
  test.beforeEach(async ({page}) => {
    await page.addInitScript({path: GOOGLE_APIS_FAKE_PATH})
    await homepageSetup(page)
    await setupAuthenticationIntercepts(page, {connection: 'google'})
    await returningUserVisitsHomepageWaitForModel(page, {search: '?feature=quotas', pauseRenderer: true})
    await auth0Login(page, 'google')
    await setFreeUserMetadata(page)
    await seedServerLoads(page, FREE_LIMIT)
    await connectDrive(page)
  })

  test('a free user\'s 3rd private model shows the limit dialog', async ({page}) => {
    await pickDriveFile(page, 'third-private-model')

    await expect(page.getByTestId('button-quota-subscribe')).toBeVisible()
    await expect(page.getByText(`limit of ${FREE_LIMIT} private models in any rolling ${WINDOW_DAYS}-day window`))
      .toBeVisible()
    // Refused, so the model never opened.
    expect(new URL(page.url()).pathname).not.toMatch(/\/v\/g\//)
    const serverLoads = await page.evaluate(() => (window as unknown as WindowWithStore).__mockQuotaLoads?.length)
    expect(serverLoads).toBe(FREE_LIMIT)

    await expect.poll(() => funnelEvents(page, 'quota_limit_reached')).toHaveLength(1)
    const [limitEvent] = await funnelEvents(page, 'quota_limit_reached')
    expect(limitEvent.params).toMatchObject({tier: 'free', feature: 'private_load'})
  })

  // The window's edge from the user's side: one of the two seeded models was
  // opened 8 days ago, outside the 7-day window, so the 3rd pick is the 2nd
  // that counts. record-load (its mock prunes to the window, as the real
  // function does) allows it and the model opens, with no dialog. Same as a
  // ledger written under the old 30-day window at rollout. The allowed pick
  // navigates to the model, a full page load, so the mock's in-page ledger
  // and the response body are gone by then; the status and the navigation
  // are the evidence (record-load.test.js checks the pruned write-back).
  test('a private model opened 8 days ago doesn\'t count: the next one opens', async ({page}) => {
    await seedServerLoads(page, FREE_LIMIT, [0, WINDOW_DAYS + 1])
    const recordLoad = page.waitForResponse((r) => new URL(r.url()).pathname === '/.netlify/functions/record-load')

    await pickDriveFile(page, 'after-the-window')

    const response = await recordLoad
    expect(response.status()).toBe(HTTP_OK)
    expect(JSON.parse(response.request().postData() ?? '{}')).toEqual({key: '/share/v/g/after-the-window'})
    await page.waitForURL((url) => url.pathname === '/share/v/g/after-the-window')
    await expect(page.getByTestId('button-quota-subscribe')).toHaveCount(0)
    expect(await funnelEvents(page, 'quota_limit_reached')).toHaveLength(0)
  })

  // The dialog's "What counts?" link: /share/quotas quotes the same window.
  test('the limit dialog links to the quotas page, which says rolling 7 days', async ({page}) => {
    await pickDriveFile(page, 'third-private-model')
    await expect(page.getByTestId('button-quota-subscribe')).toBeVisible()

    await page.getByRole('link', {name: 'What counts?'}).click()

    await expect(page).toHaveURL(/\/share\/quotas$/)
    const freeRow = page.getByRole('row', {name: /Free \(signed in\)/})
    await expect(freeRow).toContainText(`Rolling ${WINDOW_DAYS} days`)
    await expect(freeRow).toContainText(String(FREE_LIMIT))
    // The signed-out tier's lines (src/quota/tierCopy.js), which the pricing
    // page lists too: the benchmark link is a site path, so it has to resolve
    // from here and from the marketing site alike.
    const signedOut = page.getByTestId('quotas-signed-out')
    await expect(signedOut.getByRole('listitem')).toHaveCount(SIGNED_OUT_LINE_COUNT)
    await expect(signedOut).toContainText('Open local models in your browser. No waiting for upload')
    await expect(signedOut).not.toContainText(/export/i)
    await expect(signedOut.getByRole('link', {name: 'see the benchmark'})).toHaveAttribute('href', '/share/about/conway')
  })

  test('free user at the limit subscribes through checkout', async ({page}) => {
    await pickDriveFile(page, 'over-limit-model')

    const subscribeButton = page.getByTestId('button-quota-subscribe')
    await expect(subscribeButton).toBeVisible()

    await expect.poll(() => funnelEvents(page, 'quota_limit_reached')).toHaveLength(1)

    // The `_ga` cookie gtag/js writes on prod (it never loads here). The
    // checkout carries its client id to the pricing table's
    // client-reference-id, so the stripe-webhook's server-side
    // subscription_started lands on this browser's GA client
    // (design/new/quotas.md §"Server-side subscription events").
    await page.context().addCookies([{name: '_ga', value: `GA1.1.${GA_CLIENT_ID}`, domain: 'localhost', path: '/'}])

    const subscribeRequest = page.waitForRequest((req) => new URL(req.url()).pathname === '/subscribe/')
    await subscribeButton.click()
    const subscribeUrl = new URL((await subscribeRequest).url())

    await expect(page.getByText('Mock Subscribe Page')).toBeVisible()
    // Playwright's default colorScheme is light, and the viewer follows it.
    expect(subscribeUrl.searchParams.get('theme')).toBe('light')
    expect(subscribeUrl.searchParams.get('userEmail')).toBe(USER_EMAIL)
    // The raw query, not just the decoded param: an unencoded `+` would
    // decode above as a space and fail there, but pin the wire form too.
    expect(subscribeUrl.search).toContain(`userEmail=${encodeURIComponent(USER_EMAIL)}`)
    // Dot-free: Stripe silently drops a client-reference-id with a dot.
    expect(subscribeUrl.searchParams.get('gaRef')).toBe(`gacid_${GA_CLIENT_ID.replace('.', '_')}`)

    const checkoutEvents = await funnelEvents(page, 'begin_checkout')
    expect(checkoutEvents).toHaveLength(1)
    expect(checkoutEvents[0].params).toMatchObject({from: 'quota', destination: 'checkout'})
  })
})
