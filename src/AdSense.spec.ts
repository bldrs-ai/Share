import {expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from './tests/e2e/formFactor'
import {homepageSetup} from './tests/e2e/utils'


// Regression guard: the AdSense script must NOT load. `adsbygoogle.js` serves
// Auto ads by itself (no `<ins>` slot required) whenever the AdSense dashboard
// permits it, so the tag being on the page is the same thing as ads being on
// the page — the dashboard toggle is not a reliable second gate. That is how
// ads ended up over the viewer twice; see design/new/ads.md §"Incident:
// unintended Auto ads".
//
// Watching the request (not the DOM) is deliberate: MSW fulfills
// googlesyndication with an empty 200, so no ad would ever render in a test
// even with the tag present — but `page.on('request')` still sees the attempt.
// Re-adding the `<script>` to public/index.html turns this red.
//
// Analytics (gtag) is intentionally unaffected; it lives in the index.html
// stub + src/index/ga.js and never needed this script.
//
// Both form factors, per the desktop+mobile E2E rule (CLAUDE.md): Auto ads
// chooses its formats per viewport, so an ad regression can be layout-specific.
describeMobileAndDesktop('AdSense', () => {
  test('AdSense script is not requested on page load', async ({page}) => {
    await homepageSetup(page)
    const adRequests: string[] = []
    page.on('request', (req) => {
      const url = req.url()
      if (url.includes('googlesyndication.com') || url.includes('adsbygoogle')) {
        adRequests.push(url)
      }
    })
    await page.goto('/')
    // `load` covers async <script> tags in the document, which is where the
    // AdSense tag lived.
    await page.waitForLoadState('load')
    expect(adRequests).toEqual([])
    expect(await page.locator('ins.adsbygoogle').count()).toBe(0)
  })
})
