import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {setupVirtualPathIntercept, waitForModelReady} from '../../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../../tests/e2e/utils'


/**
 * Share#2131: picks ignored the cut planes. A ray through a model cut open
 * still met the geometry the plane had removed from view, so in a house cut
 * open you could not hover or select the interior: the pick landed on the
 * (invisible) wall in front of it. `viewer/three/clippedHits.js` now drops
 * those hits in the one seam both raycasters share.
 *
 * The fixtures make the case unambiguous: an exterior wall at x 2.0..2.2 in
 * front of an interior box at x -1..0, both on the line of sight of a camera
 * on +x looking down -x, beside the model centre (x 0.6, height 1). The
 * Section cut (CutPlaneMenu's `x` plane, at the model centre, keeping x at or
 * below it) removes the wall and leaves the box. So the canvas centre picks
 * the wall before the cut and the box after it, and nothing else.
 *
 * Two fixtures, the two pick paths: an IFC, which loads as a batched model
 * (BatchedMesh, the instance tree, the hover overlay), hovered and
 * double-clicked; and an OBJ, plain Meshes, double-clicked (a mesh model has
 * no hover highlight).
 */
const IFC_MODEL = '/share/v/gh/bldrs-ai/test-models/main/ifc/misc/cut-plane-pick.ifc'
const OBJ_MODEL = '/share/v/gh/bldrs-ai/test-models/main/obj/cut-plane-pick.obj'
// The IFC's express ids (the fixture's #1000 and #2000).
const IFC_EXTERIOR = 1000
const IFC_INTERIOR = 2000
// Camera on +x looking straight down -x, through both boxes but 0.3 above and
// 0.25 beside the model centre: the Section cut's arrow sits ON the centre,
// along that same axis, and a ray through it would pick the arrow (visible,
// never clipped) first. The IFC is Z-up and the scene Y-up, so both fixtures
// share these scene coordinates.
const CAMERA_HASH = '#c:10.6,1.3,0.25,0.6,1.3,0.25'
const TEST_TIMEOUT_MS = 90_000
const PICK_TIMEOUT_MS = 10_000
// Where the hover starts from, above the point it then moves to: off the
// model, so the pick at the point is a fresh one.
const APPROACH_PX = 100


/**
 * @param page
 * @return the canvas centre in page coordinates, checked to be over the
 *   canvas rather than a panel
 */
async function canvasCentre(page: Page): Promise<{x: number, y: number}> {
  const point = await page.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    const x = Math.round(rect.left + (rect.width / 2))
    const y = Math.round(rect.top + (rect.height / 2))
    return {x, y, isCanvas: document.elementFromPoint(x, y) === canvas}
  })
  expect(point.isCanvas, 'the canvas centre is not covered').toBe(true)
  return {x: point.x, y: point.y}
}


/**
 * @param page
 * @return the parent ids the hover highlight is painting: the hover
 *   overlay's instances, or batchedHighlight's preselection where the overlay
 *   fell back to the recolour (as hoverPick.spec.ts reads them)
 */
async function hoveredParents(page: Page): Promise<number[]> {
  return await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const parents = new Set<number>()
    const store = (window as any).store.getState()
    for (const {mesh, batchIds} of store.viewer?.highlighter?.hoverOverlay?.hover?.resolve?.() ?? []) {
      batchIds.forEach((batchId: number) => parents.add(mesh.instanceParents[batchId]))
    }
    store.model?.traverse?.((o: any) => {
      for (const batchId of o.userData?.batchedHighlight?.preSet ?? []) {
        parents.add(o.instanceParents[batchId])
      }
    })
    return [...parents].sort((a, b) => a - b)
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}


/**
 * @param page
 * @return the store's `selectedElements`, as numbers
 */
async function selectedIds(page: Page): Promise<number[]> {
  return await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ids = (window as any).store.getState().selectedElements ?? []
    return ids.map(Number).sort((a: number, b: number) => a - b)
  })
}


/**
 * Hover the point, as the user does, and wait for the highlight to name
 * `want`. The pointer is first moved off the model, so the hover is a fresh
 * pick and not the one before the cut.
 *
 * @param page
 * @param point
 * @param want the one parent id the highlight should paint
 */
async function expectHoverPicks(page: Page, point: {x: number, y: number}, want: number) {
  await page.mouse.move(point.x, point.y - APPROACH_PX)
  await page.mouse.move(point.x, point.y, {steps: 5})
  await expect.poll(() => hoveredParents(page), {timeout: PICK_TIMEOUT_MS}).toEqual([want])
}


/**
 * Double-click the point, as the user selects, and wait for the selection to
 * be exactly `want`.
 *
 * @param page
 * @param point
 * @param want the one element id the selection should hold
 */
async function expectDoubleClickSelects(page: Page, point: {x: number, y: number}, want: number) {
  await page.mouse.dblclick(point.x, point.y)
  await expect.poll(() => selectedIds(page), {timeout: PICK_TIMEOUT_MS}).toEqual([want])
}


/**
 * Turn on the Section cut (the `x` plane at the model centre) from the
 * cut-plane menu.
 *
 * @param page
 */
async function addSectionCut(page: Page) {
  await page.getByTestId('control-button-cut-plane').click()
  await page.getByTestId('menu-item-section').click()
  await expect(page.getByTestId('menu-cut-plane')).toBeHidden()
  await expect.poll(() => new URL(page.url()).hash).toContain('cp:x')
}


/**
 * @param page
 * @param modelPath
 */
async function openModel(page: Page, modelPath: string) {
  test.setTimeout(TEST_TIMEOUT_MS)
  await homepageSetup(page)
  await setIsReturningUser(page.context())
  await setupVirtualPathIntercept(page, modelPath, '')
  await page.goto(`${modelPath}${CAMERA_HASH}`)
  await waitForModelReady(page)
}


describeMobileAndDesktop('Cutplanes: picks skip what the cut removed', () => {
  test('a batched IFC: hover and double-click pick the interior behind a cut-away wall', async ({page}) => {
    await openModel(page, IFC_MODEL)
    const centre = await canvasCentre(page)
    // Before the cut the wall is in front: what makes the after-cut pick
    // mean something.
    await expectHoverPicks(page, centre, IFC_EXTERIOR)
    await expectDoubleClickSelects(page, centre, IFC_EXTERIOR)

    await addSectionCut(page)
    await expectHoverPicks(page, centre, IFC_INTERIOR)
    await expectDoubleClickSelects(page, centre, IFC_INTERIOR)
  })

  test('an OBJ: double-click picks the interior mesh behind a cut-away wall', async ({page}) => {
    await openModel(page, OBJ_MODEL)
    // The loader numbers a mesh model's meshes itself (Loader.js
    // recursiveDecorate), so read the ids off the meshes by their OBJ names.
    const ids = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const out: Record<string, number> = {}
      ;(window as any).store.getState().model.traverse((o: any) => {
        if (o.isMesh && (o.name === 'Exterior' || o.name === 'Interior')) {
          out[o.name] = o.expressID
        }
      })
      return out
      /* eslint-enable @typescript-eslint/no-explicit-any */
    })
    expect(Number.isInteger(ids.Exterior) && Number.isInteger(ids.Interior)).toBe(true)
    expect(ids.Exterior).not.toBe(ids.Interior)
    const centre = await canvasCentre(page)
    await expectDoubleClickSelects(page, centre, ids.Exterior)

    await addSectionCut(page)
    await expectDoubleClickSelects(page, centre, ids.Interior)
  })
})
