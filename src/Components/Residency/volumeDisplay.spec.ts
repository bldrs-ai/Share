import fs from 'node:fs'
import path from 'node:path'
import {Page, expect, test} from '@playwright/test'
import {SAME_FRAME_TOLERANCE, frameDifference} from '../../tests/e2e/canvasFrame'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {waitForModelReady} from '../../tests/e2e/models'
import {captureRenderedFrame, homepageSetup, returningUserVisitsHomepageWaitForModel} from '../../tests/e2e/utils'


/**
 * The Display menu's Volume section (viewer/display/volumeMode.js): a volume's
 * window and opacity sliders change what the shader draws, and follow into
 * the link (`#d:vw=…,vo=…`) through the live view link (Share/viewLink.js).
 *
 * The volume is pydicom's phantom CT (testdata/models/dicom/phantom-ct.zip),
 * dropped on the viewer as a user would.
 */

const TEST_TIMEOUT_MS = 90_000
const LOAD_TIMEOUT_MS = 30_000
const PHANTOM_ZIP = new Uint8Array(fs.readFileSync(path.resolve('testdata/models/dicom/phantom-ct.zip')))


/**
 * Drop the phantom zip on the viewer and wait for its volume.
 *
 * @param page Playwright page
 */
async function openPhantom(page: Page) {
  await page.evaluate(({bytesArg}) => {
    const dropzone = document.querySelector('[data-testid="cadview-dropzone"]')
    if (!dropzone) {
      throw new Error('Drop target not found')
    }
    const dt = new DataTransfer()
    dt.items.add(new File([new Uint8Array(bytesArg)], 'CT1.zip'))
    dropzone.dispatchEvent(new DragEvent('drop', {bubbles: true, cancelable: true, dataTransfer: dt}))
  }, {bytesArg: Array.from(PHANTOM_ZIP)})
  await expect(page).toHaveURL(/\/share\/v\/local-only\/[0-9a-f-]+\.nrrd/i, {timeout: LOAD_TIMEOUT_MS})
  await waitForModelReady(page)
}


/**
 * @param page Playwright page
 * @return the page's `#d:` token, or null
 */
function displayToken(page: Page): Promise<string | null> {
  return page.evaluate(() =>
    window.location.hash.substring(1).split(';').find((set) => set.startsWith('d:')) ?? null)
}


describeMobileAndDesktop('Display menu: volume window and opacity', () => {
  test.beforeEach(async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await homepageSetup(page)
    await returningUserVisitsHomepageWaitForModel(page)
  })

  // Moves that must show on screen. The phantom's bone shell is opaque at any
  // density near the default, so a small step can leave every pixel as it
  // was; these clear the volume outright.
  test('the opacity slider changes the volume on screen, the link carries it, and Reset undoes it', async ({page}) => {
    await openPhantom(page)
    const before = await captureRenderedFrame(page)

    // Opacity to nothing. A keyboard step commits, as a mouse release does.
    await page.getByTestId('control-button-residency').click()
    await expect(page.getByTestId('volume-window-label')).toHaveText('Window: 150 – 900 HU')
    const opacity = page.getByTestId('volume-opacity-slider').locator('input')
    await opacity.focus()
    await opacity.press('Home')
    await expect(page.getByTestId('volume-opacity-label')).toHaveText('Opacity: 0%')
    await page.keyboard.press('Escape')
    await expect.poll(() => displayToken(page)).toBe('d:vo=0')
    expect(frameDifference(before, await captureRenderedFrame(page))).toBeGreaterThan(SAME_FRAME_TOLERANCE)

    // Reset: the volume as it loaded, and nothing in the link.
    await page.getByTestId('control-button-residency').click()
    await page.getByTestId('volume-reset').click()
    await page.keyboard.press('Escape')
    await expect.poll(() => displayToken(page)).toBe(null)
    expect(frameDifference(before, await captureRenderedFrame(page))).toBeLessThanOrEqual(SAME_FRAME_TOLERANCE)
  })

  test('the window slider clears the volume when it\'s above everything in the scan', async ({page}) => {
    await openPhantom(page)
    const before = await captureRenderedFrame(page)
    // The window above everything in the scan (the shell is 1200 HU, the
    // sphere 2500): high to the top of the range, then low up to it. Values
    // snap to the slider's 20 HU steps from -1024, so the top is 3056.
    await page.getByTestId('control-button-residency').click()
    await expect(page.getByTestId('volume-window-label')).toHaveText('Window: 150 – 900 HU')
    // The popover's focus trap moves focus into the popover once it has
    // opened, which would take a thumb's focus away mid-press: wait for each
    // thumb to hold it.
    const pressOn = async (index: number, key: string) => {
      const thumb = page.getByTestId('volume-window-slider').locator('input').nth(index)
      await expect(async () => {
        await thumb.focus()
        await expect(thumb).toBeFocused({timeout: 200})
      }).toPass()
      await page.keyboard.press(key)
    }
    await pressOn(1, 'End')
    await expect(page.getByTestId('volume-window-label')).toHaveText(/– 3056 HU$/)
    await pressOn(0, 'End')
    await expect(page.getByTestId('volume-window-label')).toHaveText(/^Window: 30\d\d – 3056 HU$/)
    await page.keyboard.press('Escape')
    await expect.poll(() => displayToken(page)).toMatch(/^d:vw=30\d\d_3056$/)
    expect(frameDifference(before, await captureRenderedFrame(page))).toBeGreaterThan(SAME_FRAME_TOLERANCE)
  })
})
