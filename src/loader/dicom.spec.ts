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


/**
 * Move the one cut plane past the volume's box, so that every corner of the
 * box is on its kept side (`keepAll`: `distanceToPoint > 0`) or none is
 * (`keepNone`). Moved in place, as a drag moves it.
 *
 * @param page Playwright page
 * @param where `keepAll` or `keepNone`
 */
async function placeCutPlane(page: Page, where: 'keepAll' | 'keepNone') {
  const placed = await page.evaluate((side) => {
    type Vec = {x: number, y: number, z: number}
    type Plane = {normal: Vec, constant: number}
    type Mesh = {
      userData: {isVolume?: boolean}, matrixWorld: {elements: number[]},
      geometry: {attributes: {position: {count: number, getX: (i: number) => number,
        getY: (i: number) => number, getZ: (i: number) => number}}},
      traverse: (fn: (n: Mesh) => void) => void,
    }
    type State = {model?: Mesh, viewer?: {clipper?: {_meshClipper?: {planes: Array<{plane: Plane}>}}}}
    const state = (window as unknown as {useStore: {getState: () => State}}).useStore.getState()
    const plane = state.viewer?.clipper?._meshClipper?.planes[0]?.plane
    let volume: Mesh | null = null
    state.model?.traverse((n) => {
      if (n.userData?.isVolume) {
        volume = n
      }
    })
    if (!plane || volume === null) {
      return false
    }
    const {matrixWorld: {elements: m}, geometry: {attributes: {position}}} = volume as Mesh
    const distances: number[] = []
    for (let i = 0; i < position.count; i++) {
      const [x, y, z] = [position.getX(i), position.getY(i), position.getZ(i)]
      const world = [
        (m[0] * x) + (m[4] * y) + (m[8] * z) + m[12],
        (m[1] * x) + (m[5] * y) + (m[9] * z) + m[13],
        (m[2] * x) + (m[6] * y) + (m[10] * z) + m[14],
      ]
      distances.push((plane.normal.x * world[0]) + (plane.normal.y * world[1]) + (plane.normal.z * world[2]))
    }
    const margin = 0.01
    plane.constant = side === 'keepAll' ? margin - Math.min(...distances) : -margin - Math.max(...distances)
    return true
  }, where)
  expect(placed, 'placeCutPlane: no cut plane or no volume').toBe(true)
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
    // Nothing selected is what the click did; Properties off is what
    // CadView did for a volume (the Properties button already needs a
    // selection, so asserting it absent too would add nothing).
    expect(await selectionState(page)).toEqual({selected: null, isPropertiesEnabled: false})
  })

  test('a plan cut keeps the side three keeps, and opens the volume', async ({page}) => {
    await dropFile(page, PHANTOM_ZIP, 'CT1.zip')
    await expectVolumeOpened(page)
    const whole = await captureRenderedFrame(page)
    await page.getByTestId('control-button-cut-plane').click()
    await page.getByTestId('menu-item-plan').click()
    await expect(page.getByTestId('menu-cut-plane')).toBeHidden()
    expect(await hideCutPlaneArrows(page)).toBe(1)
    // With the arrow hidden, all a frame can show is the volume and what the
    // cut did to it.
    const cut = await captureRenderedFrame(page)
    expect(await setVolumeVisible(page, false)).toBe(VOLUME_NAME)
    const hidden = await captureRenderedFrame(page)
    await setVolumeVisible(page, true)
    // Cut, not gone, and not untouched.
    expect(frameDifference(cut, whole)).toBeGreaterThan(SAME_FRAME_TOLERANCE)
    expect(frameDifference(cut, hidden)).toBeGreaterThan(SAME_FRAME_TOLERANCE)
    // Which side: three keeps where `distanceToPoint >= 0`. Moved past the
    // box with all of it on that side, the cut must remove nothing; with
    // none of it, everything. A shader trimming the wrong side swaps these.
    await placeCutPlane(page, 'keepAll')
    expect(frameDifference(await captureRenderedFrame(page), whole)).toBeLessThanOrEqual(SAME_FRAME_TOLERANCE)
    await placeCutPlane(page, 'keepNone')
    expect(frameDifference(await captureRenderedFrame(page), hidden)).toBeLessThanOrEqual(SAME_FRAME_TOLERANCE)
  })
})
