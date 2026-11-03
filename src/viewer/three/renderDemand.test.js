import RenderDemand, {BACKGROUND_COST_FACTOR, BACKGROUND_MIN_GAP_MS, HEARTBEAT_MS} from './renderDemand'


/* eslint-disable no-magic-numbers */


const FRAME_MS = 16


/** @return {object} camera-controls stand-in that can fire its events */
function makeControls() {
  const listeners = {}
  return {
    listeners,
    addEventListener(type, fn) {
      (listeners[type] ??= new Set()).add(fn)
    },
    removeEventListener(type, fn) {
      listeners[type]?.delete(fn)
    },
    fire(type) {
      for (const fn of listeners[type] ?? []) {
        fn({type})
      }
    },
  }
}


describe('viewer/three/renderDemand', () => {
  let clock
  let demand

  beforeEach(() => {
    clock = 10_000
    demand = new RenderDemand({now: () => clock})
  })

  /**
   * Paint one frame whose draw call took `drawMs`, and run the next frame
   * `untilNextFrameMs` later, which is what measures the paint.
   *
   * @param {number} [drawMs]
   * @param {number} [untilNextFrameMs]
   * @return {boolean} whether that next frame painted
   */
  function paint(drawMs = 1, untilNextFrameMs = FRAME_MS) {
    expect(demand.shouldRender()).toBe(true)
    clock += drawMs
    demand.rendered(drawMs)
    clock += untilNextFrameMs
    return demand.shouldRender()
  }

  it('paints every frame outside a load', () => {
    demand.rendered(50)
    expect(demand.shouldRender()).toBe(true)
    expect(demand.shouldRender()).toBe(true)
  })

  it('paints once when a load begins, and then only when asked', () => {
    demand.begin(makeControls())
    expect(paint()).toBe(false)
    demand.invalidate()
    expect(paint()).toBe(false)
    clock += FRAME_MS
    expect(demand.shouldRender()).toBe(false)
  })

  it('spaces background frames at least the minimum gap apart', () => {
    demand.begin(makeControls())
    paint(1)
    demand.invalidateBackground()
    // The paint started FRAME_MS + 1 ago.
    clock += BACKGROUND_MIN_GAP_MS - FRAME_MS - 2
    expect(demand.shouldRender()).toBe(false)
    clock += 1
    expect(demand.shouldRender()).toBe(true)
  })

  // The draw call is not the cost (the module doc): a paint on software GL
  // returns quickly and then holds the next frame back.
  it('spaces them by the cost of the last paint measured to the next frame, not by its draw call', () => {
    demand.begin(makeControls())
    const heldBackMs = 300
    paint(5, heldBackMs)
    demand.invalidateBackground()
    const cost = 5 + heldBackMs
    clock += (BACKGROUND_COST_FACTOR * cost) - cost - 1
    expect(demand.shouldRender()).toBe(false)
    clock += 1
    expect(demand.shouldRender()).toBe(true)
  })

  // No upper bound (renderDemand.js): a cap re-created the 15× slowdown on a
  // model whose paints cost more than the cap.
  it('waits four times an expensive paint before the next background one', () => {
    demand.begin(makeControls())
    const heldBackMs = 3000
    expect(paint(5, heldBackMs)).toBe(false)
    demand.invalidateBackground()
    const cost = heldBackMs + 5
    clock += (BACKGROUND_COST_FACTOR * cost) - cost - 1
    expect(demand.shouldRender()).toBe(false)
    clock += 1
    expect(demand.shouldRender()).toBe(true)
  })

  it('a foreground ask does not wait for the budget', () => {
    demand.begin(makeControls())
    paint(800, 800)
    demand.invalidate()
    expect(demand.shouldRender()).toBe(true)
  })

  it('paints a heartbeat with nothing asking', () => {
    demand.begin(makeControls())
    paint(1)
    clock += HEARTBEAT_MS - FRAME_MS - 2
    expect(demand.shouldRender()).toBe(false)
    clock += 1
    expect(demand.shouldRender()).toBe(true)
  })

  it('treats camera moves as the follow\'s until the user takes the camera, then as the user\'s', () => {
    const controls = makeControls()
    demand.begin(controls)
    paint(200, 600)
    controls.fire('update')
    // The follow tweening: background, so it waits for the budget.
    expect(demand.shouldRender()).toBe(false)
    // A wheel zoom sends only `control`.
    controls.fire('control')
    expect(demand.shouldRender()).toBe(true)
    paint(200, 600)
    controls.fire('update')
    expect(demand.shouldRender()).toBe(true)
  })

  it('paints every frame again once the load ends, and drops its listeners', () => {
    const controls = makeControls()
    demand.begin(controls)
    paint()
    demand.end()
    expect(demand.isOnDemand).toBe(false)
    expect(demand.shouldRender()).toBe(true)
    for (const type of ['control', 'controlstart', 'update']) {
      expect(controls.listeners[type].size).toBe(0)
    }
    // A second end is harmless.
    demand.end()
  })

  it('counts its paints and their draw time', () => {
    demand.begin(makeControls())
    paint(3)
    demand.invalidate()
    paint(4)
    expect(demand.stats).toEqual({paints: 2, paintMs: 7})
  })
})
