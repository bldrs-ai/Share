import {expect, test} from '@playwright/test'
import {homepageSetup} from './tests/e2e/utils'


// Regression guard for AdSense site verification. If a future edit drops the
// `<script>` tag from public/index.html, AdSense activation breaks silently
// — no visible UI change, no test failure, no error logged. This test catches
// that by asserting the browser fires the script request on `/` load. The
// MSW handler in src/__mocks__/api-handlers.js fulfills the request with an
// empty 200, so no live traffic occurs, but `page.on('request')` still fires
// on attempt. See design/new/ads.md for the broader ad strategy.
test('AdSense script is requested on page load', async ({page}) => {
  await homepageSetup(page)
  const adsenseRequest = page.waitForRequest(
    (req) => req.url().includes('pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'),
    {timeout: 10_000},
  )
  await page.goto('/')
  const req = await adsenseRequest
  expect(req.url()).toContain('client=ca-pub-2372655610709687')
})
