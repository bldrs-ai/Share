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
 *
 * And the cut's own gizmo (owner's feedback on the preview): its arrow is
 * drawn over the model (depthTest off), so a pointer on it is on the gizmo,
 * whatever the ray meets nearer or farther. `viewer/three/pickControls.js`
 * makes the gizmo the pick there: nothing hovered, nothing selected. It is
 * checked from both sides. From +x the arrow (on the model centre, end-on)
 * stands in front of the box. From -x, the kept side, the box stands in front
 * of the arrow, which still shows through it. That is the case a
 * nearest-first pick gets wrong for the click as well as the hover. Either
 * way the box is on the arrow's ray, so a pick that looked past the gizmo
 * would name the box.
 */
const IFC_MODEL = '/share/v/gh/bldrs-ai/test-models/main/ifc/misc/cut-plane-pick.ifc'
const OBJ_MODEL = '/share/v/gh/bldrs-ai/test-models/main/obj/cut-plane-pick.obj'
// The IFC's express ids (the fixture's #1000 and #2000).
const IFC_EXTERIOR = 1000
const IFC_INTERIOR = 2000
// Camera on +x looking straight down -x, through both boxes but 0.3 above and
// 0.25 beside the model centre: the Section cut's arrow sits ON the centre,
// along that same axis, and a ray through it would pick the arrow (visible,
// never clipped) first. The margin is ~0.39 off the arrow's axis, against an
// arrow sized from the model (MeshClipper.js ARROW_SCALE_RATIO, the head and
// shaft sizes in CutPlaneArrowHelper.ts): if those grow, the centre picks
// below start landing on the arrow and select nothing. The IFC is Z-up and the
// scene Y-up, so both fixtures share these scene coordinates.
const CAMERA_HASH = '#c:10.6,1.3,0.25,0.6,1.3,0.25'
const TEST_TIMEOUT_MS = 90_000
const PICK_TIMEOUT_MS = 10_000
// Where the hover starts from, above the point it then moves to, so the move
// to the point is a fresh pick (hoverPick.js skips an unmoved pointer).
const APPROACH_PX = 100
// The camera turned round to look from the kept side: on -x, looking down +x
// along the same line.
/* eslint-disable no-magic-numbers */
const KEPT_SIDE_VIEW = [-9.4, 1.3, 0.25, 0.6, 1.3, 0.25]
/* eslint-enable no-magic-numbers */
// Frames for camera-controls to apply a pose and the loop to paint it.
const CAMERA_SETTLE_MS = 500
// How long a double-click on the gizmo is given to (wrongly) change the
// selection, or a drag to (wrongly) hover: CadView's handler selects
// synchronously on the dblclick and a hover pick lands within a frame or two,
// so a wrong answer shows well inside this (PICK_TIMEOUT_MS is the ceiling
// for the right ones, not the norm).
const NO_CHANGE_SETTLE_MS = 1500


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
 * @return the Section cut's arrow's centre in page coordinates, checked to be
 *   over the canvas
 */
async function arrowPoint(page: Page): Promise<{x: number, y: number}> {
  const point = await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const viewer = (window as any).store.getState().viewer
    const arrow = viewer.context.getScene().children.find((o: any) => o.userData?.isClippingControl)
    if (!arrow) {
      return null
    }
    const ndc = arrow.position.clone().project(viewer.context.getCamera())
    const canvas = viewer.context.getDomElement() as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    const x = Math.round(rect.left + (((ndc.x + 1) / 2) * rect.width))
    const y = Math.round(rect.top + (((1 - ndc.y) / 2) * rect.height))
    return {x, y, isCanvas: document.elementFromPoint(x, y) === canvas}
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
  if (point === null) {
    throw new Error('the cut has no arrow in the scene')
  }
  expect(point.isCanvas, 'the arrow is not covered').toBe(true)
  return {x: point.x, y: point.y}
}


/**
 * Turn the camera round to look at the model from the cut's kept side
 * ({@link KEPT_SIDE_VIEW}), as the user would by orbiting.
 *
 * @param page
 */
async function viewFromKeptSide(page: Page) {
  await page.evaluate(async (pose) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const controls = (window as any).store.getState().viewer.context.getCameraControls()
    const [px, py, pz, tx, ty, tz] = pose
    await controls.setLookAt(px, py, pz, tx, ty, tz, false)
  }, KEPT_SIDE_VIEW)
  await page.waitForTimeout(CAMERA_SETTLE_MS)
}


/**
 * Double-click the point and check, after giving it time, that the selection
 * is still `want`: a double-click that should select nothing.
 *
 * @param page
 * @param point
 * @param want the selection from before the double-click
 */
async function expectDoubleClickKeeps(page: Page, point: {x: number, y: number}, want: number) {
  await page.mouse.dblclick(point.x, point.y)
  await page.waitForTimeout(NO_CHANGE_SETTLE_MS)
  expect(await selectedIds(page)).toEqual([want])
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
 * exactly `want`. The pointer comes from elsewhere, so the hover is a fresh
 * pick and not the one before the cut.
 *
 * @param page
 * @param point
 * @param want the parent ids the highlight should paint: one, or none
 */
async function expectHoverPicks(page: Page, point: {x: number, y: number}, want: number[]) {
  await page.mouse.move(point.x, point.y - APPROACH_PX)
  await page.mouse.move(point.x, point.y, {steps: 5})
  await expect.poll(() => hoveredParents(page), {timeout: PICK_TIMEOUT_MS}).toEqual(want)
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
  test('a batched IFC: hover and double-click pick the interior behind a cut-away wall, and not past the gizmo', async ({page}) => {
    await openModel(page, IFC_MODEL)
    const centre = await canvasCentre(page)
    // Before the cut the wall is in front: what makes the after-cut pick
    // mean something.
    await expectHoverPicks(page, centre, [IFC_EXTERIOR])
    await expectDoubleClickSelects(page, centre, IFC_EXTERIOR)

    await addSectionCut(page)
    await expectHoverPicks(page, centre, [IFC_INTERIOR])
    // On the gizmo, the arrow in front of the box: the box is not hovered
    // (the move from the centre, where the box IS hovered, shows a pick ran
    // and cleared it).
    await expectHoverPicks(page, await arrowPoint(page), [])

    // From the kept side, the box in front of the arrow: not hovered, and a
    // double-click on the arrow leaves the wall selected rather than taking
    // the box. Then the box itself, off the arrow, is picked as ever.
    await viewFromKeptSide(page)
    await expectHoverPicks(page, centre, [IFC_INTERIOR])
    const arrow = await arrowPoint(page)
    await expectHoverPicks(page, arrow, [])
    await expectDoubleClickKeeps(page, arrow, IFC_EXTERIOR)

    // A drag of the arrow across the box: nothing hovered while the button is
    // down, and hover is back the moment it is released (a drag flag left
    // set, pickControls.js, would keep the box un-hoverable).
    await page.mouse.move(arrow.x, arrow.y)
    await page.mouse.down()
    await page.mouse.move(centre.x, centre.y, {steps: 5})
    await page.waitForTimeout(NO_CHANGE_SETTLE_MS)
    expect(await hoveredParents(page)).toEqual([])
    await page.mouse.up()
    await expect.poll(() => hoveredParents(page), {timeout: PICK_TIMEOUT_MS}).toEqual([IFC_INTERIOR])
    await expectDoubleClickSelects(page, centre, IFC_INTERIOR)
  })

  test('an OBJ: double-click picks the interior mesh behind a cut-away wall, and not past the gizmo', async ({page}) => {
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
    await expectDoubleClickKeeps(page, await arrowPoint(page), ids.Exterior)
    // From the kept side the box is in front of the arrow, which still shows
    // through it: a double-click on the arrow must not take the box.
    await viewFromKeptSide(page)
    await expectDoubleClickKeeps(page, await arrowPoint(page), ids.Exterior)
    await expectDoubleClickSelects(page, centre, ids.Interior)
  })
})


/**
 * The cut plane's arrow itself (owner on #2171's preview):
 *
 *  - **dragged by touch:** the clipper listened to mouse events only, and a
 *    touch sends none (camera-controls' pointerdown suppresses them), so on a
 *    phone the arrow never turned yellow and could not be moved;
 *  - **drawn over the hover:** a hovered element nearer than the arrow
 *    painted over it, since the arrow was drawn in the scene pass under the
 *    hover overlay (hoverOverlay.js#isDrawnOverHover);
 *  - **faded with distance** from the pointer, to nothing a quarter of the
 *    canvas away (arrowFade.js);
 *  - **kept in the permalink** where it was dragged to, not only which plane
 *    is on, so the link replays the cut in a new tab (CutPlaneMenu.jsx
 *    #writeDraggedPlanes, debounced as the camera is).
 */
describeMobileAndDesktop('Cutplanes: the arrow', (ff) => {
  test('drags by mouse or touch, and the dragged cut replays from the permalink in a new tab', async ({page, context}) => {
    await openModel(page, IFC_MODEL)
    await addSectionCut(page)
    await viewObliquely(page)
    const {start, end} = await arrowDragPoints(page)
    const before = await planeState(page)
    const pose = await cameraPose(page)
    const during = await dragArrow(page, start, end, ff.isMobile)
    expect(during.color, 'the arrow is grabbed (highlighted) while dragged').toBe(ARROW_HIGHLIGHT)
    const after = await planeState(page)
    expect(after.constant, 'the drag moved the plane').not.toBeCloseTo(before.constant, 3)
    expect(after.color, 'the arrow lets go on release').toBe(ARROW_DEFAULT)
    expect(await cameraPose(page), 'the camera stayed put').toEqual(pose)

    // The link follows once the drag settles (HASH_DEBOUNCE_WAIT_MS), with
    // the plane's offset, not just its axis.
    await expect.poll(() => cutPlaneOffset(page), {timeout: PICK_TIMEOUT_MS}).not.toBe(0)
    const url = page.url()
    const replay = await context.newPage()
    await homepageSetup(replay)
    await setupVirtualPathIntercept(replay, IFC_MODEL, '')
    await replay.goto(url)
    await waitForModelReady(replay)
    await expect.poll(async () => (await planeState(replay)).constant, {timeout: PICK_TIMEOUT_MS})
      .toBeCloseTo(after.constant, 2)
  })

  // Owner on #2171: grabbed at a tip, the plane jumped out to the tip as
  // the drag began. It moves by the pointer's travel along the normal, so a
  // move straight across the arrow from its tip moves it not at all.
  test('doesn\'t jump to where on the arrow it was grabbed', async ({page}) => {
    await openModel(page, IFC_MODEL)
    await addSectionCut(page)
    await viewObliquely(page)
    const {tip, across, tipDistance} = await arrowTipAndAcross(page)
    const before = await planeState(page)
    const during = await dragArrow(page, tip, across, ff.isMobile)
    expect(during.color, 'the arrow is grabbed at its tip').toBe(ARROW_HIGHLIGHT)
    const moved = Math.abs((await planeState(page)).constant - before.constant)
    // Without the fix it moves by the tip's distance from the plane.
    expect(moved, `the plane moved ${moved} of the tip's ${tipDistance}`).toBeLessThan(tipDistance * TIP_JUMP_TOLERANCE)
  })


  test('is drawn over a hovered element in front of it', async ({page}) => {
    await openModel(page, IFC_MODEL)
    const centre = await canvasCentre(page)
    await addSectionCut(page)
    // From the kept side the box is in front of the arrow; hovered, the
    // overlay draws it, and the arrow must still show over it.
    await viewFromKeptSide(page)
    // Hover the box just beside the arrow, toward the canvas centre (where
    // the box is): near enough that the arrow stays shown (arrowFade.js
    // NEAR_PX), off it so the hover picks the box.
    const arrow = await arrowPoint(page)
    const toCentre = Math.hypot(centre.x - arrow.x, centre.y - arrow.y)
    const step = Math.min(BESIDE_ARROW_PX, toCentre) / Math.max(toCentre, 1)
    const beside = {x: arrow.x + ((centre.x - arrow.x) * step), y: arrow.y + ((centre.y - arrow.y) * step)}
    await expectHoverPicks(page, beside, [IFC_INTERIOR])
    expect(await arrowOpacity(page), 'the arrow is shown').toBe(1)
    for (const kind of ['overlay', 'full'] as const) {
      const pixel = await paintedPixel(page, arrow, kind)
      expect(isArrowBlue(pixel), `the arrow shows over the hover on a ${kind} paint: ${pixel}`).toBe(true)
    }
  })

  // Owner on #2171: fade out after a few seconds without activity near the
  // arrow, back to full on a press or move near it (arrowFade.js).
  test('fades out when left alone, and comes back on activity near it', async ({page}) => {
    await openModel(page, IFC_MODEL)
    await addSectionCut(page)
    await viewObliquely(page)
    const arrow = await arrowPoint(page)
    await page.mouse.move(arrow.x + 8, arrow.y + 8)
    await expect.poll(() => arrowOpacity(page)).toBe(1)
    const shown = await paintedPixel(page, arrow, 'full')
    // Away from it, and left alone: it fades out.
    const far = await farCanvasPoint(page, arrow)
    await page.mouse.move(far.x, far.y, {steps: 5})
    expect(await arrowOpacity(page), 'not straight away').toBe(1)
    await expect.poll(() => arrowOpacity(page), {timeout: FADE_TIMEOUT_MS}).toBe(0)
    const faded = await paintedPixel(page, arrow, 'full')
    expect(channelDistance(shown, faded), `the arrow is gone from its pixel: ${shown} -> ${faded}`)
      .toBeGreaterThan(FADED_CHANNEL_DELTA)
    // Activity near it brings it straight back: a move with a mouse, a tap
    // with a finger (CDP touch, so the page gets touch pointer events).
    const near = {x: arrow.x + BESIDE_ARROW_PX, y: arrow.y + BESIDE_ARROW_PX}
    if (ff.isMobile) {
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [near]})
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []})
      await cdp.detach()
    } else {
      await page.mouse.move(near.x, near.y, {steps: 3})
    }
    await expect.poll(() => arrowOpacity(page)).toBe(1)
  })
})


// MeshClipper's arrow colours.
const ARROW_DEFAULT = 0x0000ff
const ARROW_HIGHLIGHT = 0xffff00
// The least change in a pixel's channels that counts as the arrow leaving it.
const FADED_CHANNEL_DELTA = 60
// Longer than arrowFade.js's IDLE_MS + FADE_OUT_MS (3.4 s).
const FADE_TIMEOUT_MS = 8000
// Where on the arrow to grab it near a tip, as a fraction of its half length:
// on the head's base, its widest part (CutPlaneArrowHelper's head spans 0.75
// to 1 of the half length).
const TIP_ALONG_HALF_LENGTH = 0.78
// How much of the tip's distance the plane may move on a move across it.
const TIP_JUMP_TOLERANCE = 0.1
// How far beside the arrow a hover can be and keep it shown (< NEAR_PX).
const BESIDE_ARROW_PX = 20
// A view at a slant to the Section cut, so its arrow (along x) is seen side-on
// and a drag along it moves the plane.
/* eslint-disable no-magic-numbers */
const OBLIQUE_VIEW = [7.6, 5.3, 6.25, 0.6, 1.3, 0.25]
/* eslint-enable no-magic-numbers */
// How far along the plane's normal the arrow is dragged, in CSS pixels.
const DRAG_PX = 60
const DRAG_STEPS = 10
// A step along the normal, in world units, to find its direction on screen.
const NORMAL_PROBE = 0.1
const PAINT_TIMEOUT_MS = 10_000
// Points across (and down) the canvas searched for an uncovered far point.
const FAR_POINT_GRID = 12


/**
 * @param page
 */
async function viewObliquely(page: Page) {
  await page.evaluate(async (pose) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const controls = (window as any).store.getState().viewer.context.getCameraControls()
    const [px, py, pz, tx, ty, tz] = pose
    await controls.setLookAt(px, py, pz, tx, ty, tz, false)
  }, OBLIQUE_VIEW)
  await page.waitForTimeout(CAMERA_SETTLE_MS)
}


/**
 * @param page
 * @return the first cut plane's constant and its arrow's colour
 */
async function planeState(page: Page): Promise<{constant: number, color: number}> {
  return await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const planes = (window as any).store?.getState().viewer?.clipper?.planes ?? []
    if (planes.length === 0) {
      return {constant: NaN, color: -1}
    }
    return {constant: planes[0].plane.constant, color: planes[0].arrow.material.color.getHex()}
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}


/**
 * @param page
 * @return the first arrow's material opacity
 */
async function arrowOpacity(page: Page): Promise<number> {
  return await page.evaluate(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).store.getState().viewer.clipper.planes[0].arrow.material.opacity)
}


/**
 * @param page
 * @return the `x` offset in the URL's `#cp:` set, 0 when it has none
 */
function cutPlaneOffset(page: Page): number {
  const match = new URL(page.url()).hash.match(/cp:[^:]*?x=(-?[\d.e-]+)/)
  return match ? parseFloat(match[1]) : 0
}


/**
 * @param page
 * @return the camera's position and quaternion
 */
async function cameraPose(page: Page): Promise<number[]> {
  return await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const camera = (window as any).store.getState().viewer.context.getCamera()
    return [...camera.position.toArray(), ...camera.quaternion.toArray()]
  })
}


/**
 * Where to press on the Section cut's arrow and where to drag it to:
 * {@link DRAG_PX} along the screen direction of its plane's normal (the
 * clipper keeps only the part of a move along the normal).
 *
 * @param page
 * @return the press and release points, in page coordinates
 */
async function arrowDragPoints(page: Page): Promise<{start: {x: number, y: number}, end: {x: number, y: number}}> {
  const points = await page.evaluate(({dragPx, probe}) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const viewer = (window as any).store.getState().viewer
    const planeData = viewer.clipper.planes[0]
    const camera = viewer.context.getCamera()
    const rect = viewer.context.getDomElement().getBoundingClientRect()
    const toPage = (v: any) => {
      const ndc = v.clone().project(camera)
      return {x: rect.left + (((ndc.x + 1) / 2) * rect.width), y: rect.top + (((1 - ndc.y) / 2) * rect.height)}
    }
    const start = toPage(planeData.arrow.position)
    const along = toPage(planeData.arrow.position.clone().add(planeData.plane.normal.clone().multiplyScalar(probe)))
    const length = Math.hypot(along.x - start.x, along.y - start.y)
    return {start, end: {x: start.x + ((along.x - start.x) / length * dragPx), y: start.y + ((along.y - start.y) / length * dragPx)}}
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }, {dragPx: DRAG_PX, probe: NORMAL_PROBE})
  return points
}


/**
 * A point on the arrow's head toward its tip, and a point {@link DRAG_PX}
 * from it straight across the arrow on screen (perpendicular to the plane's
 * normal as projected).
 *
 * @param page
 * @return the two page points, and the world distance from the plane to the grabbed point
 */
async function arrowTipAndAcross(page: Page): Promise<{
  tip: {x: number, y: number}, across: {x: number, y: number}, tipDistance: number,
}> {
  return await page.evaluate(({dragPx, alongTip}) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const viewer = (window as any).store.getState().viewer
    const planeData = viewer.clipper.planes[0]
    const arrow = planeData.arrow
    const camera = viewer.context.getCamera()
    const rect = viewer.context.getDomElement().getBoundingClientRect()
    const toPage = (v: any) => {
      const ndc = v.clone().project(camera)
      return {x: rect.left + (((ndc.x + 1) / 2) * rect.width), y: rect.top + (((1 - ndc.y) / 2) * rect.height)}
    }
    // The arrow points along its local +y (CutPlaneArrowHelper), scaled.
    const tipDistance = arrow.halfLength * alongTip * arrow.scale.x
    const direction = planeData.plane.normal.clone().normalize()
    const tipWorld = arrow.position.clone().addScaledVector(direction, tipDistance)
    const awayWorld = arrow.position.clone().addScaledVector(direction, -tipDistance)
    // Whichever end is nearer the camera, so the press lands on its head.
    const useTip = tipWorld.distanceTo(camera.position) <= awayWorld.distanceTo(camera.position)
    const tip = toPage(useTip ? tipWorld : awayWorld)
    const centre = toPage(arrow.position)
    const length = Math.hypot(tip.x - centre.x, tip.y - centre.y)
    const across = {x: tip.x - ((tip.y - centre.y) / length * dragPx), y: tip.y + ((tip.x - centre.x) / length * dragPx)}
    return {tip, across, tipDistance}
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }, {dragPx: DRAG_PX, alongTip: TIP_ALONG_HALF_LENGTH})
}


/**
 * Drag from `start` to `end`: the mouse on desktop, a finger on a phone (CDP
 * touch events, so the browser makes real touch pointer events, as a phone's
 * does).
 *
 * @param page
 * @param start
 * @param end
 * @param isTouch
 * @return the arrow's state mid-drag, before the release
 */
async function dragArrow(page: Page, start: {x: number, y: number}, end: {x: number, y: number},
  isTouch: boolean): Promise<{constant: number, color: number}> {
  const at = (i: number) => ({
    x: start.x + ((end.x - start.x) * i / DRAG_STEPS),
    y: start.y + ((end.y - start.y) * i / DRAG_STEPS),
  })
  if (!isTouch) {
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(end.x, end.y, {steps: DRAG_STEPS})
    const during = await planeState(page)
    await page.mouse.up()
    return during
  }
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [start]})
  for (let i = 1; i <= DRAG_STEPS; i++) {
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [at(i)]})
  }
  const during = await planeState(page)
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []})
  await cdp.detach()
  return during
}


/**
 * The colour the viewer paints at a point, read inside the next frame that
 * paints after asking for one ('overlay': the hover overlay on the cached
 * frame where it can compose one; 'full': the whole scene).
 *
 * @param page
 * @param point page coordinates
 * @param kind which paint to ask for
 * @return [r, g, b]
 */
async function paintedPixel(page: Page, point: {x: number, y: number}, kind: 'overlay' | 'full'): Promise<number[]> {
  return await page.evaluate(({x, y, ask, timeoutMs}) => new Promise<number[]>((resolve, reject) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const context = (window as any).store.getState().viewer.context
    const demand = context.getRenderDemand()
    const gl = context.getRenderer().getContext()
    const rect = context.getDomElement().getBoundingClientRect()
    const px = Math.round((x - rect.left) * gl.drawingBufferWidth / rect.width)
    const py = gl.drawingBufferHeight - 1 - Math.round((y - rect.top) * gl.drawingBufferHeight / rect.height)
    const painting = context.getLegacyRendererWrapper().update
    const timer = setTimeout(() => {
      context.setRenderUpdate(painting)
      reject(new Error('paintedPixel: no paint'))
    }, timeoutMs)
    context.setRenderUpdate((...args: unknown[]) => {
      const painted = painting(...args)
      if (painted) {
        // The default framebuffer, read inside the frame that drew it.
        const out = new Uint8Array(4)
        const bound = gl.getParameter(gl.FRAMEBUFFER_BINDING)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out)
        gl.bindFramebuffer(gl.FRAMEBUFFER, bound)
        clearTimeout(timer)
        context.setRenderUpdate(painting)
        resolve([out[0], out[1], out[2]])
      }
      return painted
    })
    if (ask === 'full') {
      demand.invalidate()
    } else {
      demand.invalidateOverlay()
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }), {x: point.x, y: point.y, ask: kind, timeoutMs: PAINT_TIMEOUT_MS})
}


/**
 * @param rgb
 * @return whether the pixel is the arrow's blue, not the hover's cyan or the model's greys
 */
function isArrowBlue([r, g, b]: number[]): boolean {
  /* eslint-disable no-magic-numbers */
  return b > 120 && g < 90 && r < 90
  /* eslint-enable no-magic-numbers */
}


/**
 * @param a
 * @param b
 * @return the largest channel difference
 */
function channelDistance(a: number[], b: number[]): number {
  return Math.max(...a.map((v, i) => Math.abs(v - b[i])))
}


/**
 * @param page
 * @param from
 * @return the point over the canvas, not under a panel or button, farthest
 *   from `from` (a phone's layout covers every corner)
 */
async function farCanvasPoint(page: Page, from: {x: number, y: number}): Promise<{x: number, y: number}> {
  const point = await page.evaluate(({fx, fy, steps}) => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    let best = null
    let bestDistance = -1
    for (let i = 0; i <= steps; i++) {
      for (let j = 0; j <= steps; j++) {
        const x = rect.left + ((rect.width - 2) * i / steps) + 1
        const y = rect.top + ((rect.height - 2) * j / steps) + 1
        const distance = Math.hypot(x - fx, y - fy)
        if (distance > bestDistance && document.elementFromPoint(x, y) === canvas) {
          best = {x, y}
          bestDistance = distance
        }
      }
    }
    return best
  }, {fx: from.x, fy: from.y, steps: FAR_POINT_GRID})
  if (point === null) {
    throw new Error('farCanvasPoint: the canvas is covered everywhere')
  }
  return point
}
