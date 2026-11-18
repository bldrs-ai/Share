import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {captureGlbLogs, glbLinesSinceReset, resetGlbLogs, waitForGlbLog} from '../tests/e2e/glbLogs'
import {setupVirtualPathIntercept, waitForModelReady} from '../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../tests/e2e/utils'


/**
 * A zip opens by its content wherever it is hosted, not only as an upload.
 *
 * Share#2006 opened a model inside a dropped or picked zip, and a hosted
 * `.ifczip`; a hosted `.zip` had no route at all. Now a download whose bytes
 * are a zip is unwrapped in `Loader#load` (`modelArchive.js#unwrapHostedArchive`)
 * and the load is retyped to the one model inside — so a zip of DICOM slices
 * in a GitHub repo is a link someone can share. The unit suites
 * (`modelArchive.test.js`, `Loader.test.js`, `Filetype.test.js`) cover the
 * naming cases; this is the user's own action, opening the link, through the
 * real GitHub route, the real download and the real parse.
 *
 * The fixtures are in the test-models fixture tree: `zip/box.ifc.zip` and
 * `zip/models.zip` (box.ifc, plus NamedScene.glb beside it in the second),
 * `zip/renamed-box.ifc` (box.ifc.zip's bytes under an IFC's name),
 * and `dicom/phantom-ct.zip`, a copy of pydicom's phantom series
 * (`tools/models/makeDicomPhantom.py`).
 */

const TEST_TIMEOUT_MS = 90_000
const LOAD_TIMEOUT_MS = 30_000
const CACHE_TIMEOUT_MS = 30_000
// How long past idle a writer that was going to run would have printed by:
// the control's box writes in well under a second.
const WRITER_QUIET_MS = 3_000

const GH = '/share/v/gh/bldrs-ai/test-models/main'
const IFC_ZIP_PATH = `${GH}/zip/box.ifc.zip`
const DICOM_ZIP_PATH = `${GH}/dicom/phantom-ct.zip`
const TWO_MODEL_ZIP_PATH = `${GH}/zip/models.zip`
// The same zip under a model's name, and the plain IFC it holds.
const RENAMED_ZIP_PATH = `${GH}/zip/renamed-box.ifc`
const PLAIN_IFC_PATH = `${GH}/ifc/misc/box.ifc`
const VOLUME_NAME = 'CT 40 × 48 × 32'


/**
 * @param page Playwright page
 * @return the loaded model's type and the name of its volume, if it has one
 */
function loadedModel(page: Page): Promise<{type: string | null, volume: string | null}> {
  return page.evaluate(() => {
    type Node = {name: string, type?: string, userData: {isVolume?: boolean}, traverse: (fn: (n: Node) => void) => void}
    const model = (window as unknown as {useStore?: {getState: () => {model?: Node | null}}}).useStore?.getState().model
    let volume: string | null = null
    model?.traverse((node) => {
      if (node.userData?.isVolume) {
        volume = node.name
      }
    })
    return {type: model?.type ?? null, volume}
  })
}


/**
 * Open a test-models path as a returning user would open a shared link.
 *
 * @param page Playwright page
 * @param modelPath the `/share/v/gh/...` path
 * @param suffix a hash to open it with
 */
async function openLink(page: Page, modelPath: string, suffix = '') {
  await setupVirtualPathIntercept(page, modelPath, '')
  await page.goto(`${modelPath}${suffix}`, {waitUntil: 'domcontentloaded'})
}


describeMobileAndDesktop('Open a hosted zip', () => {
  test.beforeEach(async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  test('a .ifc.zip in a GitHub repo opens the IFC inside it', async ({page}) => {
    await openLink(page, IFC_ZIP_PATH)
    await waitForModelReady(page)
    await expect.poll(() => loadedModel(page), {timeout: LOAD_TIMEOUT_MS}).toEqual({type: 'ifc', volume: null})
    // The link is still the archive's: that's what someone else opens.
    await expect(page).toHaveURL(new RegExp(`${IFC_ZIP_PATH.replace(/\./g, '\\.')}`))
  })

  test('a zip of DICOM slices in a GitHub repo opens as the volume, and its link with a camera reopens it', async ({page}) => {
    await openLink(page, DICOM_ZIP_PATH)
    await waitForModelReady(page)
    await expect.poll(() => loadedModel(page), {timeout: LOAD_TIMEOUT_MS}).toEqual({type: 'nrrd', volume: VOLUME_NAME})
    // The shareable form of it: the same path with a view on the hash, opened
    // fresh (via about:blank — a hash-only goto is a same-document change).
    const camera = '#c:40,30,60,0,0,0'
    await page.goto('about:blank')
    await openLink(page, DICOM_ZIP_PATH, camera)
    await waitForModelReady(page)
    await expect.poll(() => loadedModel(page), {timeout: LOAD_TIMEOUT_MS}).toEqual({type: 'nrrd', volume: VOLUME_NAME})
    await expect(page).toHaveURL(/phantom-ct\.zip#c:/)
  })

  // A zip under a model's name opens by its content, and is kept out of the
  // GLB cache: the writer's source handle would be the zip, which conway's
  // later reads must never be backed with (Loader#load drops the export
  // context at the unwrap). The plain IFC is the control: the same route
  // and the same box write an artifact.
  test('a zip named as an .ifc opens the IFC inside it, uncached, where the .ifc caches', async ({page}) => {
    const glbLogs = captureGlbLogs(page)
    await openLink(page, PLAIN_IFC_PATH)
    await waitForModelReady(page)
    await waitForGlbLog(glbLogs, 'writer: wrote', CACHE_TIMEOUT_MS)

    resetGlbLogs(glbLogs)
    await page.goto('about:blank')
    await openLink(page, RENAMED_ZIP_PATH)
    await waitForModelReady(page)
    await expect.poll(() => loadedModel(page), {timeout: LOAD_TIMEOUT_MS}).toEqual({type: 'ifc', volume: null})
    // The reader did want to cache it, going by the name…
    await waitForGlbLog(glbLogs, 'will export after parse', CACHE_TIMEOUT_MS)
    // …and the writer, which runs at idle once the model is up, never does.
    // As long as the control took to write, and then some.
    await page.evaluate(() => new Promise((resolve) => requestIdleCallback(() => resolve(null))))
    await page.waitForTimeout(WRITER_QUIET_MS)
    expect(glbLinesSinceReset(glbLogs).filter((line) => line.includes('writer:'))).toEqual([])
  })

  test('a hosted zip of several models says why it can\'t open, naming them', async ({page}) => {
    await openLink(page, TWO_MODEL_ZIP_PATH)
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({timeout: LOAD_TIMEOUT_MS})
    await expect(dialog.getByRole('heading', {name: 'Can\'t open this archive'})).toBeVisible()
    await expect(dialog).toContainText('This archive holds 2 models (models/box.ifc, models/NamedScene.glb).')
    await expect(dialog).not.toContainText('Discord')
  })
})
