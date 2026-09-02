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
 * @return Array of {name, contentId, hasOpenCid, openCid, localHour} per real_model_open event
 */
async function realModelOpenEvents(
  page: Page,
): Promise<{name: string, contentId: string, hasOpenCid: boolean, openCid?: unknown, localHour?: unknown}[]> {
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
        localHour: entry[2]?.local_hour,
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
    await visitHomepageWaitForModel(page, {pauseRenderer: true})
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

  /*
   * local_hour exists because GA4's own `hour` dimension is in the
   * property's timezone, which says nothing about when a user in Milan
   * or São Paulo works.
   *
   * Same typing trap as open_cid, and the reason for the `h.` prefix:
   * gtag beacons anything numeric-looking as `epn.`, which a text
   * custom dimension will not populate from. Zero-padding alone does
   * not help — Number('08') is 8 — so the NaN assertion below is the
   * one that actually pins this.
   */
  test('sends local_hour as a non-numeric string in the browser timezone', async ({page}) => {
    await setupVirtualPathIntercept(page, REAL_MODEL, 'box.ifc')
    await page.goto(REAL_MODEL, {waitUntil: 'domcontentloaded'})
    // Read before the model loads, and accept the next hour too: a run that
    // straddles a clock boundary would otherwise fail looking like a product
    // bug. Comparing against the browser's clock at all is the point — it is
    // what distinguishes this from GA4's property-timezone `hour`.
    const hourAtStart = await page.evaluate(() => new Date().getHours())
    await waitForModelReady(page)
    const events = await realModelOpenEvents(page)
    expect(events).toHaveLength(1)
    expect(typeof events[0].localHour).toBe('string')
    expect(Number(events[0].localHour)).toBeNaN()
    const HOURS_PER_DAY = 24
    const HOUR_DIGITS = 2
    const accepted = [hourAtStart, (hourAtStart + 1) % HOURS_PER_DAY]
      .map((h) => `h.${String(h).padStart(HOUR_DIGITS, '0')}`)
    expect(accepted).toContain(events[0].localHour)
  })

  /*
   * The user property has to reach config's own events — page_view,
   * session_start, first_visit — since those are what make landing page and
   * new-vs-returning queryable per user. Carrying it IN the config call is
   * what guarantees that; a `set` queued beforehand would depend on
   * queue-drain ordering gtag does not document. With the loader blocked,
   * inspecting the queued config call is the only way to see it.
   */
  test('carries open_cid as a user property on the gtag config call', async ({page}) => {
    await page.context().addCookies([
      {name: '_ga', value: `GA1.1.${FAKE_CLIENT_ID}`, domain: 'localhost', path: '/'},
    ])
    await setupVirtualPathIntercept(page, REAL_MODEL, 'box.ifc')
    await page.goto(REAL_MODEL, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
    const config = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dataLayer: any[] = (window as any).dataLayer || []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entry = dataLayer.find((e: any) => e?.[0] === 'config')
      return entry ? {params: entry[2]} : null
    })
    expect(config).not.toBeNull()
    expect(config?.params?.user_properties).toEqual({open_cid: `cid.${FAKE_CLIENT_ID}`})
    // the same typing rule the event param follows
    expect(Number(config?.params?.user_properties?.open_cid)).toBeNaN()
  })

  // The stub duplicates analytics#isAllowed rather than importing it, so the
  // duplicate needs its own coverage — a consent gate that fails open is
  // worse than one that never existed.
  test('omits the user property when analytics consent is withheld', async ({page}) => {
    await page.context().addCookies([
      {name: '_ga', value: `GA1.1.${FAKE_CLIENT_ID}`, domain: 'localhost', path: '/'},
      {name: 'isAnalyticsAllowed', value: 'false', domain: 'localhost', path: '/'},
    ])
    await setupVirtualPathIntercept(page, REAL_MODEL, 'box.ifc')
    await page.goto(REAL_MODEL, {waitUntil: 'domcontentloaded'})
    const config = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dataLayer: any[] = (window as any).dataLayer || []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entry = dataLayer.find((e: any) => e?.[0] === 'config')
      return entry ? {params: entry[2]} : null
    })
    expect(config?.params?.user_properties).toBeUndefined()
  })
})
