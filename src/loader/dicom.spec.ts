import fs from 'node:fs'
import path from 'node:path'
import {Page, expect, test} from '@playwright/test'
import {SAME_FRAME_TOLERANCE, frameDifference} from '../tests/e2e/canvasFrame'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {waitForModelReady} from '../tests/e2e/models'
import {captureRenderedFrame, homepageSetup, returningUserVisitsHomepageWaitForModel} from '../tests/e2e/utils'


/**
 * A zip of DICOM slices opens as a volume, dropped or picked.
 *
 * The reader, the stacking into NRRD, the archive seam and the fixup are
 * unit-tested (`dicom.test.js`, `modelArchive.test.js`, `nrrd.test.js`,
 * `Loader.test.js`); this is the user's own action through both ways a local
 * file reaches Share, through the real unzip, the real NRRDLoader and a real
 * WebGL2 frame — the one thing Jest can't run is the ray-marching shader.
 *
 * The archive is pydicom's phantom series (`tools/models/makeDicomPhantom.py`):
 * 32 extension-less slices in shuffled order beside a one-slice scout series.
 */

const TEST_TIMEOUT_MS = 90_000
const LOAD_TIMEOUT_MS = 30_000
const CHOOSER_WAIT_MS = 15_000

// Relative to the repo root, the cwd Playwright runs specs from.
const PHANTOM_ZIP = new Uint8Array(fs.readFileSync(path.resolve('testdata/models/dicom/phantom-ct.zip')))

// The series is stacked into one NRRD at the seam, so OPFS holds a `.nrrd`.
const LOCAL_NRRD_ROUTE = /\/share\/v\/local-only\/[0-9a-f-]+\.nrrd$/i
const VOLUME_NAME = 'CT 40 × 48 × 32'


/**
 * Drop one file on the viewer, as modelArchive.spec.ts does.
 *
 * @param page Playwright page
 * @param bytes File contents
 * @param name File name
 */
async function dropFile(page: Page, bytes: Uint8Array, name: string) {
  await page.evaluate(({bytesArg, nameArg}) => {
    const dropzone = document.querySelector('[data-testid="cadview-dropzone"]')
    if (!dropzone) {
      throw new Error('Drop target not found')
    }
    const dt = new DataTransfer()
    dt.items.add(new File([new Uint8Array(bytesArg)], nameArg))
    dropzone.dispatchEvent(new DragEvent('drop', {bubbles: true, cancelable: true, dataTransfer: dt}))
  }, {bytesArg: Array.from(bytes), nameArg: name})
}


/**
 * Pick one file through Open › Local › Browse.
 *
 * @param page Playwright page
 * @param bytes File contents
 * @param name File name
 */
async function pickFile(page: Page, bytes: Uint8Array, name: string) {
  await page.getByTestId('control-button-open').click()
  await page.getByRole('tab', {name: 'Local'}).click()
  const browse = page.getByTestId('button_open_file')
  await expect(browse).toBeVisible()
  const waiting = page.waitForEvent('filechooser', {timeout: CHOOSER_WAIT_MS})
  await browse.click()
  const chooser = await waiting
  await chooser.setFiles({name, mimeType: 'application/zip', buffer: Buffer.from(bytes)})
}


/**
 * Show or hide the loaded volume mesh.
 *
 * @param page Playwright page
 * @param visible
 * @return the volume's name, or null when the model has none
 */
function setVolumeVisible(page: Page, visible: boolean): Promise<string | null> {
  return page.evaluate((show) => {
    type Node = {name: string, visible: boolean, userData: {isVolume?: boolean}, traverse: (fn: (n: Node) => void) => void}
    const store = (window as unknown as {useStore?: {getState: () => {model?: Node | null}}}).useStore
    let found: string | null = null
    store?.getState().model?.traverse((node) => {
      if (node.userData?.isVolume) {
        node.visible = show
        found = node.name
      }
    })
    return found
  }, visible)
}


/**
 * The upload opened as the volume, under the archive's name, and the volume
 * is on the canvas: a fresh frame with it hidden differs from one with it
 * shown, which only holds if the shader drew something.
 *
 * @param page Playwright page
 */
async function expectVolumeOpened(page: Page) {
  await expect(page).toHaveURL(LOCAL_NRRD_ROUTE, {timeout: LOAD_TIMEOUT_MS})
  await waitForModelReady(page)
  await expect.poll(() => page.evaluate(() => {
    const raw = localStorage.getItem('bldrs:recent-files')
    const files: Array<{source: string, name: string}> = raw ? JSON.parse(raw).files ?? [] : []
    return files.find((f) => f.source === 'local')?.name ?? null
  })).toBe('CT1.nrrd')
  const shown = await captureRenderedFrame(page)
  expect(await setVolumeVisible(page, false)).toBe(VOLUME_NAME)
  const hidden = await captureRenderedFrame(page)
  await setVolumeVisible(page, true)
  expect(frameDifference(shown, hidden)).toBeGreaterThan(SAME_FRAME_TOLERANCE)
}


/**
 * Store state the volume tests read.
 *
 * @param page Playwright page
 * @return what is selected, and whether the Properties panel is on
 */
function selectionState(page: Page): Promise<{selected: unknown, isPropertiesEnabled: boolean}> {
  return page.evaluate(() => {
    type State = {selectedElement: unknown, isPropertiesEnabled: boolean}
    const state = (window as unknown as {useStore: {getState: () => State}}).useStore.getState()
    return {selected: state.selectedElement, isPropertiesEnabled: state.isPropertiesEnabled}
  })
}


/**
 * Hide the cut planes' drag arrows, so a frame shows only what the cut did
 * to the volume, not the arrow drawn beside it.
 *
 * @param page Playwright page
 * @return how many planes there are
 */
function hideCutPlaneArrows(page: Page): Promise<number> {
  return page.evaluate(() => {
    type Clipper = {_meshClipper?: {planes: Array<{arrow: {visible: boolean}}>}}
    type State = {viewer?: {clipper?: Clipper}}
    const state = (window as unknown as {useStore: {getState: () => State}}).useStore.getState()
    const planes = state.viewer?.clipper?._meshClipper?.planes ?? []
    planes.forEach((p) => {
      p.arrow.visible = false
    })
    return planes.length
  })
}


describeMobileAndDesktop('Open a zip of DICOM slices as a volume', () => {
  test.beforeEach(async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await homepageSetup(page)
    await returningUserVisitsHomepageWaitForModel(page)
  })

  test('a dropped DICOM zip opens as a volume', async ({page}) => {
    await dropFile(page, PHANTOM_ZIP, 'CT1.zip')
    await expectVolumeOpened(page)
  })

  test('a picked DICOM zip opens as a volume', async ({page}) => {
    await pickFile(page, PHANTOM_ZIP, 'CT1.zip')
    await expectVolumeOpened(page)
  })

  test('a click on the volume selects nothing, and Properties stays off', async ({page}) => {
    await dropFile(page, PHANTOM_ZIP, 'CT1.zip')
    await expectVolumeOpened(page)
    // The model is framed in the middle of the canvas.
    const canvas = page.getByTestId('cadview-dropzone')
    const box = await canvas.boundingBox()
    if (box === null) {
      throw new Error('No viewer canvas to click')
    }
    await page.mouse.click(box.x + (box.width / 2), box.y + (box.height / 2))
    expect(await selectionState(page)).toEqual({selected: null, isPropertiesEnabled: false})
    await expect(page.getByTestId('control-button-properties')).toHaveCount(0)
  })

  test('a plan cut opens the volume', async ({page}) => {
    await dropFile(page, PHANTOM_ZIP, 'CT1.zip')
    await expectVolumeOpened(page)
    const whole = await captureRenderedFrame(page)
    await page.getByTestId('control-button-cut-plane').click()
    await page.getByTestId('menu-item-plan').click()
    await expect(page.getByTestId('menu-cut-plane')).toBeHidden()
    expect(await hideCutPlaneArrows(page)).toBe(1)
    const cut = await captureRenderedFrame(page)
    // With the arrow hidden, all that can differ is the volume itself.
    expect(frameDifference(whole, cut)).toBeGreaterThan(SAME_FRAME_TOLERANCE)
    // And it is cut, not gone: hiding it still changes the frame.
    expect(await setVolumeVisible(page, false)).toBe(VOLUME_NAME)
    const hidden = await captureRenderedFrame(page)
    expect(frameDifference(cut, hidden)).toBeGreaterThan(SAME_FRAME_TOLERANCE)
  })
})
