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
// The frame-aligned leg sweeps the pointer across the canvas along these
// rows, from one side to the other, in this many mouse steps each (all
// fractions of the canvas).
/* eslint-disable no-magic-numbers */
const SWEEP_ROWS = [0.4, 0.5, 0.6]
const SWEEP_FROM = 0.1
const SWEEP_TO = 0.9
/* eslint-enable no-magic-numbers */
const SWEEP_STEPS = 120
// The drawing-buffer pixel ratio the frame-aligned leg paints at. Headless
// Chromium's WebGL is SwiftShader, on the CPU, where a full-size Momentum
// frame takes ~80 ms: longer than the timer scheduler's 33 ms floor, so the
// two schedulers would pick every frame alike and nothing could tell them
// apart. A quarter of the pixels paints within a 60 Hz frame, as a GPU does.
// Only the paint's resolution changes: the canvas keeps its CSS size, so the
// layout and the pointer's normalized position (what the ray is cast from)
// are untouched.
const SWEEP_PIXEL_RATIO = 0.25
// The fast-sweep leg crosses the canvas in this few mouse steps, one a
// frame: hundreds of px per frame, far over hoverPick.js
// FAST_POINTER_PX_PER_MS.
const FAST_SWEEP_STEPS = 4
// Frames the highlight has to settle in once the pointer stops.
const SETTLE_FRAMES = 3


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
/** What one sweep recorded (see {@link recordSweep}). */
interface Sweep {
  // Paints during the sweep, each with the hover key it showed and the key
  // the latest pointer move before it was over.
  paints: {shown: string | null, current: string | null}[]
  // Paints that came after a pointer move with no hover pick between the
  // move and the paint: frames that showed a highlight older than their input.
  unpicked: number
  // Element changes along the pointer's path.
  changes: number
  picks: number
  frames: number
}


/**
 * Instrument the page for {@link recordSweep}: record each paint
 * (`RenderDemand#rendered`, the end of a painted frame) with the hover key
 * it showed (`ShareViewer#_lastBatchedPreselectKey`), each window mousemove
 * with the canvas position it moved to, each hover pick, and each frame.
 * Also lowers the drawing buffer's resolution ({@link SWEEP_PIXEL_RATIO}).
 *
 * @param page
 */
async function instrumentSweep(page: Page) {
  await page.evaluate((pixelRatio) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const w = window as any
    const viewer = w.store.getState().viewer
    const demand = viewer.context.getRenderDemand()
    const canvas = viewer.context.getDomElement()
    const renderer = viewer.context.getRenderer()
    renderer.setPixelRatio(pixelRatio)
    viewer.postProcessor.getComposer.setSize(canvas.clientWidth, canvas.clientHeight, false)
    // While recording, the viewer is held painting every frame
    // (RenderDemand#keepPainting): what is checked is what EVERY frame shows,
    // and the canvas pointermove's settle window, which otherwise paints
    // those frames, steps aside whenever a paint costs more than
    // EXPENSIVE_PAINT_MS (renderDemandHooks.js), as a slow CI runner's might.
    const rec: any = {
      paints: [], moves: [], picks: [], frames: 0, release: null,
      get on() {
        return this.release !== null
      },
      set on(isOn: boolean) {
        if (isOn && this.release === null) {
          this.release = demand.keepPainting()
        } else if (!isOn && this.release !== null) {
          this.release()
          this.release = null
        }
      },
    }
    w.__hoverSweep = rec
    // And it reads every paint as cheap. Over a paint that costs more than
    // EXPENSIVE_PAINT_MS the frame scheduler skips the picks of fast moves on
    // purpose (hoverPick.js, the fast-move gate), so on a loaded runner the
    // invariant below would not be the spec. The gate has its own leg (the
    // fast sweep below) and units.
    demand.paintCostMs = () => 0
    const rendered = demand.rendered.bind(demand)
    demand.rendered = (cost: number) => {
      rendered(cost)
      if (rec.on) {
        rec.paints.push({t: performance.now(), shown: viewer._lastBatchedPreselectKey ?? null})
      }
    }
    const pick = viewer.highlightIfcItem
    const pointer = viewer.context.getNormalizedMousePosition()
    viewer.highlightIfcItem = function(...args: any[]) {
      if (rec.on) {
        rec.picks.push({t: performance.now(), x: pointer.x, y: pointer.y})
      }
      return pick.apply(this, args)
    }
    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (rec.on) {
        const b = canvas.getBoundingClientRect()
        rec.moves.push({
          t: performance.now(),
          x: (((e.clientX - b.left) / (b.right - b.left)) * 2) - 1,
          y: -(((e.clientY - b.top) / (b.bottom - b.top)) * 2) + 1,
        })
      }
    }, {capture: true})
    const tick = () => {
      if (rec.on) {
        rec.frames++
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }, SWEEP_PIXEL_RATIO)
}


/**
 * Sweep the pointer across the canvas along one row, as the user does, and
 * read back what every painted frame showed against what the pointer was over
 * when that frame began: the key a pick at the latest move's position makes,
 * computed afterwards with the pointer still (the camera doesn't move).
 *
 * @param page
 * @param row fraction of the canvas height
 * @return the sweep
 */
async function recordSweep(page: Page, row: number): Promise<Sweep> {
  const box = await page.evaluate(() => {
    const r = (document.querySelector('canvas') as HTMLCanvasElement).getBoundingClientRect()
    return {left: r.left, top: r.top, width: r.width, height: r.height}
  })
  const rowY = box.top + (box.height * row)
  await page.mouse.move(box.left + (box.width * SWEEP_FROM), rowY)
  await page.waitForTimeout(HOVER_SETTLE_MS)
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__hoverSweep.on = true
  })
  await page.mouse.move(box.left + (box.width * SWEEP_TO), rowY, {steps: SWEEP_STEPS})
  await page.waitForTimeout(HOVER_SETTLE_MS)
  return await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const w = window as any
    const rec = w.__hoverSweep
    rec.on = false
    const viewer = w.store.getState().viewer
    const position = viewer.context.getNormalizedMousePosition()
    const [stillX, stillY] = [position.x, position.y]
    const POSITION_EPSILON = 1e-9
    const keyAt = (x: number, y: number) => {
      position.x = x
      position.y = y
      const found = viewer.context.castRayIfc()
      return found ? (viewer._batchedHoverTarget(found).key ?? null) : null
    }
    const current = rec.moves.map((m: any) => keyAt(m.x, m.y))
    position.x = stillX
    position.y = stillY
    let changes = 0
    for (let i = 1; i < current.length; i++) {
      changes += current[i] !== current[i - 1] ? 1 : 0
    }
    // Each paint against the latest move handled before it; paints before
    // the sweep's first move are the hover it started from.
    const paints = []
    let m = -1
    for (const paint of rec.paints) {
      while (m + 1 < rec.moves.length && rec.moves[m + 1].t < paint.t) {
        m++
      }
      if (m >= 0) {
        paints.push({shown: paint.shown, current: current[m]})
      }
    }
    // A paint after a move must have had a pick between them, unless the
    // move left the canvas position where the last pick saw it.
    let unpicked = 0
    let prev = -Infinity
    for (const paint of rec.paints) {
      const since = prev
      prev = paint.t
      const moved = rec.moves.filter((mv: any) => mv.t > since && mv.t < paint.t)
      if (moved.length === 0) {
        continue
      }
      const last = moved[moved.length - 1]
      const picked = rec.picks.filter((pk: any) => pk.t < paint.t)
      const lastPick = picked[picked.length - 1]
      if (lastPick === undefined || lastPick.t < last.t) {
        // The two positions are the same arithmetic on the same event
        // (three/context/mouse.js); a tolerance only guards float noise.
        const same = lastPick !== undefined &&
          Math.abs(lastPick.x - last.x) < POSITION_EPSILON && Math.abs(lastPick.y - last.y) < POSITION_EPSILON
        if (!same) {
          unpicked++
        }
      }
    }
    const out = {paints, unpicked, changes, picks: rec.picks.length, frames: rec.frames}
    rec.paints = []
    rec.moves = []
    rec.picks = []
    rec.frames = 0
    return out
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}


describeMobileAndDesktop('viewer/hoverPick', (ff) => {
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
      // The leg is what it says: the default one picks through the tree, the
      // walk leg through none (batchedInstanceBvh.js INSTANCE_TREE_FLAG). The
      // batch count anchors the walk leg's zero.
      const treeState = () => page.evaluate(() => {
        let batches = 0
        let trees = 0
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(window as any).store.getState().model?.traverse?.((o: any) => {
          if (o.isBatchedMesh) {
            batches++
            trees += o.userData?.instanceBoundsTree === true ? 1 : 0
          }
        })
        return {batches, trees}
      })
      if (query === TREE_QUERY) {
        await expect.poll(async () => (await treeState()).trees,
          {message: 'the tree leg picks through an instance tree', timeout: TREES_TIMEOUT_MS}).toBeGreaterThan(0)
      } else {
        const {batches, trees} = await treeState()
        expect(batches, 'the model is batched').toBeGreaterThan(0)
        expect(trees, 'the walk leg builds no instance tree').toBe(0)
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

  // Frame-aligned hover (hoverPick.js#createFrameHoverPicker): the pick runs
  // in the render loop's frame, before its paint, so every frame painted
  // while the pointer moves shows what the pointer is over in that frame.
  // The timer scheduler (`?feature=disableFrameHover`) picked at most every
  // 33 ms, and a trailing pick's repaint waited for the frame after it, so at
  // 60 Hz some frames painted the element the pointer had just left.
  test('the highlight follows the pointer frame by frame, and a click selects what it shows', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS * 2)
    await openSettled(page, TREE_QUERY)
    await instrumentSweep(page)
    const sweeps: Sweep[] = []
    for (const row of SWEEP_ROWS) {
      sweeps.push(await recordSweep(page, row))
    }
    const paints = sweeps.flatMap((sw) => sw.paints)
    const changes = sweeps.reduce((n, sw) => n + sw.changes, 0)
    const picks = sweeps.reduce((n, sw) => n + sw.picks, 0)
    const frames = sweeps.reduce((n, sw) => n + sw.frames, 0)
    const unpicked = sweeps.reduce((n, sw) => n + sw.unpicked, 0)
    // The sweep means something: the pointer crossed elements, and the
    // viewer painted while it moved.
    expect(changes, 'the pointer crosses elements').toBeGreaterThanOrEqual(4)
    expect(paints.length, 'the viewer paints while the pointer moves').toBeGreaterThanOrEqual(SWEEP_STEPS)
    // At most one pick per frame, and one on every frame the pointer moved:
    // no frame painted after a move without picking for it first.
    expect(picks).toBeLessThanOrEqual(frames)
    expect(unpicked, 'frames painted after a pointer move without a hover pick').toBe(0)
    // Every painted frame shows what the pointer was over when it began.
    const stale = paints.filter((p) => p.shown !== p.current)
    expect(stale, `${stale.length} of ${paints.length} paints showed a stale hover`).toEqual([])

    // Hover and click agree: the element the pointer rests on is the one a
    // double-click selects (on a phone, a double tap).
    const points = await canvasPoints(page)
    const [hover] = await hoverEach(page, points.slice(0, 1))
    let target = hover
    if (target.hovered.length === 0) {
      const more = await hoverEach(page, points)
      target = more.find((p) => p.hovered.length > 0) as PointResult
    }
    expect(target, 'the pointer must find the model somewhere').toBeDefined()
    let selected: number[]
    if (ff.isMobile) {
      await page.touchscreen.tap(target.x, target.y)
      await page.touchscreen.tap(target.x, target.y)
      const handle = await page.waitForFunction(() => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const ids = (window as any).store.getState().selectedElements ?? []
        return ids.length > 0 ? ids.map(Number) : null
        /* eslint-enable @typescript-eslint/no-explicit-any */
      }, null, {timeout: 10_000})
      selected = await handle.jsonValue()
    } else {
      selected = await doubleClickSelects(page, target)
    }
    expect(selected).toEqual(expect.arrayContaining(target.hovered))
  })

  // Fast moves over an expensive paint (hoverPick.js module doc): a sweep
  // across the canvas at the full pixel ratio, where a SwiftShader frame of
  // Momentum costs more than EXPENSIVE_PAINT_MS on desktop, skips the picks
  // of its fast frames; the frame after the pointer stops must still pick,
  // so the highlight it rests on is never lost.
  test('a fast sweep ends on the highlight of the element the pointer stops on', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS * 2)
    await openSettled(page, TREE_QUERY)
    const box = await page.evaluate(() => {
      const r = (document.querySelector('canvas') as HTMLCanvasElement).getBoundingClientRect()
      return {left: r.left, top: r.top, width: r.width, height: r.height}
    })
    // Where the sweeps stop: points on the model, so the highlight they must
    // end on is an element's, not the empty one.
    const targets = (await hoverEach(page, await canvasPoints(page)))
      .filter((p) => p.hovered.length > 0)
      .slice(0, SWEEP_ROWS.length)
    expect(targets.length, 'the pointer must find the model somewhere').toBeGreaterThan(0)
    for (const target of targets) {
      // From the far side of the canvas, so the sweep crosses it.
      const fromX = target.x - box.left > box.width / 2 ?
        box.left + (box.width * SWEEP_FROM) :
        box.left + (box.width * SWEEP_TO)
      await page.mouse.move(fromX, target.y)
      await page.waitForTimeout(HOVER_SETTLE_MS)
      await page.mouse.move(target.x, target.y, {steps: FAST_SWEEP_STEPS})
      // A few frames, not a timeout: the settle pick is the next frame's.
      await page.evaluate(async (frames) => {
        for (let i = 0; i < frames; i++) {
          await new Promise((resolve) => requestAnimationFrame(resolve))
        }
      }, SETTLE_FRAMES)
      const {shown, current} = await page.evaluate(() => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const viewer = (window as any).store.getState().viewer
        const found = viewer.context.castRayIfc()
        return {
          shown: viewer._lastBatchedPreselectKey ?? null,
          current: found ? (viewer._batchedHoverTarget(found).key ?? null) : null,
        }
        /* eslint-enable @typescript-eslint/no-explicit-any */
      })
      expect(current, 'the sweep stops on an element').not.toBeNull()
      expect(shown, `the highlight where the sweep to ${target.x},${target.y} stopped`).toBe(current)
    }
  })
})
