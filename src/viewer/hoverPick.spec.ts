import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {captureGlbLogs, resetGlbLogs, waitForGlbLog} from '../tests/e2e/glbLogs'
import {waitForModelReady} from '../tests/e2e/models'
import {clearOpfs, homepageSetup, setIsReturningUser} from '../tests/e2e/utils'


const {beforeEach} = test

// A real IFC of a few hundred instances, loaded as a batched model, so the
// pick runs through the instance tree (ifc/batchedInstanceBvh.js) once it is
// built. Copied to `__test_fixtures__/` by `yarn test-flows-build`.
const MODEL_PATH = '/share/v/p/__test_fixtures__/Momentum.ifc'
// `disableInstanceBvh` (FeatureFlags.js) builds no instance tree, so every
// pick walks every instance: the pick as it was before the tree. It is the
// reference the tree's hover and selection are compared to. `glbVerbose`
// logs the GLB cache's hit and write, which the spec waits on.
const WALK_QUERY = '?feature=glbVerbose,disableInstanceBvh'
const TREE_QUERY = '?feature=glbVerbose'
const TEST_TIMEOUT_MS = 180_000
const CACHE_TIMEOUT_MS = 60_000
const TREES_TIMEOUT_MS = 60_000
// Longer than the slowest hover interval (hoverPick.js MAX_INTERVAL_MS), so
// any trailing pick has fired.
const HOVER_SETTLE_MS = 600
const GRID_COLUMNS = 4
const GRID_ROWS = 3


/** What hovering and then double-clicking one canvas point did. */
interface PointResult {
  x: number
  y: number
  // Parent element ids the hover highlight painted, sorted.
  hovered: number[]
}


/**
 * Open the model and wait until it is ready, still, and every per-geometry
 * tree is built — which `deferredBatchedBvh` does only after the instance
 * tree, so from here the default leg picks through the instance tree.
 *
 * @param page
 * @param query {@link WALK_QUERY} or {@link TREE_QUERY}
 */
async function openSettled(page: Page, query: string) {
  await page.goto(`${MODEL_PATH}${query}`)
  await waitForModelReady(page, TEST_TIMEOUT_MS)
  await page.waitForFunction(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const model = (window as any).store?.getState?.()?.model
    let batches = 0
    let pending = 0
    model?.traverse?.((o: any) => {
      if (o.isBatchedMesh && Array.isArray(o.boundsTrees)) {
        batches++
        o.boundsTrees.forEach((tree: any, id: number) => {
          if (tree === null && o._geometryInfo[id]?.active !== false) {
            pending++
          }
        })
      }
    })
    return batches > 0 && pending === 0
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }, null, {timeout: TREES_TIMEOUT_MS})
}


/**
 * Canvas points spread over the viewport, each where the canvas (not a
 * panel or drawer) is what the pointer is over.
 *
 * @param page
 * @return points in page coordinates
 */
async function canvasPoints(page: Page): Promise<{x: number, y: number}[]> {
  return await page.evaluate(({columns, rows}) => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    const out = []
    for (let i = 0; i < columns; i++) {
      for (let j = 0; j < rows; j++) {
        const x = Math.round(rect.left + (rect.width * (i + 1) / (columns + 1)))
        const y = Math.round(rect.top + (rect.height * (j + 1) / (rows + 1)))
        if (document.elementFromPoint(x, y) === canvas) {
          out.push({x, y})
        }
      }
    }
    return out
  }, {columns: GRID_COLUMNS, rows: GRID_ROWS})
}


/**
 * Hover each point, as the user does, and read what the hover highlight
 * painted (`batchedHighlight`'s preselection layer).
 *
 * @param page
 * @param points
 * @return per point, the parents painted
 */
async function hoverEach(page: Page, points: {x: number, y: number}[]): Promise<PointResult[]> {
  const out: PointResult[] = []
  for (const {x, y} of points) {
    await page.mouse.move(x, y)
    await page.waitForTimeout(HOVER_SETTLE_MS)
    const hovered = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const parents = new Set<number>()
      ;(window as any).store.getState().model?.traverse?.((o: any) => {
        for (const batchId of o.userData?.batchedHighlight?.preSet ?? []) {
          parents.add(o.instanceParents[batchId])
        }
      })
      return [...parents].sort((a, b) => a - b)
      /* eslint-enable @typescript-eslint/no-explicit-any */
    })
    out.push({x, y, hovered})
  }
  return out
}


/**
 * Double-click a point and read the selected element ids.
 *
 * @param page
 * @param point
 * @return the store's `selectedElements`, as numbers
 */
async function doubleClickSelects(page: Page, point: {x: number, y: number}): Promise<number[]> {
  await page.mouse.dblclick(point.x, point.y)
  const handle = await page.waitForFunction(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const ids = (window as any).store.getState().selectedElements ?? []
    return ids.length > 0 ? ids.map(Number) : null
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }, null, {timeout: 10_000})
  return await handle.jsonValue()
}


/**
 * Hover picking on a batched IFC through the instance tree
 * (ifc/batchedInstanceBvh.js) and the hover scheduler (hoverPick.js). The
 * user's own action — moving the pointer over the model, then
 * double-clicking — must highlight and select exactly what it did when every
 * pick walked every instance. The same page is loaded twice, once with the
 * walk forced (`disableInstanceBvh`), and the two compared point for point.
 */
describeMobileAndDesktop('viewer/hoverPick', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    // The first load must parse and write the cache, not hit one a killed
    // run left.
    await clearOpfs(page)
  })

  test('hovering highlights, and a double-click selects, what the full walk did', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS * 3)
    // Both legs are GLB cache hits — the load PSB's hover cost was measured
    // on — so they pick against the same hydrated batches: a parse and a
    // cache hit lay instances out differently. The first load parses and
    // writes the cache.
    const glbLogs = captureGlbLogs(page)
    await page.goto(`${MODEL_PATH}${TREE_QUERY}`)
    await waitForModelReady(page, TEST_TIMEOUT_MS)
    await waitForGlbLog(glbLogs, 'writer: wrote', CACHE_TIMEOUT_MS)
    const legs: {hover: PointResult[], selected: number[]}[] = []
    let points: {x: number, y: number}[] = []
    for (const query of [WALK_QUERY, TREE_QUERY]) {
      resetGlbLogs(glbLogs)
      await openSettled(page, query)
      await waitForGlbLog(glbLogs, 'cache HIT', CACHE_TIMEOUT_MS)
      if (points.length === 0) {
        points = await canvasPoints(page)
      }
      const hover = await hoverEach(page, points)
      // Double-click the first point the hover found something at: last,
      // because on a phone a selection opens the drawer over the canvas.
      const target = hover.find((p) => p.hovered.length > 0)
      expect(target, 'the pointer must find the model somewhere').toBeDefined()
      const selected = await doubleClickSelects(page, target as PointResult)
      // The double-click selects the element the hover highlighted there.
      expect(selected).toEqual(expect.arrayContaining((target as PointResult).hovered))
      legs.push({hover, selected})
    }
    const [walk, tree] = legs
    // Enough of the pointer's path lands on the model for the comparison to
    // mean something.
    expect(walk.hover.filter((p) => p.hovered.length > 0).length).toBeGreaterThanOrEqual(2)
    expect(tree.hover).toEqual(walk.hover)
    expect(tree.selected).toEqual(walk.selected)
  })
})
