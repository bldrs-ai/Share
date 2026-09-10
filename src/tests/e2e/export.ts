import {Page, expect} from '@playwright/test'
import {captureGlbLogs, waitForGlbLog} from './glbLogs'
import {waitForModelReady} from './models'


/**
 * Shared setup for the share-140 export specs (`Share/exportGlb.spec.ts`,
 * `Profile/myExports.spec.ts`): getting a Pro user in front of a model whose
 * GLB artifact is actually on disk, and getting the premium module into the
 * page.
 *
 * Design: design/new/glb-export-premium.md §4.4, §4.5.
 */


export const EXPORT_MODEL_PATH = '/share/v/p/index.ifc'

// `export` is off by default (FeatureFlags.js). `glbVerbose` is pure
// logging, and is how a spec knows the artifact writer finished rather than
// racing it.
export const EXPORT_FLAGS = '?feature=export,glbVerbose'

export const PRO_MODULE_PATTERN = '**/.netlify/functions/pro-module*'

// Repo-root relative, like `models.ts`'s `fixturesDir`: playwright runs from
// the repo root both locally (`yarn test-flows`) and in CI.
export const PRO_MODULE_FILE = 'netlify/functions/_pro-modules/glbExport.js'

export const GLTF_MAGIC = 'glTF'
export const EXPORT_TEST_TIMEOUT_MS = 120_000

const CACHE_TIMEOUT_MS = 60_000


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
export async function setSubscriptionTier(page: Page, tier: 'sharePro' | 'free') {
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
export async function loadModelAndWaitForArtifact(page: Page) {
  const glbLogs = captureGlbLogs(page)
  await page.goto(`${EXPORT_MODEL_PATH}${EXPORT_FLAGS}`, {waitUntil: 'domcontentloaded'})
  await waitForModelReady(page)
  // The writer is idle-scheduled and fires well after `data-model-ready`;
  // this line is the only signal that the artifact is actually on disk.
  await waitForGlbLog(glbLogs, 'writer: wrote', CACHE_TIMEOUT_MS)
}


/**
 * @param page Playwright page
 */
export async function openShareDialog(page: Page) {
  await page.getByTestId('control-button-share').click()
  await expect(page.getByTestId('export-section')).toBeVisible()
}


/**
 * Stand in for the authenticated `pro-module` Netlify Function with the very
 * bytes it would serve.
 *
 * The function does not run under Playwright (the build is served by
 * `http-server`), so the premium module reaches the page one of two ways, and
 * both serve the SAME built bytes rather than a stub of the export result —
 * the premium code itself stays under test. MSW's service worker claims the
 * request first and proxies to the `docs/__pro_dev__/` copy the playwright
 * build emits; this route is the fallback for a run where MSW hasn't
 * activated yet, fulfilled from the file the real function reads.
 *
 * @param page Playwright page
 */
export async function routeProModule(page: Page) {
  await page.route(PRO_MODULE_PATTERN, async (route) => {
    await route.fulfill({
      path: PRO_MODULE_FILE,
      contentType: 'text/javascript; charset=utf-8',
      headers: {'Cache-Control': 'private, no-store'},
    })
  })
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
export function watchProModuleRequests(page: Page): string[] {
  const urls: string[] = []
  page.on('request', (request) => {
    if (/pro-module|__pro_dev__/.test(request.url())) {
      urls.push(request.url())
    }
  })
  return urls
}
