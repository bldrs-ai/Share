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

// LIMITS[TIERS.FREE] in src/quota/quota.js. Seeding exactly the cap is
// what makes useQuota report hasCapacity false for a free user.
const FREE_LIMIT = 4


type FunnelEvent = {name: string, params: Record<string, unknown>}

type WindowWithStore = Window & {
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
 * Write `quota.json` to OPFS with the free tier's full allowance already
 * used, in the shape quota.js#saveQuota persists.
 *
 * Must run BEFORE auth0Login: useQuota re-reads OPFS only when its tier
 * changes, and the anonymous→free flip on sign-in is that change. Seeded
 * after it, the hook would keep the empty state it read while anonymous.
 * Timestamps are "now" so pruneLoads' 30-day window keeps all of them.
 *
 * @param page Playwright page
 */
async function seedFreeTierAtLimit(page: Page) {
  await page.evaluate(async (limit) => {
    const loadedAt = new Date().toISOString()
    const loads = Array.from({length: limit}, (_, i) => ({key: `/share/v/new/seeded-${i}.ifc`, loadedAt}))
    const root = await navigator.storage.getDirectory()
    const handle = await root.getFileHandle('quota.json', {create: true})
    const writable = await handle.createWritable()
    await writable.write(JSON.stringify({tier: 'free', loads}))
    await writable.close()
  }, FREE_LIMIT)
}


/**
 * A signed-in free user who has never been a Stripe customer: no
 * stripeCustomerId is what sends goToSubscription to checkout, not the
 * portal.
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
 * Drop a local model on the viewer. ViewerContainer's drop handler checks
 * useQuota's hasCapacity before reading the file, so at the limit this
 * opens QuotaLimitDialog without the bytes ever mattering.
 *
 * @param page Playwright page
 */
async function dropLocalFile(page: Page) {
  await page.evaluate(() => {
    const dropzone = document.querySelector('[data-testid="cadview-dropzone"]')
    if (!dropzone) {
      throw new Error('Drop target not found')
    }
    const dt = new DataTransfer()
    dt.items.add(new File(['ISO-10303-21;'], 'over-limit.ifc'))
    dropzone.dispatchEvent(new DragEvent('drop', {bubbles: true, cancelable: true, dataTransfer: dt}))
  })
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
 * QuotaLimitDialog's Subscribe button goes through the shared upgrade door,
 * subscriptionNav#goToSubscription (#1912), instead of building its own
 * `/subscribe/` URL. The user-visible result for a free user with no Stripe
 * customer id is the checkout page, keeping theme and the (encoded) email;
 * the analytics result is one quota_limit_reached when the dialog shows and
 * one begin_checkout {from: 'quota'} on the click
 * (design/new/quotas.md §"Funnel analytics").
 *
 * The quota gate is behind the `quotas` feature flag, hence the search
 * param. In this build `useMock` is on, so the checkout page is the MSW
 * stub fetched and written into the document (Profile/Subscription.spec.ts
 * asserts it the same way) — the request URL is the only place the theme
 * and email are observable.
 */
describeMobileAndDesktop('QuotaLimitDialog: Subscribe', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setupAuthenticationIntercepts(page)
    await returningUserVisitsHomepageWaitForModel(page, {search: '?feature=quotas', pauseRenderer: true})
    await seedFreeTierAtLimit(page)
    await auth0Login(page)
    await setFreeUserMetadata(page)
  })

  test('free user at the limit subscribes through checkout', async ({page}) => {
    await dropLocalFile(page)

    const subscribeButton = page.getByTestId('button-quota-subscribe')
    await expect(subscribeButton).toBeVisible()
    // Free, not anonymous: the sign-up offer is for anonymous users only.
    await expect(page.getByTestId('button-quota-signup')).toHaveCount(0)

    await expect.poll(() => funnelEvents(page, 'quota_limit_reached')).toHaveLength(1)
    const [limitEvent] = await funnelEvents(page, 'quota_limit_reached')
    expect(limitEvent.params).toMatchObject({tier: 'free', feature: 'private_load'})

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

    const checkoutEvents = await funnelEvents(page, 'begin_checkout')
    expect(checkoutEvents).toHaveLength(1)
    expect(checkoutEvents[0].params).toMatchObject({from: 'quota', destination: 'checkout'})
  })
})
