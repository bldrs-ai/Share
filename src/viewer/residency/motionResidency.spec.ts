/* eslint-disable no-magic-numbers */
import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {waitForModelReady} from '../../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../../tests/e2e/utils'


const {beforeEach} = test


/**
 * Adaptive residency during camera motion (B3 of
 * design/new/demand-tiled-rendering.md; viewer/residency/MotionResidency.js),
 * behind `?feature=motionResidency`.
 *
 * The user's action end to end: set the Display menu's "While moving"
 * control, drag the camera on the canvas, let go. What is asserted is what
 * the renderer drew, not the controller's bookkeeping: every painted frame's
 * triangles, summed over the render calls in it (three resets
 * `renderer.info.render` at each `render()`, and the composer renders more
 * than once a paint), read through a wrapper on `renderer.render` that asks
 * for nothing itself. During the drag the frames draw fewer triangles than
 * the still view did; at rest the last frame draws exactly as many as before
 * the drag, and every instance that was visible before is visible again.
 */
describeMobileAndDesktop('viewer/residency/motionResidency', () => {
  beforeEach(async ({page}) => {
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await page.goto('/share/v/p/index.ifc?feature=motionResidency')
    await waitForModelReady(page)
    await installTriangleRecorder(page)
  })


  test('a manual percent draws less while dragging and everything again at rest', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    const before = await stillFrame(page)
    expect(before.triangles, 'the still view drew the model').toBeGreaterThan(0)

    await openDisplayMenu(page)
    await page.getByTestId('motion-residency-auto').locator('input').uncheck()
    const slider = page.getByTestId('motion-residency-slider').getByRole('slider')
    await expect(slider).toBeEnabled()
    await slider.press('Home')
    for (let i = 0; i < MANUAL_PERCENT; i++) {
      await slider.press('ArrowRight')
    }
    await expect(slider).toHaveAttribute('aria-valuenow', `${MANUAL_PERCENT}`)
    await expect(page.getByTestId('motion-residency-label')).toHaveText(`While moving: ${MANUAL_PERCENT}%`)
    // The choice persists like the at-rest one: in the #d: token.
    await expect.poll(() => page.evaluate(() => window.location.hash)).toContain(`mres=${MANUAL_PERCENT}`)
    await closeDisplayMenu(page)
    // Nothing is evicted until the camera moves.
    expect(await stillFrame(page)).toEqual(before)

    const moving = await dragCamera(page)
    expect(moving.length, 'the drag painted').toBeGreaterThan(0)
    expect(Math.max(...moving.map((f) => f.triangles)),
      'every frame of the drag drew fewer triangles than the still view').toBeLessThan(before.triangles)

    const after = await settledFrame(page)
    expect(after.triangles, 'at rest the full set is drawn again').toBe(before.triangles)
    expect(after.visible, 'every instance visible before is visible again').toBe(before.visible)
  })


  test('Auto (the default) sheds detail while dragging and restores it at rest', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    const before = await stillFrame(page)

    await openDisplayMenu(page)
    await expect(page.getByTestId('motion-residency-auto').locator('input')).toBeChecked()
    // The load's closing camera fit is a camera move too, so Auto may already
    // report a settled percent here.
    await expect(page.getByTestId('motion-residency-label')).toHaveText(/^While moving: Auto( \(\d+%\))?$/)
    await closeDisplayMenu(page)

    // SwiftShader rasterizes on the CPU, so even this small model's frame
    // is far over a 60 Hz budget and Auto has every reason to cut. Two
    // drags: the first finds the level, the second starts from it.
    await dragCamera(page)
    await settledFrame(page)
    const moving = await dragCamera(page)
    expect(moving.length, 'the drag painted').toBeGreaterThan(0)
    expect(Math.min(...moving.map((f) => f.triangles)),
      'Auto drew fewer triangles while the camera moved').toBeLessThan(before.triangles)

    const after = await settledFrame(page)
    expect(after.triangles).toBe(before.triangles)
    expect(after.visible).toBe(before.visible)

    // The menu reports what Auto settled on.
    await openDisplayMenu(page)
    await expect(page.getByTestId('motion-residency-label')).toHaveText(/^While moving: Auto \(\d+%\)$/)
  })
})


const TEST_TIMEOUT_MS = 90_000
const MANUAL_PERCENT = 20
// Longer than MotionResidency's REST_MS (200 ms) plus camera-controls'
// damping tail after a fling.
const SETTLE_MS = 1500


type Frame = {triangles: number, visible: number}

/* eslint-disable @typescript-eslint/no-explicit-any */
type RecorderWindow = Window & {
  store?: {getState: () => any}
  __motionFrames?: Array<{triangles: number}>
}
/* eslint-enable @typescript-eslint/no-explicit-any */


/**
 * Wrap the viewer's `renderer.render` to sum triangles per painted frame
 * (one rAF task) into `window.__motionFrames`. Frames that don't paint call
 * no render and record nothing.
 *
 * @param page
 */
async function installTriangleRecorder(page: Page) {
  await page.evaluate(() => {
    const win = window as unknown as RecorderWindow
    const renderer = win.store?.getState().viewer?.context?.getRenderer?.()
    if (!renderer) {
      throw new Error('installTriangleRecorder: no viewer renderer')
    }
    win.__motionFrames = []
    let frame: {triangles: number} | null = null
    const original = renderer.render
    renderer.render = function(...args: unknown[]) {
      try {
        return original.apply(this, args)
      } finally {
        if (frame === null) {
          frame = {triangles: 0}
          const open = frame
          win.__motionFrames?.push(open)
          // Closes after this rAF callback's render calls have all run.
          queueMicrotask(() => {
            frame = null
          })
        }
        frame.triangles += this.info?.render?.triangles ?? 0
      }
    }
  })
}


/**
 * @param page
 * @return frames recorded since the last call, and resets the buffer
 */
async function takeFrames(page: Page): Promise<Array<{triangles: number}>> {
  return await page.evaluate(() => {
    const win = window as unknown as RecorderWindow
    const frames = win.__motionFrames ?? []
    win.__motionFrames = []
    return frames
  })
}


/**
 * @param page
 * @return visible batched instances on the loaded model
 */
async function visibleInstances(page: Page): Promise<number> {
  return await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const model = (window as unknown as RecorderWindow).store?.getState().model as any
    const meshes: any[] = model?.isBatchedMesh ? [model] :
      (model?.children ?? []).filter((child: any) => child?.isBatchedMesh)
    let visible = 0
    for (const mesh of meshes) {
      const count = mesh.instanceParents?.length ?? 0
      for (let index = 0; index < count; index++) {
        visible += mesh.getVisibleAt(index) ? 1 : 0
      }
    }
    return visible
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}


/**
 * Force one paint of the current view and read what it drew.
 *
 * @param page
 * @return the paint's triangles and the visible instance count
 */
async function stillFrame(page: Page): Promise<Frame> {
  await takeFrames(page)
  await page.evaluate(() => new Promise<void>((resolve) => {
    const win = window as unknown as RecorderWindow
    win.store?.getState().viewer?.context?.getRenderDemand?.()?.invalidate()
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
  const frames = await takeFrames(page)
  if (frames.length === 0) {
    throw new Error('stillFrame: the forced paint drew nothing')
  }
  return {triangles: frames[frames.length - 1].triangles, visible: await visibleInstances(page)}
}


/**
 * Let the camera come to rest, then read the last frame the viewer painted
 * on its own (not a forced one: the restore must have asked for its paint).
 *
 * @param page
 * @return the last painted frame's triangles and the visible count
 */
async function settledFrame(page: Page): Promise<Frame> {
  await page.waitForTimeout(SETTLE_MS)
  const frames = await takeFrames(page)
  if (frames.length === 0) {
    throw new Error('settledFrame: nothing painted after the drag')
  }
  return {triangles: frames[frames.length - 1].triangles, visible: await visibleInstances(page)}
}


/**
 * Orbit by dragging across the canvas in small steps, and return the frames
 * painted while the pointer was down.
 *
 * @param page
 * @return the painted frames of the drag
 */
async function dragCamera(page: Page): Promise<Array<{triangles: number}>> {
  const box = await page.locator('#viewer-container canvas').first().boundingBox()
  if (box === null) {
    throw new Error('dragCamera: the viewer canvas is not laid out')
  }
  const x = box.x + (box.width / 2)
  const y = box.y + (box.height / 3)
  await page.mouse.move(x, y)
  // A pointer move over the canvas opens render-on-demand's settle window
  // (renderDemand.js layer 5), which repaints the still view for 200 ms;
  // let it close so the frames below are the drag's own.
  await page.waitForTimeout(400)
  await takeFrames(page)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(x + (i * 8), y + (i * 2))
    await page.waitForTimeout(30)
  }
  const frames = await takeFrames(page)
  await page.mouse.up()
  return frames
}


/**
 * @param page
 */
async function openDisplayMenu(page: Page) {
  await page.getByTestId('control-button-residency').click()
  await expect(page.getByTestId('motion-residency-slider')).toBeVisible()
}


/**
 * @param page
 */
async function closeDisplayMenu(page: Page) {
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('motion-residency-slider')).toBeHidden()
}
