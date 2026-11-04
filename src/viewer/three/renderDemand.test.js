import RenderDemand, {
  BACKGROUND_COST_FACTOR, BACKGROUND_MIN_GAP_MS, HEARTBEAT_MS, USER_CAMERA_EVENT, noteUserCamera,
} from './renderDemand'


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

  // Codex review on #2052: a ViewCube snap, a fit or a permalink pose moves
  // the camera with no control event, and is the user's all the same.
  it('paints a camera move at once, whoever made it, unless the follow made it', () => {
    const controls = makeControls()
    demand.begin(controls)
    paint(200, 600)
    // No control event: a ViewCube snap's rotateTo(…, true).
    controls.fire('update')
    expect(demand.shouldRender()).toBe(true)
    paint(200, 600)
    // The follow's snap, made inside runFollowMove: background.
    demand.runFollowMove(() => controls.fire('update'))
    expect(demand.shouldRender()).toBe(false)
    // Once the user takes the camera (a wheel zoom sends only `control`),
    // even the follow's move paints at once.
    controls.fire('control')
    expect(demand.shouldRender()).toBe(true)
    paint(200, 600)
    demand.runFollowMove(() => controls.fire('update'))
    expect(demand.shouldRender()).toBe(true)
  })

  // Codex review on #2052, round 2: a time window after each follow fit took
  // a ViewCube snap made inside it for the follow's.
  it('paints a ViewCube snap made right after a follow refit at once', () => {
    const controls = makeControls()
    demand.begin(controls)
    paint(200, 600)
    demand.runFollowMove(() => controls.fire('update'))
    expect(demand.shouldRender()).toBe(false)
    // The snap's first update, one frame after the refit.
    clock += FRAME_MS
    controls.fire('update')
    expect(demand.shouldRender()).toBe(true)
  })

  it('takes a camera UI\'s note of the user\'s camera as the user driving', () => {
    const controls = makeControls()
    controls.dispatchEvent = (event) => controls.fire(event.type)
    demand.begin(controls)
    paint(200, 600)
    noteUserCamera(controls)
    expect(demand.isUserDriving).toBe(true)
    expect(controls.listeners[USER_CAMERA_EVENT].size).toBe(1)
    paint(200, 600)
    demand.runFollowMove(() => controls.fire('update'))
    expect(demand.shouldRender()).toBe(true)
    // A stand-in without events is fine.
    expect(() => noteUserCamera({})).not.toThrow()
    expect(() => noteUserCamera(null)).not.toThrow()
  })

  it('stops counting moves as the follow\'s even when its move throws', () => {
    const controls = makeControls()
    demand.begin(controls)
    paint(200, 600)
    expect(() => demand.runFollowMove(() => {
      throw new Error('fit failed')
    })).toThrow('fit failed')
    controls.fire('update')
    expect(demand.shouldRender()).toBe(true)
  })

  it('paints every frame again once its scope closes, and drops its listeners', () => {
    const controls = makeControls()
    const end = demand.begin(controls)
    paint()
    end()
    expect(demand.isOnDemand).toBe(false)
    expect(demand.shouldRender()).toBe(true)
    for (const type of ['control', 'controlstart', 'update', USER_CAMERA_EVENT]) {
      expect(controls.listeners[type].size).toBe(0)
    }
    // Closing twice is harmless.
    end()
    expect(demand.isOnDemand).toBe(false)
  })

  // Codex review on #2052: an aborted first attempt that CadView retries
  // closes the session's scope, and must not close CadView's.
  it('nests scopes: closing an inner one leaves the outer one painting on demand', () => {
    const controls = makeControls()
    const endLoad = demand.begin(controls)
    const endSession = demand.begin(controls)
    endSession()
    expect(demand.isOnDemand).toBe(true)
    expect(controls.listeners.update.size).toBe(1)
    paint()
    expect(demand.shouldRender()).toBe(false)
    // A second session for the retry, and its abort.
    demand.begin(controls)()
    expect(demand.isOnDemand).toBe(true)
    endLoad()
    expect(demand.isOnDemand).toBe(false)
    expect(controls.listeners.update.size).toBe(0)
  })

  it('counts its paints and their draw time', () => {
    demand.begin(makeControls())
    paint(3)
    demand.invalidate()
    paint(4)
    expect(demand.stats).toEqual({paints: 2, paintMs: 7})
  })
})
