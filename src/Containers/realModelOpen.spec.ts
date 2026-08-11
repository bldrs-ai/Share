import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
} from '../tests/e2e/utils'
import {setupVirtualPathIntercept, waitForModelReady} from '../tests/e2e/models'


// Any remote-sourced model qualifies as a "real" open; this one rides the
// bldrs-ai/test-models fixture path that the dev server serves natively.
const REAL_MODEL = '/share/v/gh/bldrs-ai/test-models/main/ifc/misc/box.ifc'


/**
 * Collect `real_model_open` gtag events from the page's dataLayer.
 *
 * index.html declares `gtag(){dataLayer.push(arguments)}` inline, so
 * even with the googletagmanager script blocked in tests every
 * `gtagEvent` call lands in `window.dataLayer` — no stub needed.
 * Entries are `arguments` objects; map to plain serializable data
 * before they cross the evaluate boundary.
 *
 * @param page Playwright page object
 * @return Array of {name, contentId, hasOpenCid, openCid} per real_model_open event
 */
async function realModelOpenEvents(
  page: Page,
): Promise<{name: string, contentId: string, hasOpenCid: boolean, openCid?: unknown}[]> {
  return await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dataLayer: any[] = (window as any).dataLayer || []
    return dataLayer
      .filter((entry) => entry?.[0] === 'event' && entry?.[1] === 'real_model_open')
      .map((entry) => ({
        name: String(entry[1]),
        contentId: String(entry[2]?.content_id ?? ''),
        hasOpenCid: entry[2]?.open_cid !== undefined,
        openCid: entry[2]?.open_cid,
      }))
  })
}


// A real GA client id: two dot-joined numbers, so the whole value
// parses as a float unless something makes it non-numeric.
const FAKE_CLIENT_ID = '1871520000.1754700000'


/**
 * The homepage auto-loads the bundled demo model, and counting that as a
 * model open once polluted the metric this event feeds into Google Ads
 * conversion bidding — hence the guarded, separately-named event
 * (CadView#loadModel + analytics#isRealModelOpen).
 */
describeMobileAndDesktop('real_model_open GA event', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  test('does not fire for the homepage demo model', async ({page}) => {
    await visitHomepageWaitForModel(page)
    // Guard against a vacuous pass: the inline gtag bootstrap must have
    // run, or the absence below would only prove gtag was missing.
    const hasGtag = await page.evaluate(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      typeof (window as any).gtag === 'function' && Array.isArray((window as any).dataLayer))
    expect(hasGtag).toBe(true)
    expect(await realModelOpenEvents(page)).toHaveLength(0)
  })

  test('fires once for a GitHub-hosted model open', async ({page}) => {
    await setupVirtualPathIntercept(page, REAL_MODEL, 'box.ifc')
    await page.goto(REAL_MODEL, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
    const events = await realModelOpenEvents(page)
    expect(events).toHaveLength(1)
    expect(events[0].contentId).toContain('box.ifc')
    // open_cid comes from gtag's client_id callback or the _ga cookie,
    // neither of which exists here: index/ga.js skips the loader
    // off-prod and under automation, so nothing ever writes them. The
    // param must be absent rather than empty, so it can't form its own
    // bucket in GA4.
    expect(events[0].hasOpenCid).toBe(false)
  })

  /*
   * Pins the wire format through the real call site, not just
   * getOpenCid in isolation: a bare client id is numeric-looking, and
   * gtag beacons numeric-looking params as `epn.` (number), which
   * truncates the id in float64 and leaves the text custom dimension
   * empty. Seeding the `_ga` cookie exercises analytics#getGaClientId's
   * fallback, the one client-id path that works with GA unloaded.
   */
  test('sends a non-numeric open_cid when a client id is available', async ({page}) => {
    await page.context().addCookies([
      {name: '_ga', value: `GA1.1.${FAKE_CLIENT_ID}`, domain: 'localhost', path: '/'},
    ])
    await setupVirtualPathIntercept(page, REAL_MODEL, 'box.ifc')
    await page.goto(REAL_MODEL, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
    const events = await realModelOpenEvents(page)
    expect(events).toHaveLength(1)
    expect(events[0].openCid).toBe(`cid.${FAKE_CLIENT_ID}`)
    // The point of the prefix: unparseable as a number, so gtag keeps
    // it in the text slot with all its digits intact.
    expect(Number(events[0].openCid)).toBeNaN()
    expect(String(events[0].openCid)).toContain(FAKE_CLIENT_ID)
  })
})
