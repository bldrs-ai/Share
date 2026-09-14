import {Page, expect} from '@playwright/test'
import {captureGlbLogs, waitForGlbLog} from './glbLogs'
import {waitForModelReady} from './models'


/**
 * Shared setup for the share-140 export specs: getting a Pro user in front of
 * a model whose GLB artifact is actually on disk, and getting the premium
 * module into the page.
 *
 * `Share/exportGlb.spec.ts` is the only caller today. It was written for two
 * — `Profile/myExports.spec.ts` went with the export history when the list
 * came off the Export tab (#1838), since an E2E for UI that nothing mounts
 * has no subject — and everything here is still shared setup rather than that
 * one spec's private helpers, so it stays put for the list's return (§4.5).
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
// Compressing the fixture is milliseconds of encoding behind a wasm module
// that has to be fetched and instantiated first — DRACO's arrives as a
// script tag and a sibling `.wasm` (`loader/glbCompress.js`).
const COMPRESS_TIMEOUT_MS = 60_000

// Byte offset of the JSON chunk's length field in a GLB: past the 12-byte
// file header. The 8 bytes after it are the chunk's own header.
const GLB_JSON_LENGTH_OFFSET = 12
const GLB_CHUNK_HEADER_BYTES = 8

const SNACKBAR_SELECTOR = '[data-testid="snackbar"]'
// Centre of a box.
const HALF = 2


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
 * Open the Save dialog's Export tab, where the export UI lives as of #1838.
 * Only reachable signed in — the toolbar Save button is gated otherwise.
 *
 * @param page Playwright page
 */
export async function openExportTab(page: Page) {
  await page.getByTestId('control-button-save').click()
  await page.getByTestId('tab-export').click()
  await expect(page.getByTestId('export-section')).toBeVisible()
}


/**
 * Clear the post-load "Loaded <model>" snackbar so a later assertion is
 * about the EXPORT's status message and not the load's. The load view owns
 * the snackbar while it is up (AlertDialogAndSnackbar.jsx), and OK ends it
 * with no animation.
 *
 * @param page Playwright page
 */
export async function dismissLoadSnackbar(page: Page) {
  const ok = page.getByTestId('LoadStatusOk')
  if (await ok.isVisible()) {
    await ok.click()
  }
  await expect(page.getByTestId('snackbar')).toBeHidden()
}


/**
 * Click a gated control (`GatedAction`, #1838).
 *
 * `force` is required, and is not papering over a flaky click: Playwright's
 * actionability check treats `aria-disabled='true'` on a role=button as
 * disabled and waits for it to become "enabled", which never happens — the
 * whole point of the pattern is a control that LOOKS disabled and still takes
 * the click. Force skips that wait; the click itself is a real one, and what
 * the test then asserts is that the help opened, which only happens if the
 * handler ran.
 *
 * @param page Playwright page
 * @param testId the gate's testid, e.g. 'gated-save'
 */
export async function clickGate(page: Page, testId: string) {
  await expect(page.getByTestId(testId)).toHaveAttribute('aria-disabled', 'true')
  await page.getByTestId(testId).click({force: true})
}


/**
 * Assert the status message is not merely present but actually on top: the
 * point at its centre must hit-test inside the snackbar. `toBeVisible` alone
 * passes for a snackbar that renders UNDER an open dialog and its backdrop,
 * which is exactly the bug #1838 fixed (`zIndex.snackbar` above `modal`) —
 * on mobile the dialog covers the whole band.
 *
 * @param page Playwright page
 */
export async function expectSnackbarOnTop(page: Page) {
  const content = page.locator(`${SNACKBAR_SELECTOR} .MuiSnackbarContent-root`)
  await expect(content).toBeVisible()
  const box = await content.boundingBox()
  if (box === null) {
    throw new Error('The snackbar content has no layout box')
  }
  const isOnTop = await page.evaluate(({x, y, selector}) => {
    const hit = document.elementFromPoint(x, y)
    return Boolean(hit && hit.closest(selector))
  }, {
    x: box.x + (box.width / HALF),
    y: box.y + (box.height / HALF),
    selector: SNACKBAR_SELECTOR,
  })
  expect(isOnTop).toBe(true)
}


/**
 * Assert nothing in the page (the open dialog included) is wider than the
 * viewport. Worth an assertion on the mobile projection specifically: the
 * Export tab's action row (centred, the button plus a Pro chip for a free
 * user) holds the widest pair of controls in the dialog, so an action that
 * stopped wrapping would push the document sideways at 390px rather than
 * fail any testid lookup (#1838).
 *
 * @param page Playwright page
 */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth)
}


/**
 * Pick a compression codec and wait for the size line to settle on the new
 * figure.
 *
 * A compressed estimate IS the compressed file, so selecting one runs the
 * encoder and the line reads "Estimating…" until it lands (#1842) — there is
 * nothing to compare against until `export-size` is back.
 *
 * @param page Playwright page
 * @param mode 'none' | 'meshopt' | 'draco'
 * @return the byte count the settled line carries
 */
export async function selectCompression(page: Page, mode: string): Promise<number> {
  // A dropdown (owner feedback on #1842): open it, pick the item, and read
  // the choice back off the closed control.
  await page.getByTestId('export-compression').click()
  await page.getByTestId(`export-compression-${mode}`).click()
  await expect(page.getByTestId('export-compression')).toContainText(compressionLabel(mode))
  const sizeLine = page.getByTestId('export-size')
  await expect(sizeLine).toBeVisible({timeout: COMPRESS_TIMEOUT_MS})
  return Number(await sizeLine.getAttribute('data-bytes'))
}


/**
 * @param mode 'none' | 'meshopt' | 'draco'
 * @return what the dropdown calls it — `glbCompression.js`'s COMPRESSION_LABELS
 */
function compressionLabel(mode: string): string {
  return mode.charAt(0).toUpperCase() + mode.slice(1)
}


/**
 * The glTF JSON chunk of a downloaded `.glb`, so a spec can read what the
 * file says about itself — which extensions it uses, above all.
 *
 * @param bytes the saved file
 * @return the parsed JSON chunk
 */
export function glbJsonChunk(bytes: Buffer): {extensionsUsed?: string[]; extensionsRequired?: string[]} {
  const jsonByteLength = bytes.readUInt32LE(GLB_JSON_LENGTH_OFFSET)
  const start = GLB_JSON_LENGTH_OFFSET + GLB_CHUNK_HEADER_BYTES
  // The chunk is space-padded to 4 bytes, which `JSON.parse` need not accept.
  return JSON.parse(bytes.subarray(start, start + jsonByteLength).toString('utf8').replace(/\s+$/, ''))
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
