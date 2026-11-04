import fs from 'node:fs'
import path from 'node:path'
import {deflateRawSync} from 'node:zlib'
import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {waitForModelReady} from '../tests/e2e/models'
import {homepageSetup, returningUserVisitsHomepageWaitForModel} from '../tests/e2e/utils'


/**
 * Share#2006: a model inside a zip opens, dropped or picked.
 *
 * Half of what the Open dialog rejected in the 2026-11-01 triage was archives
 * (bldrs-ai/ops#26). Entry selection, the size ceiling and the dialog's
 * rendering are unit-tested (`zipArchive.test.js`, `modelArchive.test.js`,
 * `AlertDialog.test.jsx`, and each seam's suite); this is the user's own
 * action through both ways a local file reaches Share — a drop on the viewer
 * (`utils/dragAndDrop.js`) and Open › Local › Browse
 * (`utils/loader.js#loadLocalFile`) — each through the real sniff, the real
 * unzip and the real load.
 *
 * The archives are built here, with Node's own deflate, from small fixtures
 * already in the repo; nothing in Share wrote them.
 */

const TEST_TIMEOUT_MS = 90_000
const LOAD_TIMEOUT_MS = 30_000
const CHOOSER_WAIT_MS = 15_000

// Relative to the repo root, the cwd Playwright runs specs from.
const FIXTURES = path.resolve('src/tests/fixtures')
const BOX_IFC = new Uint8Array(fs.readFileSync(path.join(FIXTURES, 'box.ifc')))
const NAMED_SCENE_GLB = new Uint8Array(
  fs.readFileSync(path.join(FIXTURES, 'github/bldrs-ai/test-models/main/glb/NamedScene.glb')))
const NOT_A_MODEL = new TextEncoder().encode('%PDF-1.7 not a model')

// An upload's route: the OPFS storage id `<uuid>.<ext>`, whose extension is
// the type the loader resolves it by — the entry's, not `.zip`.
const LOCAL_IFC_ROUTE = /\/share\/v\/local-only\/[0-9a-f-]+\.ifc$/i
const LOCAL_GLB_ROUTE = /\/share\/v\/local-only\/[0-9a-f-]+\.glb$/i


/**
 * CRC-32 (the zip/gzip polynomial), which zip records carry for each entry.
 * Share's reader doesn't check it; any other unzip would.
 *
 * @param data bytes to checksum
 * @return the unsigned CRC
 */
function crc32(data: Uint8Array): number {
  /* eslint-disable no-magic-numbers */
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
  /* eslint-enable no-magic-numbers */
}


/**
 * A zip archive of deflated entries, as any zip tool writes one: local
 * headers and data, then the central directory, then its end record.
 *
 * @param entries path inside the archive, and contents
 * @return the archive's bytes
 */
function zipOf(entries: Array<{path: string, data: Uint8Array}>): Uint8Array {
  /* eslint-disable no-magic-numbers */
  const parts: Uint8Array[] = []
  const directory: Uint8Array[] = []
  let offset = 0
  for (const {path: entryPath, data} of entries) {
    const name = new TextEncoder().encode(entryPath)
    const stored = new Uint8Array(deflateRawSync(data))
    const crc = crc32(data)
    const local = new Uint8Array(30)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true) // version needed
    lv.setUint16(6, 0x0800, true) // UTF-8 names
    lv.setUint16(8, 8, true) // deflate
    lv.setUint16(12, 0x21, true) // 1980-01-01
    lv.setUint32(14, crc, true)
    lv.setUint32(18, stored.length, true)
    lv.setUint32(22, data.length, true)
    lv.setUint16(26, name.length, true)
    const central = new Uint8Array(46)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, 8, true)
    cv.setUint16(14, 0x21, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, stored.length, true)
    cv.setUint32(24, data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    parts.push(local, name, stored)
    directory.push(central, name)
    offset += local.length + name.length + stored.length
  }
  const directoryLength = directory.reduce((sum, part) => sum + part.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, directoryLength, true)
  ev.setUint32(16, offset, true)
  const all = [...parts, ...directory, end]
  const out = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of all) {
    out.set(part, at)
    at += part.length
  }
  return out
  /* eslint-enable no-magic-numbers */
}


const ONE_IFC_ZIP = zipOf([
  {path: 'export/box.ifc', data: BOX_IFC},
  {path: 'export/readme.pdf', data: NOT_A_MODEL},
])
const TWO_MODEL_ZIP = zipOf([
  {path: 'models/box.ifc', data: BOX_IFC},
  {path: 'models/NamedScene.glb', data: NAMED_SCENE_GLB},
])
const IFCZIP = zipOf([{path: 'box.ifc', data: BOX_IFC}])
const NO_MODEL_ZIP = zipOf([
  {path: 'plan.dwg', data: NOT_A_MODEL},
  {path: 'spec.pdf', data: NOT_A_MODEL},
])


/**
 * Drop one file on the viewer, as dropBinaryStl.spec.ts does.
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
 * The name the newest local recent was recorded under — what the Open
 * dialog's Recents row and the load report show for an upload.
 *
 * @param page Playwright page
 * @return the display name, or null when there is no local recent
 */
function newestLocalRecentName(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('bldrs:recent-files')
    const files: Array<{source: string, name: string}> = raw ? JSON.parse(raw).files ?? [] : []
    return files.find((f) => f.source === 'local')?.name ?? null
  })
}


/**
 * The loaded model's root name, which for a GLB composes the source file's
 * name: `<scene> (<file>)` (Loader#convertToShareModel).
 *
 * @param page Playwright page
 * @return the name, or null while there is no model
 */
function loadedModelName(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const store = (window as unknown as {store?: {getState: () => {model?: {name?: string} | null}}}).store
    return store?.getState().model?.name ?? null
  })
}


/**
 * The upload opened as the IFC inside the archive, recorded under the
 * entry's name.
 *
 * @param page Playwright page
 */
async function expectBoxIfcOpened(page: Page) {
  await expect(page).toHaveURL(LOCAL_IFC_ROUTE, {timeout: LOAD_TIMEOUT_MS})
  await waitForModelReady(page)
  await expect.poll(() => newestLocalRecentName(page)).toBe('box.ifc')
}


/**
 * The chooser is up, listing both models; choose one.
 *
 * @param page Playwright page
 * @param entryPath the model to choose, by its path inside the archive
 */
async function chooseEntry(page: Page, entryPath: string) {
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible({timeout: LOAD_TIMEOUT_MS})
  await expect(dialog.getByRole('heading', {name: 'Choose a model'})).toBeVisible()
  await expect(dialog).toContainText('This archive holds 2 models Share can open.')
  await expect(dialog.getByTestId('archive-entry-models/box.ifc')).toContainText('box.ifc')
  await expect(dialog.getByTestId('archive-entry-models/NamedScene.glb')).toContainText('NamedScene.glb')
  // Nothing opened yet: the demo model's route is still the one showing.
  await expect(page).toHaveURL(/\/share\/v\/p\/index\.ifc/)
  await dialog.getByTestId(`archive-entry-${entryPath}`).click()
  await expect(dialog).toBeHidden()
}


describeMobileAndDesktop('Open a model from inside a .zip', () => {
  test.beforeEach(async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await homepageSetup(page)
    await returningUserVisitsHomepageWaitForModel(page)
  })

  test('a dropped zip with one model opens it', async ({page}) => {
    await dropFile(page, ONE_IFC_ZIP, 'box ifc.zip')
    await expectBoxIfcOpened(page)
  })

  test('a dropped zip with several models asks which, and opens the one chosen', async ({page}) => {
    await dropFile(page, TWO_MODEL_ZIP, 'models.zip')
    await chooseEntry(page, 'models/NamedScene.glb')
    await expect(page).toHaveURL(LOCAL_GLB_ROUTE, {timeout: LOAD_TIMEOUT_MS})
    await waitForModelReady(page)
    // The load names the entry, not the archive.
    await expect.poll(() => loadedModelName(page)).toContain('(NamedScene.glb)')
    expect(await newestLocalRecentName(page)).toBe('NamedScene.glb')
  })

  test('a dropped zip with no model says what it holds', async ({page}) => {
    await dropFile(page, NO_MODEL_ZIP, 'plans.zip')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({timeout: LOAD_TIMEOUT_MS})
    await expect(dialog.getByRole('heading', {name: 'No model in this archive'})).toBeVisible()
    await expect(dialog).toContainText('This archive has no model Share can open (it contains .dwg and .pdf).')
    await expect(dialog).not.toContainText('File upload of unknown type')
  })

  test('a picked .ifczip opens the IFC inside it', async ({page}) => {
    await pickFile(page, IFCZIP, 'box.ifczip')
    await expectBoxIfcOpened(page)
  })

  test('a picked zip with several models asks which, and opens the one chosen', async ({page}) => {
    await pickFile(page, TWO_MODEL_ZIP, 'models.zip')
    await chooseEntry(page, 'models/box.ifc')
    await expectBoxIfcOpened(page)
  })
})
