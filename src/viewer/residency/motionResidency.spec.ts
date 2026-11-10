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


  test('a hover right after rest is drawn on the at-rest set, not on a frame cached in motion', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    // The hover overlay (#2129, on by default) draws a hover on the cached
    // frame of the last FULL paint. Had the restore at rest reached the
    // screen as anything but a full paint, that cache would still be a frame
    // of the motion set, and the hover below would show it.
    await openDisplayMenu(page)
    await page.getByTestId('motion-residency-auto').locator('input').uncheck()
    const slider = page.getByTestId('motion-residency-slider').getByRole('slider')
    await slider.press('Home')
    for (let i = 0; i < MANUAL_PERCENT; i++) {
      await slider.press('ArrowRight')
    }
    await closeDisplayMenu(page)
    const before = await stillFrame(page)
    const moving = await dragCamera(page)
    expect(Math.max(...moving.map((f) => f.triangles))).toBeLessThan(before.triangles)
    await settledFrame(page)

    await installHoverTools(page)
    const kind = await hoverSomething(page)
    expect(kind, 'the hover painted an overlay frame (the cached path)').toBe('overlay')
    /* eslint-disable @typescript-eslint/no-explicit-any */
    expect(await page.evaluate(() => (window as any).__mrHover.next('full', true))).toBe('full')
    const off = await page.evaluate(() => (window as any).__mrHover.diff('hover', 'full'))
    /* eslint-enable @typescript-eslint/no-explicit-any */
    expect(off, 'the overlay frame matches a full repaint of the at-rest scene')
      .toBeLessThanOrEqual(SAME_FRAME_PIXELS)
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


// Share of pixels an overlay frame may differ from a full repaint of the
// same state (hoverOverlay.spec.ts's tolerance), and the channel step that
// counts as a changed pixel.
const SAME_FRAME_PIXELS = 0.0005
const CHANNEL_TOLERANCE = 2
// Longer than the slowest hover interval, so a trailing pick has fired.
const HOVER_SETTLE_MS = 600
// How long a hover move may take to paint.
const HOVER_PAINT_MS = 15000


type Frame = {triangles: number, visible: number}

/* eslint-disable @typescript-eslint/no-explicit-any */
type RecorderWindow = Window & {
  store?: {getState: () => any}
  __motionFrames?: Array<{triangles: number, overlay: boolean}>
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
    const demand = win.store?.getState().viewer?.context?.getRenderDemand?.()
    win.__motionFrames = []
    let frame: {triangles: number, overlay: boolean} | null = null
    // The hover overlay (#2129) draws the hovered instances with their own
    // render call on camera layer 31 (hoverOverlay.js OVERLAY_LAYER), into
    // full paints as well as its own overlay-only ones. That draw is the
    // hover, not the resident set, so it isn't counted.
    const OVERLAY_LAYER_MASK = (1 << 31) >>> 0
    const original = renderer.render
    renderer.render = function(...args: unknown[]) {
      try {
        return original.apply(this, args)
      } finally {
        if (frame === null) {
          const overlayPaints = demand?.stats?.overlayPaints ?? 0
          frame = {triangles: 0, overlay: false}
          const open = frame
          win.__motionFrames?.push(open)
          // Closes after this rAF callback's render calls (and the
          // RenderDemand bookkeeping after them) have all run.
          queueMicrotask(() => {
            open.overlay = (demand?.stats?.overlayPaints ?? 0) > overlayPaints
            frame = null
          })
        }
        const camera = args[1] as {layers?: {mask?: number}} | undefined
        if (camera?.layers?.mask !== OVERLAY_LAYER_MASK) {
          frame.triangles += this.info?.render?.triangles ?? 0
        }
      }
    }
  })
}


/**
 * @param page
 * @return frames recorded since the last call, and resets the buffer
 */
async function takeFrames(page: Page): Promise<Array<{triangles: number, overlay: boolean}>> {
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
  // The last FULL paint: an overlay-only frame after it (a hover where the
  // pointer let go) redraws the hover on that paint's cached frame, and its
  // scene is that paint's scene.
  const frames = (await takeFrames(page)).filter((f) => !f.overlay)
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
async function dragCamera(page: Page): Promise<Array<{triangles: number, overlay: boolean}>> {
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
 * In-page tools, after hoverOverlay.spec.ts's: catch the next frame the viewer
 * paints (and whether it was an overlay paint), and count differing pixels
 * between two catches.
 *
 * @param page
 */
async function installHoverTools(page: Page) {
  await page.evaluate((tolerance) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const w = window as any
    const context = w.store.getState().viewer.context
    const demand = context.getRenderDemand()
    const gl = context.getRenderer().getContext()
    const frames: Record<string, Uint8Array> = {}
    const read = () => {
      const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4)
      const bound = gl.getParameter(gl.FRAMEBUFFER_BINDING)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      gl.bindFramebuffer(gl.FRAMEBUFFER, bound)
      return pixels
    }
    w.__mrHover = {
      next: (name: string, askFull: boolean, timeoutMs = 15000) => new Promise((resolve, reject) => {
        const painting = context.getLegacyRendererWrapper().update
        const timer = setTimeout(() => {
          context.setRenderUpdate(painting)
          reject(new Error(`no paint for ${name}`))
        }, timeoutMs)
        context.setRenderUpdate((...args: unknown[]) => {
          const overlayPaints = demand.stats.overlayPaints
          const painted = painting(...args)
          if (painted) {
            frames[name] = read()
            clearTimeout(timer)
            context.setRenderUpdate(painting)
            resolve(demand.stats.overlayPaints > overlayPaints ? 'overlay' : 'full')
          }
          return painted
        })
        if (askFull) {
          demand.invalidate()
        }
      }),
      diff: (a: string, b: string) => {
        const x = frames[a]
        const y = frames[b]
        let n = 0
        for (let at = 0; at < x.length; at += 4) {
          if (Math.abs(x[at] - y[at]) > tolerance || Math.abs(x[at + 1] - y[at + 1]) > tolerance ||
            Math.abs(x[at + 2] - y[at + 2]) > tolerance) {
            n++
          }
        }
        return n / (x.length / 4)
      },
      hoverCount: () => {
        const hover = w.store.getState().viewer.highlighter.hoverOverlay?.hover
        return hover ? hover.resolve().reduce((sum: number, {batchIds}: any) => sum + batchIds.length, 0) : 0
      },
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }, CHANNEL_TOLERANCE)
}


/**
 * Hover a batched part as the user does, and catch the frame that hover
 * painted as `hover`. The pointer first rests on empty canvas, so the hover
 * below is a change (cursor-leave cleared the last one through the viewer's
 * own path); then it moves onto the projected centre of the model's largest
 * part.
 *
 * @param page
 * @return the kind of paint the hover made
 */
async function hoverSomething(page: Page): Promise<string> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const targets = await page.evaluate(() => {
    const w = window as any
    const context = w.store.getState().viewer.context
    const canvas = context.getRenderer().domElement as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    const camera = context.getCamera()
    let best: any = null
    w.store.getState().model.traverse((o: any) => {
      if (!o.isBatchedMesh) {
        return
      }
      o._instanceInfo.forEach((info: any, id: number) => {
        if (!info.active || !o.getVisibleAt(id)) {
          return
        }
        const sphere = o.getBoundingSphereAt(o.getGeometryIdAt(id), new (o.boundingSphere.constructor)())
        const matrix = new (o.matrixWorld.constructor)()
        o.getMatrixAt(id, matrix)
        sphere.applyMatrix4(matrix).applyMatrix4(o.matrixWorld)
        if (best === null || sphere.radius > best.radius) {
          best = sphere
        }
      })
    })
    const at = best.center.clone().project(camera)
    const hit = {x: rect.left + ((at.x + 1) / 2 * rect.width), y: rect.top + ((1 - at.y) / 2 * rect.height)}
    // Empty canvas: the first grid point over the canvas whose ray meets
    // nothing, checked later from the page side.
    const empties = []
    for (let i = 1; i < 8; i++) {
      for (let j = 1; j < 8; j++) {
        const x = Math.round(rect.left + (rect.width * i / 8))
        const y = Math.round(rect.top + (rect.height * j / 8))
        if (document.elementFromPoint(x, y) === canvas) {
          empties.push({x, y})
        }
      }
    }
    return {hit, empties}
  })
  let isEmptyFound = false
  for (const point of targets.empties) {
    await page.mouse.move(point.x, point.y)
    const onModel = await page.evaluate(() =>
      (window as any).store.getState().viewer.context.castRayIfc()?.object !== undefined)
    if (!onModel) {
      isEmptyFound = true
      break
    }
  }
  if (!isEmptyFound) {
    throw new Error('hoverSomething: no empty canvas point to start from')
  }
  await page.waitForTimeout(HOVER_SETTLE_MS)
  expect(await page.evaluate(() => (window as any).__mrHover.hoverCount()), 'no hover on empty canvas').toBe(0)
  const caught = page.evaluate((ms) => (window as any).__mrHover.next('hover', false, ms), HOVER_PAINT_MS)
  await page.mouse.move(Math.round(targets.hit.x), Math.round(targets.hit.y))
  await page.waitForTimeout(HOVER_SETTLE_MS)
  expect(await page.evaluate(() => (window as any).__mrHover.hoverCount()), 'the part is hovered').toBeGreaterThan(0)
  return await caught as string
  /* eslint-enable @typescript-eslint/no-explicit-any */
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
