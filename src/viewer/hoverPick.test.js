/* eslint-disable no-magic-numbers */
import {COST_FACTOR, COST_SAMPLES, MAX_INTERVAL_MS, MIN_INTERVAL_MS, createHoverPicker} from './hoverPick'


/**
 * A hover picker over a fake clock and timer queue, its pick costing
 * `cost` ms of that clock.
 *
 * @param {object} [opts]
 * @param {number} [opts.cost]
 * @return {object}
 */
function harness({cost = 1} = {}) {
  const state = {t: 0, dragging: false, p: {x: 0, y: 0}, picks: [], timers: [], cost}
  const picker = createHoverPicker({
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


describe('viewer/hoverPick', () => {
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
    const picker = createHoverPicker({
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
