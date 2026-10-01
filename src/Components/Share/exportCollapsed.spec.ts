import {readFile} from 'node:fs/promises'
import {Page, expect, test} from '@playwright/test'
import {
  EXPORT_MODEL_PATH,
  EXPORT_FLAGS,
  EXPORT_TEST_TIMEOUT_MS,
  dismissLoadSnackbar,
  glbJsonChunk,
  loadModelAndWaitForArtifact,
  openExportTab,
  reopenLocalGlb,
  routeProModule,
  doubleClickSelectsAnElement,
  expectNavTreeFollowsSelection,
  selectCompression,
  setPortable,
  setSubscriptionTier,
  waitForCodecSizing,
} from '../../tests/e2e/export'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {captureGlbLogs, resetGlbLogs, waitForGlbLog} from '../../tests/e2e/glbLogs'
import {waitForModelReady} from '../../tests/e2e/models'
import {
  auth0Login,
  clearOpfs,
  homepageSetup,
  setIsReturningUser,
  setupAuthenticationIntercepts,
} from '../../tests/e2e/utils'


/**
 * The collapsed artifact (share-140 #1871) is only as good as what a USER can
 * do with it: double-click an element in the scene and see it selected — in
 * the store, in the NavTree, in the URL. This spec asserts exactly that, on
 * every way a collapsed model reaches the viewer:
 *
 * - the OPFS cache HIT (the collapsed slot, hydrated through ranges);
 * - an Export download reopened, once per codec — None, Meshopt, Draco —
 *   with Portable explicitly OFF: the subject is the batched-native file,
 *   whose collapsed nodes Portable would split (`glbPortable.js`), and since
 *   #1831 Portable is the default.
 *
 * Why it exists: the first cut of #1871 passed every unit test and the cache
 * E2E, and the owner's first smoke still found a Draco export of DSA that
 * rendered perfectly and could not be selected. Every test below the
 * double-click had asserted a proxy — raycast returns the right batchId,
 * per-element bounds match — and none had performed the action. Draco merged
 * the collapsed primitive's vertices across elements and edgebreaker
 * reordered its triangles, the range canary correctly refused the table, and
 * the fail-soft fallback (render, don't pick) made that silent. So the
 * assertion here is the user-visible one, and the pick is aimed at a
 * COLLAPSED element specifically: a model is hybrid, and a click that lands
 * on an instanced part proves nothing about the ranges.
 *
 * The collapse-OFF Draco export rides along as the baseline, so a regression
 * in the shared pick path is distinguishable from one in the collapse.
 *
 * `glbCollapse` is default-on now, so the `glbCollapse` the collapsed tests
 * pass is redundant; it stays so they keep naming what they test. The
 * baseline is the one that MUST name its layout, now with
 * `disableGlbCollapse`: the default would silently make it a second collapsed
 * test and stop it being a baseline at all.
 */


const CODECS = ['none', 'meshopt', 'draco'] as const


/**
 * Export the current model with `mode` and save it under a name the local
 * loader recognises.
 *
 * @param page Playwright page
 * @param mode codec
 * @param name file stem
 * @return the saved path
 */
async function exportWith(page: Page, mode: string, name: string): Promise<string> {
  await selectCompression(page, mode)
  const download = page.waitForEvent('download')
  await page.getByTestId('export-glb-button').click()
  const path = test.info().outputPath(`${name}-${mode}.glb`)
  await (await download).saveAs(path)
  return path
}


/** A Draco bitstream's method byte: 'DRACO', major, minor, encoder type, METHOD. */
const DRACO_METHOD_BYTE = 8
const DRACO_EDGEBREAKER = 1
/** The row tag's glTF semantic (`loader/bldrsInstanceTables.js#ROW_TAG_SEMANTIC`). */
const ROW_TAG_SEMANTIC = '_BLDRS_ROW'
const GLB_HEADER_BYTES = 12
const GLB_CHUNK_HEADER_BYTES = 8


/** What one node kind's primitives hold in an exported Draco file. */
type DracoKind = {methods: Set<number>; primitives: number; tagged: number}


/**
 * The Draco method each node kind of an exported file was encoded with, read
 * off every primitive's bitstream header — what the file actually holds, not
 * what the encoder was asked for — and how many of its primitives carry the
 * row tag, in both the glTF attributes and the Draco extension's.
 *
 * @param bytes one exported GLB
 * @return per kind, the methods seen, the primitive count and the tagged count
 */
function dracoByNodeKind(bytes: Buffer): {collapsed: DracoKind; instanced: DracoKind} {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const json: any = glbJsonChunk(bytes)
  const jsonLength = bytes.readUInt32LE(GLB_HEADER_BYTES)
  const binStart = GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES + jsonLength + GLB_CHUNK_HEADER_BYTES
  const methodsOf = (meshIndex: number) => json.meshes[meshIndex].primitives.map((primitive: any) => {
    const view = json.bufferViews[primitive.extensions.KHR_draco_mesh_compression.bufferView]
    const at = binStart + (view.byteOffset ?? 0)
    expect(bytes.subarray(at, at + 5).toString('latin1')).toBe('DRACO')
    return bytes[at + DRACO_METHOD_BYTE]
  })
  const kinds = () => ({methods: new Set<number>(), primitives: 0, tagged: 0})
  const out = {collapsed: kinds(), instanced: kinds()}
  for (const node of json.nodes ?? []) {
    if (!Number.isInteger(node.mesh) || !Number.isInteger(node.extras?.bldrsTableNode)) {
      continue
    }
    const kind = out[node.extensions?.EXT_mesh_gpu_instancing ? 'instanced' : 'collapsed']
    methodsOf(node.mesh).forEach((method: number) => kind.methods.add(method))
    for (const primitive of json.meshes[node.mesh].primitives) {
      kind.primitives++
      if (ROW_TAG_SEMANTIC in primitive.attributes &&
          ROW_TAG_SEMANTIC in primitive.extensions.KHR_draco_mesh_compression.attributes) {
        kind.tagged++
      }
    }
  }
  return out
  /* eslint-enable @typescript-eslint/no-explicit-any */
}


describeMobileAndDesktop('Share 140: a collapsed model stays selectable (#1871)', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setupAuthenticationIntercepts(page)
    await setIsReturningUser(page.context())
    await clearOpfs(page)
  })

  test('cache hit and every export codec reopen with double-click selection', async ({page}) => {
    test.setTimeout(EXPORT_TEST_TIMEOUT_MS * 4)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))
    const glbLogs = captureGlbLogs(page)

    await routeProModule(page)
    await loadModelAndWaitForArtifact(page, 'glbCollapse')
    // The writer collapsed something, or nothing below tests the ranges.
    expect(glbLogs.some((l) => /batched writer: collapsed [1-9]\d* single-placement/.test(l)))
      .toBe(true)

    // Cache HIT: the collapsed slot, hydrated through ranges.
    resetGlbLogs(glbLogs)
    await page.goto(`${EXPORT_MODEL_PATH}${EXPORT_FLAGS},glbCollapse`, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
    await waitForGlbLog(glbLogs, 'cache HIT', EXPORT_TEST_TIMEOUT_MS)
    await waitForGlbLog(glbLogs, 'collapsed table(s)', EXPORT_TEST_TIMEOUT_MS)
    await dismissLoadSnackbar(page)
    await doubleClickSelectsAnElement(page, 'collapsed')
    await expectNavTreeFollowsSelection(page)

    // Every codec's download, reopened the way a user brings a file back.
    await setSubscriptionTier(page, 'sharePro')
    await auth0Login(page)
    await openExportTab(page)
    await dismissLoadSnackbar(page)
    // The batched-native download: the collapsed ranges, their canary and
    // the per-primitive Draco method all live in its instance tables and its
    // EXT_mesh_gpu_instancing nodes, which Portable (the default) rewrites.
    await setPortable(page, false)
    await waitForCodecSizing(page)
    const paths = []
    for (const mode of CODECS) {
      paths.push({mode, path: await exportWith(page, mode, 'collapsed')})
    }
    await page.keyboard.press('Escape')

    for (const {mode, path} of paths) {
      await test.step(`reopen the ${mode} export`, async () => {
        resetGlbLogs(glbLogs)
        await reopenLocalGlb(page, path)
        await waitForModelReady(page)
        await dismissLoadSnackbar(page)
        // Hydrated, and through the collapsed path — not the plain-GLTF
        // fallback that renders fine and picks nothing.
        await waitForGlbLog(glbLogs, 'hydrated instance-table', EXPORT_TEST_TIMEOUT_MS)
        const hydrated = glbLogs.find((l) => l.includes('collapsed table(s)')) ?? ''
        expect(Number(/(\d+) collapsed table/.exec(hydrated)?.[1]), `${mode}: collapsed tables hydrated`)
          .toBeGreaterThan(0)
        await doubleClickSelectsAnElement(page, 'collapsed')
        await expectNavTreeFollowsSelection(page)
      })
    }
  })

  test('a hybrid Draco export is one EDGEBREAKER write, and both kinds of element reopen selectable', async ({page}) => {
    // `index.ifc` under the collapse is HYBRID — five single-placement
    // elements merge into one primitive while one shape placed twice stays an
    // instanced node. Every primitive is EDGEBREAKER, the collapsed one
    // carrying the per-vertex row tag its reader regroups triangles by
    // (`loader/bldrsInstanceTables.js#ROW_TAG_SEMANTIC`), so this is the
    // browser test of the tag through three's own DRACOLoader: the method
    // bytes and the attribute prove the file is the tagged layout, the
    // `regrouped` log proves the reader took the tag path rather than the
    // untagged one, and a double-click on each kind proves the rows it rebuilt
    // are the elements they claim to be.
    test.setTimeout(EXPORT_TEST_TIMEOUT_MS * 2)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))
    const glbLogs = captureGlbLogs(page)

    await routeProModule(page)
    await loadModelAndWaitForArtifact(page, 'glbCollapse')
    const writer = glbLogs.find((l) => l.includes('batched writer: collapsed')) ?? ''
    const [, rows, kept] = /collapsed (\d+) single-placement.*; (\d+) instanced node/.exec(writer) ?? []
    expect(Number(rows), 'collapsed rows in the artifact').toBeGreaterThan(0)
    expect(Number(kept), 'instanced nodes kept beside them').toBeGreaterThan(0)

    await setSubscriptionTier(page, 'sharePro')
    await auth0Login(page)
    await openExportTab(page)
    await dismissLoadSnackbar(page)
    // The batched-native download: the collapsed ranges, their canary and
    // the per-primitive Draco method all live in its instance tables and its
    // EXT_mesh_gpu_instancing nodes, which Portable (the default) rewrites.
    await setPortable(page, false)
    await waitForCodecSizing(page)
    const path = await exportWith(page, 'draco', 'hybrid')
    await page.keyboard.press('Escape')

    const kinds = dracoByNodeKind(await readFile(path))
    expect([...kinds.collapsed.methods], 'collapsed primitives: EDGEBREAKER').toEqual([DRACO_EDGEBREAKER])
    expect([...kinds.instanced.methods], 'instanced primitives: EDGEBREAKER').toEqual([DRACO_EDGEBREAKER])
    expect(kinds.collapsed.primitives, 'collapsed primitives in the file').toBeGreaterThan(0)
    expect(kinds.collapsed.tagged, 'every collapsed primitive row-tagged').toBe(kinds.collapsed.primitives)
    expect(kinds.instanced.tagged, 'no instanced primitive row-tagged').toBe(0)

    resetGlbLogs(glbLogs)
    await reopenLocalGlb(page, path)
    await waitForModelReady(page)
    await dismissLoadSnackbar(page)
    await waitForGlbLog(glbLogs, 'hydrated instance-table', EXPORT_TEST_TIMEOUT_MS)
    const hydrated = glbLogs.find((l) => l.includes('collapsed table(s)')) ?? ''
    expect(Number(/(\d+) collapsed table/.exec(hydrated)?.[1]), 'collapsed tables hydrated')
      .toBeGreaterThan(0)
    expect(glbLogs.some((l) => /regrouped [1-9]\d* row-tagged triangle/.test(l)),
      'the reader regrouped by the row tag').toBe(true)
    const collapsed = await doubleClickSelectsAnElement(page, 'collapsed')
    await expectNavTreeFollowsSelection(page)
    // On the mobile form factor the NavTree panel covers the canvas, so the
    // second pick would land on it; close it before aiming again.
    await page.getByTestId('control-button-navigation').click()
    await expect(page.getByTestId('NavTreePanel')).toBeHidden()
    const instanced = await doubleClickSelectsAnElement(page, 'instanced')
    await expectNavTreeFollowsSelection(page)
    expect(instanced, 'the second pick is a different element').not.toBe(collapsed)
  })

  test('baseline: an un-collapsed Draco export reopens with selection', async ({page}) => {
    test.setTimeout(EXPORT_TEST_TIMEOUT_MS * 2)
    const glbLogs = captureGlbLogs(page)
    await routeProModule(page)
    // Explicit: the default is the collapsed artifact (#1871).
    await loadModelAndWaitForArtifact(page, 'disableGlbCollapse')
    // A baseline that quietly collapsed would be a second collapsed test.
    expect(glbLogs.some((l) => l.includes('batched writer: collapsed'))).toBe(false)
    await setSubscriptionTier(page, 'sharePro')
    await auth0Login(page)
    await openExportTab(page)
    await dismissLoadSnackbar(page)
    // The batched-native download: the collapsed ranges, their canary and
    // the per-primitive Draco method all live in its instance tables and its
    // EXT_mesh_gpu_instancing nodes, which Portable (the default) rewrites.
    await setPortable(page, false)
    await waitForCodecSizing(page)
    const path = await exportWith(page, 'draco', 'instanced')
    await page.keyboard.press('Escape')

    resetGlbLogs(glbLogs)
    await reopenLocalGlb(page, path)
    await waitForModelReady(page)
    await dismissLoadSnackbar(page)
    await waitForGlbLog(glbLogs, 'hydrated instance-table', EXPORT_TEST_TIMEOUT_MS)
    const hydrated = glbLogs.find((l) => l.includes('collapsed table(s)')) ?? ''
    expect(Number(/(\d+) collapsed table/.exec(hydrated)?.[1]), 'no collapsed tables in the baseline')
      .toBe(0)
    await doubleClickSelectsAnElement(page, 'any')
    await expectNavTreeFollowsSelection(page)
  })
})
