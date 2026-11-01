import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {homepageSetup, returningUserVisitsHomepageWaitForModel} from '../tests/e2e/utils'


/**
 * Share#2007: a Revit file, dropped or picked, gets the Revit guidance —
 * export IFC, open the .ifc and not the .txt, and a link to the steps —
 * instead of "Cannot extract filetype from filename: Tower.rvt".
 *
 * The map itself is unit-tested (`formatGuidance.test.js`, which also checks
 * every help anchor is a section on the marketing page), and so is the
 * dialog's rendering of it (`AlertDialog.test.jsx`). This is the user's own
 * action, both ways a local file reaches Share: a drop on the viewer
 * (`utils/dragAndDrop.js`) and a pick from Open › Local › Browse
 * (`utils/loader.js#loadLocalFile`), each through the real sniff that has to
 * reject the file first. The help page itself isn't served here — Playwright
 * builds without the marketing site (SKIP_MARKETING) — so the link is checked
 * by where it points.
 */

const TEST_TIMEOUT_MS = 60_000
const CHOOSER_WAIT_MS = 15_000

// A Revit project is an OLE compound file; its signature, then zeros. Nothing
// in Filetype.js#analyzeHeader claims it, and the zeros at offset 80 are a
// binary-STL triangle count of 0, which that check refuses.
const OLE_SIGNATURE = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1] // eslint-disable-line no-magic-numbers
const REVIT_BYTES_LENGTH = 512
const REVIT_BYTES = [...OLE_SIGNATURE, ...new Array(REVIT_BYTES_LENGTH - OLE_SIGNATURE.length).fill(0)]
// One of the triage sample's double-extension names that reads like an IFC.
const REVIT_NAME = 'Tower_rev03.IFC.RVT'


/**
 * Drop one file on the viewer, as dropBinaryStl.spec.ts does.
 *
 * @param page Playwright page
 * @param bytes File contents
 * @param name File name
 */
async function dropFile(page: Page, bytes: number[], name: string) {
  await page.evaluate(({bytesArg, nameArg}) => {
    const dropzone = document.querySelector('[data-testid="cadview-dropzone"]')
    if (!dropzone) {
      throw new Error('Drop target not found')
    }
    const dt = new DataTransfer()
    dt.items.add(new File([new Uint8Array(bytesArg)], nameArg))
    dropzone.dispatchEvent(new DragEvent('drop', {bubbles: true, cancelable: true, dataTransfer: dt}))
  }, {bytesArg: bytes, nameArg: name})
}


/**
 * Pick one file through Open › Local › Browse, as browseFileChooser.spec.ts
 * does, from bytes rather than a path on disk.
 *
 * @param page Playwright page
 * @param bytes File contents
 * @param name File name
 */
async function pickFile(page: Page, bytes: number[], name: string) {
  await page.getByTestId('control-button-open').click()
  await page.getByRole('tab', {name: 'Local'}).click()
  const browse = page.getByTestId('button_open_file')
  await expect(browse).toBeVisible()
  const waiting = page.waitForEvent('filechooser', {timeout: CHOOSER_WAIT_MS})
  await browse.click()
  const chooser = await waiting
  await chooser.setFiles({name, mimeType: 'application/octet-stream', buffer: Buffer.from(bytes)})
}


/**
 * The `message` of every GA `alert` event gtag queued (window.dataLayer; the
 * GA loader is skipped in tests, see engineFailureAlert.spec.ts).
 *
 * @param page Playwright page
 * @return The messages, in order
 */
async function gaAlertMessages(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dataLayer: any[] = (window as any).dataLayer || []
    return dataLayer
      .filter((entry) => entry?.[0] === 'event' && entry[1] === 'alert')
      .map((entry) => String(entry[2]?.message))
  })
}


/**
 * The dialog says what a Revit file is and what to do, under its own header,
 * with the help link, and none of the generic dialog's text.
 *
 * @param page Playwright page
 */
async function expectRevitGuidance(page: Page) {
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible({timeout: TEST_TIMEOUT_MS})
  await expect(dialog.getByRole('heading', {name: 'Revit file'})).toBeVisible()
  await expect(dialog).toContainText('This is a native Revit file. Share can\'t open Revit files directly.')
  await expect(dialog).toContainText('In Revit, use File → Export → IFC, then open the .ifc here.')
  await expect(dialog).toContainText('open the .ifc, not the .txt')
  const help = dialog.getByRole('link', {name: 'How to export IFC from Revit'})
  await expect(help).toBeVisible()
  await expect(help).toHaveAttribute('href', '/help/native-cad-files/#revit')
  await expect(help).toHaveAttribute('target', '_blank')
  await expect(dialog).not.toContainText('Cannot extract filetype')
  await expect(dialog).not.toContainText('File upload of unknown type')
  await expect(dialog).not.toContainText('Discord')
}


describeMobileAndDesktop('Revit file guidance', () => {
  test.beforeEach(async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await homepageSetup(page)
    await returningUserVisitsHomepageWaitForModel(page)
  })

  test('a dropped .rvt says to export IFC from Revit', async ({page}) => {
    await dropFile(page, REVIT_BYTES, REVIT_NAME)
    await expectRevitGuidance(page)
    // Still counted as an unrecognized format, under the constant label and
    // never the file's name (loader/unrecognizedFormat.js, #2005).
    await expect.poll(() => gaAlertMessages(page)).toContain('Unrecognized model format')
    expect(JSON.stringify(await gaAlertMessages(page))).not.toContain('Tower_rev03')
  })

  test('a picked .rvt says to export IFC from Revit', async ({page}) => {
    await pickFile(page, REVIT_BYTES, REVIT_NAME)
    await expectRevitGuidance(page)
    await expect.poll(() => gaAlertMessages(page)).toContain('Unrecognized model format')
    expect(JSON.stringify(await gaAlertMessages(page))).not.toContain('Tower_rev03')
  })
})
