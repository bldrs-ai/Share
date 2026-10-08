import {readFile, writeFile} from 'node:fs/promises'
import {gunzipSync} from 'node:zlib'
import {BrowserContext, Page, TestInfo, expect, test} from '@playwright/test'
import {
  dismissLoadSnackbar,
  expectNoHorizontalScroll,
  expectSnackbarOnTop,
  openExportTab,
  openLocalFile,
  reopenLocalGlb,
  selectCompression,
  setPortable,
  toggleGzip,
  toggleMetadata,
  waitForCodecSizing,
} from '../../tests/e2e/export'
import {resetGlbLogs, waitForGlbLog} from '../../tests/e2e/glbLogs'
import {waitForModelReady} from '../../tests/e2e/models'
import {glbFramingProblems, glbJsonText, isGzip} from '../../tests/e2e/live/glbBytes'
import {hasNodeChain, loadGlbInThree, validateGlb} from '../../tests/e2e/live/glbNode'
import {
  HTTP_OK,
  LIVE_MODEL_PATH,
  LIVE_TEST_TIMEOUT_MS,
  PRO_MODULE_URL,
  RECORD_EXPORT_URL,
  cacheDirectives,
  clickExportAndDownload,
  loginWithPassword,
  noteUnverified,
  openLiveModel,
  requireLive,
  sceneHighlightCount,
  setReturningVisitor,
  waitForArtifactWritten,
  watchResponses,
  skipAllWithoutTarget,
} from '../../tests/e2e/live/liveSession'
import {makeSpz} from '../../tests/e2e/live/spz'


/**
 * Live smoke, Pro tier (the comped Pro account): §8 steps 1, 2, 3, 4, 5, 5b,
 * 5c, 6, 8 and 10 — and 7's "a file, not an inline tab" as far as an engine
 * can show it. Every test logs in afresh (liveSession.ts#loginWithPassword
 * says why a saved session is not reused).
 *
 * What stands in for the third-party viewers §8 names: glTF-Validator and
 * three.js' GLTFLoader, run on the downloaded bytes (live/glbNode.ts).
 */

// `public/index.ifc`'s spatial chain and the label its building elements
// share — the same names `exportGlb.spec.ts` walks in the mocked suite.
const SPATIAL_CHAIN = ['Bldrs', 'Build', 'Every', 'Thing']
const LEAF_LABEL = 'Together'


/**
 * Log the Pro account in, open the model, and wait for its artifact.
 *
 * @param page the page
 * @param context its context
 * @param testInfo the running test's info
 * @return the `[glb]` log buffer
 */
async function proWithArtifact(page: Page, context: BrowserContext, testInfo: TestInfo): Promise<string[]> {
  const {target, account} = requireLive(testInfo, {role: 'pro'})
  await setReturningVisitor(context, target)
  await loginWithPassword(context, target, account as {email: string, password: string})
  const glbLogs = await openLiveModel(page, {isSignedIn: true})
  await waitForArtifactWritten(page, glbLogs)
  return glbLogs
}


/**
 * The reopened model is a model: its spatial tree is there, and a NavTree
 * row selects, addresses the element and highlights it in the scene. (The
 * reverse, a pick in the scene selecting the row, needs the batched-mesh
 * aiming `export.ts#doubleClickSelectsAnElement` does and stays with the
 * mocked suite.)
 *
 * @param page the page, with the reopened model loaded
 */
async function expectReopenedModelIsPickable(page: Page) {
  await dismissLoadSnackbar(page)
  await page.getByTestId('control-button-navigation').click()
  await expect(page.getByTestId('NavTreePanel')).toBeVisible()
  const node = (label: string) => page.locator(`[data-node-label="${label}"]`)
  for (const name of SPATIAL_CHAIN) {
    await expect(node(name)).toHaveCount(1)
    await node(name).getByTestId('NavTreeNodeToggle').click()
  }
  await node(LEAF_LABEL).first().getByTestId('NavTreeNodeLabel').click()
  await expect(node(LEAF_LABEL).first()).toHaveAttribute('data-is-selected', 'true')
  await expect(page).toHaveURL(/\/share\/v\/new\/[^/]+\.glb(\/\d+)+/)
  // …and the scene paints it, which is the half a tree that merely rendered
  // would not give (#1844).
  await expect.poll(() => sceneHighlightCount(page)).toBeGreaterThan(0)
}


// Titles name the §8 step without the section sign: Playwright builds each
// test's output directory from its title, the specs that reopen a download
// save it there, and Chromium's file chooser silently dropped a file whose
// path held the "§" (the upload never started; seen while writing this).
test.describe('Live smoke: Pro', () => {
  skipAllWithoutTarget()

  test('Preparing, then a valid gated .glb, metadata on and off (steps 1, 2, 3, 5, 6, 8)', async ({page, context}, testInfo) => {
    test.setTimeout(LIVE_TEST_TIMEOUT_MS)
    const {target, account} = requireLive(testInfo, {role: 'pro'})
    await setReturningVisitor(context, target)
    await loginWithPassword(context, target, account as {email: string, password: string})
    const proModule = watchResponses(page, PRO_MODULE_URL)
    const records = watchResponses(page, RECORD_EXPORT_URL)

    // Step 1: open the tab as soon as the session is up — in a fresh
    // context OPFS is empty, so the artifact cannot exist before this load's
    // writer runs, and the button must say so.
    const glbLogs = await openLiveModel(page, {isSignedIn: true})
    await openExportTab(page)
    const button = page.getByTestId('export-glb-button')
    // One snapshot, taken in one turn of the page, so the label and the
    // store cannot disagree about when the artifact arrived.
    const before = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const el = document.querySelector('[data-testid="export-glb-button"]') as HTMLButtonElement | null
      const state = (window as any).useStore?.getState?.() ?? (window as any).store?.getState?.()
      /* eslint-enable @typescript-eslint/no-explicit-any */
      return {label: el?.textContent?.trim() ?? null, isDisabled: el?.disabled ?? null, hasArtifact: Boolean(state?.glbArtifact)}
    })
    if (before.hasArtifact) {
      noteUnverified(testInfo, 'step 1: the writer finished before the Export tab opened, so "Preparing GLB…" was not observed')
    } else {
      expect(before).toEqual({label: 'Preparing GLB…', isDisabled: true, hasArtifact: false})
    }
    await waitForArtifactWritten(page, glbLogs)
    await expect(button).toBeEnabled()
    await expect(button).toHaveText('Export GLB')

    // Step 2, Pro: nothing new on the tab — no allowance line, no Pro chip.
    await expect(page.getByTestId('export-free-remaining')).toHaveCount(0)
    await expect(page.getByTestId('export-pro-chip')).toHaveCount(0)

    await dismissLoadSnackbar(page)
    await setPortable(page, false)
    await waitForCodecSizing(page)
    const withMetadata = await selectCompression(page, 'none')

    const first = await clickExportAndDownload(page)
    expect(first.name).toBe('index.glb')
    expect(glbFramingProblems(first.bytes)).toEqual([])
    expect(first.bytes.byteLength).toBe(withMetadata)
    expect((await validateGlb(first.bytes)).errors).toEqual([])
    expect((await loadGlbInThree(first.bytes)).triangleCount).toBeGreaterThan(0)
    // Step 7, as far as an engine shows it: a download event, and the page
    // is still the model — not navigated to an inline view of the bytes.
    expect(new URL(page.url()).pathname).toBe(LIVE_MODEL_PATH)

    // Step 3: the exporter came from the gated function, as private code.
    expect(proModule).toHaveLength(1)
    expect(proModule[0].status).toBe(HTTP_OK)
    expect(proModule[0].headers['content-type']).toMatch(/^text\/javascript/)
    // Directives, not the string: Netlify's edge re-serializes the header
    // the function set as `private, no-store` to `private,no-store`.
    expect(cacheDirectives(proModule[0].headers['cache-control'])).toEqual(['no-store', 'private'])
    // A Pro delivery is never charged (#1939 §4.8): no free-export row id.
    expect(proModule[0].headers['x-bldrs-export-id']).toBeUndefined()

    // Step 8: the "Exported …" message reads over the still-open dialog, and
    // nothing pushes the page sideways (the mobile projects' half).
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByTestId('snackbar')).toContainText('Exported')
    await expectSnackbarOnTop(page)
    await expectNoHorizontalScroll(page)

    // Step 5: metadata off is a smaller file with no BLDRS_ anywhere in its
    // JSON — and the first file, with it on, had some.
    expect(glbJsonText(first.bytes)).toContain('BLDRS_')
    const stripped = await toggleMetadata(page)
    expect(stripped).toBeLessThan(withMetadata)
    const second = await clickExportAndDownload(page)
    expect(glbFramingProblems(second.bytes)).toEqual([])
    expect(second.bytes.byteLength).toBe(stripped)
    expect(glbJsonText(second.bytes)).not.toContain('BLDRS_')
    expect((await validateGlb(second.bytes)).errors).toEqual([])
    // Step 3: the second export did not fetch the module again (memoised).
    expect(proModule).toHaveLength(1)

    // Step 6, server half: each export was recorded through the real
    // record-export → Management API path, and the record is the file.
    // The POST is fire-and-forget after the download, so wait for both; and
    // pair each with its file by size, which the two files do not share.
    await expect.poll(() => records.filter((r) => r.method === 'POST').length).toBeGreaterThanOrEqual(2)
    const recorded = records.filter((r) => r.method === 'POST')
    for (const file of [first, second]) {
      const post = recorded.find((r) => JSON.parse(r.requestBody ?? '{}').bytes === file.bytes.byteLength)
      expect(post, `a record-export POST for the ${file.bytes.byteLength}-byte file`).toBeDefined()
      const sent = JSON.parse(post?.requestBody ?? '{}')
      expect(post?.status).toBe(HTTP_OK)
      expect(sent.format).toBe('glb')
      expect(sent.key).toContain('index.ifc')
      const stored = JSON.parse(await post?.body ?? '{}').exports as Array<{id: string, bytes: number}>
      expect(stored.find((row) => row.id === sent.id)?.bytes).toBe(file.bytes.byteLength)
    }
    // Step 6, UI half: the history list is dormant on main (§4.5).
    if (await page.getByTestId('exports-list').count() === 0) {
      noteUnverified(testInfo, 'step 6: the export history list is not mounted on this deploy ' +
        '(glb-export-premium.md §4.5, dormant), so only the server record was checked')
    }
  })

  test('a reload hits the cache, enables Export at once, exports the same bytes (step 4)', async ({page, context}, testInfo) => {
    test.setTimeout(LIVE_TEST_TIMEOUT_MS)
    const glbLogs = await proWithArtifact(page, context, testInfo)
    const exportOnce = async () => {
      await openExportTab(page)
      await dismissLoadSnackbar(page)
      await setPortable(page, false)
      await waitForCodecSizing(page)
      await selectCompression(page, 'none')
      return (await clickExportAndDownload(page)).bytes
    }
    const before = await exportOnce()

    resetGlbLogs(glbLogs)
    await page.reload({waitUntil: 'domcontentloaded'})
    await waitForModelReady(page, LIVE_TEST_TIMEOUT_MS)
    await waitForGlbLog(glbLogs, 'cache HIT', LIVE_TEST_TIMEOUT_MS)
    // Enabled without a writer pass: a cache hit publishes the artifact.
    await openExportTab(page)
    await expect(page.getByTestId('export-glb-button')).toBeEnabled({timeout: 10_000})
    expect(glbLogs.some((line) => line.includes('writer: wrote'))).toBe(false)
    await page.keyboard.press('Escape')

    const after = await exportOnce()
    expect(after.byteLength).toBe(before.byteLength)
    expect(after.every((byte, i) => byte === before[i]), 'the same bytes as before the reload').toBe(true)
  })

  test('Meshopt and Draco: each settles, weighs what it said, opens in three.js (step 5b)', async ({page, context}, testInfo) => {
    test.setTimeout(LIVE_TEST_TIMEOUT_MS)
    // DRACO is the codec that fetches a script and a sibling .wasm at use
    // time, which is the per-browser failure 5b exists for.
    const draco = watchResponses(page, /\/static\/js\/draco\//)
    await proWithArtifact(page, context, testInfo)
    await openExportTab(page)
    await dismissLoadSnackbar(page)
    await setPortable(page, false)
    await waitForCodecSizing(page)

    const plainBytes = await selectCompression(page, 'none')
    const plain = await clickExportAndDownload(page)
    const triangles = (await loadGlbInThree(plain.bytes)).triangleCount

    for (const [mode, extension] of [['meshopt', 'EXT_meshopt_compression'], ['draco', 'KHR_draco_mesh_compression']]) {
      const promised = await selectCompression(page, mode)
      const {bytes} = await clickExportAndDownload(page)
      expect(glbFramingProblems(bytes), mode).toEqual([])
      expect(bytes.byteLength, `${mode}: the download weighs what the line said`).toBe(promised)
      const json = glbJsonText(bytes)
      expect(JSON.parse(json).extensionsUsed, mode).toContain(extension)
      expect(json, `${mode}: metadata on, so BLDRS_ survives the codec`).toContain('BLDRS_')
      const validation = await validateGlb(bytes)
      expect(validation.errors, `${mode}: glTF-Validator errors`).toEqual([])
      expect((await loadGlbInThree(bytes)).triangleCount, `${mode}: three.js decodes every triangle`).toBe(triangles)
    }
    // On this small fixture only Draco is smaller than the raw file; Meshopt
    // brings quantization overhead that a model this size does not repay
    // (exportGlb.spec.ts#COMPRESSION_CODECS has the measurement).
    expect(await selectCompression(page, 'draco')).toBeLessThan(plainBytes)

    const dracoOk = draco.filter((r) => r.status === HTTP_OK)
    expect(dracoOk.some((r) => /\.js(\?|$)/.test(r.url)), 'the Draco script was served').toBe(true)
    const wasm = dracoOk.find((r) => /\.wasm(\?|$)/.test(r.url))
    expect(wasm, 'the Draco .wasm was served').toBeDefined()
    expect(wasm?.headers['content-type']).toBe('application/wasm')
  })

  test('Portable: named hierarchy, no instancing extension, reopens pickable (step 5c)', async ({page, context}, testInfo) => {
    test.setTimeout(LIVE_TEST_TIMEOUT_MS * 2)
    await proWithArtifact(page, context, testInfo)
    await openExportTab(page)
    await dismissLoadSnackbar(page)
    // On when the tab opens (#1831): asserted, not set.
    await expect(page.getByTestId('export-portable').locator('input')).toBeChecked()
    await waitForCodecSizing(page)

    const promised = await selectCompression(page, 'none')
    const portable = await clickExportAndDownload(page)
    expect(glbFramingProblems(portable.bytes)).toEqual([])
    expect(portable.bytes.byteLength).toBe(promised)
    // What 3dviewer.net refuses in the native export.
    expect(JSON.parse(glbJsonText(portable.bytes)).extensionsUsed ?? []).not.toContain('EXT_mesh_gpu_instancing')
    expect((await validateGlb(portable.bytes)).errors).toEqual([])
    const loaded = await loadGlbInThree(portable.bytes)
    // What the three.js editor's outline shows: the named chain, not mesh_N.
    expect(hasNodeChain(loaded.paths, [...SPATIAL_CHAIN, LEAF_LABEL])).toBe(true)

    await selectCompression(page, 'draco')
    const withDraco = await clickExportAndDownload(page)
    expect(hasNodeChain((await loadGlbInThree(withDraco.bytes)).paths, [...SPATIAL_CHAIN, LEAF_LABEL])).toBe(true)

    // Reopening the portable export in Share (#1849).
    const savedPath = testInfo.outputPath('portable.glb')
    await writeFile(savedPath, portable.bytes)
    await page.keyboard.press('Escape')
    await reopenLocalGlb(page, savedPath)
    await waitForModelReady(page, LIVE_TEST_TIMEOUT_MS)
    await expectReopenedModelIsPickable(page)
  })

  test('.glb.gz reopens by Open dialog and by drag-in; a .spz still loads (step 10)', async ({page, context}, testInfo) => {
    test.setTimeout(LIVE_TEST_TIMEOUT_MS * 2)
    await proWithArtifact(page, context, testInfo)
    await openExportTab(page)
    await dismissLoadSnackbar(page)
    await setPortable(page, false)
    await waitForCodecSizing(page)
    const rawBytes = await selectCompression(page, 'none')
    const gzipped = await toggleGzip(page)

    const {bytes, name} = await clickExportAndDownload(page)
    expect(name).toMatch(/\.glb\.gz$/)
    expect(bytes.byteLength).toBe(gzipped)
    expect(isGzip(bytes)).toBe(true)
    const inflated = new Uint8Array(gunzipSync(bytes))
    expect(glbFramingProblems(inflated)).toEqual([])
    expect(inflated.byteLength).toBe(rawBytes)
    const savedPath = testInfo.outputPath('index.glb.gz')
    await writeFile(savedPath, bytes)
    await page.keyboard.press('Escape')

    // The Open dialog's Local tab.
    await openLocalFile(page, savedPath, /\/share\/v\/new\/[^/]+\.glb/)
    await waitForModelReady(page, LIVE_TEST_TIMEOUT_MS)
    await expectReopenedModelIsPickable(page)

    // Drag-in, onto the viewer.
    await page.keyboard.press('Escape')
    const beforeDrop = page.url()
    await dropFile(page, savedPath, 'index.glb.gz', 'application/gzip')
    await expect(page).not.toHaveURL(beforeDrop, {timeout: LIVE_TEST_TIMEOUT_MS})
    await expect(page).toHaveURL(/\/share\/v\/new\/[^/]+\.glb/)
    await waitForModelReady(page, LIVE_TEST_TIMEOUT_MS)
    await expectReopenedModelIsPickable(page)

    // A .spz IS a gzip stream, and must reach the splat loader still
    // compressed rather than be unwrapped as a .glb.gz envelope would be.
    await page.keyboard.press('Escape')
    const spzPath = testInfo.outputPath('point.spz')
    await writeFile(spzPath, makeSpz())
    await dropFile(page, spzPath, 'point.spz', 'application/octet-stream')
    await expect(page).toHaveURL(/\/share\/v\/new\/[^/]+\.spz/, {timeout: LIVE_TEST_TIMEOUT_MS})
    // Ready, and no "Load failed": a .spz the splat loader cannot read shows
    // that alert and never sets data-model-ready (checked against a corrupt
    // one while writing this).
    await waitForModelReady(page, LIVE_TEST_TIMEOUT_MS)
    await expect(page.getByText(/Load failed|Loader error|Unhandled error in parse|Could not guess filetype/)).toHaveCount(0)
  })
})


/**
 * Drop a file from disk onto the viewer, as a drag from the desktop would.
 *
 * @param page the page
 * @param path the file on disk
 * @param name the name the browser should see
 * @param type its MIME type
 */
async function dropFile(page: Page, path: string, name: string, type: string) {
  const base64 = (await readFile(path)).toString('base64')
  const dataTransfer = await page.evaluateHandle(({data, fileName, mime}) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes], fileName, {type: mime}))
    return transfer
  }, {data: base64, fileName: name, mime: type})
  const dropzone = page.getByTestId('cadview-dropzone')
  await dropzone.dispatchEvent('dragenter', {dataTransfer})
  await dropzone.dispatchEvent('dragover', {dataTransfer})
  await dropzone.dispatchEvent('drop', {dataTransfer})
}
