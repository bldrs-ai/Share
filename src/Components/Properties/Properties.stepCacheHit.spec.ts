import {Page, expect, test} from '@playwright/test'
import {captureGlbLogs, resetGlbLogs, waitForGlbLog} from '../../tests/e2e/glbLogs'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {setupVirtualPathIntercept, waitForModelReady} from '../../tests/e2e/models'
import {clearOpfs, homepageSetup, setIsReturningUser} from '../../tests/e2e/utils'


/**
 * STEP Properties on a cache-hit GLB: double-click a part in the scene and
 * the panel shows that part.
 *
 * A STEP scene pick selects the geometry's shared product_definition_shape
 * (the batch's `instanceParents` entry). A live parse can answer any id, so
 * the panel rendered it. The cached artifact cannot: BLDRS_element_properties
 * is seeded from spatial-tree nodes only, a shape is not one, and the panel
 * came up "Please select an element" with the part visibly highlighted. The
 * pick also records the clicked occurrence, whose leaf IS a tree node, and
 * `CadView.jsx` now falls back to it. This spec is the user's action on the
 * one path that broke; it goes red with that fallback removed.
 *
 * The expectation is read off the artifact's own spatial tree (the leaf's
 * Name), not hard-coded, so it names whichever part the pick landed on.
 */
const AS1_PATH = '/share/v/gh/bldrs-ai/test-models/main/step/nist/as1-colorless.stp'
const FLAGS = '?feature=glbVerbose'
const TEST_TIMEOUT_MS = 180_000
const CACHE_TIMEOUT_MS = 60_000
// A STEP parse behind a Conway wasm boot; the shared default is sized for
// the small IFC fixtures.
const MODEL_READY_TIMEOUT_MS = 60_000


/**
 * Double-click parts until one is selected with an occurrence path.
 *
 * @param page Playwright page
 * @return the selected occurrence's leaf expressID and its tree Name
 */
async function doubleClickAPart(page: Page): Promise<{leaf: number, name: string}> {
  const points: Array<{x: number, y: number}> = await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const w = window as any
    const state = (w.store ?? w.useStore).getState()
    const camera = state.viewer.context.getCamera()
    const rect = (document.querySelector('canvas') as HTMLCanvasElement).getBoundingClientRect()
    const out: Array<{x: number, y: number}> = []
    const visit = (mesh: any) => {
      if (!mesh?.isBatchedMesh || !mesh.instanceParents) {
        return
      }
      mesh.updateMatrixWorld(true)
      mesh.computeBoundingBox()
      const Box3 = mesh.boundingBox.constructor
      const Matrix4 = mesh.matrixWorld.constructor
      for (let batchId = 0; batchId < mesh.instanceParents.length; batchId++) {
        const box = new Box3()
        const matrix = new Matrix4()
        mesh.getBoundingBoxAt(mesh.getGeometryIdAt(batchId), box)
        mesh.getMatrixAt(batchId, matrix)
        const centre = box.applyMatrix4(matrix.premultiply(mesh.matrixWorld))
          .getCenter(mesh.boundingBox.min.clone()).project(camera)
        // Inside the viewport, off its very edge (normalised device coords).
        const ON_SCREEN = 0.9
        if (Math.abs(centre.x) < ON_SCREEN && Math.abs(centre.y) < ON_SCREEN) {
          out.push({
            x: rect.left + (((centre.x + 1) / 2) * rect.width),
            y: rect.top + (((1 - centre.y) / 2) * rect.height),
          })
        }
      }
    }
    if (state.model?.traverse) {
      state.model.traverse(visit)
    } else {
      visit(state.model)
    }
    return out
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
  expect(points.length, 'a part must be on screen').toBeGreaterThan(0)

  const MAX_TRIES = 6
  for (const {x, y} of points.slice(0, MAX_TRIES)) {
    await page.mouse.dblclick(x, y)
    const picked = await page.waitForFunction(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const w = window as any
      const state = (w.store ?? w.useStore).getState()
      const path = state.selectedOccurrencePath
      if (!Array.isArray(path) || path.length === 0) {
        return null
      }
      const leaf = Number(path[path.length - 1])
      let name: string | null = null
      const walk = (node: any) => {
        if (!node || name !== null) {
          return
        }
        if (node.expressID === leaf) {
          name = node.Name?.value ?? ''
          return
        }
        for (const child of node.children ?? []) {
          walk(child)
        }
      }
      walk(state.model?.userData?.bldrsSpatialTree)
      return name === null ? null : {leaf, name}
      /* eslint-enable @typescript-eslint/no-explicit-any */
    }, null, {timeout: 3000}).then((handle) => handle.jsonValue(), () => null)
    if (picked) {
      return picked
    }
  }
  throw new Error('double-click selected no STEP occurrence')
}


describeMobileAndDesktop('View 100: STEP Properties on a cache-hit GLB', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await clearOpfs(page)
  })

  test('double-clicking a part shows that part in Properties', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    const glbLogs = captureGlbLogs(page)
    // The intercept derives the fixture URL from the CLEAN path; a query
    // suffix would land inside its filePath.
    await setupVirtualPathIntercept(page, AS1_PATH, '')

    // Load 1 — cache MISS writes the artifact.
    await page.goto(`${AS1_PATH}${FLAGS}`, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page, MODEL_READY_TIMEOUT_MS)
    await waitForGlbLog(glbLogs, 'writer: wrote', CACHE_TIMEOUT_MS)

    // Load 2 — cache HIT, the path that broke.
    resetGlbLogs(glbLogs)
    await page.goto(`${AS1_PATH}${FLAGS}`, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page, MODEL_READY_TIMEOUT_MS)
    await waitForGlbLog(glbLogs, 'cache HIT', CACHE_TIMEOUT_MS)
    await waitForGlbLog(glbLogs, 'hydrated Properties panel from BLDRS_element_properties', CACHE_TIMEOUT_MS)

    const {leaf, name} = await doubleClickAPart(page)
    expect(name, 'the picked part has a name to show').not.toBe('')

    const panel = page.getByTestId('PropertiesPanel')
    if (!await panel.isVisible()) {
      await page.getByTestId('control-button-properties').click()
    }
    await expect(panel).toBeVisible()
    await expect(panel).not.toContainText('Please select an element')
    await expect(panel.locator('tr').filter({hasText: 'Express Id'})).toContainText(`${leaf}`)
    await expect(panel.locator('tr').filter({hasText: 'Name'}).first()).toContainText(name)
  })
})
