/* eslint-disable no-magic-numbers */
import {
  CHEAP_PICK_MS, COST_FACTOR, COST_SAMPLES, EXPENSIVE_PAINT_MS, FAST_POINTER_PX_PER_MS, MAX_INTERVAL_MS,
  MIN_INTERVAL_MS, createFrameHoverPicker, createTimerHoverPicker,
} from './hoverPick'
import {IfcContext} from './three/context/context'
import {newUpdateFunction} from './three/IfcHighlighter'
import RenderDemand, {requestBackgroundPaint} from './three/renderDemand'


/**
 * A TIMER hover picker (the `disableFrameHover` rollback) over a fake clock and timer queue, its pick costing
 * `cost` ms of that clock.
 *
 * @param {object} [opts]
 * @param {number} [opts.cost]
 * @return {object}
 */
function harness({cost = 1} = {}) {
  const state = {t: 0, dragging: false, p: {x: 0, y: 0}, picks: [], timers: [], cost}
  const picker = createTimerHoverPicker({
    pick: () => {
      state.picks.push({...state.p})
      state.t += state.cost
    },
    isDragging: () => state.dragging,
    pointer: () => state.p,
    now: () => state.t,
    setTimer: (fn, ms) => {
      const timer = {fn, at: state.t + ms}
      state.timers.push(timer)
      return timer
    },
    clearTimer: (timer) => {
      state.timers = state.timers.filter((t) => t !== timer)
    },
  })
  return {
    state,
    picker,
    /**
     * Move the pointer and dispatch a mousemove, `dt` ms later.
     *
     * @param {number} dt
     * @param {number} x
     * @param {number} y
     */
    move(dt, x, y) {
      advance(dt)
      state.p = {x, y}
      picker.onMove()
    },
    advance,
  }

  /** @param {number} dt run due timers while the clock moves on */
  function advance(dt) {
    const end = state.t + dt
    for (;;) {
      const due = state.timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0]
      if (!due) {
        break
      }
      state.timers = state.timers.filter((t) => t !== due)
      state.t = Math.max(state.t, due.at)
      due.fn()
    }
    state.t = Math.max(state.t, end)
  }
}


describe('viewer/hoverPick#createTimerHoverPicker', () => {
  it('picks on a move, then no more than once per interval', () => {
    const h = harness()
    h.move(0, 0.1, 0.1)
    expect(h.state.picks).toHaveLength(1)
    h.move(5, 0.2, 0.2)
    h.move(5, 0.3, 0.3)
    expect(h.state.picks).toHaveLength(1)
    h.move(MIN_INTERVAL_MS, 0.4, 0.4)
    expect(h.state.picks).toHaveLength(2)
  })

  it('picks where the pointer stopped, once the interval is up', () => {
    const h = harness()
    h.move(0, 0.1, 0.1)
    h.move(5, 0.2, 0.2)
    h.move(5, 0.3, 0.3)
    h.advance(MIN_INTERVAL_MS)
    expect(h.state.picks).toEqual([{x: 0.1, y: 0.1}, {x: 0.3, y: 0.3}])
    // Nothing further is pending once it has caught up.
    h.advance(1000)
    expect(h.state.picks).toHaveLength(2)
  })

  it('does not pick again while the canvas pointer is where it was', () => {
    const h = harness()
    h.move(0, 0.1, 0.1)
    // Window mousemoves over a drawer: the canvas position does not change.
    for (let i = 0; i < 20; i++) {
      h.move(100, 0.1, 0.1)
    }
    expect(h.state.picks).toHaveLength(1)
  })

  it('does not pick while dragging, nor after a drag ends unless the pointer moves', () => {
    const h = harness()
    h.state.dragging = true
    h.move(0, 0.1, 0.1)
    h.move(100, 0.2, 0.2)
    expect(h.state.picks).toHaveLength(0)
    h.state.dragging = false
    h.move(100, 0.3, 0.3)
    expect(h.state.picks).toEqual([{x: 0.3, y: 0.3}])
  })

  it('a drag that starts while a trailing pick waits cancels it', () => {
    const h = harness()
    h.move(0, 0.1, 0.1)
    h.move(5, 0.2, 0.2)
    h.state.dragging = true
    h.advance(MIN_INTERVAL_MS)
    expect(h.state.picks).toHaveLength(1)
  })

  it('spaces picks out by their cost, within bounds', () => {
    const slow = harness({cost: 40})
    slow.move(0, 0.1, 0.1)
    // 40 ms a pick → the next may come 160 ms after the last began.
    slow.move(100, 0.2, 0.2)
    expect(slow.state.picks).toHaveLength(1)
    slow.advance(200)
    expect(slow.state.picks).toHaveLength(2)
    expect(40 * COST_FACTOR).toBeGreaterThan(MIN_INTERVAL_MS)

    const glacial = harness({cost: 1000})
    glacial.move(0, 0.1, 0.1)
    glacial.move(MAX_INTERVAL_MS - glacial.state.t + 1, 0.2, 0.2)
    expect(glacial.state.picks).toHaveLength(2)
  })

  it('one slow pick does not stall the next; a run of them does', () => {
    const h = harness({cost: 5})
    let x = 0
    const pickNow = () => {
      // Far enough past any interval that the move picks at once.
      h.move(MAX_INTERVAL_MS + 1, (x += 0.01), 0)
    }
    for (let i = 0; i < COST_SAMPLES; i++) {
      pickNow()
    }
    h.state.cost = 100
    pickNow()
    h.state.cost = 5
    const before = h.state.picks.length
    // The median is still 5 ms, so the next pick may come one minimum
    // interval later, not 4 × 100 ms.
    h.move(MIN_INTERVAL_MS, (x += 0.01), 0)
    expect(h.state.picks.length).toBe(before + 1)
    // A majority of slow picks does slow it.
    h.state.cost = 100
    for (let i = 0; i < COST_SAMPLES; i++) {
      pickNow()
    }
    const slow = h.state.picks.length
    h.move(MIN_INTERVAL_MS, (x += 0.01), 0)
    expect(h.state.picks.length).toBe(slow)
    expect(100 * COST_FACTOR).toBeGreaterThan(MIN_INTERVAL_MS)
  })

  it('treats a viewer with no pointer as always moved', () => {
    const picks = []
    const picker = createTimerHoverPicker({
      pick: () => picks.push(1), isDragging: () => false, pointer: () => null,
      now: (() => {
        let t = 0
        return () => (t += 1000)
      })(),
    })
    picker.onMove()
    picker.onMove()
    expect(picks).toHaveLength(2)
    picker.dispose()
  })

  it('dispose drops a pending trailing pick', () => {
    const h = harness()
    h.move(0, 0.1, 0.1)
    h.move(5, 0.2, 0.2)
    h.picker.dispose()
    h.advance(1000)
    expect(h.state.picks).toHaveLength(1)
  })
})


/** One display frame at 60 Hz. */
const FRAME_MS = 16.7


/**
 * A FRAME hover picker over a fake clock, its pick costing `cost` ms of it.
 * `frame()` runs one animation frame's hover hook; `move()` dispatches a
 * mousemove; neither advances the clock unless asked.
 *
 * @param {object} [opts]
 * @param {number} [opts.cost]
 * @return {object}
 */
function frameHarness({cost = 0.2} = {}) {
  const state = {t: 0, dragging: false, p: {x: 0, y: 0}, picks: [], cost}
  const picker = createFrameHoverPicker({
    pick: () => {
      state.picks.push({...state.p, t: state.t})
      state.t += state.cost
    },
    isDragging: () => state.dragging,
    pointer: () => state.p,
    now: () => state.t,
  })
  return {
    state,
    picker,
    /**
     * @param {number} x
     * @param {number} y
     */
    move(x, y) {
      state.p = {x, y}
      picker.onMove()
    },
    /** @return {boolean} whether this frame picked */
    frame() {
      state.t += FRAME_MS
      return picker.onFrame()
    },
  }
}


describe('viewer/hoverPick#createFrameHoverPicker', () => {
  it('only marks the pointer on a move, and picks in the next frame', () => {
    const h = frameHarness()
    h.move(0.1, 0.1)
    expect(h.state.picks).toHaveLength(0)
    expect(h.frame()).toBe(true)
    expect(h.state.picks).toEqual([expect.objectContaining({x: 0.1, y: 0.1})])
  })

  it('picks at most once per frame, where the pointer is at the frame', () => {
    const h = frameHarness()
    // A fast mouse: several moves land inside one frame.
    h.move(0.1, 0.1)
    h.move(0.2, 0.2)
    h.move(0.3, 0.3)
    h.frame()
    expect(h.state.picks).toEqual([expect.objectContaining({x: 0.3, y: 0.3})])
  })

  it('picks on every frame the pointer moved while picks are cheap: no 33 ms floor', () => {
    const h = frameHarness({cost: CHEAP_PICK_MS})
    for (let i = 1; i <= 30; i++) {
      h.move(i / 100, 0)
      expect(h.frame()).toBe(true)
    }
    expect(h.state.picks).toHaveLength(30)
    // Consecutive picks are one frame apart, closer than the timer
    // scheduler's floor ever allowed.
    expect(h.state.picks[1].t - h.state.picks[0].t).toBeLessThan(MIN_INTERVAL_MS)
  })

  it('stops picking, and so asking for paints, when the pointer stops', () => {
    const h = frameHarness()
    h.move(0.1, 0.1)
    h.frame()
    // The "pointer stopped" pick is the frame after the last move: there is
    // nothing left pending after it.
    for (let i = 0; i < 100; i++) {
      expect(h.frame()).toBe(false)
    }
    expect(h.state.picks).toHaveLength(1)
  })

  it('does not pick again while the canvas pointer is where it was', () => {
    const h = frameHarness()
    h.move(0.1, 0.1)
    h.frame()
    // Window mousemoves over a drawer: the canvas position does not change.
    for (let i = 0; i < 20; i++) {
      h.move(0.1, 0.1)
      h.frame()
    }
    expect(h.state.picks).toHaveLength(1)
  })

  it('does not pick while dragging, and catches up when the mouseup marks the pointer', () => {
    const h = frameHarness()
    h.state.dragging = true
    h.move(0.1, 0.1)
    h.frame()
    h.move(0.2, 0.2)
    h.frame()
    expect(h.state.picks).toHaveLength(0)
    // The mouseup (Containers/viewer.js) clears the drag and calls onMove.
    h.state.dragging = false
    h.picker.onMove()
    h.frame()
    expect(h.state.picks).toEqual([expect.objectContaining({x: 0.2, y: 0.2})])
    // A click that didn't move the pointer picks nothing on its mouseup.
    h.picker.onMove()
    h.frame()
    expect(h.state.picks).toHaveLength(1)
  })

  it('backs off by cost when picks are dear, and picks where the pointer stopped once it may', () => {
    // 10 ms a pick: dear, so the next may come 4 × 10 ms after the last began.
    const cost = 10
    expect(cost).toBeGreaterThan(CHEAP_PICK_MS)
    const h = frameHarness({cost})
    h.move(0.01, 0)
    h.frame()
    let frames = 0
    let x = 0.01
    // Keep moving every frame until the next pick.
    while (h.state.picks.length === 1) {
      h.move((x += 0.01), 0)
      h.frame()
      frames++
    }
    // On the first frame at or after the interval: not before, and not a
    // frame later than it had to be.
    const gap = h.state.picks[1].t - h.state.picks[0].t
    expect(gap).toBeGreaterThanOrEqual(cost * COST_FACTOR)
    expect(gap).toBeLessThan((cost * COST_FACTOR) + FRAME_MS)
    expect(frames).toBeGreaterThan(1)
    // The wait keeps the move pending: no further move needed for the pick
    // where the pointer stopped.
    h.move(0.9, 0.9)
    for (let i = 0; i < 10; i++) {
      h.frame()
    }
    expect(h.state.picks.at(-1)).toEqual(expect.objectContaining({x: 0.9, y: 0.9}))
  })

  it('caps the back-off at MAX_INTERVAL_MS', () => {
    // 200 ms a pick would wait 800 ms uncapped.
    const cost = 200
    expect(cost * COST_FACTOR).toBeGreaterThan(MAX_INTERVAL_MS)
    const h = frameHarness({cost})
    h.move(0.1, 0)
    h.frame()
    h.move(0.2, 0)
    while (h.state.picks.length === 1) {
      h.frame()
    }
    const gap = h.state.picks[1].t - h.state.picks[0].t
    expect(gap).toBeGreaterThanOrEqual(MAX_INTERVAL_MS)
    expect(gap).toBeLessThan(MAX_INTERVAL_MS + FRAME_MS)
  })

  it('switches back to every frame once the median pick is cheap again', () => {
    const h = frameHarness({cost: 10})
    let x = 0
    const pickOnce = () => {
      const before = h.state.picks.length
      for (let i = 0; i < 100 && h.state.picks.length === before; i++) {
        h.move((x += 0.01), 0)
        h.frame()
      }
    }
    for (let i = 0; i < COST_SAMPLES; i++) {
      pickOnce()
    }
    // The instance tree lands: picks drop to 0.2 ms. One cheap pick is not a
    // median, so the back-off holds until most of the window is cheap.
    h.state.cost = 0.2
    for (let i = 0; i < (COST_SAMPLES >> 1) + 1; i++) {
      pickOnce()
    }
    const before = h.state.picks.length
    for (let i = 0; i < 10; i++) {
      h.move((x += 0.01), 0)
      h.frame()
    }
    expect(h.state.picks.length - before).toBe(10)
  })

  it('treats a viewer with no pointer as always moved', () => {
    const picks = []
    const picker = createFrameHoverPicker({
      pick: () => picks.push(1), isDragging: () => false, pointer: () => null,
    })
    picker.onMove()
    picker.onFrame()
    picker.onMove()
    picker.onFrame()
    expect(picks).toHaveLength(2)
  })

  it('dispose drops a pending pick and ignores later moves', () => {
    const h = frameHarness()
    h.move(0.1, 0.1)
    h.picker.dispose()
    h.frame()
    h.move(0.2, 0.2)
    h.frame()
    expect(h.state.picks).toHaveLength(0)
  })
})


/**
 * A frame hover picker fed real mouse-event positions (CSS px) and times,
 * over frames `frameMs` apart and a last paint costing `paintMs`.
 *
 * @param {object} opts
 * @param {number} opts.frameMs
 * @param {number} opts.paintMs
 * @return {object}
 */
function sweepHarness({frameMs, paintMs}) {
  const state = {t: 0, px: 0, picks: [], paintMs}
  const picker = createFrameHoverPicker({
    pick: () => state.picks.push(state.px),
    isDragging: () => false,
    pointer: () => ({x: state.px, y: 0}),
    now: () => state.t,
    paintCostMs: () => state.paintMs,
  })
  return {
    state,
    /**
     * One frame in which the pointer moved `dx` px, its mousemove landing
     * just before the frame (Chrome dispatches it ahead of rAF).
     *
     * @param {number} dx px this frame; 0 for a still pointer
     * @return {boolean} whether the frame picked
     */
    frame(dx) {
      state.t += frameMs
      if (dx !== 0) {
        state.px += dx
        picker.onMove({clientX: state.px, clientY: 0, timeStamp: state.t - 1})
      }
      return picker.onFrame()
    },
  }
}


describe('viewer/hoverPick#createFrameHoverPicker fast moves over an expensive paint', () => {
  const SLOW_FRAME_MS = 100
  const FAST_FRAME_MS = 16.7
  // Per frame, faster and slower than FAST_POINTER_PX_PER_MS.
  const fastDx = (frameMs) => Math.ceil(FAST_POINTER_PX_PER_MS * frameMs * 2)
  const slowDx = (frameMs) => Math.max(1, Math.floor(FAST_POINTER_PX_PER_MS * frameMs / 4))

  it('skips the pick while both hold: the paint is expensive and the pointer fast', () => {
    const h = sweepHarness({frameMs: SLOW_FRAME_MS, paintMs: EXPENSIVE_PAINT_MS * 3})
    // From rest the first move's speed is measured against a still pointer.
    h.frame(1)
    const before = h.state.picks.length
    for (let i = 0; i < 10; i++) {
      expect(h.frame(fastDx(SLOW_FRAME_MS))).toBe(false)
    }
    expect(h.state.picks).toHaveLength(before)
  })

  it('picks where the pointer stops, on the first still frame', () => {
    const h = sweepHarness({frameMs: SLOW_FRAME_MS, paintMs: EXPENSIVE_PAINT_MS * 3})
    h.frame(1)
    for (let i = 0; i < 10; i++) {
      h.frame(fastDx(SLOW_FRAME_MS))
    }
    expect(h.frame(0)).toBe(true)
    expect(h.state.picks.at(-1)).toBe(h.state.px)
  })

  it('picks as soon as the pointer slows down', () => {
    const h = sweepHarness({frameMs: SLOW_FRAME_MS, paintMs: EXPENSIVE_PAINT_MS * 3})
    h.frame(1)
    h.frame(fastDx(SLOW_FRAME_MS))
    h.frame(fastDx(SLOW_FRAME_MS))
    expect(h.frame(slowDx(SLOW_FRAME_MS))).toBe(true)
    expect(h.state.picks.at(-1)).toBe(h.state.px)
  })

  it('never skips while paints are cheap, however fast the pointer', () => {
    const h = sweepHarness({frameMs: FAST_FRAME_MS, paintMs: EXPENSIVE_PAINT_MS / 4})
    h.frame(1)
    for (let i = 0; i < 20; i++) {
      expect(h.frame(fastDx(FAST_FRAME_MS))).toBe(true)
    }
  })

  it('never skips a slow pointer, however expensive the paint', () => {
    const h = sweepHarness({frameMs: SLOW_FRAME_MS, paintMs: EXPENSIVE_PAINT_MS * 3})
    for (let i = 0; i < 20; i++) {
      expect(h.frame(slowDx(SLOW_FRAME_MS))).toBe(true)
    }
  })

  it('measures speed from the last mouse event, so the first move after a rest picks', () => {
    const h = sweepHarness({frameMs: SLOW_FRAME_MS, paintMs: EXPENSIVE_PAINT_MS * 3})
    h.frame(1)
    for (let i = 0; i < 50; i++) {
      h.frame(0)
    }
    // One frame's worth of a fast move, but measured from the event the
    // pointer rested at, seconds ago: slow, so it picks.
    expect(h.frame(fastDx(SLOW_FRAME_MS))).toBe(true)
    // Keep sweeping and the gate holds.
    expect(h.frame(fastDx(SLOW_FRAME_MS))).toBe(false)
  })
})


/**
 * The viewer's own frame (IfcContext#updateAllComponents) on demand, with
 * the real render closure (IfcHighlighter#newUpdateFunction) and RenderDemand,
 * and the frame hover picker as one of its components, registered after the
 * camera as `ThreeContext#onFrame` does. The pick asks for its paint the way
 * the BatchedMesh `setColorAt` hook does (renderDemandHooks.js).
 *
 * @return {object}
 */
function viewerFrameHarness() {
  const state = {pointer: {x: 0, y: 0}, highlighted: null, frameNo: 0, picks: [], paints: []}
  const demand = new RenderDemand()
  const stopSession = demand.startSession()
  const composer = {
    render: () => state.paints.push({frame: state.frameNo, highlighted: state.highlighted}),
  }
  const renderer = {}
  renderer.update = newUpdateFunction({
    getLegacyRendererWrapper: () => ({blocked: false}),
    getRenderDemand: () => demand,
  }, composer)
  const picker = createFrameHoverPicker({
    pick: () => {
      state.picks.push(state.frameNo)
      const next = `under:${state.pointer.x}`
      if (next !== state.highlighted) {
        state.highlighted = next
        requestBackgroundPaint()
      }
    },
    isDragging: () => false,
    pointer: () => state.pointer,
  })
  const self = {
    clock: {getDelta: () => FRAME_MS / 1000},
    renderDemand: demand,
    renderer,
    items: {components: [{update: () => undefined}, renderer, {update: () => undefined}, {update: picker.onFrame}]},
  }
  return {
    state,
    move(x) {
      state.pointer = {x, y: 0}
      picker.onMove()
    },
    frame() {
      state.frameNo++
      IfcContext.prototype.updateAllComponents.call(self)
    },
    dispose() {
      stopSession()
      demand.dispose()
    },
  }
}


describe('viewer/hoverPick in the viewer\'s frame', () => {
  it('paints the highlight a move causes in the same frame as its pick, and nothing while idle', () => {
    const h = viewerFrameHarness()
    try {
      // The session's first frame paints; after it the viewer is idle.
      h.frame()
      const settled = h.state.paints.length
      for (let i = 0; i < 10; i++) {
        h.frame()
      }
      expect(h.state.paints).toHaveLength(settled)
      expect(h.state.picks).toHaveLength(0)
      // One move: one pick, and the frame it ran in painted its highlight.
      h.move(0.25)
      h.frame()
      expect(h.state.picks).toEqual([h.state.frameNo])
      expect(h.state.paints.at(-1)).toEqual({frame: h.state.frameNo, highlighted: 'under:0.25'})
      // A sweep: every frame's paint shows what that frame's pointer is over.
      for (let i = 1; i <= 20; i++) {
        h.move(0.25 + (i / 100))
        h.frame()
        expect(h.state.paints.at(-1)).toEqual({frame: h.state.frameNo, highlighted: `under:${0.25 + (i / 100)}`})
      }
      // Then idle again: no pick, no paint.
      const paints = h.state.paints.length
      const picks = h.state.picks.length
      for (let i = 0; i < 10; i++) {
        h.frame()
      }
      expect(h.state.paints).toHaveLength(paints)
      expect(h.state.picks).toHaveLength(picks)
    } finally {
      h.dispose()
    }
  })
})
