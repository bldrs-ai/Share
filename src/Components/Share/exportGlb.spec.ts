import {readFile} from 'node:fs/promises'
import {Page, expect, test} from '@playwright/test'
import {captureGlbLogs, waitForGlbLog} from '../../tests/e2e/glbLogs'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {waitForModelReady} from '../../tests/e2e/models'
import {
  auth0Login,
  clearOpfs,
  homepageSetup,
  setIsReturningUser,
  setupAuthenticationIntercepts,
} from '../../tests/e2e/utils'


/**
 * "Download GLB" in the Share dialog (share-140 S2, #1833).
 *
 * The acceptance test for the whole epic's user-facing claim: a Pro user
 * gets a valid standalone `.glb` out of the artifact Share already cached,
 * and the other two tiers get routed to log in / upgrade instead.
 *
 * What makes this more than the jest coverage: the bytes are real end to
 * end. The IFC is parsed, the writer packs a Bldrs container into OPFS,
 * the store hand-off (`glbArtifact`) enables the button, the premium module
 * is fetched over HTTP and imported from a `blob:` URL, and the file the
 * BROWSER saves is opened here and checked for the `glTF` magic. A unit
 * test can assert every one of those steps and still miss that the blob
 * import, the OPFS read or the download attribute doesn't work in a real
 * page.
 *
 * URL flags: `export` (the feature is off by default — FeatureFlags.js) and
 * `glbVerbose`, which is pure logging and is how the spec knows the writer
 * finished rather than racing it.
 *
 * The `pro-module` function does not run under Playwright (the build is
 * served by `http-server`), so the premium module reaches the page one of
 * two ways, and both serve the SAME built bytes rather than a stub of the
 * export result — the premium code itself stays under test. MSW's service
 * worker claims the request first and proxies to the `docs/__pro_dev__/`
 * copy the playwright build emits; the `page.route` below is the fallback
 * for a run where MSW hasn't activated yet, fulfilled from
 * `netlify/functions/_pro-modules/glbExport.js`, the file the real function
 * reads.
 */
const MODEL_PATH = '/share/v/p/index.ifc'
const FLAGS = '?feature=export,glbVerbose'
const PRO_MODULE_PATTERN = '**/.netlify/functions/pro-module*'
// Repo-root relative, like `models.ts`'s `fixturesDir`: playwright runs
// from the repo root both locally (`yarn test-flows`) and in CI.
const PRO_MODULE_FILE = 'netlify/functions/_pro-modules/glbExport.js'
const TEST_TIMEOUT_MS = 120_000
const CACHE_TIMEOUT_MS = 60_000
const GLTF_MAGIC = 'glTF'


type AppMetadata = {
  userEmail: string
  stripeCustomerId: string | null
  subscriptionStatus: 'sharePro' | 'free'
}

type WindowWithStore = Window & {
  store?: {getState: () => {setAppMetadata: (meta: AppMetadata) => void}}
}


/**
 * Put the signed-in user in a tier, the way Profile/Subscription.spec.ts
 * does — the app reads it from `app_metadata` on the JWT, which the Auth0
 * intercepts don't mint per-tier.
 *
 * @param page Playwright page
 * @param tier which tier to inject
 */
async function setSubscriptionTier(page: Page, tier: 'sharePro' | 'free') {
  await page.evaluate((subscriptionTier) => {
    const store = (window as unknown as WindowWithStore).store
    if (!store) {
      throw new Error('Zustand store not found on window — is this a test build?')
    }
    store.getState().setAppMetadata({
      userEmail: 'cypress@bldrs.ai',
      stripeCustomerId: null,
      subscriptionStatus: subscriptionTier as 'sharePro' | 'free',
    })
  }, tier)
}


/**
 * Load the fixture and wait until the GLB artifact exists in OPFS, which is
 * what enables the Export button.
 *
 * @param page Playwright page
 */
async function loadModelAndWaitForArtifact(page: Page) {
  const glbLogs = captureGlbLogs(page)
  await page.goto(`${MODEL_PATH}${FLAGS}`, {waitUntil: 'domcontentloaded'})
  await waitForModelReady(page)
  // The writer is idle-scheduled and fires well after `data-model-ready`;
  // this line is the only signal that the artifact is actually on disk.
  await waitForGlbLog(glbLogs, 'writer: wrote', CACHE_TIMEOUT_MS)
}


/**
 * @param page Playwright page
 */
async function openShareDialog(page: Page) {
  await page.getByTestId('control-button-share').click()
  await expect(page.getByTestId('export-section')).toBeVisible()
}


/**
 * Collect every request for the premium module, by either delivery route.
 *
 * Watching requests rather than counting `page.route` hits, because MSW's
 * service worker answers `/.netlify/functions/pro-module` before the route
 * handler sees it — and then fetches `/__pro_dev__/<name>.js` itself, which
 * is the request that reaches the network. Matching both shapes means this
 * counts the fetch whichever half serves it.
 *
 * @param page Playwright page
 * @return the growing list of matching URLs
 */
function watchProModuleRequests(page: Page): string[] {
  const urls: string[] = []
  page.on('request', (request) => {
    if (/pro-module|__pro_dev__/.test(request.url())) {
      urls.push(request.url())
    }
  })
  return urls
}

describeMobileAndDesktop('Share 140: Download GLB', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setupAuthenticationIntercepts(page)
    await setIsReturningUser(page.context())
    // Each test gets a fresh context (OPFS is partitioned per context), so
    // this is insurance against a run interrupted mid-write — which is
    // exactly the case an afterEach could not clean up.
    await clearOpfs(page)
  })

  test('a Pro user downloads a valid standalone .glb', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    // Stand in for the authenticated Netlify function with the very bytes it
    // would serve, for the case MSW doesn't claim the request first.
    const proModuleRequests = watchProModuleRequests(page)
    await page.route(PRO_MODULE_PATTERN, async (route) => {
      await route.fulfill({
        path: PRO_MODULE_FILE,
        contentType: 'text/javascript; charset=utf-8',
        headers: {'Cache-Control': 'private, no-store'},
      })
    })

    await loadModelAndWaitForArtifact(page)
    await setSubscriptionTier(page, 'sharePro')
    await auth0Login(page)

    await openShareDialog(page)
    const exportButton = page.getByTestId('export-glb-button')
    await expect(exportButton).toBeEnabled()
    await expect(exportButton).toHaveText('Download GLB')

    const downloadPromise = page.waitForEvent('download')
    await exportButton.click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toBe('index.glb')
    const savedPath = await download.path()
    const bytes = await readFile(savedPath)
    // The point of the feature: what lands in Downloads is a GLB, not the
    // Bldrs container (which starts with "BLDR" and no third-party viewer
    // can read).
    expect(bytes.subarray(0, GLTF_MAGIC.length).toString('ascii')).toBe(GLTF_MAGIC)
    expect(bytes.byteLength).toBeGreaterThan(0)
    // The export really did go through the gated delivery path rather than
    // through anything already in the page bundle.
    expect(proModuleRequests.length).toBeGreaterThan(0)
  })

  test('an anonymous user is asked to log in instead', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    // Nothing premium may be requested for a user we already know isn't
    // entitled — the server would refuse, and the UI shouldn't ask.
    const proModuleRequests = watchProModuleRequests(page)
    await page.route(PRO_MODULE_PATTERN, async (route) => {
      await route.fulfill({status: 401, body: 'denied'})
    })

    await loadModelAndWaitForArtifact(page)
    await openShareDialog(page)

    await page.getByTestId('export-glb-button').click()

    await expect(page.getByTestId('login-with-github')).toBeVisible()
    expect(proModuleRequests).toEqual([])
  })

  test('a signed-in free user is routed to upgrade', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    const proModuleRequests = watchProModuleRequests(page)
    await page.route(PRO_MODULE_PATTERN, async (route) => {
      await route.fulfill({status: 403, body: 'denied'})
    })

    await loadModelAndWaitForArtifact(page)
    await setSubscriptionTier(page, 'free')
    await auth0Login(page)

    await openShareDialog(page)
    // The chip is the affordance that says why the button won't export.
    await expect(page.getByTestId('export-pro-chip')).toBeVisible()

    await page.getByTestId('export-glb-button').click()

    // `/subscribe/` is an MSW stub in this build and ProfileControl's
    // `useMock` path writes it into the document rather than navigating,
    // so this is the same assertion Profile/Subscription.spec.ts makes.
    await expect(page.getByText('Mock Subscribe Page')).toBeVisible()
    expect(proModuleRequests).toEqual([])
  })
})
