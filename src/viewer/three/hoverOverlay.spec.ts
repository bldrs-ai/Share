import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {waitForModelReady} from '../../tests/e2e/models'
import {clearOpfs, homepageSetup, setIsReturningUser} from '../../tests/e2e/utils'


/* eslint-disable @typescript-eslint/no-explicit-any */


const {beforeEach} = test

// A real IFC of a few hundred instances, loaded as a batched model, so the
// hover goes through ShareViewer's batched branch and the overlay draws it.
// Copied to `__test_fixtures__/` by `yarn test-flows-build`. The default URL:
// the overlay is on by default (`disableHoverOverlay` turns it off).
const MODEL_URL = '/share/v/p/__test_fixtures__/Momentum.ifc'
// The hosted STEP logo: seven block occurrences of two part shapes, so a
// hover that went by part (or product) would light more than one block.
const STEP_URL = '/share/v/p/index.step'
// Smaller than either form factor's viewport, for the resize leg.
const RESIZED_VIEWPORT = {width: 360, height: 640}
const RESTORE_AFTER_MS = 100
const TEST_TIMEOUT_MS = 240_000
const MODEL_TIMEOUT_MS = 120_000
// Longer than the slowest hover interval (hoverPick.js MAX_INTERVAL_MS), so
// any trailing pick has fired.
const HOVER_SETTLE_MS = 600
// Dense enough to land on the small STEP logo at the phone viewport; points
// that miss the model are skipped cheaply (`findHoverPoint`).
const GRID_COLUMNS = 8
const GRID_ROWS = 10
// A channel step above this is a changed pixel. The same scene from the same
// camera on the same renderer draws the same pixels, so this only has to
// absorb blending rounding.
const CHANNEL_TOLERANCE = 2
// The share of pixels an overlay composite may differ from a full repaint of
// the same state by: where another surface lies at the hovered one's 16-bit
// depth code, the overlay shows the hovered one and the recolour the one
// drawn last (hoverOverlay.js module doc). Measured 0 on this model.
const SAME_FRAME_PIXELS = 0.0005
// The fewest pixels a hover must change for it to count as shown, and the
// fewest hidden pixels for an element to count as partly occluded.
const MIN_HIGHLIGHT_PIXELS = 50
const MIN_OCCLUDED_PIXELS = 100
const PAINT_TIMEOUT_MS = 15_000
const WHEEL_ZOOM_DELTA = -200


/**
 * In-page tools: capture the next frame the viewer paints (and which kind of
 * paint it was), and compare captures pixel for pixel without shipping them
 * out of the page.
 *
 * @param page
 */
async function installFrameTools(page: Page) {
  await page.evaluate((timeoutMs) => {
    const w = window as any
    const viewer = w.store.getState().viewer
    const context = viewer.context
    const demand = context.getRenderDemand()
    const gl = context.getRenderer().getContext()
    const frames: Record<string, Uint8Array> = {}
    const masks: Record<string, Uint8Array> = {}
    const read = () => {
      const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4)
      // The default framebuffer, read inside the frame that drew it (the
      // canvas doesn't preserve its buffer); three's binding put back.
      const bound = gl.getParameter(gl.FRAMEBUFFER_BINDING)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      gl.bindFramebuffer(gl.FRAMEBUFFER, bound)
      return pixels
    }
    const changed = (a: Uint8Array, b: Uint8Array, tolerance: number) => {
      const out = new Uint8Array(a.length / 4)
      for (let p = 0; p < out.length; p++) {
        const at = p * 4
        if (Math.abs(a[at] - b[at]) > tolerance || Math.abs(a[at + 1] - b[at + 1]) > tolerance ||
          Math.abs(a[at + 2] - b[at + 2]) > tolerance) {
          out[p] = 1
        }
      }
      return out
    }
    w.__ovl = {
      // The next frame that paints, under `name`. `ask` asks for one first:
      // 'full' a full paint, 'overlay' an overlay paint (full if the overlay
      // can't compose one); null waits for whatever paints next.
      next: (name: string, ask: string | null) => new Promise((resolve, reject) => {
        w.__ovl.cancel()
        const painting = context.getLegacyRendererWrapper().update
        const done = () => {
          clearTimeout(timer)
          context.setRenderUpdate(painting)
          w.__ovlPending = null
        }
        const timer = setTimeout(() => {
          done()
          reject(new Error(`no paint for ${name}`))
        }, timeoutMs)
        w.__ovlPending = done
        context.setRenderUpdate((...args: unknown[]) => {
          const overlayPaints = demand.stats.overlayPaints
          const painted = painting(...args)
          if (painted) {
            frames[name] = read()
            done()
            resolve(demand.stats.overlayPaints > overlayPaints ? 'overlay' : 'full')
          }
          return painted
        })
        if (ask === 'full') {
          demand.invalidate()
        } else if (ask === 'overlay') {
          demand.invalidateOverlay()
        }
      }),
      // Stop waiting for a frame (`next` that nothing will paint for).
      cancel: () => w.__ovlPending?.(),
      // Take the hover off, as the cursor leaving the model does.
      clearHover: () => viewer._clearPreselectionForAllModels(),
      // Pixels that differ between two captures, kept as mask `name`.
      mask: (name: string, a: string, b: string, tolerance: number) => {
        masks[name] = changed(frames[a], frames[b], tolerance)
        return masks[name].reduce((n: number, v: number) => n + v, 0)
      },
      // Pixels set in mask `a` and (unless `negate`) set / not set in `b`.
      both: (a: string, b: string, negate = false) => {
        let n = 0
        for (let p = 0; p < masks[a].length; p++) {
          n += masks[a][p] && (negate ? !masks[b][p] : masks[b][p]) ? 1 : 0
        }
        return n
      },
      pixels: () => gl.drawingBufferWidth * gl.drawingBufferHeight,
      // The batches and ids the overlay is drawing, and their parents.
      hovered: () => {
        const hover = viewer.highlighter.hoverOverlay.hover
        const live = hover ? hover.resolve() : []
        const parents = new Set<number>()
        for (const {mesh, batchIds} of live) {
          batchIds.forEach((id: number) => parents.add(mesh.instanceParents[id]))
        }
        return {count: live.reduce((n: number, {batchIds}: any) => n + batchIds.length, 0),
          parents: [...parents].sort((a, b) => a - b)}
      },
      // Show only the hovered instances (or nothing), for their footprint;
      // `restore()` puts every batch's visibility back.
      isolateHovered: (showHovered: boolean) => {
        const live = viewer.highlighter.hoverOverlay.hover.resolve()
        const keep = new Map<any, Set<number>>(live.map(({mesh, batchIds}: any) => [mesh, new Set<number>(batchIds)]))
        // Saved by the first call only, so a second call (hovered shown,
        // then hidden) still restores the model as it was before either.
        const saved: Array<() => void> | null = w.__ovlRestore ? null : []
        w.store.getState().model.traverse((o: any) => {
          if (!o.isBatchedMesh) {
            return
          }
          o._instanceInfo.forEach((info: any, id: number) => {
            if (info.active) {
              const was = info.visible
              o.setVisibleAt(id, showHovered && keep.get(o)?.has(id) === true)
              saved?.push(() => o.setVisibleAt(id, was))
            }
          })
        })
        if (saved !== null) {
          w.__ovlRestore = () => saved.forEach((undo) => undo())
        }
      },
      restore: () => {
        w.__ovlRestore?.()
        w.__ovlRestore = null
      },
      // Mask `name` = pixels set in mask `a` and not in mask `b`.
      andNot: (name: string, a: string, b: string) => {
        masks[name] = masks[a].map((v: number, p: number) => (v && !masks[b][p] ? 1 : 0))
        return masks[name].reduce((n: number, v: number) => n + v, 0)
      },
    }
  }, PAINT_TIMEOUT_MS)
}


/**
 * @param page
 * @param name
 * @param ask 'full', 'overlay' or null (see `__ovl.next`)
 * @return which kind of paint the frame was
 */
async function nextFrame(page: Page, name: string, ask: 'full' | 'overlay' | null): Promise<string> {
  return await page.evaluate(({n, a}) => (window as any).__ovl.next(n, a), {n: name, a: ask})
}


/**
 * @param page
 * @param name
 * @param a
 * @param b
 * @return how many pixels differ between captures `a` and `b`
 */
async function mask(page: Page, name: string, a: string, b: string): Promise<number> {
  return await page.evaluate(({n, x, y, t}) => (window as any).__ovl.mask(n, x, y, t),
    {n: name, x: a, y: b, t: CHANNEL_TOLERANCE})
}


/**
 * @param page
 * @return the canvas's pixel count
 */
async function pixelCount(page: Page): Promise<number> {
  return await page.evaluate(() => (window as any).__ovl.pixels())
}


/**
 * @param page
 * @return what the overlay is drawing
 */
async function hovered(page: Page): Promise<{count: number, parents: number[]}> {
  return await page.evaluate(() => (window as any).__ovl.hovered())
}


/**
 * Canvas points spread over the viewport, each where the canvas (not a panel
 * or drawer) is what the pointer is over.
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
 * Open the model with the overlay on and wait until it is still.
 *
 * @param page
 */
async function openModel(page: Page, url: string = MODEL_URL) {
  await page.goto(url)
  await waitForModelReady(page, MODEL_TIMEOUT_MS)
  await expect.poll(() => page.evaluate(() => {
    const w = window as any
    let batches = 0
    w.store.getState().model?.traverse?.((o: any) => {
      batches += o.isBatchedMesh ? 1 : 0
    })
    return batches > 0 && w.store.getState().viewer?.highlighter?.hoverOverlay?.enabled === true
  }), {message: 'a batched model with the hover overlay on', timeout: MODEL_TIMEOUT_MS}).toBe(true)
  await installFrameTools(page)
}


/**
 * Hover `point` as the user does, catching the frame the hover paints.
 *
 * @param page
 * @param point
 * @param name capture name for that frame
 * @return the kind of paint it was, or null when the hover found nothing
 */
async function hoverAndCatch(page: Page, point: {x: number, y: number}, name: string): Promise<string | null> {
  const caught = nextFrame(page, name, null).catch(() => null)
  await page.mouse.move(point.x, point.y)
  await page.waitForTimeout(HOVER_SETTLE_MS)
  if ((await hovered(page)).count === 0) {
    await page.evaluate(() => (window as any).__ovl.cancel())
    return null
  }
  return await caught
}


/**
 * Find a canvas point whose hover the overlay draws, starting from a clean
 * base frame each time.
 *
 * @param page
 * @param accept extra test on the point (default any)
 * @return the point and the kind of paint its hover made
 */
async function findHoverPoint(page: Page,
  accept: (p: {x: number, y: number}) => Promise<boolean> = () => Promise.resolve(true)) {
  for (const point of await canvasPoints(page)) {
    // Skip a point whose ray meets no batch, without the full capture dance.
    // Read a pixel beside it, so the hover's own move below is a real move
    // (the picker skips a pointer that hasn't moved).
    await page.mouse.move(point.x - 1, point.y)
    const isOnBatch = await page.evaluate(() =>
      (window as any).store.getState().viewer.context.castRayIfc()?.object?.isBatchedMesh === true)
    if (!isOnBatch) {
      continue
    }
    await page.evaluate(() => (window as any).__ovl.clearHover())
    await page.waitForTimeout(HOVER_SETTLE_MS)
    await nextFrame(page, 'base', 'full')
    const kind = await hoverAndCatch(page, point, 'hover')
    if (kind !== null && await accept(point)) {
      return {point, kind}
    }
  }
  throw new Error('no canvas point hovers anything the overlay draws')
}


/**
 * Hover somewhere the overlay draws, and check the frame the hover painted
 * was an overlay frame that matches a full repaint of the same state.
 *
 * @param page
 */
async function expectOverlayHoverMatchesFull(page: Page) {
  const {kind} = await findHoverPoint(page)
  expect(kind).toBe('overlay')
  expect(await mask(page, 'shown', 'base', 'hover')).toBeGreaterThan(MIN_HIGHLIGHT_PIXELS)
  expect(await nextFrame(page, 'full', 'full')).toBe('full')
  const off = await mask(page, 'off', 'hover', 'full')
  expect(off / await pixelCount(page)).toBeLessThanOrEqual(SAME_FRAME_PIXELS)
}


/**
 * The hover overlay (viewer/three/hoverOverlay.js, on by default):
 * a hover change on a batched model is drawn on the cached frame of the last
 * full paint, not by repainting the model. The frame the user sees after a
 * hover must be the one a full repaint of the same state would draw.
 */
describeMobileAndDesktop('viewer/three/hoverOverlay', (ff) => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await clearOpfs(page)
  })

  test('a hover paints its highlight as an overlay that matches a full repaint', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await openModel(page)
    const {kind} = await findHoverPoint(page)
    // The user's own action painted an overlay frame, not a full one.
    expect(kind).toBe('overlay')
    // It shows: the hover changed pixels against the base frame.
    expect(await mask(page, 'shown', 'base', 'hover')).toBeGreaterThan(MIN_HIGHLIGHT_PIXELS)
    // And it is what a full repaint of this state draws.
    expect(await nextFrame(page, 'full', 'full')).toBe('full')
    const off = await mask(page, 'off', 'hover', 'full')
    expect(off / await pixelCount(page)).toBeLessThanOrEqual(SAME_FRAME_PIXELS)
  })

  test('an element partly behind another is highlighted only where it is seen', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS * 2)
    await openModel(page)
    // A hovered element whose silhouette (drawn alone) has enough pixels the
    // shipped hover (the recolour, drawn in full) does not light: hidden
    // behind something else.
    let occluded = 0
    await findHoverPoint(page, async () => {
      await page.evaluate(() => (window as any).__ovl.isolateHovered(true))
      await nextFrame(page, 'alone', 'full')
      await page.evaluate(() => (window as any).__ovl.isolateHovered(false))
      await nextFrame(page, 'empty', 'full')
      await page.evaluate(() => (window as any).__ovl.restore())
      await nextFrame(page, 'restored', 'full')
      // Back as it was: the restored scene, hover and all, is the hover frame.
      expect(await mask(page, 'unrestored', 'hover', 'restored')).toBeLessThanOrEqual(
        Math.ceil(SAME_FRAME_PIXELS * await pixelCount(page)))
      await mask(page, 'silhouette', 'alone', 'empty')
      const shown = await mask(page, 'shown', 'base', 'hover')
      occluded = await page.evaluate(() => (window as any).__ovl.both('silhouette', 'shown', true))
      return shown > MIN_HIGHLIGHT_PIXELS && occluded > MIN_OCCLUDED_PIXELS
    })
    expect(occluded).toBeGreaterThan(MIN_OCCLUDED_PIXELS)
    // The truth for this element: the recolour, with the overlay turned off
    // for one re-pick at the same point.
    const before = await hovered(page)
    await page.evaluate(() => {
      const viewer = (window as any).store.getState().viewer
      viewer.highlighter.hoverOverlay.enabled = false
      viewer._clearPreselectionForAllModels()
    })
    const {x, y} = await page.evaluate(() => {
      const w = window as any
      const rect = (document.querySelector('canvas') as HTMLCanvasElement).getBoundingClientRect()
      const m = w.store.getState().viewer.context.getNormalizedMousePosition()
      return {x: rect.left + ((m.x + 1) / 2 * rect.width), y: rect.top + ((1 - m.y) / 2 * rect.height)}
    })
    await page.mouse.move(x + 1, y)
    await page.waitForTimeout(HOVER_SETTLE_MS)
    await page.mouse.move(x, y)
    await page.waitForTimeout(HOVER_SETTLE_MS)
    const recoloured = await page.evaluate(() => {
      const parents = new Set<number>()
      ;(window as any).store.getState().model.traverse((o: any) => {
        for (const id of o.userData?.batchedHighlight?.preSet ?? []) {
          parents.add(o.instanceParents[id])
        }
      })
      return [...parents].sort((a, b) => a - b)
    })
    expect(recoloured).toEqual(before.parents)
    await nextFrame(page, 'truth', 'full')
    await mask(page, 'truthShown', 'base', 'truth')
    // Nothing the overlay lit is hidden in the shipped look...
    const litBehind = await page.evaluate(() => (window as any).__ovl.both('shown', 'truthShown', true))
    expect(litBehind / await pixelCount(page)).toBeLessThanOrEqual(SAME_FRAME_PIXELS)
    // ...in particular none of the silhouette the shipped look hides, which
    // is what a draw without the depth test would light...
    const hidden = await page.evaluate(() => (window as any).__ovl.andNot('hidden', 'silhouette', 'truthShown'))
    expect(hidden).toBeGreaterThan(MIN_OCCLUDED_PIXELS)
    const litHidden = await page.evaluate(() => (window as any).__ovl.both('shown', 'hidden'))
    expect(litHidden / await pixelCount(page)).toBeLessThanOrEqual(SAME_FRAME_PIXELS)
    // ...and the two frames match.
    const off = await mask(page, 'off', 'hover', 'truth')
    expect(off / await pixelCount(page)).toBeLessThanOrEqual(SAME_FRAME_PIXELS)
  })

  test('moving the camera after a hover leaves no stale overlay', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await openModel(page)
    const {point} = await findHoverPoint(page)
    await nextFrame(page, 'before', 'overlay')
    // The user zooms over the canvas; camera-controls damps to rest.
    await page.mouse.move(point.x, point.y)
    await page.mouse.wheel(0, WHEEL_ZOOM_DELTA)
    await page.waitForTimeout(HOVER_SETTLE_MS * 2)
    // An overlay frame now composes from a cache of the NEW pose: the same
    // pixels as a full repaint, and not the old frame's.
    await nextFrame(page, 'after', 'overlay')
    await nextFrame(page, 'afterFull', 'full')
    const off = await mask(page, 'off', 'after', 'afterFull')
    expect(off / await pixelCount(page)).toBeLessThanOrEqual(SAME_FRAME_PIXELS)
    expect(await mask(page, 'moved', 'before', 'after')).toBeGreaterThan(MIN_HIGHLIGHT_PIXELS)
  })

  test('a double-click selects what the hover highlighted', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await openModel(page)
    const {point} = await findHoverPoint(page)
    const {parents} = await hovered(page)
    expect(parents.length).toBeGreaterThan(0)
    await page.mouse.dblclick(point.x, point.y)
    const handle = await page.waitForFunction(() => {
      const ids = (window as any).store.getState().selectedElements ?? []
      return ids.length > 0 ? ids.map(Number) : null
    }, null, {timeout: 10_000})
    expect(await handle.jsonValue()).toEqual(expect.arrayContaining(parents))
    // Hovering the element that is now selected draws the hover over the
    // selection colour, as the recolour did (preselection wins): an overlay
    // frame that differs from the selected one and matches a full repaint.
    const stillCanvas = await page.evaluate(({x, y}) =>
      document.elementFromPoint(x, y) === document.querySelector('canvas'), point)
    if (stillCanvas) {
      await page.evaluate(() => (window as any).__ovl.clearHover())
      await page.waitForTimeout(HOVER_SETTLE_MS)
      await nextFrame(page, 'selected', 'full')
      // A pointer move to a pixel beside it re-picks the same element (the
      // clear reset the hover's dedup), and that pick is the frame caught.
      expect(await hoverAndCatch(page, {x: point.x + 1, y: point.y}, 'selectedHover')).toBe('overlay')
      expect(await mask(page, 'onSelected', 'selected', 'selectedHover')).toBeGreaterThan(MIN_HIGHLIGHT_PIXELS)
      await nextFrame(page, 'selectedFull', 'full')
      const off = await mask(page, 'off', 'selectedHover', 'selectedFull')
      expect(off / await pixelCount(page)).toBeLessThanOrEqual(SAME_FRAME_PIXELS)
    }
  })

  test('a STEP hover lights one occurrence, as an overlay that matches a full repaint', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await openModel(page, STEP_URL)
    await expectOverlayHoverMatchesFull(page)
    // One block, not every occurrence of its part shape.
    expect((await hovered(page)).count).toBe(1)
  })

  test('after a resize, hover still composes a frame that matches a full repaint', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await openModel(page)
    await expectOverlayHoverMatchesFull(page)
    const before = await pixelCount(page)
    await page.setViewportSize(RESIZED_VIEWPORT)
    await expect.poll(() => pixelCount(page)).not.toBe(before)
    await page.waitForTimeout(HOVER_SETTLE_MS)
    await expectOverlayHoverMatchesFull(page)
  })

  test('after a WebGL context loss and restore, hover still matches a full repaint', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await openModel(page)
    await expectOverlayHoverMatchesFull(page)
    const hadBaseWhenLost = await page.evaluate((restoreAfterMs) => new Promise<boolean>((resolve) => {
      const viewer = (window as any).store.getState().viewer
      const canvas = viewer.context.getRenderer().domElement
      const lose = viewer.context.getRenderer().getContext().getExtension('WEBGL_lose_context')
      let hadBase = true
      // Registered after the overlay's own listener, so this reads what it did.
      canvas.addEventListener('webglcontextlost', () => {
        hadBase = viewer.highlighter.hoverOverlay.hasBase
        setTimeout(() => lose.restoreContext(), restoreAfterMs)
      }, {once: true})
      canvas.addEventListener('webglcontextrestored', () => resolve(hadBase), {once: true})
      lose.loseContext()
    }), RESTORE_AFTER_MS)
    // Lost, the overlay may not compose from a cache GL threw away.
    expect(hadBaseWhenLost).toBe(false)
    await page.waitForTimeout(HOVER_SETTLE_MS)
    await expectOverlayHoverMatchesFull(page)
  })

  if (ff.isMobile) {
    test('a tap leaves a frame that matches a full repaint', async ({page}) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      await openModel(page)
      const [point] = await canvasPoints(page)
      await nextFrame(page, 'base', 'full')
      await page.touchscreen.tap(point.x, point.y)
      await page.waitForTimeout(HOVER_SETTLE_MS * 2)
      // Whatever the tap's compatibility mouse events hovered, the frame on
      // screen now (asked as an overlay frame, full if it can't be one) is
      // the one a full repaint of the same state draws.
      await nextFrame(page, 'tapped', 'overlay')
      await nextFrame(page, 'tappedFull', 'full')
      const off = await mask(page, 'off', 'tapped', 'tappedFull')
      expect(off / await pixelCount(page)).toBeLessThanOrEqual(SAME_FRAME_PIXELS)
    })
  }
})
