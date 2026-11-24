import {expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {homepageSetup, setIsReturningUser} from '../tests/e2e/utils'


// Shape of a campaign landing URL. `gclid` stays a realistic landing param,
// like the `utm_*` pair; the unknown `foo` proves the whole query survives
// rather than an allowlist of params we happened to name. GA attributes the
// visit to its campaign source only if the query reaches gtag.js intact.
const AD_CLICK_SEARCH = '?gclid=TEST123&utm_source=google&utm_medium=cpc&foo=bar'

// The chain rewrites the URL three times and each hop waits on a React
// effect, so give the walk to the model URL room on a loaded CI runner.
const FORWARD_TIMEOUT_MS = 30_000


describeMobileAndDesktop('Landing query string', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  // Regression guard for the landing-query attribution bug (#1784, found
  // through Ads attribution; the fix carries every param, not just gclid). Landing on `/`
  // walks `/` -> `/share` -> `/share/v/p` -> `/share/v/p/index.ifc`, each
  // hop a `navigate` out of a React effect, and any one of them calling
  // `navigate(dest)` bare drops `location.search`.
  //
  // Assert on `window.location`, not react-router's location: gtag/js
  // loads asynchronously and reads the *global* live at send time, so the
  // global is both what actually broke and the only thing that proves the
  // fix. A router-level assertion can pass while GA4 still sees no gclid.
  test('survives the homepage forward chain', async ({page}) => {
    await page.goto(`/${AD_CLICK_SEARCH}`, {waitUntil: 'domcontentloaded'})

    await page.waitForURL((url) => url.pathname.endsWith('/share/v/p/index.ifc'), {
      timeout: FORWARD_TIMEOUT_MS,
    })

    const search = await page.evaluate(() => window.location.search)
    const params = new URLSearchParams(search)
    expect(params.get('gclid')).toBe('TEST123')
    expect(params.get('utm_source')).toBe('google')
    expect(params.get('utm_medium')).toBe('cpc')
    expect(params.get('foo')).toBe('bar')
  })
})
