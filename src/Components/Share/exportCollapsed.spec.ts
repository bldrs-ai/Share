import {Page, expect, test} from '@playwright/test'
import {
  EXPORT_MODEL_PATH,
  EXPORT_FLAGS,
  EXPORT_TEST_TIMEOUT_MS,
  dismissLoadSnackbar,
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


/**
 * Double-click an element in the scene and wait for it to be selected.
 *
 * Aims at a COLLAPSED element when `collapsedOnly` (one whose batch geometry
 * id is a synthesised range — `batchedGeometryRanges.js#BATCHED_GEOMETRY_
 * RANGE_IDS`), by projecting its bounds' centre to the canvas. Candidates are
 * tried in turn because the one in front at that pixel may be a different
 * element; the assertion is that SOME collapsed element, clicked, selects
 * itself. Broken picking selects none of them.
 *
 * @param page Playwright page
 * @param collapsedOnly aim only at collapsed elements
 * @return the parent expressID that got selected
 */
async function doubleClickSelectsAnElement(page: Page, collapsedOnly: boolean): Promise<number> {
  const candidates: Array<{parent: number; x: number; y: number}> = await page.evaluate((onlyRanges) => {
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
        if (onlyRanges && !mesh.bldrsGeometryRangeIds?.has(geometryId)) {
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
  }, collapsedOnly)
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
    await doubleClickSelectsAnElement(page, true)
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
        await doubleClickSelectsAnElement(page, true)
        await expectNavTreeFollowsSelection(page)
      })
    }
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
    await doubleClickSelectsAnElement(page, false)
    await expectNavTreeFollowsSelection(page)
  })
})
