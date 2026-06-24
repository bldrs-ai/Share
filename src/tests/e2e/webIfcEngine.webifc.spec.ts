import {expect, test} from '@playwright/test'
import {homepageSetup, setIsReturningUser, waitForModel} from './utils'


/**
 * Web-ifc *engine* smoke. Runs ONLY under
 * `tools/playwright.webifc.config.js`, against a build produced with
 * `USE_WEBIFC_SHIM=false` (real web-ifc) and served cross-origin
 * isolated so web-ifc selects its multi-threaded wasm — the engine we
 * validate for side-by-side comparison with Conway. The default config
 * ignores `*.webifc.spec.ts`, so this never runs against the Conway
 * build (where the assertions below would be meaningless).
 *
 * Doubles as a runtime inspector: it forwards browser console output,
 * page errors and failed requests to the test stdout (shown by the
 * `list` reporter in CI) so a failure deep in web-ifc's wasm / pthread
 * worker init is legible without a local browser.
 */
const {describe} = test

describe('web-ifc engine', () => {
  test('loads index.ifc under the multi-threaded web-ifc engine', async ({page}) => {
    // Forward in-browser diagnostics to the test runner stdout.
    page.on('console', (msg) => console.warn(`[browser:${msg.type()}] ${msg.text()}`))
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))
    page.on('worker', (worker) => console.warn(`[worker started] ${worker.url()}`))
    page.on('requestfailed', (req) =>
      console.warn(`[requestfailed] ${req.url()} :: ${req.failure()?.errorText}`))

    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await page.goto('/share/v/p/index.ifc', {waitUntil: 'domcontentloaded'})

    // Confirm the serve actually isolated the page. If it didn't,
    // web-ifc silently falls back to its single-threaded wasm and this
    // smoke would pass WITHOUT exercising the MT path we care about — so
    // assert isolation up front to keep a green result honest.
    const isolated = await page.evaluate(() => self.crossOriginIsolated)
    console.warn(`[diag] crossOriginIsolated=${isolated}`)
    expect(isolated, 'page must be cross-origin isolated so web-ifc selects its MT wasm').toBe(true)

    await waitForModel(page)
  })
})
