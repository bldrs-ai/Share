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
 * @return Array of {name, contentId} for each real_model_open event
 */
async function realModelOpenEvents(page: Page): Promise<{name: string, contentId: string}[]> {
  return await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dataLayer: any[] = (window as any).dataLayer || []
    return dataLayer
      .filter((entry) => entry?.[0] === 'event' && entry?.[1] === 'real_model_open')
      .map((entry) => ({name: String(entry[1]), contentId: String(entry[2]?.content_id ?? '')}))
  })
}


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
  })
})
