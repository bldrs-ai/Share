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
 * @param excludeLeaf keep trying until a part OTHER than this one is picked
 * @param minDepth keep trying until the occurrence path is at least this long
 * @return the selected occurrence's leaf expressID, its tree Name, and its path
 */
async function doubleClickAPart(page: Page, excludeLeaf: number | null = null, minDepth = 1):
    Promise<{leaf: number, name: string, path: number[]}> {
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
    const picked = await page.waitForFunction(({excluded, depth}) => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const w = window as any
      const state = (w.store ?? w.useStore).getState()
      const path = state.selectedOccurrencePath
      if (!Array.isArray(path) || path.length < Math.max(depth, 1)) {
        return null
      }
      const leaf = Number(path[path.length - 1])
      if (leaf === excluded) {
        return null
      }
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
      return name === null ? null : {leaf, name, path: path.map(Number)}
      /* eslint-enable @typescript-eslint/no-explicit-any */
    }, {excluded: excludeLeaf, depth: minDepth}, {timeout: 3000}).then((handle) => handle.jsonValue(), () => null)
    if (picked) {
      return picked
    }
  }
  throw new Error('double-click selected no STEP occurrence')
}


/**
 * Load AS1 twice: a cache MISS writes the artifact, then a cache HIT loads it.
 *
 * @param page Playwright page
 */
async function loadCacheHit(page: Page) {
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
}


describeMobileAndDesktop('View 100: STEP Properties on a cache-hit GLB', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await clearOpfs(page)
  })

  test('double-clicking a part shows that part in Properties', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await loadCacheHit(page)

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

  test('a part with no cached record keeps the empty state, not a parent\'s properties', async ({page}) => {
    // Codex on #1876: the fallback resolves the picked occurrence's LEAF
    // only. Walking on up the path when the leaf is missing would show a
    // parent assembly beside a scene and NavTree that select the part.
    //
    // The panel's button is disabled while nothing resolves, so open it on
    // an ordinary pick first, then make the NEXT pick's leaf unresolvable
    // and pick a different part: the panel must fall back to its empty
    // state rather than to an ancestor.
    test.setTimeout(TEST_TIMEOUT_MS)
    await loadCacheHit(page)
    const first = await doubleClickAPart(page)
    const panel = page.getByTestId('PropertiesPanel')
    if (!await panel.isVisible()) {
      await page.getByTestId('control-button-properties').click()
    }
    await expect(panel.locator('tr').filter({hasText: 'Express Id'})).toContainText(`${first.leaf}`)

    await page.evaluate((keep) => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const w = window as any
      const store = w.store ?? w.useStore
      const model = store.getState().model
      const original = model.getItemProperties.bind(model)
      model.getItemProperties = (id: number) => {
        const path = store.getState().selectedOccurrencePath
        const leaf = Array.isArray(path) && path.length > 0 ? Number(path[path.length - 1]) : null
        return Number(id) === leaf && leaf !== keep ? Promise.resolve(null) : original(id)
      }
      /* eslint-enable @typescript-eslint/no-explicit-any */
    }, first.leaf)

    // A part nested at least one level deep, so there IS an ancestor for a
    // walk to land on — and that ancestor must resolve, or the walk would
    // come up empty too and this test could not tell the two apart.
    const MIN_DEPTH = 2
    const second = await doubleClickAPart(page, first.leaf, MIN_DEPTH)
    const parent = second.path[second.path.length - 2]
    const parentResolves = await page.evaluate(async (id) => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const w = window as any
      return Boolean(await (w.store ?? w.useStore).getState().model.getItemProperties(id))
      /* eslint-enable @typescript-eslint/no-explicit-any */
    }, parent)
    expect(parentResolves, `the picked part's parent #${parent} has a cached record`).toBe(true)
    await expect(panel).toContainText('Please select an element')
    await expect(panel.locator('tr').filter({hasText: 'Express Id'})).toHaveCount(0)
  })
})
