import {Page, expect} from '@playwright/test'
import {estimateKey, settledEstimateBytes} from './exportEstimate'
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
// Dismissing the load snackbar is a courtesy click; it may have closed itself.
const SNACKBAR_CLICK_TIMEOUT_MS = 5_000

// Byte offset of the JSON chunk's length field in a GLB: past the 12-byte
// file header. The 8 bytes after it are the chunk's own header.
const GLB_JSON_LENGTH_OFFSET = 12
const GLB_CHUNK_HEADER_BYTES = 8

// `glbCompression.js`'s COMPRESSION_MODES, in the same order — which is also
// the order the background sweep measures them in (`export/codecSizes.js`).
const CODEC_MODES = ['none', 'meshopt', 'draco']

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
 * @param extraFlags more `?feature=` names, comma-joined onto
 *   `EXPORT_FLAGS`. With none, the artifact is the default one, which is
 *   COLLAPSED since `glbCollapse` went default-on (#1871); pass
 *   `disableGlbCollapse` to export the un-collapsed layout instead
 */
export async function loadModelAndWaitForArtifact(page: Page, extraFlags = '') {
  const glbLogs = captureGlbLogs(page)
  const flags = extraFlags ? `${EXPORT_FLAGS},${extraFlags}` : EXPORT_FLAGS
  await page.goto(`${EXPORT_MODEL_PATH}${flags}`, {waitUntil: 'domcontentloaded'})
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
    // The snackbar can close itself between the check and the click, and a
    // detached button is retried until the test times out (live run
    // 37740697840). The assertion below is the one that matters.
    await ok.click({timeout: SNACKBAR_CLICK_TIMEOUT_MS}).catch(() => undefined)
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
 * But `force` skips the OTHER actionability checks too, and two of them
 * matter here: that the element is stable, and that it receives the click at
 * its centre. The gate sits in a dialog whose content is still settling (it
 * was measured 16px lower a few frames earlier, and below the fold), and
 * `toBeVisible` passes while it moves; a forced click then lands where the
 * control was, and the help never opens. Idle that window is a few
 * milliseconds, which is why it only failed (the mobile "free user" test,
 * `gated-help` not found) when the machine was busy: reproduced at 4 to 6
 * workers on 4 cores, not at 3. So wait for those two checks ourselves.
 *
 * @param page Playwright page
 * @param testId the gate's testid, e.g. 'gated-save'
 */
export async function clickGate(page: Page, testId: string) {
  const gate = page.getByTestId(testId)
  await expect(gate).toHaveAttribute('aria-disabled', 'true')
  await expect.poll(() => gate.evaluate((el) => new Promise<boolean>((resolve) => {
    // Where the click will land: Playwright scrolls the target into view first,
    // and the gate can sit below the dialog's fold.
    el.scrollIntoView({block: 'center'})
    const before = el.getBoundingClientRect()
    // Two frames on: has it moved, and does a click at its centre reach it?
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const after = el.getBoundingClientRect()
      const isStill = before.x === after.x && before.y === after.y &&
        before.width === after.width && before.height === after.height
      const hit = document.elementFromPoint(after.x + (after.width / 2), after.y + (after.height / 2))
      resolve(isStill && hit !== null && el.contains(hit))
    }))
  }))).toBe(true)
  await gate.click({force: true})
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
 * Pick a compression codec and wait for the size line to settle on the
 * figure for it.
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
  return await waitForEstimate(page)
}


/**
 * Put the Portable toggle in the state a test means to exercise.
 *
 * Portable is ON by default (#1831), and a spec that silently rides the
 * default tests whichever variant the default happens to be that month — the
 * batched-native assertions below (instance tables, Draco method bytes,
 * `EXT_mesh_gpu_instancing`) all went vacuous-or-red the day it flipped. So
 * every export spec states the variant it is about, and this is how.
 *
 * Call it right after `openExportTab` and before `waitForCodecSizing`: the
 * background sweep measures AT the Portable setting and restarts when it
 * changes, and a codec the test then pins with `selectCompression` is never
 * overridden by the restarted sweep. It does not wait for the size line —
 * Portable re-estimates through the whole-file path even at codec `none`
 * (#1843) — so a caller that wants the figure calls `waitForEstimate`.
 *
 * @param page Playwright page
 * @param isPortable the state to leave the toggle in
 */
export async function setPortable(page: Page, isPortable: boolean) {
  const toggle = page.getByTestId('export-portable').locator('input')
  if (await toggle.isChecked() !== isPortable) {
    await toggle.click()
  }
  await expect(toggle).toBeChecked({checked: isPortable})
}


/**
 * Flip "Include Bldrs metadata" and wait for the size line to settle on the
 * figure for it.
 *
 * No re-estimate happens here — one run produces both figures and the toggle
 * picks between them (#1842) — but the wait goes through the same key, so a
 * fixture whose metadata happens to weigh nothing reports a wrong FIGURE
 * rather than hanging on "the number never changed".
 *
 * @param page Playwright page
 * @return the byte count the settled line carries
 */
export async function toggleMetadata(page: Page): Promise<number> {
  await page.getByTestId('export-include-metadata').locator('input').click()
  return await waitForEstimate(page)
}


/**
 * Wait until the background codec sweep has a figure for every codec (#1850).
 *
 * Anything that touches the Compression control has to come after this. The
 * sweep selects the smallest codec the moment its last figure lands, so a
 * click racing that selection reads a dropdown that moved under it — and a
 * click that merely re-picks what was already showing has to register as a
 * choice for the pin to hold, which is what the MenuItem's own `onClick` in
 * `ExportSection.jsx` is for.
 *
 * What this DOES guarantee is only the figures. `data-codec-sizes` completes
 * in the same render commit that first makes `codecToSelect` return a new
 * codec, and `setCompression` lands in the effect after it, so the selection
 * is one commit behind this wait. In practice every caller then does
 * something Playwright retries against a live DOM — `waitForCodecSizes` opens
 * the menu, `selectCompression` waits on the size line's estimate key — and
 * the commit is long gone by the time anything is read. A caller that wants
 * the selection itself should assert on the closed control, as
 * `exportGlb.spec.ts` does.
 *
 * Fails fast rather than timing out if the sweep is PARKED — over the ~50 MB
 * threshold so it never auto-started, or stopped part-way — because in that
 * state the attribute never completes on its own and the bare
 * `toHaveAttribute` diff ("expected `none,meshopt,draco`, got ``") does not
 * say why. No spec is in that state today; all six callers load `index.ifc`,
 * which is far under the threshold. The first spec pointed at a large fixture
 * will be, and it should read "click Calculate sizes first", not wait a
 * minute for nothing.
 *
 * @param page Playwright page
 */
export async function waitForCodecSizing(page: Page) {
  const section = page.getByTestId('export-section')
  const parked = page.getByTestId('export-codec-sizes-start')
  const complete = CODEC_MODES.join(',')
  await page.waitForFunction(
    ({selector, expected}) => Boolean(
      document.querySelector(`[data-testid="${selector}"]`) ||
      document.querySelector('[data-testid="export-section"]')?.getAttribute('data-codec-sizes') === expected),
    {selector: 'export-codec-sizes-start', expected: complete},
    {timeout: COMPRESS_TIMEOUT_MS})
  await expect(
    parked,
    'the codec sweep is parked — the artifact is over the auto-measure threshold, or a Stop ' +
    'left it part-way. Click "Calculate sizes" (export-codec-sizes-start) before waiting on it.',
  ).toHaveCount(0)
  await expect(section).toHaveAttribute('data-codec-sizes', complete)
}


/**
 * Wait until the background sweep has put a real byte count on every codec's
 * dropdown option, and read them off (#1850).
 *
 * The figures live on the OPTIONS, not on the closed control, so the menu has
 * to be open to see them — which is also where a user compares them. MUI
 * keeps the menu mounted while it is open and React updates it in place, so
 * one open is enough to watch all three land.
 *
 * @param page Playwright page
 * @return `{none, meshopt, draco}` in bytes
 */
export async function waitForCodecSizes(page: Page): Promise<Record<string, number>> {
  await waitForCodecSizing(page)
  await page.getByTestId('export-compression').click()
  const options = CODEC_MODES.map((mode) => page.getByTestId(`export-compression-${mode}`))
  const sizes: Record<string, number> = {}
  for (let i = 0; i < CODEC_MODES.length; i++) {
    sizes[CODEC_MODES[i]] = Number(await options[i].getAttribute('data-bytes'))
  }
  // Escape closes the Select's menu without changing the selection, and the
  // Save dialog around it stays open (MUI's menu consumes the key).
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('export-compression-none')).toHaveCount(0)
  return sizes
}


/**
 * The codec with the smallest figure, which is what the panel should have
 * selected on its own.
 *
 * @param sizes from `waitForCodecSizes`
 * @return the mode
 */
export function smallestCodecIn(sizes: Record<string, number>): string {
  return CODEC_MODES.reduce((best, mode) => (sizes[mode] < sizes[best] ? mode : best), CODEC_MODES[0])
}


/**
 * Pick a Quality rung and wait for the size line to settle on the figure for
 * it (#1848).
 *
 * Two rungs are two different files — different encoder settings, and for
 * the coarse rungs different POSITION bits — so the estimate re-runs and the
 * line goes through "Estimating…" exactly as it does for a codec.
 *
 * Under MESHOPT that is true of the settings but not of the bytes: the codec
 * has one coarser setting and Balanced already spends it, so Reduced
 * re-encodes to Balanced's file (`exportQuality.js#isDracoOnlyRung`). A spec
 * asserting a rung MOVED the figure has to pick Draco.
 *
 * @param page Playwright page
 * @param level 'best' | 'balanced' | 'smallest'
 * @return the byte count the settled line carries
 */
export async function selectQuality(page: Page, level: string): Promise<number> {
  await page.getByTestId('export-quality').click()
  await page.getByTestId(`export-quality-${level}`).click()
  return await waitForEstimate(page)
}


/**
 * Wait for the size line to settle on the figure for the selection the
 * controls now hold, and return it.
 *
 * Keyed on WHICH selection the displayed figure describes, never on the
 * figure itself: see `exportEstimate.ts` for the two failure modes that
 * closes. The expected key is read back off the controls rather than passed
 * in, so a caller can flip one axis without knowing the other three.
 *
 * @param page Playwright page
 * @return the byte count the settled line carries
 */
export async function waitForEstimate(page: Page): Promise<number> {
  const expected = await currentEstimateKey(page)
  const sizeLine = page.getByTestId('export-size')
  await expect
    .poll(async () => {
      if (await sizeLine.count() === 0) {
        return null
      }
      return settledEstimateBytes(
        await sizeLine.getAttribute('data-estimate-key'),
        await sizeLine.getAttribute('data-bytes'),
        expected)
    }, {timeout: COMPRESS_TIMEOUT_MS})
    .not.toBeNull()
  // The poll reports only pass/fail, so read the figure back off the line it
  // just accepted. Nothing is clicking in between, so the key still matches.
  return Number(await sizeLine.getAttribute('data-bytes'))
}


/**
 * The key the size line will carry once it has caught up with the controls.
 *
 * Read off the controls themselves — the dropdown's hidden native input
 * carries the raw mode, not the label — because they update with the click,
 * while the line lags by an estimate.
 *
 * @param page Playwright page
 * @return `estimateKey` for the selection now showing
 */
async function currentEstimateKey(page: Page): Promise<string> {
  const mode = await page.getByTestId('export-compression').locator('input').inputValue()
  const quality = await page.getByTestId('export-quality').locator('input').inputValue()
  const isPortable = await page.getByTestId('export-portable').locator('input').isChecked()
  const isMetadataIncluded = await page.getByTestId('export-include-metadata').locator('input').isChecked()
  // Absent where `CompressionStream` is (Safari before 16.4) — the row is not
  // rendered at all there, and `count()` rather than `isChecked()` is what
  // tells the two apart without failing the lookup.
  const gzip = page.getByTestId('export-gzip').locator('input')
  const isGzipped = await gzip.count() > 0 && await gzip.isChecked()
  return estimateKey(mode, isPortable, isMetadataIncluded, quality, isGzipped)
}


/**
 * Flip "Compress download" and wait for the size line to settle on the figure
 * for it (#1854).
 *
 * Gzip re-estimates at every codec, `none` included: it is the one control
 * with no header shortcut, so the file has to be read and compressed before
 * there is a figure. What comes back is the `.glb.gz` byte count, which is
 * what the browser will save.
 *
 * @param page Playwright page
 * @return the byte count the settled line carries
 */
export async function toggleGzip(page: Page): Promise<number> {
  await page.getByTestId('export-gzip').locator('input').click()
  return await waitForEstimate(page)
}


/**
 * Bring a saved `.glb` back in through the Open dialog's file chooser, the way
 * a user would, and wait for it to load.
 *
 * @param page Playwright page
 * @param path the file on disk
 */
export async function reopenLocalGlb(page: Page, path: string) {
  await openLocalFile(page, path, /\/share\/v\/new\/.+\.glb/)
}


/**
 * Open a file from disk through the Open dialog's Local tab — Browse, then
 * the file chooser — and wait until it has loaded. What {@link reopenLocalGlb}
 * does for a downloaded `.glb`, for any format the loader takes.
 *
 * @param page Playwright page
 * @param path the file on disk
 * @param urlPattern what the model URL becomes once the upload has routed
 */
export async function openLocalFile(page: Page, path: string, urlPattern: RegExp) {
  await page.getByTestId('control-button-open').click()
  // The dialog opens on whichever tab it last showed (Google, for a signed-in
  // user); Browse lives on Local.
  await page.getByRole('tab', {name: 'Local'}).click()
  // Bounded, and not retried. In CI the chooser event has failed to arrive
  // after this click (#1872, #1890, shard 2), and an unbounded `waitForEvent`
  // then sat on the whole test budget — 4 and 8 minutes — before failing,
  // which pushed the shard past its 15-minute job limit. The miss we could
  // reproduce is the app's, not the click's: the loader detached its file
  // input in the same turn it clicked it, so a GC before Playwright resolved
  // the chooser's node dropped the event — every time, with a GC forced
  // after the click (`utils/loader.js#holdUntilPicked`, pinned by
  // `Open/browseFileChooser.spec.ts`). Were it to miss again anyway, a second
  // click is no remedy: Browse closes the dialog, so there is no button left
  // to click, and the retry this replaced sat out the test budget waiting for
  // one. Fail in 15 s instead.
  const browse = page.getByTestId('button_open_file')
  await expect(browse).toBeVisible()
  const CHOOSER_WAIT_MS = 15_000
  const waiting = page.waitForEvent('filechooser', {timeout: CHOOSER_WAIT_MS})
  await browse.click()
  const chooser = await waiting
  await chooser.setFiles(path)
  await expect(page).toHaveURL(urlPattern, {timeout: EXPORT_TEST_TIMEOUT_MS})
  await expect(page.getByTestId('LoadStatusOk')).toBeVisible({timeout: EXPORT_TEST_TIMEOUT_MS})
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
export function glbJsonChunk(bytes: Buffer): {
  extensionsUsed?: string[]
  extensionsRequired?: string[]
  nodes?: Array<{name?: string; mesh?: number; extras?: Record<string, unknown>}>
  meshes?: Array<{primitives: Array<{attributes: Record<string, number>}>}>
  accessors?: Array<{bufferView?: number; componentType: number; type: string}>
  bufferViews?: Array<{byteOffset?: number; byteLength: number; byteStride?: number}>
  extensions?: Record<string, {bufferView?: number}>
} {
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
 * Take the DRACO encoder away, so picking Draco exercises the fallback: the
 * estimate and the export both come back as the file already is, at the size
 * the panel then quotes (#1842).
 *
 * Done by planting the global rather than by blocking the script that defines
 * it (`loader/glbCompress.js#loadDracoEncoder` injects
 * `/static/js/draco/draco_encoder.js` only when the global is missing, then
 * calls it). A `page.route` abort does not reach a request MSW's service
 * worker has already claimed — see `routeProModule` — and a codec that
 * silently succeeded would make this test assert the opposite of its name.
 * Same stand-in the jest suite uses (`export/glbCompression.test.js`).
 *
 * Must be in place before the page loads, which is what `addInitScript` gives.
 *
 * @param page Playwright page
 */
export async function disableDracoEncoder(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as {DracoEncoderModule: () => Promise<never>}).DracoEncoderModule =
      () => Promise.reject(new Error('draco_encoder.wasm unavailable'))
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


/** Which elements a double-click may aim at. */
export type ElementKind = 'collapsed' | 'instanced' | 'any'


/** Whose geometry: the root product's own, a child occurrence's, or either. */
export type PlacementLevel = 'root' | 'child' | 'any'


/**
 * Double-click an element in the scene and wait for it to be selected.
 *
 * Aims at a COLLAPSED element for `'collapsed'` (one whose batch geometry id
 * is a synthesised range — `batchedGeometryRanges.js#BATCHED_GEOMETRY_
 * RANGE_IDS`), at one that is NOT for `'instanced'`, by projecting its bounds'
 * centre to the canvas. Candidates are tried in turn because the one in front
 * at that pixel may be a different element; the assertion is that SOME
 * element of that kind, clicked, selects itself. Broken picking selects none
 * of them.
 *
 * @param page Playwright page
 * @param kind which elements to aim at
 * @param level 'root' aims only at the root product's own geometry (empty
 *   occurrence path), 'child' only at a child occurrence's
 * @param owner aim only at placements whose parent (the geometry's owner)
 *   is this id, e.g. one part of a multi-root file; any when omitted
 * @return the parent expressID that got selected
 */
export async function doubleClickSelectsAnElement(
  page: Page, kind: ElementKind, level: PlacementLevel = 'any', owner: number | null = null): Promise<number> {
  const candidates: Array<{parent: number; x: number; y: number}> = await page.evaluate(({aimAt, level: aimLevel, onlyParent}) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const w = window as any
    const state = (w.store ?? w.useStore).getState()
    const camera = state.viewer.context.getCamera()
    const canvas = document.querySelector('canvas') as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    const out: Array<{parent: number; x: number; y: number}> = []
    const visit = (mesh: any) => {
      if (!mesh?.isBatchedMesh || !mesh.instanceParents) {
        return
      }
      mesh.updateMatrixWorld(true)
      mesh.computeBoundingBox()
      const Box3 = mesh.boundingBox.constructor
      const Matrix4 = mesh.matrixWorld.constructor
      for (let batchId = 0; batchId < mesh.instanceParents.length; batchId++) {
        const geometryId = mesh.getGeometryIdAt(batchId)
        const isRange = Boolean(mesh.bldrsGeometryRangeIds?.has(geometryId))
        if ((aimAt === 'collapsed' && !isRange) || (aimAt === 'instanced' && isRange)) {
          continue
        }
        // The root product's own geometry has an empty occurrence path; a
        // child occurrence's does not.
        const pathLength = mesh.instanceOccurrencePaths?.[batchId]?.length
        if ((aimLevel === 'root' && pathLength !== 0) || (aimLevel === 'child' && !(pathLength > 0))) {
          continue
        }
        if (onlyParent !== null && mesh.instanceParents[batchId] !== onlyParent) {
          continue
        }
        const box = new Box3()
        const matrix = new Matrix4()
        mesh.getBoundingBoxAt(geometryId, box)
        mesh.getMatrixAt(batchId, matrix)
        const centre = box.applyMatrix4(matrix.premultiply(mesh.matrixWorld))
          .getCenter(mesh.boundingBox.min.clone()).project(camera)
        // Inside the viewport, off its very edge (normalised device coords).
        const ON_SCREEN = 0.95
        if (Math.abs(centre.x) < ON_SCREEN && Math.abs(centre.y) < ON_SCREEN) {
          out.push({
            parent: mesh.instanceParents[batchId],
            x: rect.left + (((centre.x + 1) / 2) * rect.width),
            y: rect.top + (((1 - centre.y) / 2) * rect.height),
          })
        }
      }
    }
    const model = state.model
    if (model?.traverse) {
      model.traverse(visit)
    } else {
      visit(model)
    }
    return out
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }, {aimAt: kind, level, onlyParent: owner})
  expect(candidates.length, 'there must be an element of the kind under test on screen')
    .toBeGreaterThan(0)

  const MAX_TRIES = 8
  for (const {parent, x, y} of candidates.slice(0, MAX_TRIES)) {
    await page.mouse.dblclick(x, y)
    const selected = await page.waitForFunction(({id, isChild}) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const state = ((window as any).store ?? (window as any).useStore).getState()
      // A child occurrence's pick selects its tree row, not the geometry's owner.
      return isChild ? (state.selectedInstanceIds ?? []).length > 0 :
        (state.selectedElements ?? []).includes(`${id}`)
    }, {id: parent, isChild: level === 'child'}, {timeout: 3000}).then(() => true, () => false)
    if (selected) {
      return parent
    }
  }
  throw new Error('double-click selected none of the elements it was aimed at')
}


/**
 * Double-click an instance of a MERGED mesh (the non-batched layout: one
 * `Mesh` whose `instanceMap` says which triangles belong to which placement)
 * and wait for it to be selected. What {@link doubleClickSelectsAnElement}
 * does for the batched layout, whose candidates come from `BatchedMesh`
 * tables a merged model does not have.
 *
 * Aims at the first triangle's centroid of instances spread across the
 * model, because the one in front at a pixel may be another instance's; some
 * click selecting itself is the assertion.
 *
 * @param page Playwright page
 * @return the parent expressID that got selected
 */
export async function doubleClickSelectsAMergedInstance(page: Page): Promise<number> {
  const candidates: Array<{parent: number; x: number; y: number}> = await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const w = window as any
    const state = (w.store ?? w.useStore).getState()
    const camera = state.viewer.context.getCamera()
    const canvas = document.querySelector('canvas') as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    const out: Array<{parent: number; x: number; y: number}> = []
    const MAX_PER_MESH = 24
    const visit = (mesh: any) => {
      const map = mesh?.isMesh && !mesh.isBatchedMesh ? mesh.instanceMap : null
      if (!map || !mesh.geometry?.index) {
        return
      }
      mesh.updateMatrixWorld(true)
      const position = mesh.geometry.attributes.position
      const index = mesh.geometry.index
      const Vector3 = camera.position.constructor
      const step = Math.max(1, Math.floor(map.instanceCount / MAX_PER_MESH))
      for (let instanceId = 0; instanceId < map.instanceCount; instanceId += step) {
        const triangle = map.instanceIdToTriangleIndices.get(instanceId)?.[0]
        if (triangle === undefined) {
          continue
        }
        const centre = new Vector3()
        for (let corner = 0; corner < 3; corner++) {
          centre.add(new Vector3().fromBufferAttribute(position, index.getX((triangle * 3) + corner)))
        }
        centre.divideScalar(3).applyMatrix4(mesh.matrixWorld).project(camera)
        const ON_SCREEN = 0.95
        if (Math.abs(centre.x) < ON_SCREEN && Math.abs(centre.y) < ON_SCREEN) {
          out.push({
            parent: map.getParentExpressIdByInstance(instanceId),
            x: rect.left + (((centre.x + 1) / 2) * rect.width),
            y: rect.top + (((1 - centre.y) / 2) * rect.height),
          })
        }
      }
    }
    if (state.model?.traverse) {
      state.model.traverse(visit)
    } else {
      visit(state.model)
    }
    return out
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
  expect(candidates.length, 'there must be a merged-mesh instance on screen').toBeGreaterThan(0)

  const MAX_TRIES = 8
  for (const {parent, x, y} of candidates.slice(0, MAX_TRIES)) {
    await page.mouse.dblclick(x, y)
    const selected = await page.waitForFunction((id) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any
      return ((w.store ?? w.useStore).getState().selectedElements ?? []).includes(`${id}`)
    }, parent, {timeout: 3000}).then(() => true, () => false)
    if (selected) {
      return parent
    }
  }
  throw new Error('double-click selected none of the merged instances it was aimed at')
}


/**
 * The scene instances the selection narrows to (`selectedInstanceIds`) and its
 * anchor rows, read from the store: the highlight itself is a canvas effect.
 *
 * @param page Playwright page
 * @return the instance ids and the anchor row ids, as strings
 */
export function selectedInstancesAndAnchors(page: Page): Promise<{instances: number[], anchors: string[]}> {
  return page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const state = ((window as any).store ?? (window as any).useStore).getState()
    return {
      instances: (state.selectedInstanceIds ?? []).map(Number),
      anchors: (state.selectedAnchorIds ?? []).map(String),
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}


/**
 * Shift-double-click the scene at a point, as a user adds to or drops from a
 * multi-selection.
 *
 * @param page Playwright page
 * @param point canvas-relative to the viewport, as a candidate carries
 */
export async function shiftDoubleClickAt(page: Page, point: {x: number, y: number}) {
  await page.keyboard.down('Shift')
  try {
    await page.mouse.dblclick(point.x, point.y)
  } finally {
    await page.keyboard.up('Shift')
  }
}


/**
 * Shift-double-click a batched instance that is NOT yet selected and wait for
 * it to join the selection (one more instance than before). Candidates are
 * tried in turn because the instance in front at a pixel may be one already
 * selected, which would toggle it off instead; those are skipped by id.
 *
 * @param page Playwright page
 * @param selected the instance ids already selected
 * @param level whose geometry to aim at (the root product's own, a child's)
 * @return the point clicked and the instance id that joined
 */
export async function shiftDoubleClickAnotherInstance(
  page: Page, selected: number[], level: PlacementLevel = 'any'):
    Promise<{x: number, y: number, instanceId: number}> {
  const candidates: Array<{instanceId: number; x: number; y: number}> = await page.evaluate(({skip, aimLevel}) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const w = window as any
    const state = (w.store ?? w.useStore).getState()
    const camera = state.viewer.context.getCamera()
    const rect = (document.querySelector('canvas') as HTMLCanvasElement).getBoundingClientRect()
    const out: Array<{instanceId: number; x: number; y: number}> = []
    const visit = (mesh: any) => {
      if (!mesh?.isBatchedMesh || !mesh.instanceParents || !mesh.instanceOccurrenceIds) {
        return
      }
      mesh.updateMatrixWorld(true)
      mesh.computeBoundingBox()
      const Box3 = mesh.boundingBox.constructor
      const Matrix4 = mesh.matrixWorld.constructor
      for (let batchId = 0; batchId < mesh.instanceParents.length; batchId++) {
        const instanceId = mesh.instanceOccurrenceIds[batchId]
        const pathLength = mesh.instanceOccurrencePaths?.[batchId]?.length
        if (skip.includes(instanceId) || (aimLevel === 'root' && pathLength !== 0) ||
            (aimLevel === 'child' && !(pathLength > 0))) {
          continue
        }
        const box = new Box3()
        const matrix = new Matrix4()
        mesh.getBoundingBoxAt(mesh.getGeometryIdAt(batchId), box)
        mesh.getMatrixAt(batchId, matrix)
        const centre = box.applyMatrix4(matrix.premultiply(mesh.matrixWorld))
          .getCenter(mesh.boundingBox.min.clone()).project(camera)
        const ON_SCREEN = 0.95
        if (Math.abs(centre.x) < ON_SCREEN && Math.abs(centre.y) < ON_SCREEN) {
          out.push({
            instanceId,
            x: rect.left + (((centre.x + 1) / 2) * rect.width),
            y: rect.top + (((1 - centre.y) / 2) * rect.height),
          })
        }
      }
    }
    if (state.model?.traverse) {
      state.model.traverse(visit)
    } else {
      visit(state.model)
    }
    return out
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }, {skip: selected, aimLevel: level})
  expect(candidates.length, 'there must be another instance on screen').toBeGreaterThan(0)

  // Overlapping instances share a pixel, and the one in front takes the click:
  // a second candidate there tells nothing new.
  const seenPixels = new Set<string>()
  const distinct = candidates.filter(({x, y}) => {
    const key = `${Math.round(x)},${Math.round(y)}`
    return !seenPixels.has(key) && seenPixels.add(key)
  })
  const MAX_TRIES = 12
  const sameAsBefore = (now: number[]) =>
    now.length === selected.length && selected.every((id) => now.includes(id))
  for (const candidate of distinct.slice(0, MAX_TRIES)) {
    await shiftDoubleClickAt(page, candidate)
    // Settled when the selection has changed at all; the pick may have landed
    // on a different (or an already selected) instance than the one aimed at.
    const changed = await page.waitForFunction((before) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any
      const now = ((w.store ?? w.useStore).getState().selectedInstanceIds ?? []).map(Number)
      return now.length !== before.length || before.some((id) => !now.includes(id))
    }, selected, {timeout: 3000}).then(() => true, () => false)
    if (!changed) {
      continue
    }
    const now = (await selectedInstancesAndAnchors(page)).instances
    const joined = now.filter((id) => !selected.includes(id))
    if (now.length === selected.length + 1 && joined.length === 1) {
      return {x: candidate.x, y: candidate.y, instanceId: joined[0]}
    }
    // It dropped one that was selected, or took more than one: put the
    // selection back by toggling the same spot, then try the next.
    await shiftDoubleClickAt(page, candidate)
    await expect.poll(async () => sameAsBefore((await selectedInstancesAndAnchors(page)).instances)).toBe(true)
  }
  throw new Error('shift-double-click added none of the instances it was aimed at')
}


/**
 * The NavTree row for a named product is highlighted as the selection.
 *
 * `expectNavTreeFollowsSelection` only asks that SOME row is selected, which
 * is too weak to catch a pick that selects the wrong row; this names the row.
 * A STEP pick reports the geometry's `product_definition_shape` while the row
 * is the `product_definition`, so a part with no assembly structure got no
 * highlight at all (#1909).
 *
 * @param page Playwright page
 * @param label the row's label, as the NavTree shows it
 */
export async function expectProductRowSelected(page: Page, label: string) {
  const panel = page.getByTestId('NavTreePanel')
  if (!await panel.isVisible()) {
    await page.getByTestId('control-button-navigation').click()
  }
  await expect(panel).toBeVisible()
  await expect(page.locator(`[data-node-label="${label}"][data-is-selected="true"]`)).toHaveCount(1)
}


/**
 * The rest of the user-visible selection: the NavTree row and the URL.
 *
 * @param page Playwright page
 */
export async function expectNavTreeFollowsSelection(page: Page) {
  const panel = page.getByTestId('NavTreePanel')
  if (!await panel.isVisible()) {
    await page.getByTestId('control-button-navigation').click()
  }
  await expect(panel).toBeVisible()
  await expect(page.locator('[data-is-selected="true"]').first()).toBeVisible()
  // The element path follows the model file in the URL, before any query or
  // hash (`/index.ifc/89/112/…/396?feature=…`).
  await expect(page).toHaveURL(/\.(ifc|glb|step|stp)(\/\d+)+(\?|#|$)/)
}
