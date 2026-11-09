import RenderDemand, {
  BACKGROUND_COST_FACTOR, BACKGROUND_MIN_GAP_MS, HEARTBEAT_MS, SETTLE_MS, USER_CAMERA_EVENT, noteUserCamera,
  requestBackgroundPaint, requestPaint, runPaint,
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
    expect(demand.stats).toEqual({paints: 2, paintMs: 7, frames: 4})
  })
})


// `?feature=renderOnDemand` (story #2055): on demand between loads too.
describe('viewer/three/renderDemand session', () => {
  let clock
  let demand
  let probe
  let probeChanged

  beforeEach(() => {
    clock = 10_000
    demand = new RenderDemand({now: () => clock})
    probeChanged = false
    probe = {changed: () => probeChanged, snapshot: jest.fn()}
  })

  afterEach(() => {
    demand.dispose()
  })

  /**
   * One frame: whether it painted, recording the paint when it did.
   *
   * @return {boolean}
   */
  function frame() {
    clock += FRAME_MS
    const painting = demand.shouldRender()
    if (painting) {
      demand.rendered(1)
    }
    return painting
  }

  /**
   * @param {number} count frames to run
   * @return {number} how many of them painted
   */
  function paintsIn(count) {
    let paints = 0
    for (let i = 0; i < count; i++) {
      paints += frame() ? 1 : 0
    }
    return paints
  }

  it('paints once when it starts, then nothing while nothing changes', () => {
    demand.startSession({probe})
    expect(paintsIn(120)).toBe(1)
    // No heartbeat between loads: a minute of idle frames paints nothing.
    clock += 60_000
    expect(paintsIn(10)).toBe(0)
  })

  it('paints the frame after the probe sees a change, and records the baseline at the paint', () => {
    demand.startSession({probe})
    paintsIn(2)
    probe.snapshot.mockClear()
    probeChanged = true
    expect(frame()).toBe(true)
    expect(probe.snapshot).toHaveBeenCalledTimes(1)
    probeChanged = false
    expect(paintsIn(10)).toBe(0)
  })

  it('does not paint a control start between loads: the move after it asks', () => {
    const controls = makeControls()
    demand.startSession({controls, probe})
    paintsIn(2)
    controls.fire('controlstart')
    expect(frame()).toBe(false)
    expect(demand.isUserDriving).toBe(true)
    controls.fire('update')
    expect(frame()).toBe(true)
  })

  it('paints for every camera update between loads, damping included', () => {
    const controls = makeControls()
    demand.startSession({controls, probe})
    paintsIn(2)
    // camera-controls sends `update` from each frame's update() while it
    // damps toward rest, with no input event; each one paints.
    for (let i = 0; i < 5; i++) {
      controls.fire('update')
      expect(frame()).toBe(true)
    }
    expect(paintsIn(10)).toBe(0)
  })

  it('keeps the session camera across a load, and paints what the load left at its end', () => {
    const controls = makeControls()
    demand.startSession({controls, probe})
    const endLoad = demand.begin(controls)
    paintsIn(2)
    demand.invalidateBackground()
    endLoad()
    expect(demand.isOnDemand).toBe(true)
    expect(controls.listeners.update.size).toBe(1)
    expect(frame()).toBe(true)
    expect(paintsIn(10)).toBe(0)
    controls.fire('update')
    expect(frame()).toBe(true)
  })

  // The load's end, with render-on-demand on by default: when the last scope
  // closes the session paints once even with nothing asking and the probe
  // quiet, because a change the load made without a signal (one that waited
  // on a budget the load no longer has) would otherwise stay off screen.
  // The E2E's load-end leg can't isolate this paint: the store change the
  // load ends with opens a settle window that paints anyway.
  it('paints exactly once when the last load scope closes, with nothing pending', () => {
    demand.startSession({probe})
    const endOuter = demand.begin()
    const endInner = demand.begin()
    // Everything the load asked for has painted, and the heartbeat is far off.
    paintsIn(2)
    expect(paintsIn(3)).toBe(0)
    endInner()
    expect(paintsIn(3), 'an inner scope closing leaves the load on its budget').toBe(0)
    endOuter()
    expect(paintsIn(10)).toBe(1)
  })

  it('paints a background ask on the next frame between loads, with no budget', () => {
    demand.startSession({probe})
    paintsIn(2)
    demand.invalidateBackground()
    expect(frame()).toBe(true)
    expect(paintsIn(5)).toBe(0)
  })

  it('reaches the viewer from anywhere through requestPaint, and stops once disposed', () => {
    demand.startSession({probe})
    paintsIn(2)
    requestPaint()
    expect(frame()).toBe(true)
    requestBackgroundPaint()
    expect(frame()).toBe(true)
    demand.dispose()
    requestPaint()
    expect(demand.isDirty).toBe(false)
  })

  it('ignores the scene changes three makes inside a paint', () => {
    demand.startSession({probe})
    paintsIn(2)
    runPaint(() => requestBackgroundPaint())
    expect(frame()).toBe(false)
  })

  it('paints for the settle window after user input, then stops', () => {
    demand.startSession({probe})
    paintsIn(2)
    demand.invalidateSoon()
    const window = Math.floor(SETTLE_MS / FRAME_MS)
    expect(paintsIn(window)).toBe(window)
    expect(paintsIn(10)).toBe(0)
  })

  it('makes a settle ask background work during a load, so the load\'s store churn stays budgeted', () => {
    demand.startSession({probe})
    demand.begin(makeControls())
    paintsIn(2)
    let paints = 0
    for (let i = 0; i < 60; i++) {
      demand.invalidateSoon()
      paints += frame() ? 1 : 0
    }
    // At least BACKGROUND_MIN_GAP_MS apart: ~10 in a second, not 60.
    expect(paints).toBeLessThanOrEqual(Math.ceil((60 * FRAME_MS) / BACKGROUND_MIN_GAP_MS) + 1)
  })

  it('leaves a held viewer to the load budget during a load', () => {
    demand.startSession({probe})
    demand.keepPainting()
    demand.begin(makeControls())
    paintsIn(2)
    expect(paintsIn(5)).toBe(0)
  })

  it('paints every frame while held, and once more at the release', () => {
    demand.startSession({probe})
    paintsIn(2)
    const release = demand.keepPainting()
    expect(paintsIn(30)).toBe(30)
    release()
    release()
    expect(paintsIn(30)).toBe(1)
  })

  it('goes back to painting every frame when the session stops', () => {
    const controls = makeControls()
    const stop = demand.startSession({controls, probe})
    paintsIn(2)
    stop()
    expect(demand.isOnDemand).toBe(false)
    expect(controls.listeners.update.size).toBe(0)
    expect(paintsIn(10)).toBe(10)
  })
})
