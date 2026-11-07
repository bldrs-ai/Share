/* eslint-disable no-magic-numbers */
import {Page, expect, test} from '@playwright/test'
import {CanvasFrame, SAME_FRAME_TOLERANCE, frameDifference} from '../../tests/e2e/canvasFrame'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {waitForModelReady} from '../../tests/e2e/models'
import {captureRenderedFrame, homepageSetup, setIsReturningUser} from '../../tests/e2e/utils'


const {beforeEach} = test


/**
 * Render-on-demand for the whole session (`?feature=renderOnDemand`, story
 * #2055; src/viewer/three/renderDemand.js). Two promises, both read off the
 * viewer's own paint counter (`RenderDemand#stats`, counted at the render
 * seam, DESIGN.md §"Render loop & perf monitor"):
 *
 *  - an idle viewer stops painting while its loop keeps ticking;
 *  - the user's camera input, a selection and a resize each repaint, and
 *    the LAST frame the viewer painted on its own is the right one.
 *
 * The second is the check that matters, because the failure render-on-demand
 * can have is a stale frame: a change that never asked for a paint leaves the
 * old picture up. So each test records what the viewer's own paints drew
 * (`recordPaints`, reading the drawing buffer inside each painted frame),
 * lets it go idle, then forces one fresh paint of the current scene
 * (`captureRenderedFrame`) and requires the two to match. A source that
 * forgot to ask fails either way round: no paint at all, or a last paint
 * that predates the change (camera-controls' damping tail, a highlight
 * applied a frame after the click).
 */
describeMobileAndDesktop('viewer/three/renderOnDemand', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await page.goto('/share/v/p/index.ifc?feature=renderOnDemand')
    await waitForModelReady(page)
    await waitForIdle(page)
  })


  test('an idle viewer stops painting while its loop keeps ticking', async ({page}) => {
    const before = await readStats(page)
    await page.waitForTimeout(IDLE_QUIET_MS)
    const after = await readStats(page)
    expect(after.frames - before.frames, 'the render loop kept running').toBeGreaterThan(10)
    expect(after.paints - before.paints, 'an idle viewer painted').toBe(0)
  })


  test('a camera drag repaints, through the end of its damping', async ({page}) => {
    const before = await captureRenderedFrame(page)
    const {x, y} = await canvasCenter(page)
    await startRecording(page)
    await page.mouse.move(x, y)
    await page.mouse.down()
    // A fling: two long moves and an immediate release. camera-controls
    // eases the camera after the pointer (damping), so most of the turn
    // lands in frames after the pointerup that no input event announces.
    await page.mouse.move(x + 90, y + 20)
    await page.mouse.move(x + 180, y + 40)
    await page.mouse.up()
    const painted = await stopRecordingWhenIdle(page)
    expect(painted.paints, 'the drag painted').toBeGreaterThan(0)
    expect(frameDifference(painted.last, before), 'the camera moved on screen').toBeGreaterThan(SAME_FRAME_TOLERANCE)
    // The camera's own numbers are the sharper witness: a damping tail too
    // small for the pixel grid still moves the pose.
    expect(painted.lastPose, 'the last paint showed where the camera came to rest').toEqual(painted.poseNow)
    await expectLastPaintCurrent(page, painted.last)
  })


  test('a selection repaints with its highlight', async ({page}) => {
    const before = await captureRenderedFrame(page)
    await startRecording(page)
    await selectAtCanvas(page)
    const painted = await stopRecordingWhenIdle(page)
    expect(painted.paints, 'the selection painted').toBeGreaterThan(0)
    expect(frameDifference(painted.last, before), 'the highlight is on screen').toBeGreaterThan(SAME_FRAME_TOLERANCE)
    await expectLastPaintCurrent(page, painted.last)
  })


  test('a resize repaints at the new size', async ({page}) => {
    const viewport = page.viewportSize()
    if (viewport === null) {
      throw new Error('no viewport')
    }
    const before = await captureRenderedFrame(page)
    await startRecording(page)
    await page.setViewportSize({width: Math.round(viewport.width * 0.75), height: viewport.height})
    const painted = await stopRecordingWhenIdle(page)
    expect(painted.paints, 'the resize painted').toBeGreaterThan(0)
    // The grid's row count follows the canvas aspect, so a new shape shows
    // as a different grid.
    expect(painted.last.rows, 'the last paint is at the new size').not.toBe(before.rows)
    await expectLastPaintCurrent(page, painted.last)
  })
})


/** How long the viewer must paint nothing to count as idle. */
const IDLE_QUIET_MS = 1500
/** How long a test waits for the viewer to go idle. */
const IDLE_TIMEOUT_MS = 15_000
/** Cells across a recorded frame, as `captureRenderedFrame`'s. */
const FRAME_COLS = 64


type Stats = {paints: number, frames: number}


/**
 * @param page
 * @return the viewer's paint and frame counters
 */
async function readStats(page: Page): Promise<Stats> {
  return await page.evaluate(() => {
    const stats = (window as unknown as RodWindow).store?.getState().viewer?.context?.getRenderDemand?.()?.stats
    if (!stats) {
      throw new Error('readStats: no RenderDemand on window.store.getState().viewer.context')
    }
    return {paints: stats.paints, frames: stats.frames}
  })
}


/**
 * Wait until the viewer has painted nothing for {@link IDLE_QUIET_MS} while
 * its loop ticked.
 *
 * @param page
 */
async function waitForIdle(page: Page) {
  const deadline = Date.now() + IDLE_TIMEOUT_MS
  let last = await readStats(page)
  let quietSince = Date.now()
  while (Date.now() < deadline) {
    await page.waitForTimeout(250)
    const now = await readStats(page)
    if (now.paints !== last.paints) {
      quietSince = Date.now()
    } else if (Date.now() - quietSince >= IDLE_QUIET_MS && now.frames > last.frames) {
      return
    }
    last = now
  }
  throw new Error(`waitForIdle: the viewer still paints after ${IDLE_TIMEOUT_MS} ms`)
}


/**
 * Record what each of the viewer's own paints draws: wrap the render seam so
 * that, inside every frame the RenderDemand let paint, the drawing buffer is
 * read into the same grid `captureRenderedFrame` returns. The buffer must be
 * read in the painting frame's own task (the renderer has no
 * `preserveDrawingBuffer`). Frames that don't paint are passed through
 * untouched, so this asks for nothing itself.
 *
 * @param page
 */
async function startRecording(page: Page) {
  await page.evaluate((cols) => {
    const w = window as unknown as RodWindow
    const context = w.store?.getState().viewer?.context
    const painting = context?.getLegacyRendererWrapper?.().update
    const demand = context?.getRenderDemand?.()
    const gl = context?.getRenderer?.().getContext()
    if (!context?.setRenderUpdate || typeof painting !== 'function' || !demand || !gl) {
      throw new Error('startRecording: no render seam, RenderDemand or WebGL context')
    }
    const read = (): CanvasFrame => {
      const width = gl.drawingBufferWidth
      const height = gl.drawingBufferHeight
      const pixels = new Uint8Array(width * height * 4)
      const bound = gl.getParameter(gl.FRAMEBUFFER_BINDING)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      gl.bindFramebuffer(gl.FRAMEBUFFER, bound)
      const rows = Math.max(1, Math.round(cols * height / width))
      const rgb = new Array(cols * rows * 3).fill(0)
      const counts = new Array(cols * rows).fill(0)
      for (let py = 0; py < height; py++) {
        const cy = Math.min(rows - 1, Math.floor(py * rows / height))
        for (let px = 0; px < width; px++) {
          const cell = (cy * cols) + Math.min(cols - 1, Math.floor(px * cols / width))
          const at = ((py * width) + px) * 4
          rgb[cell * 3] += pixels[at]
          rgb[(cell * 3) + 1] += pixels[at + 1]
          rgb[(cell * 3) + 2] += pixels[at + 2]
          counts[cell]++
        }
      }
      for (let cell = 0; cell < counts.length; cell++) {
        for (let c = 0; c < 3; c++) {
          rgb[(cell * 3) + c] = Math.round(rgb[(cell * 3) + c] / Math.max(1, counts[cell]))
        }
      }
      return {cols, rows, rgb}
    }
    const pose = (): number[] => {
      const camera = context.getCamera?.()
      return camera ? [...camera.position.toArray(), ...camera.quaternion.toArray()] : []
    }
    const recording = {paints: 0, last: null as CanvasFrame | null, lastPose: [] as number[], painting, pose}
    w.__rodRecording = recording
    context.setRenderUpdate((...args: unknown[]) => {
      const paintsBefore = demand.stats.paints
      painting(...args)
      if (demand.stats.paints !== paintsBefore) {
        recording.paints++
        recording.last = read()
        recording.lastPose = pose()
      }
    })
  }, FRAME_COLS)
}


/**
 * Wait for the viewer to go idle, then stop recording and put the real
 * update back.
 *
 * @param page
 * @return how many paints were recorded, the last one's frame and camera
 */
async function stopRecordingWhenIdle(page: Page): Promise<Recorded> {
  await waitForIdle(page)
  const recorded = await page.evaluate(() => {
    const w = window as unknown as RodWindow
    const recording = w.__rodRecording
    if (!recording) {
      throw new Error('stopRecordingWhenIdle: not recording')
    }
    w.store?.getState().viewer?.context?.setRenderUpdate?.(recording.painting)
    delete w.__rodRecording
    return {paints: recording.paints, last: recording.last, lastPose: recording.lastPose, poseNow: recording.pose()}
  })
  expect(recorded.last, 'the viewer painted while recording').not.toBeNull()
  return recorded as Recorded
}


/** What `stopRecordingWhenIdle` hands back. */
type Recorded = {
  paints: number
  /** The last paint's frame. */
  last: CanvasFrame
  /** The camera's position and quaternion at the last paint, and now. */
  lastPose: number[]
  poseNow: number[]
}


/**
 * The frame the viewer last painted on its own must be what a fresh paint of
 * the scene shows now: nothing changed after it without asking.
 *
 * @param page
 * @param last the last recorded paint
 */
async function expectLastPaintCurrent(page: Page, last: CanvasFrame) {
  const fresh = await captureRenderedFrame(page)
  expect(fresh.rows, 'same canvas shape').toBe(last.rows)
  expect(frameDifference(last, fresh), 'the last on-demand paint is stale').toBeLessThanOrEqual(SAME_FRAME_TOLERANCE)
}


/**
 * @param page
 * @return the canvas's centre, in page coordinates
 */
async function canvasCenter(page: Page): Promise<{x: number, y: number}> {
  const box = await page.locator('#viewer-container canvas').first().boundingBox()
  if (box === null) {
    throw new Error('canvasCenter: the viewer canvas is not laid out')
  }
  return {x: box.x + (box.width / 2), y: box.y + (box.height / 2)}
}


/**
 * Double-click the model where the canvas is uncovered, trying points out
 * from the centre until one selects an element (the phone layout puts
 * panels over parts of the canvas).
 *
 * @param page
 */
async function selectAtCanvas(page: Page) {
  const {x, y} = await canvasCenter(page)
  const offsets = [[0, 0], [0, -40], [-40, 0], [40, 0], [0, 40], [-40, -40], [40, -40]]
  for (const [dx, dy] of offsets) {
    const onCanvas = await page.evaluate(([px, py]) =>
      document.elementFromPoint(px, py)?.tagName === 'CANVAS', [x + dx, y + dy])
    if (!onCanvas) {
      continue
    }
    await page.mouse.dblclick(x + dx, y + dy)
    const isSelected = await page.waitForFunction(() =>
      ((window as unknown as RodWindow).store?.getState().selectedElements ?? []).length > 0,
    undefined, {timeout: 3000}).then(() => true, () => false)
    if (isSelected) {
      return
    }
  }
  throw new Error('selectAtCanvas: no double-click on the canvas selected an element')
}


type RodWindow = Window & {
  store?: {getState: () => {
    selectedElements?: unknown[]
    viewer?: {context?: {
      setRenderUpdate?: (fn: (...args: unknown[]) => void) => void
      getLegacyRendererWrapper?: () => {update?: (...args: unknown[]) => void}
      getRenderer?: () => {getContext: () => WebGLRenderingContext}
      getRenderDemand?: () => {stats: {paints: number, frames: number}} | null
      getCamera?: () => {position: {toArray: () => number[]}, quaternion: {toArray: () => number[]}}
    }}
  }}
  __rodRecording?: {
    paints: number
    last: CanvasFrame | null
    lastPose: number[]
    painting: (...args: unknown[]) => void
    pose: () => number[]
  }
}
