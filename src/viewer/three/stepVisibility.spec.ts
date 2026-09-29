import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {waitForModelReady} from '../../tests/e2e/models'
import {homepageSetup, pauseViewerRendering, setIsReturningUser} from '../../tests/e2e/utils'


/**
 * Selection, hide and isolate on STEP (and scene multi-select on IFC), where
 * a NavTree row's id is a NAUO that owns no geometry: the geometry is keyed by
 * the part's shared product_definition_shape, and each placement by its
 * occurrence path. Every operation below used to act on the row ids and so
 * reached nothing — no eye on leaf rows, Isolate blanking the model,
 * multi-select Hide and highlight doing nothing — or, for a scene shift-click,
 * picked "the whole element" instead of adding to the selection.
 *
 * `index.step` is the Bldrs logo as an assembly: seven `Together` leaf
 * occurrences under Build / Every / Thing, one batched instance each.
 */
const STEP_PATH = '/share/v/p/index.step'
const IFC_PATH = '/share/v/p/index.ifc'
const LEAF = 'Together'
const LEAF_COUNT = 7


describeMobileAndDesktop('STEP hide / isolate / multi-select', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  test('every leaf occurrence row has an eye, which hides just that occurrence', async ({page}) => {
    const {leaves} = await loadStepTree(page)
    await expect(leaves.getByTestId('hide-icon')).toHaveCount(LEAF_COUNT)
    await leaves.nth(0).getByTestId('hide-icon').click()
    await expect.poll(() => visibleInstances(page)).toBe(LEAF_COUNT - 1)
    // The open NavTree's `n:` survives the `#d:` write beside it. (Writers used
    // to re-serialize it as a bare `n`, and the next as `n:undefined`;
    // location.test.js pins both.)
    await expect.poll(() => hashToken(page, 'd')).toMatch(/^hide=/)
    expect(hashToken(page, 'n')).toBe('')
    await leaves.nth(0).getByTestId('unhide-icon').click()
    await expect.poll(() => visibleInstances(page)).toBe(LEAF_COUNT)
  })

  test('Isolate shows just the selected occurrence, and the link reopens it isolated', async ({page}) => {
    test.setTimeout(TWO_LOADS_TIMEOUT_MS)
    const {leaves} = await loadStepTree(page)
    await leaves.nth(0).getByTestId('NavTreeNodeLabel').click()
    await closeTree(page)
    await page.getByTestId('Isolate').click()
    await expect.poll(() => visibleInstances(page)).toBe(1)
    await expect.poll(() => displayToken(page)).toMatch(/^iso=o[\d.]+$/)

    await page.reload()
    await waitForModelReady(page)
    await expect.poll(() => visibleInstances(page)).toBe(1)
  })

  test('shift-clicking rows multi-selects them without selecting text; Hide and Isolate act on all', async ({page}) => {
    const {leaves} = await loadStepTree(page)
    await leaves.nth(0).getByTestId('NavTreeNodeLabel').click()
    await leaves.nth(1).getByTestId('NavTreeNodeLabel').click({modifiers: ['Shift']})
    await expect(leaves.nth(0)).toHaveAttribute('data-is-selected', 'true')
    await expect(leaves.nth(1)).toHaveAttribute('data-is-selected', 'true')
    expect(await page.evaluate(() => String(window.getSelection())), 'no text selected').toBe('')
    // Both highlight: the selection resolved to their instances.
    expect((await selection(page)).instances).toHaveLength(2)

    await closeTree(page)
    await page.getByTestId('Isolate').click()
    await expect.poll(() => visibleInstances(page)).toBe(2)
    await page.getByTestId('Isolate').click()
    await expect.poll(() => visibleInstances(page)).toBe(LEAF_COUNT)
    await page.getByTestId('Hide').click()
    await expect.poll(() => visibleInstances(page)).toBe(LEAF_COUNT - 2)
    expect(page.url()).not.toContain('undefined')
  })

  test('a link to an isolated multi-selection reopens it isolated and unpainted, as it was left', async ({page}) => {
    test.setTimeout(TWO_LOADS_TIMEOUT_MS)
    const {leaves} = await loadStepTree(page)
    await leaves.nth(0).getByTestId('NavTreeNodeLabel').click()
    await leaves.nth(1).getByTestId('NavTreeNodeLabel').click({modifiers: ['Shift']})
    await expect.poll(() => paintedInstances(page)).toBe(2)
    await closeTree(page)
    // Isolate drops the selection's cyan, so the parts show their own colours.
    await page.getByTestId('Isolate').click()
    await expect.poll(() => visibleInstances(page)).toBe(2)
    expect(await paintedInstances(page)).toBe(0)

    await page.reload()
    await waitForModelReady(page)
    await expect.poll(() => visibleInstances(page)).toBe(2)
    // Wait for the viewer to have taken the restored selection (it records
    // the ids just before it would paint), so "unpainted" isn't just "not yet".
    await expect.poll(() => page.evaluate(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).useStore.getState().viewer.getSelectedIds().length)).toBeGreaterThanOrEqual(2)
    expect(await paintedInstances(page)).toBe(0)
  })

  test('shift-double-clicking in the scene adds an occurrence, and the link reopens both selected', async ({page}) => {
    test.setTimeout(TWO_LOADS_TIMEOUT_MS)
    await loadStepTree(page)
    await closeTree(page)
    const [first, second] = await instancePoints(page, 2)
    await page.mouse.dblclick(first.x, first.y)
    await expect.poll(async () => (await selection(page)).instances).toHaveLength(1)
    await shiftDoubleClick(page, second)
    await expect.poll(async () => (await selection(page)).anchors).toHaveLength(2)
    const selected = await selection(page)
    expect(selected.instances).toHaveLength(2)
    // The path names one element; the rest ride `#sel:`.
    await expect.poll(() => hashToken(page, 'sel')).toMatch(/^e\d+,e\d+$/)

    await page.reload()
    await waitForModelReady(page)
    await expect.poll(async () => (await selection(page)).anchors.slice().sort()).toEqual(selected.anchors.slice().sort())
    expect((await selection(page)).instances.slice().sort()).toEqual(selected.instances.slice().sort())
  })
})


describeMobileAndDesktop('IFC scene multi-select', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  test('shift-double-clicking in the scene adds an element, and the link reopens both selected', async ({page}) => {
    test.setTimeout(THREE_LOADS_TIMEOUT_MS)
    await page.goto(IFC_PATH)
    await waitForModelReady(page)
    await pauseViewerRendering(page)
    await closeTree(page)
    const [first, second] = await instancePoints(page, 2)
    await page.mouse.dblclick(first.x, first.y)
    await expect.poll(async () => (await selection(page)).anchors).toHaveLength(1)
    await shiftDoubleClick(page, second)
    await expect.poll(async () => (await selection(page)).anchors).toHaveLength(2)
    const {anchors} = await selection(page)
    await expect.poll(() => hashToken(page, 'sel')).toBe(anchors.map((id) => `e${id}`).join(','))

    // Back and Forward through the multi-selection restore each state.
    await page.goBack()
    await expect.poll(async () => (await selection(page)).anchors).toEqual([anchors[0]])
    await page.goForward()
    await expect.poll(async () => (await selection(page)).anchors.slice().sort()).toEqual(anchors.slice().sort())

    await page.reload()
    await waitForModelReady(page)
    await expect.poll(async () => (await selection(page)).anchors.slice().sort()).toEqual(anchors.slice().sort())

    // Shift-click the path's own element away: the survivor stays selected,
    // and in the link, rather than the path restoring the one just dropped.
    await pauseViewerRendering(page)
    await shiftDoubleClick(page, first)
    const survivor = anchors.find((id) => id !== anchors[0])
    await expect.poll(async () => (await selection(page)).anchors).toEqual([survivor])
    await expect.poll(() => hashToken(page, 'sel')).toBe(`e${survivor}`)
    await page.reload()
    await waitForModelReady(page)
    await expect.poll(async () => (await selection(page)).anchors).toEqual([survivor])

    // Shift-click the survivor away too: the selection empties and stays so,
    // rather than the (stale) path bringing its element back when `#sel:` goes.
    await pauseViewerRendering(page)
    await shiftDoubleClick(page, second)
    await expect.poll(() => hashToken(page, 'sel')).toBe(null)
    // Let the location change the token's removal made run its course.
    await page.waitForTimeout(SETTLE_MS)
    expect((await selection(page)).anchors).toEqual([])
  })
})


// Tests that load the model two or three times.
const TWO_LOADS_TIMEOUT_MS = 90_000
const THREE_LOADS_TIMEOUT_MS = 120_000
// Long enough for the effects a location change triggers to have run.
const SETTLE_MS = 1000


/**
 * Load index.step, stop the viewer painting (these tests read state, not
 * pixels; see `pauseViewerRendering`), and open the NavTree down to the
 * leaf occurrences.
 *
 * @param page Playwright page
 * @return the leaf occurrence rows
 */
async function loadStepTree(page: Page) {
  await page.goto(STEP_PATH)
  await waitForModelReady(page)
  await pauseViewerRendering(page)
  const panel = page.getByTestId('NavTreePanel')
  if (!await panel.isVisible()) {
    await page.getByTestId('control-button-navigation').click()
  }
  await expect(panel).toBeVisible()
  for (const label of ['Bldrs', 'Build', 'Every', 'Thing']) {
    const row = panel.locator(`[data-node-label="${label}"]`).first()
    if (await row.getAttribute('data-is-expanded') === 'false') {
      await row.getByTestId('NavTreeNodeToggle').click()
    }
  }
  const leaves = panel.locator(`[data-node-label="${LEAF}"]`)
  await expect(leaves).toHaveCount(LEAF_COUNT)
  return {leaves}
}


/**
 * Close the NavTree, which covers the element controls and the scene on a
 * phone.
 *
 * @param page Playwright page
 */
async function closeTree(page: Page) {
  if (await page.getByTestId('NavTreePanel').isVisible()) {
    await page.getByTestId('control-button-navigation').click()
  }
  await expect(page.getByTestId('NavTreePanel')).not.toBeVisible()
}


/**
 * @param page Playwright page
 * @param point where to click
 * @param point.x
 * @param point.y
 */
async function shiftDoubleClick(page: Page, point: {x: number, y: number}) {
  await page.keyboard.down('Shift')
  await page.mouse.dblclick(point.x, point.y)
  await page.keyboard.up('Shift')
}


/**
 * @param page Playwright page
 * @return the store's selection: anchor row ids and highlighted instances
 */
function selection(page: Page): Promise<{anchors: string[], instances: number[]}> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state = (window as any).useStore.getState()
    return {anchors: state.selectedAnchorIds ?? [], instances: state.selectedInstanceIds ?? []}
  })
}


/**
 * @param page Playwright page
 * @return how many batched instances carry the selection's paint
 */
function paintedInstances(page: Page): Promise<number> {
  return page.evaluate(() => {
    let painted = 0
    /* eslint-disable @typescript-eslint/no-explicit-any */
    ;(window as any).useStore.getState().viewer.isolator.ifcModel.traverse((obj: any) => {
      painted += obj.userData?.batchedHighlight?.selSet?.size ?? 0
    })
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return painted
  })
}


/**
 * @param page Playwright page
 * @return how many batched instances are drawn
 */
function visibleInstances(page: Page): Promise<number> {
  return page.evaluate(() => {
    let visible = 0
    /* eslint-disable @typescript-eslint/no-explicit-any */
    ;(window as any).useStore.getState().viewer.isolator.ifcModel.traverse((obj: any) => {
      if (obj.isBatchedMesh && obj.instanceParents) {
        for (let batchId = 0; batchId < obj.instanceParents.length; batchId++) {
          visible += obj.getVisibleAt(batchId) ? 1 : 0
        }
      }
    })
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return visible
  })
}


/**
 * Screen points on `count` instances of different products, well inside the
 * canvas, for double-clicking through the real canvas handler.
 *
 * @param page Playwright page
 * @param count how many
 * @return client coordinates, one per product
 */
async function instancePoints(page: Page, count: number): Promise<Array<{x: number, y: number}>> {
  const points = await page.evaluate((wanted) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const state = (window as any).useStore.getState()
    const camera = state.viewer.context.getCamera()
    const rect = (document.querySelector('canvas') as HTMLCanvasElement).getBoundingClientRect()
    const margin = 60
    const out: Array<{x: number, y: number}> = []
    const seen = new Set()
    state.viewer.isolator.ifcModel.traverse((obj: any) => {
      if (!obj.isBatchedMesh || !obj.instanceParents) {
        return
      }
      for (let batchId = 0; batchId < obj.instanceParents.length && out.length < wanted; batchId++) {
        const parent = obj.instanceParents[batchId]
        if (seen.has(parent) || !obj.getVisibleAt(batchId)) {
          continue
        }
        const box = obj.getBoundingBoxAt(obj.getGeometryIdAt(batchId), obj.boundingBox.clone())
        const matrix = obj.matrixWorld.clone()
        obj.getMatrixAt(batchId, matrix)
        matrix.premultiply(obj.matrixWorld)
        const ndc = box.getCenter(box.min.clone()).applyMatrix4(matrix).project(camera)
        const x = rect.left + (((ndc.x + 1) / 2) * rect.width)
        const y = rect.top + (((1 - ndc.y) / 2) * rect.height)
        if (x > rect.left + margin && x < rect.right - margin && y > rect.top + margin && y < rect.bottom - margin &&
            out.every((p) => Math.hypot(p.x - x, p.y - y) > margin)) {
          seen.add(parent)
          out.push({x, y})
        }
      }
    })
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return out
  }, count)
  expect(points, 'enough products on screen to click').toHaveLength(count)
  return points
}


/**
 * @param page Playwright page
 * @return the `#d:` token's terms, or null without one
 */
function displayToken(page: Page): string | null {
  return hashToken(page, 'd')
}


/**
 * @param page Playwright page
 * @param name the token's prefix
 * @return the token's value, or null without one
 */
function hashToken(page: Page, name: string): string | null {
  const token = new URL(page.url()).hash.substring(1).split(';').find((part) => part.startsWith(`${name}:`))
  return token ? token.substring(name.length + 1) : null
}
