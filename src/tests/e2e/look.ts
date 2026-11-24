import {Page} from '@playwright/test'


/**
 * Turn the §6e render look on for this page's loads. The Playwright build has
 * it off unless a spec opts in (`LOOK_IS_OPT_IN`, tools/esbuild/
 * vars.playwright.js; the check is src/viewer/lookMode.js), so call this
 * before the first `goto` in a spec that is about the look: its AO, its
 * panels, its hover cache.
 *
 * @param page
 */
export async function withLook(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as {__bldrsLookOptIn: boolean}).__bldrsLookOptIn = true
  })
}
