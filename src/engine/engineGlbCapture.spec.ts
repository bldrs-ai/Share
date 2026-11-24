import {readFile} from 'node:fs/promises'
import {Page, expect, test} from '@playwright/test'
import {
  EXPORT_TEST_TIMEOUT_MS,
  GLTF_MAGIC,
  dismissLoadSnackbar,
  glbJsonChunk,
  openExportTab,
  routeProModule,
  selectCompression,
  setPortable,
  setSubscriptionTier,
} from '../tests/e2e/export'
import {watchEngineWorker} from '../tests/e2e/engineWorker'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {captureGlbLogs, resetGlbLogs, waitForGlbLog} from '../tests/e2e/glbLogs'
import {waitForModelReady} from '../tests/e2e/models'
import {
  auth0Login,
  clearOpfs,
  homepageSetup,
  pauseViewerRendering,
  resumeViewerRendering,
  setIsReturningUser,
  setupAuthenticationIntercepts,
} from '../tests/e2e/utils'


/**
 * The GLB artifact of a worker-engine load (engine-worker.md §7 step 5,
 * `?feature=engineWorker`), for both Conway formats.
 *
 * Before step 5 a worker load wrote no artifact at all: the writer's
 * property capture, spill and release reached for a main-thread engine that
 * held no model. Now its engine captures run in the worker as one `capture`
 * job. Each test, per format:
 *   1. loads the model on the MAIN-THREAD engine and keeps the artifact it
 *      writes, as the reference;
 *   2. clears OPFS and loads it again in the WORKER (`watchEngineWorker`
 *      asserts a worker session, not the in-process fallback), and expects
 *      the captures to have run there and the artifact to be the reference
 *      BYTE FOR BYTE. Both engines run the same capture code
 *      (loader/glbEngineCapture.js) over the same conway, and the geometry
 *      comes from the same main-side scene build, so any difference is a
 *      defect;
 *   3. exports it as a Pro user, and expects the file to carry the
 *      properties and the tree the capture produced;
 *   4. reloads it, and expects a cache HIT whose NavTree and Properties
 *      come from the artifact.
 *
 * Known issue, not asserted: on a cache hit, the Properties panel's
 * reference rows resolve through an engine with no model open and render
 * `null` (#2066, owned by the #2070 work). The panel is checked for opening
 * on the selected element and showing its own record, not for its
 * reference rows.
 */
const IFC_PATH = '/share/v/p/index.ifc'
// `#621` is one of the logo's proxies, named Together (Properties.cacheHit.spec.ts).
const IFC_ELEMENT = '81/621'
const STEP_PATH = '/share/v/p/index.step'
// The logo as an AP214 assembly: seven `Together` occurrences
// (tools/models/README.md, engineModelLoad.spec.ts).
const STEP_LEAF = 'Together'
// The kill switch: the worker is the default since engine-worker.md §7 step 9.
const MAIN_FLAGS = '?feature=disableEngineWorker,export,glbVerbose'
const WORKER_FLAGS = '?feature=engineWorker,export,glbVerbose'
const CACHE_TIMEOUT_MS = 60_000
// Two parses (one per engine, each a cold wasm boot), an export and a cache
// hit, per form factor.
const TEST_TIMEOUT_MS = EXPORT_TEST_TIMEOUT_MS * 3


/** The cached artifact in OPFS: its name, size and SHA-256. */
interface Artifact {
  name: string
  size: number
  sha256: string
}


/**
 * Every `.glb` artifact in the page's OPFS.
 *
 * @param page Playwright page
 * @return the artifacts found
 */
function opfsArtifacts(page: Page): Promise<Artifact[]> {
  return page.evaluate(async () => {
    const out: Artifact[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const walk = async (dir: any) => {
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === 'directory') {
          await walk(handle)
        } else if (name.includes('.glb')) {
          const file = await handle.getFile()
          const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
          const HEX = 16
          const sha256 = Array.from(new Uint8Array(digest)).map((b) => b.toString(HEX).padStart(2, '0')).join('')
          out.push({name, size: file.size, sha256})
        }
      }
    }
    await walk(await navigator.storage.getDirectory())
    return out
  })
}


/**
 * Load `url` as a cache MISS and wait for the writer to land the artifact.
 * The viewer is paused for the wait: the writer is idle-scheduled, and a
 * painting page never goes idle under SwiftShader (export.ts
 * #loadModelAndWaitForArtifact says why).
 *
 * @param page Playwright page
 * @param glbLogs the page's captured `[glb]` lines
 * @param url what to load
 * @return the one artifact written
 */
async function loadAndWaitForArtifact(page: Page, glbLogs: string[], url: string): Promise<Artifact> {
  resetGlbLogs(glbLogs)
  await page.goto(url, {waitUntil: 'domcontentloaded'})
  await waitForModelReady(page)
  await pauseViewerRendering(page)
  await waitForGlbLog(glbLogs, 'writer: wrote', CACHE_TIMEOUT_MS)
  await resumeViewerRendering(page)
  expect(glbLogs.some((l) => l.includes('cache MISS')), 'a fresh write, not a hit').toBe(true)
  const artifacts = await opfsArtifacts(page)
  expect(artifacts, 'exactly one artifact').toHaveLength(1)
  return artifacts[0]
}


/**
 * Export the cached artifact as a Pro user, native and uncompressed, so the
 * file is the artifact's own glTF and not a re-encode of it.
 *
 * @param page Playwright page
 * @return the downloaded bytes
 */
async function exportNative(page: Page): Promise<Buffer> {
  await routeProModule(page)
  await setSubscriptionTier(page, 'sharePro')
  await auth0Login(page)
  await pauseViewerRendering(page)
  await openExportTab(page)
  await dismissLoadSnackbar(page)
  await setPortable(page, false)
  await selectCompression(page, 'none')
  const exportButton = page.getByTestId('export-glb-button')
  await expect(exportButton).toBeEnabled()
  const downloadPromise = page.waitForEvent('download')
  await exportButton.click()
  const download = await downloadPromise
  const path = test.info().outputPath(download.suggestedFilename())
  await download.saveAs(path)
  await page.getByTestId('button-close-dialog-save').click()
  await resumeViewerRendering(page)
  return readFile(path)
}


/**
 * The worker leg of each test: load, capture in the worker, compare with the
 * main-thread reference, and export.
 *
 * @param page Playwright page
 * @param glbLogs the page's captured `[glb]` lines
 * @param path the model's route
 */
async function workerArtifactMatchesMainAndExports(page: Page, glbLogs: string[], path: string) {
  const mainEngine = watchEngineWorker(page)
  const reference = await loadAndWaitForArtifact(page, glbLogs, `${path}${MAIN_FLAGS}`)
  // The reference really came from the main-thread engine, and its captures
  // ran in process, with no line.
  await mainEngine.expectMainThreadEngine()
  expect(glbLogs.some((l) => l.includes('engine captures ran in'))).toBe(false)

  await clearOpfs(page)
  // Watched from here on: the main-thread load above printed its own pump
  // line, which the watcher would count against the worker leg.
  const engine = watchEngineWorker(page)
  const fromWorker = await loadAndWaitForArtifact(page, glbLogs, `${path}${WORKER_FLAGS}`)
  await engine.expectWorkerEngine()
  // The captures ran in the worker session, not over a page-side engine
  // (Loader.js prints it page-side, where a spec can see it).
  expect(glbLogs.some((l) => l.includes('engine captures ran in the worker engine'))).toBe(true)
  expect(fromWorker).toEqual(reference)

  const bytes = await exportNative(page)
  expect(bytes.subarray(0, GLTF_MAGIC.length).toString('ascii')).toBe(GLTF_MAGIC)
  const used = glbJsonChunk(bytes).extensionsUsed ?? []
  expect(used).toContain('BLDRS_spatial_tree')
  expect(used).toContain('BLDRS_element_properties')
}


describeMobileAndDesktop('Engine worker: GLB capture', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setupAuthenticationIntercepts(page)
    await setIsReturningUser(page.context())
    // Insurance against a run interrupted mid-write (OPFS is per context).
    await clearOpfs(page)
  })

  test('IFC: a worker load writes the main-thread artifact, exports it, and reopens from the cache', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))
    const glbLogs = captureGlbLogs(page)
    await workerArtifactMatchesMainAndExports(page, glbLogs, IFC_PATH)

    // The worker's artifact serves the next load: no parse, no engine.
    resetGlbLogs(glbLogs)
    await page.goto(`${IFC_PATH}/${IFC_ELEMENT}${WORKER_FLAGS}`, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
    await waitForGlbLog(glbLogs, 'cache HIT', CACHE_TIMEOUT_MS)
    await page.getByTestId('control-button-properties').click()
    const propertiesPanel = page.getByTestId('PropertiesPanel')
    await expect(propertiesPanel).toBeVisible()
    // The record came out of the worker-captured BLDRS_element_properties.
    await waitForGlbLog(glbLogs, 'decoded payload', CACHE_TIMEOUT_MS)
    await expect(propertiesPanel.locator('tr').filter({hasText: 'Express Id'})).toContainText('621')
    await expect(propertiesPanel.locator('tr').filter({hasText: 'Name'}).first()).toContainText('Together')
  })

  test('STEP: a worker load writes the main-thread artifact, exports it, and reopens from the cache', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))
    const glbLogs = captureGlbLogs(page)
    await workerArtifactMatchesMainAndExports(page, glbLogs, STEP_PATH)

    resetGlbLogs(glbLogs)
    await page.goto(`${STEP_PATH}${WORKER_FLAGS}`, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
    await waitForGlbLog(glbLogs, 'cache HIT', CACHE_TIMEOUT_MS)
    // The NavTree is the worker-captured BLDRS_spatial_tree, names included.
    await page.getByTestId('control-button-navigation').click()
    const node = (label: string) => page.locator(`[data-node-label="${label}"]`)
    for (const name of ['Bldrs', 'Build', 'Every', 'Thing']) {
      await node(name).getByTestId('NavTreeNodeToggle').click()
    }
    await node(STEP_LEAF).first().getByTestId('NavTreeNodeLabel').click()
    await expect(node(STEP_LEAF).first()).toHaveAttribute('data-is-selected', 'true')
    await page.getByTestId('control-button-properties').click()
    const propertiesPanel = page.getByTestId('PropertiesPanel')
    await expect(propertiesPanel).toBeVisible()
    await expect(propertiesPanel).toContainText(STEP_LEAF)
  })
})
