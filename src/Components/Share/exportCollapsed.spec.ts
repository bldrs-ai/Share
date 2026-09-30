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
  selectCompression,
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
 * - an Export download reopened, once per codec — None, Meshopt, Draco.
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
 */


const CODECS = ['none', 'meshopt', 'draco'] as const


/** Which elements a double-click may aim at. */
type ElementKind = 'collapsed' | 'instanced' | 'any'


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
 * @return the parent expressID that got selected
 */
async function doubleClickSelectsAnElement(page: Page, kind: ElementKind): Promise<number> {
  const candidates: Array<{parent: number; x: number; y: number}> = await page.evaluate((aimAt) => {
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
  }, kind)
  expect(candidates.length, 'there must be an element of the kind under test on screen')
    .toBeGreaterThan(0)

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
  throw new Error('double-click selected none of the elements it was aimed at')
}


/**
 * The rest of the user-visible selection: the NavTree row and the URL.
 *
 * @param page Playwright page
 */
async function expectNavTreeFollowsSelection(page: Page) {
  const panel = page.getByTestId('NavTreePanel')
  if (!await panel.isVisible()) {
    await page.getByTestId('control-button-navigation').click()
  }
  await expect(panel).toBeVisible()
  await expect(page.locator('[data-is-selected="true"]').first()).toBeVisible()
  // The element path follows the model file in the URL, before any query or
  // hash (`/index.ifc/89/112/…/396?feature=…`).
  await expect(page).toHaveURL(/\.(ifc|glb)(\/\d+)+(\?|#|$)/)
}


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
const DRACO_SEQUENTIAL = 0
const DRACO_EDGEBREAKER = 1
const GLB_HEADER_BYTES = 12
const GLB_CHUNK_HEADER_BYTES = 8


/**
 * The Draco method each node kind of an exported file was encoded with, read
 * off every primitive's bitstream header — what the file actually holds, not
 * what the encoder was asked for.
 *
 * @param bytes one exported GLB
 * @return the methods seen under collapsed nodes and under instanced ones
 */
function dracoMethodsByNodeKind(bytes: Buffer): {collapsed: Set<number>; instanced: Set<number>} {
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
  const out = {collapsed: new Set<number>(), instanced: new Set<number>()}
  for (const node of json.nodes ?? []) {
    if (!Number.isInteger(node.mesh) || !Number.isInteger(node.extras?.bldrsTableNode)) {
      continue
    }
    const kind = node.extensions?.EXT_mesh_gpu_instancing ? 'instanced' : 'collapsed'
    methodsOf(node.mesh).forEach((method: number) => out[kind].add(method))
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

  test('a hybrid Draco export is spliced, and both kinds of element reopen selectable', async ({page}) => {
    // `index.ifc` under the collapse is HYBRID — five single-placement
    // elements merge into one primitive while one shape placed twice stays an
    // instanced node — which is the file shape the per-primitive Draco method
    // exists for (`export/dracoMethodSplice.js`): the collapsed primitive must
    // be SEQUENTIAL for its rows to survive, the instanced one should be
    // EDGEBREAKER like it is with the collapse off. That takes two encoder
    // writes joined into one file, so this is the browser test of the join:
    // the method bytes prove the file went through it, and a double-click on
    // each kind proves nothing it rewrote broke decode, the witness or picking.
    // Verified red against a broken join: an un-swapped collapsed payload is
    // refused by the witness, an un-re-laid BIN never finishes loading. The two
    // methods happen to agree on this small model's accessor counts and index
    // type, so the checks on copying those live in `dracoMethodSplice.test.js`.
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
    await waitForCodecSizing(page)
    const path = await exportWith(page, 'draco', 'hybrid')
    await page.keyboard.press('Escape')

    // One file, two methods: a single-write encode (either method) fails here.
    const methods = dracoMethodsByNodeKind(await readFile(path))
    expect([...methods.collapsed], 'collapsed primitives: SEQUENTIAL').toEqual([DRACO_SEQUENTIAL])
    expect([...methods.instanced], 'instanced primitives: EDGEBREAKER').toEqual([DRACO_EDGEBREAKER])

    resetGlbLogs(glbLogs)
    await reopenLocalGlb(page, path)
    await waitForModelReady(page)
    await dismissLoadSnackbar(page)
    await waitForGlbLog(glbLogs, 'hydrated instance-table', EXPORT_TEST_TIMEOUT_MS)
    const hydrated = glbLogs.find((l) => l.includes('collapsed table(s)')) ?? ''
    expect(Number(/(\d+) collapsed table/.exec(hydrated)?.[1]), 'collapsed tables hydrated')
      .toBeGreaterThan(0)
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
    await loadModelAndWaitForArtifact(page)
    await setSubscriptionTier(page, 'sharePro')
    await auth0Login(page)
    await openExportTab(page)
    await dismissLoadSnackbar(page)
    await waitForCodecSizing(page)
    const path = await exportWith(page, 'draco', 'instanced')
    await page.keyboard.press('Escape')

    resetGlbLogs(glbLogs)
    await reopenLocalGlb(page, path)
    await waitForModelReady(page)
    await dismissLoadSnackbar(page)
    await waitForGlbLog(glbLogs, 'hydrated instance-table', EXPORT_TEST_TIMEOUT_MS)
    await doubleClickSelectsAnElement(page, 'any')
    await expectNavTreeFollowsSelection(page)
  })
})
