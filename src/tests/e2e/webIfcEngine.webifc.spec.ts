import {expect, test} from '@playwright/test'
import {homepageSetup, setIsReturningUser, waitForModel} from './utils'


/**
 * Web-ifc *engine* smoke. Runs ONLY under
 * `tools/playwright.webifc.config.js`, against a build produced with
 * `USE_WEBIFC_SHIM=false` (real web-ifc) — the engine we validate for
 * side-by-side render comparison with Conway. The default config ignores
 * `*.webifc.spec.ts`, so this never runs against the Conway build.
 *
 * web-ifc 0.0.35's MT build is unshippable as-packaged (the npm package
 * ships no `web-ifc-mt.worker.js`), so the build is pinned to web-ifc's
 * single-threaded engine via `webIfcSingleThreadPlugin`
 * (tools/esbuild/plugins.js); MT is a follow-up. See
 * design/new/viewer-replacement.md §5f. The page is still served
 * cross-origin isolated — Conway's own MT wasm needs it and the MT
 * follow-up will too.
 *
 * Doubles as a runtime inspector: it forwards browser console output,
 * page errors and failed requests to the test stdout (shown by the
 * `list` reporter in CI) so a failure deep in web-ifc's wasm init is
 * legible without a local browser.
 */
const {describe} = test

describe('web-ifc engine', () => {
  test('loads index.ifc under the real (single-threaded) web-ifc engine', async ({page}) => {
    // Forward in-browser diagnostics to the test runner stdout.
    page.on('console', (msg) => console.warn(`[browser:${msg.type()}] ${msg.text()}`))
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))
    page.on('worker', (worker) => console.warn(`[worker started] ${worker.url()}`))
    page.on('requestfailed', (req) =>
      console.warn(`[requestfailed] ${req.url()} :: ${req.failure()?.errorText}`))

    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await page.goto('/share/v/p/index.ifc', {waitUntil: 'domcontentloaded'})

    // The build is pinned single-threaded (web-ifc 0.0.35 MT is
    // unshippable as-packaged — see file header), so web-ifc loads
    // regardless of isolation. We still serve isolated — Conway's own MT
    // wasm needs it and the MT follow-up will — so assert it stays healthy.
    const isolated = await page.evaluate(() => self.crossOriginIsolated)
    console.warn(`[diag] crossOriginIsolated=${isolated}`)
    expect(isolated, 'isolated serving must stay healthy for the MT follow-up').toBe(true)

    await waitForModel(page)
  })
})
