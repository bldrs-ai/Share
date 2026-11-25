import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {setupVirtualPathIntercept, waitForModelReady} from '../tests/e2e/models'
import {homepageSetup, setIsReturningUser, visitHomepageWaitForModel} from '../tests/e2e/utils'


// Not the homepage model, so its load keeps the status bar.
const GITHUB_MODEL = '/share/v/gh/bldrs-ai/test-models/main/ifc/misc/box.ifc'
// Long enough for a "Loaded …" grace line to have appeared, were there one.
const LOADED_LINE_WINDOW_MS = 1000


/**
 * Note every status-bar text the page shows from its first script on, so a
 * line that flashes up and goes during the load is still caught.
 *
 * @param page Playwright page
 */
async function recordStatusBar(page: Page) {
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    w.statusBarTexts = []
    new MutationObserver(() => {
      const bar = document.querySelector('[data-testid=snackbar]')
      const text = bar?.textContent?.trim()
      if (text && !w.statusBarTexts.includes(text)) {
        w.statusBarTexts.push(text)
      }
    }).observe(document, {childList: true, subtree: true, characterData: true})
  })
}


/**
 * @param page Playwright page
 * @return the status-bar texts seen so far
 */
async function statusBarTexts(page: Page): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await page.evaluate(() => (window as any).statusBarTexts ?? [])
}


/**
 * The homepage model (index.ifc, index.step) loads on every visit, so it
 * loads quietly: no "Loading …", no progress line and no "Loaded …" in the
 * status bar (owner, 2026-11-25; design/new/load-log-format.md). Its report
 * stays on the "i" control.
 */
describeMobileAndDesktop('Homepage model loads quietly', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await recordStatusBar(page)
  })

  test('the homepage model shows no status bar while it loads', async ({page}) => {
    await visitHomepageWaitForModel(page)
    // Past where the "Loaded …" line would have shown.
    await page.waitForTimeout(LOADED_LINE_WINDOW_MS)
    expect(await statusBarTexts(page)).toEqual([])
  })

  // So the assertion above can fail: an opened model still shows its load.
  test('a model someone opened still shows its load in the status bar', async ({page}) => {
    await setupVirtualPathIntercept(page, GITHUB_MODEL, 'box.ifc')
    await page.goto(GITHUB_MODEL, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
    await expect.poll(async () => (await statusBarTexts(page)).length).toBeGreaterThan(0)
  })
})
