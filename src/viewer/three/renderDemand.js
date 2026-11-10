/**
 * On-demand rendering while a model streams in (open-205 #2043).
 *
 * The viewer's render loop paints every animation frame (`IfcContext.render`
 * → the `setRenderUpdate` closure, DESIGN.md §"Render loop & perf monitor").
 * During a progressive Conway load every one of those frames competes with
 * the geometry pump for the main thread, and a frame costs more as the scene
 * grows. Measured in headless Chromium, whose WebGL is SwiftShader on the
 * CPU: the 860 MB PSB took 37 s of Geometry with the loop frozen and
 * 615–695 s at one frame a second (design/new/browser-load-measurement.md
 * §Confounders). A real GPU is far milder, but the overlay now lifts at the
 * first preview mesh, so frames render while the parse runs on every device.
 *
 * So for the length of a progressive load the loop keeps ticking (camera
 * controls still update in it) but paints only when something asks:
 *
 *  - **now**, on the next frame, for what the user is doing: a camera move
 *    other than the load's own follow, a selection change, a resize;
 *  - **in the background**, when the frame budget allows, for what the load
 *    is doing: geometry arriving, the camera follow's refits, and a one-second
 *    heartbeat that catches anything nobody asked for. The budget keeps
 *    background painting to about a fifth of the time by spacing those
 *    frames at four times the last paint's cost, and at least
 *    `BACKGROUND_MIN_GAP_MS` apart. The load's first geometry is the
 *    exception: it paints at once (`ProgressiveLoadSession`), being what the
 *    user is waiting to see. On a slow GPU the rest of the stream then shows
 *    up in steps seconds apart, which is the trade: the load finishes.
 *
 * **A paint's cost is measured to the next frame, not around the draw call.**
 * The composer's `render()` only queues GL commands: on SwiftShader it
 * returned in ~27 ms on average while the paints behind it kept a 231 MB
 * model loading past 15 minutes, and with painting off the same ticking loop
 * loaded it in 53 s, the frozen-loop time. The work lands in the
 * GPU process, which holds back the next animation frame until it is done
 * (and competes with the main thread for the CPU while it runs). So the
 * cost of a paint is the time from its start to the next frame the loop
 * gets: an over-estimate when the main thread itself was busy in between,
 * which only paints less while loading (design/new/in-app-model-switch.md
 * §4.2a has the numbers).
 *
 * Without a session (below), outside a load (`isOnDemand === false`) every
 * frame paints, as before #2055: everything that changes the picture after a
 * load (cut planes, isolation, looks, hover, splat sorting) keeps working
 * without having to ask. That is the mode `?feature=disableRenderOnDemand`
 * and the prod rollback put back (renderOnDemandMode.js).
 *
 * **The whole session on demand (render-on-demand, story #2055, on by
 * default).** `startSession` keeps the viewer on demand between loads too:
 * an idle viewer paints nothing. `IfcContext` starts it when
 * `renderOnDemandMode.js#isRenderOnDemandOn` says so. Between loads there is no heartbeat
 * and no frame budget; whatever asks paints on the next frame. Because a
 * source that forgets to ask leaves a stale frame on screen, which is the
 * worst failure here, asking is layered (renderDemandHooks.js has the
 * inventory and DESIGN.md §"Render loop & perf monitor" the summary):
 *
 *  1. the camera (camera-controls `update`, damping and transitions
 *     included), resize, and the explicit asks below, as during a load. A
 *     bare `controlstart` doesn't paint between loads (`onUserControl`), and
 *     the camera moves before the paint in each frame
 *     (`IfcContext#updateAllComponents`);
 *  2. `requestPaint()` from anywhere: the sources three can't see change
 *     (`visible`, material colours, outline selections, lights) call it;
 *  3. hooks on three's own change signals (`Object3D#add`/`attach`/`remove`, the
 *     BatchedMesh mutators, `needsUpdate` on materials, textures and
 *     attributes), which ask for a background paint;
 *  4. a per-frame probe of what a paint depends on and costs microseconds
 *     to read: the camera pose and projection, the drawing-buffer size and
 *     pixel ratio, the cut planes, the scene's background, environment and
 *     direct children, tone mapping;
 *  5. a settle window (`invalidateSoon`, `SETTLE_MS`) after any user input
 *     on the page and any store change, for the change a React effect
 *     makes a frame or two after the event that caused it;
 *  6. `keepPainting()` for what changes the picture on its own clock
 *     (Spark's splat sort).
 *
 * Mutations that three makes while painting (BatchedMesh rebuilds its
 * indirect texture in `onBeforeRender`) are not asks: `runPaint` brackets the
 * draw, and the hooks ignore what happens inside it, or every paint would
 * ask for the next.
 *
 * One instance per viewer, on the legacy `IfcContext`, reached through
 * `ThreeContext#getRenderDemand`. **Scopes nest:** `begin()` opens one and
 * hands back the function that closes it, and the loop paints on demand
 * while any is open. CadView opens one for the whole load, whatever the
 * format; `ProgressiveLoadSession` opens its own for a progressive parse and
 * closes it at its finish or abort. A failed first attempt that CadView
 * retries (an auth-shaped failure, `loadModelWithAuthRetry`) aborts its
 * session without ending CadView's scope, so the wait and the retried
 * download stay on demand (codex review on #2052). The render closure
 * (`IfcHighlighter#newUpdateFunction`) consults it.
 *
 * **Camera moves are the user's unless the follow made them.** camera-controls
 * reports a drag (`controlstart`) and a wheel zoom (`control`), but a ViewCube
 * snap, a fit or a permalink pose move the camera with no control event at
 * all, and those are the user's too: every camera `update` paints on the next
 * frame. The one exception is the load's own camera follow, which makes its
 * move synchronously inside `runFollowMove` (a snap and an immediate
 * controls `update`, ProgressiveLoadSession#fitUnionToFrame_): updates made
 * inside that call, and only those, paint in the background. Attribution is
 * by call, not by time: a time window after each follow fit, the first cut,
 * also swallowed a ViewCube snap that landed inside it (codex review on
 * #2052). And a camera UI of ours notes the user's camera at the moment of
 * input (`noteUserCamera`), which stops the follow for good, so no follow move
 * can run while a UI's own move is queued.
 */


/**
 * Background frames are never closer together than this. There is no upper
 * bound on purpose: capping the gap at 2 s brought sp-231MB's Geometry on
 * SwiftShader from 42 s back to 624 s, its paints costing more than that.
 */
export const BACKGROUND_MIN_GAP_MS = 100
/** Background frames are spaced at this multiple of the last frame's cost. */
export const BACKGROUND_COST_FACTOR = 4
/** With nothing asking, a background frame is still requested this often. */
export const HEARTBEAT_MS = 1000
/**
 * The camera-controls event a camera UI sends when the user works it: see
 * `noteUserCamera`.
 */
export const USER_CAMERA_EVENT = 'bldrsusercamera'
/**
 * After user input or a store change, keep painting this long: what the
 * event changes is often applied a frame or two later, by a React effect or
 * an awaited pick, and a paint before it lands would leave the old frame up
 * (see the module doc, layer 5). At 60 Hz this is ~12 paints per burst.
 */
export const SETTLE_MS = 200
/**
 * A paint that takes longer than this, measured to the next frame as the
 * load budget measures it, is an expensive one: two 60 Hz frames, so the
 * display is already showing every other frame at best. Above it, what only
 * the pointer moving would repaint is left to ask for itself: the canvas
 * pointermove no longer opens a settle window (renderDemandHooks.js
 * #attachSessionNets), and the hover pick skips fast moves
 * (viewer/hoverPick.js#createFrameHoverPicker). Below it, nothing changes.
 * The owner's PSB preview: hover lag that grew with model size, the
 * repaints, not the picks, being what the sweep queued up on the GPU.
 */
export const EXPENSIVE_PAINT_MS = 33
/**
 * What a frame paints (`RenderDemand#frameKind`). `FULL` redraws the scene;
 * `OVERLAY` asks only that the hover overlay be redrawn on the cached frame
 * of the last full paint (hoverOverlay.js). The render closure turns an
 * `OVERLAY` frame into a full one whenever the overlay can't compose it.
 */
export const PaintKind = Object.freeze({FULL: 'full', OVERLAY: 'overlay'})


// Every live RenderDemand, so `requestPaint` reaches the viewer without the
// caller holding it. One viewer at a time today; a disposed one leaves.
const liveDemands = new Set()
// Above zero while a paint runs (`runPaint`): the hooks don't count what
// three mutates inside its own render as a change to paint.
let paintDepth = 0


/**
 * The picture changed: paint it on the next frame, in every live viewer.
 * Cheap enough to call from anywhere (a flag per viewer). For the sources
 * three can't see change: `visible`, a material's colour or opacity, an
 * outline selection, a light. During a load it paints at once like any user
 * action; work the load pipeline does itself asks with
 * `requestBackgroundPaint` instead, which the load's frame budget spaces.
 */
export function requestPaint() {
  for (const demand of liveDemands) {
    demand.invalidate()
  }
}


/**
 * Only the hover overlay changed: the hovered instance(s), not the scene
 * under them (hoverOverlay.js). Between loads, with nothing else asking and
 * the probe still, the next frame redraws just the overlay on the cached
 * frame; anything else that asks in the same frame makes it a full paint,
 * which draws the overlay too. During a load, or off a session, it is a
 * plain `requestPaint`. The only caller is the overlay itself, and
 * `renderOnDemandSources.test.js` holds it to that.
 */
export function requestOverlayPaint() {
  for (const demand of liveDemands) {
    demand.invalidateOverlay()
  }
}


/**
 * The scene changed as part of ongoing work: paint when the budget allows
 * during a load, on the next frame otherwise. What the three hooks call
 * (renderDemandHooks.js). Ignored while a paint is running.
 */
export function requestBackgroundPaint() {
  if (paintDepth > 0) {
    return
  }
  for (const demand of liveDemands) {
    demand.invalidateBackground()
  }
}


/**
 * Run a draw, so that what three mutates inside it isn't taken for a change
 * (module doc). The render closure and the screenshot path draw through it.
 *
 * @param {Function} draw
 * @return {*} what `draw` returns
 */
export function runPaint(draw) {
  paintDepth++
  try {
    return draw()
  } finally {
    paintDepth--
  }
}


/**
 * What RenderDemand needs of a camera-controls instance: its events. Tests
 * pass a stand-in; a stand-in without events is tolerated (the try/catches).
 *
 * @typedef {object} CameraEvents
 * @property {Function} [addEventListener] listen for `update`, `control`, …
 * @property {Function} [removeEventListener] stop listening
 * @property {Function} [dispatchEvent] send `USER_CAMERA_EVENT`
 */


/**
 * Whether anything a paint reads changed since the last paint
 * (renderDemandHooks.js#createSceneProbe).
 *
 * @typedef {object} SceneProbe
 * @property {function(): boolean} changed whether it moved since the snapshot
 * @property {function(): void} snapshot record it as painted
 */


/**
 * The user has taken the camera through a UI of ours rather than the canvas:
 * a ViewCube drag, snap, orbit or fit button, a `#c:` permalink pose. Call it
 * at the moment of input, before the UI moves the camera.
 *
 * camera-controls sends `controlstart` / `control` only for input on its own
 * canvas, so without this a UI command looks like nobody's move. Everything
 * that reacts to the user taking the camera listens for this event as well as
 * for those: the load's camera follow stops for good
 * (ProgressiveLoadSession), the end-of-load fit is skipped
 * (CadView#watchCameraTakenDuringLoad) and camera moves paint at once
 * (RenderDemand). Because the follow stops before the UI's own move is even
 * queued, no follow refit can run between the two and flush or overwrite it
 * (codex review on #2052; design/new/in-app-model-switch.md §4.2a).
 *
 * @param {CameraEvents|null} controls the viewer's camera-controls instance
 */
export function noteUserCamera(controls) {
  try {
    controls?.dispatchEvent?.({type: USER_CAMERA_EVENT})
  } catch {
    // A controls stand-in without events: nothing is listening either.
  }
}


/** See the module doc. */
export default class RenderDemand {
  /**
   * @param {object} [options]
   * @param {Function} [options.now] clock in ms, for tests
   */
  constructor({now = () => performance.now()} = {}) {
    this.now = now
    this.isOnDemand = false
    this.isDirty = false
    this.isBackgroundDirty = false
    // Only the hover overlay asked (`invalidateOverlay`): the one ask that
    // doesn't need the scene redrawn.
    this.isOverlayDirty = false
    this.lastPaintStartMs = -Infinity
    this.lastPaintCostMs = 0
    // Set by a paint, cleared by the next frame, which measures it.
    this.isAwaitingFrameAfterPaint = false
    // Whether the user has driven the camera during this load: from then on
    // even the follow's window doesn't make a camera update background work.
    this.isUserDriving = false
    // True only while runFollowMove runs the follow's move.
    this.isFollowMoving = false
    this.controls = null
    // Open scopes (begin), by token.
    this.scopes = new Set()
    // Paint counters for the whole life of the viewer, read by the load
    // measurement probes to show what on-demand painting saved.
    // `frames` counts the frames that asked, painted or not, so a probe can
    // tell an idle viewer (frames rising, paints not) from a stopped loop.
    // `overlayPaints` counts the paints of those that only redrew the hover
    // overlay (`rendered(…, PaintKind.OVERLAY)`).
    this.stats = {paints: 0, paintMs: 0, frames: 0, overlayPaints: 0}
    // Session mode (`startSession`, `?feature=renderOnDemand`): on demand
    // between loads too.
    this.isSession = false
    this.sessionControls = null
    // What `shouldRender` asks between loads when nothing else did: has
    // anything a paint depends on changed since the last one? (layer 4)
    this.probe = null
    // Paint every frame until this time (layer 5, `invalidateSoon`).
    this.settleUntilMs = -Infinity
    // Open `keepPainting` holds (layer 6).
    this.holds = 0
    // `observePaints` observers: told around every paint, during a load or
    // not, on demand or not.
    this.paintObservers = new Set()
    liveDemands.add(this)
    this.onUserControl = () => {
      this.isUserDriving = true
      // During a load a user's control start paints at once (#2043). Between
      // loads on demand it changes nothing yet: the move that follows asks
      // through `update`, and a paint here would only queue the old pose
      // ahead of it (renderDemandHooks.js#WINDOW_INPUT_EVENTS).
      if (this.scopes.size > 0 || !this.isSession) {
        this.invalidate()
      }
    }
    this.onCameraUpdate = () => {
      if (this.isFollowMoving && !this.isUserDriving) {
        this.invalidateBackground()
      } else {
        this.invalidate()
      }
    }
    this.onResize = () => this.invalidate()
  }


  /**
   * Open an on-demand scope, for a load or a part of one. The first frame
   * paints, so the scene is current when the scope opens.
   *
   * @param {CameraEvents|null} [controls] camera-controls instance, whose `control` /
   *   `controlstart` (user input; a wheel zoom sends only `control`) and
   *   `update` (the camera moved) events drive the camera half of the demand.
   *   The first scope to name one attaches it; a nested scope naming another
   *   moves the listeners to it.
   * @return {Function} closes this scope; idempotent. The loop paints every
   *   frame again once every scope is closed.
   */
  begin(controls = null) {
    const token = {}
    const isFirst = this.scopes.size === 0
    this.scopes.add(token)
    this.isOnDemand = true
    this.isDirty = true
    if (isFirst) {
      this.isUserDriving = false
      globalThis.addEventListener?.('resize', this.onResize)
    }
    if (controls !== null && controls !== this.controls) {
      this.attachControls_(controls)
    }
    return () => this.end_(token)
  }


  /**
   * Keep the viewer on demand for the rest of its life, between loads as
   * well as during them (`?feature=renderOnDemand`; module doc). Paints once
   * at the start, so the frame is current.
   *
   * @param {object} [options]
   * @param {CameraEvents|null} [options.controls] camera-controls instance,
   *   listened to between loads as `begin` does during one
   * @param {SceneProbe|null} [options.probe] whether anything a paint reads
   *   changed since the last paint
   * @return {Function} back to painting every frame between loads
   */
  startSession({controls = null, probe = null} = {}) {
    this.isSession = true
    this.isOnDemand = true
    this.isDirty = true
    this.probe = probe
    this.sessionControls = controls
    if (controls !== null && controls !== this.controls) {
      this.attachControls_(controls)
    }
    if (this.scopes.size === 0) {
      globalThis.addEventListener?.('resize', this.onResize)
    }
    return () => this.stopSession_()
  }


  /** Undo `startSession`. */
  stopSession_() {
    if (!this.isSession) {
      return
    }
    this.isSession = false
    this.sessionControls = null
    this.probe = null
    if (this.scopes.size === 0) {
      this.detachControls_()
      globalThis.removeEventListener?.('resize', this.onResize)
      this.isOnDemand = false
    }
  }


  /**
   * Paint every frame between loads while held: for what changes the picture
   * on its own clock rather than at a call we can hook (Spark's splat sort,
   * an animation). During a load the load's budget still decides. Holds
   * count; each release is idempotent.
   *
   * @return {Function} releases this hold
   */
  keepPainting() {
    this.holds++
    let isHeld = true
    return () => {
      if (isHeld) {
        isHeld = false
        this.holds--
        this.isDirty = true
      }
    }
  }


  /**
   * Be told around each paint the render closure makes
   * (IfcHighlighter#newUpdateFunction): `beforePaint()` just before the
   * draw, `afterPaint(costMs, kind)` just after it, in the same task, each
   * with the frame's `PaintKind`. For what
   * needs to bracket the GL commands of a frame — the motion-residency GPU
   * timer (residency/gpuFrameTimer.js) places its timer query or fence here.
   * An observer must not ask for a paint; one that throws is dropped from
   * that call only, so a broken observer can't stop the viewer painting.
   *
   * @param {object} observer `{beforePaint?, afterPaint?}`
   * @return {Function} stops observing; idempotent
   */
  observePaints(observer) {
    this.paintObservers.add(observer)
    return () => {
      this.paintObservers.delete(observer)
    }
  }


  /**
   * The render closure is about to draw: tell the paint observers.
   *
   * @param {string} [kind] what it will paint (the hover overlay's
   *   `PaintKind`); undefined is a full paint
   */
  paintStarting(kind) {
    for (const observer of this.paintObservers) {
      try {
        observer.beforePaint?.(kind)
      } catch (error) {
        console.warn('[renderDemand] paint observer failed:', error)
      }
    }
  }


  /**
   * Attach the camera half of the demand to `controls`.
   *
   * @param {CameraEvents} controls camera-controls instance
   */
  attachControls_(controls) {
    this.detachControls_()
    this.controls = controls
    try {
      controls?.addEventListener?.('controlstart', this.onUserControl)
      controls?.addEventListener?.('control', this.onUserControl)
      controls?.addEventListener?.(USER_CAMERA_EVENT, this.onUserControl)
      controls?.addEventListener?.('update', this.onCameraUpdate)
    } catch {
      // A controls stand-in without events: camera moves fall to the heartbeat.
    }
  }


  /**
   * Run the load's camera follow's move: the camera updates `move` makes,
   * synchronously, paint in the background (module doc). Nothing after it
   * returns is counted as the follow's.
   *
   * @param {Function} move moves the camera and applies it at once
   */
  runFollowMove(move) {
    this.isFollowMoving = true
    try {
      move()
    } finally {
      this.isFollowMoving = false
    }
  }


  /**
   * Close one scope; back to painting every frame when it was the last.
   *
   * @param {object} token the scope begin() opened
   */
  end_(token) {
    if (!this.scopes.delete(token) || this.scopes.size > 0) {
      return
    }
    this.isUserDriving = false
    if (this.isSession) {
      // Stay on demand, back on the session's camera, and paint what the
      // load left behind: its last background change may still be waiting
      // for a budget it no longer has.
      if (this.sessionControls !== null && this.sessionControls !== this.controls) {
        this.attachControls_(this.sessionControls)
      }
      this.isDirty = true
      return
    }
    this.detachControls_()
    globalThis.removeEventListener?.('resize', this.onResize)
    this.isOnDemand = false
  }


  /** Paint on the next frame: the user is looking for a response. */
  invalidate() {
    this.isDirty = true
  }


  /**
   * Redraw the hover overlay on the next frame (`requestOverlayPaint`). Only
   * a session between loads can paint the overlay alone; otherwise this is
   * `invalidate`, so a hover during a load or off a session repaints in full.
   */
  invalidateOverlay() {
    if (!this.isSession || this.scopes.size > 0) {
      this.invalidate()
      return
    }
    this.isOverlayDirty = true
  }


  /** Paint when the frame budget allows: the load changed the scene. */
  invalidateBackground() {
    this.isBackgroundDirty = true
  }


  /**
   * Something happened that will probably change the picture soon, if it
   * hasn't already: user input, a store change (module doc, layer 5).
   * Between loads, paint every frame for `SETTLE_MS`; during a load, a
   * background paint, so the load's own store churn doesn't paint at 60 Hz.
   */
  invalidateSoon() {
    if (this.scopes.size > 0) {
      this.isBackgroundDirty = true
      return
    }
    this.settleUntilMs = Math.max(this.settleUntilMs, this.now() + SETTLE_MS)
  }


  /** Leave `requestPaint`'s reach and drop every listener; for a disposed viewer. */
  dispose() {
    liveDemands.delete(this)
    this.paintObservers.clear()
    this.stopSession_()
    for (const token of [...this.scopes]) {
      this.end_(token)
    }
    this.detachControls_()
    globalThis.removeEventListener?.('resize', this.onResize)
  }


  /**
   * Should this animation frame paint?
   *
   * @return {boolean}
   */
  shouldRender() {
    return this.frameKind() !== null
  }


  /**
   * What this animation frame should paint: nothing (`null`), the whole
   * scene, or only the hover overlay on the cached frame. `OVERLAY` only
   * when the overlay is the one thing that asked: any other ask, an open
   * settle window, a hold or a probe that moved makes the frame `FULL`, since
   * each of them may have changed the scene the cached frame shows. During a
   * load `invalidateOverlay` sets `isDirty` instead, so the budget logic
   * below never sees an overlay ask.
   *
   * @return {string|null} a `PaintKind`, or null to skip the frame
   */
  frameKind() {
    const now = this.now()
    this.stats.frames++
    if (this.isAwaitingFrameAfterPaint) {
      this.isAwaitingFrameAfterPaint = false
      this.lastPaintCostMs = Math.max(this.lastPaintCostMs, now - this.lastPaintStartMs)
    }
    if (!this.isOnDemand || this.isDirty) {
      return PaintKind.FULL
    }
    if (this.scopes.size === 0) {
      // A session between loads: no heartbeat and no budget. Whatever asked
      // paints now; with nothing asking, the probe has the last word. A hold
      // counts only here: during a load the load's budget still decides.
      if (this.holds > 0 || this.isBackgroundDirty || now < this.settleUntilMs) {
        return PaintKind.FULL
      }
      // Read on an overlay ask too: a camera or canvas change nobody
      // announced must not be papered over with the old frame.
      if (this.probe?.changed?.() === true) {
        return PaintKind.FULL
      }
      return this.isOverlayDirty ? PaintKind.OVERLAY : null
    }
    const sinceLastPaint = now - this.lastPaintStartMs
    if (sinceLastPaint >= HEARTBEAT_MS) {
      this.isBackgroundDirty = true
    }
    if (!this.isBackgroundDirty) {
      return null
    }
    const gap = Math.max(BACKGROUND_MIN_GAP_MS, BACKGROUND_COST_FACTOR * this.lastPaintCostMs)
    return sinceLastPaint >= gap ? PaintKind.FULL : null
  }


  /**
   * Record a paint that just finished. Its cost so far is the draw call's;
   * the next frame extends it to the time that frame took to come (see the
   * module doc).
   *
   * @param {number} costMs how long the draw call took on the main thread
   * @param {string} [kind] the `PaintKind` it painted. A full paint draws the
   *   overlay as well, so either kind answers an overlay ask; only a full one
   *   answers the rest.
   */
  rendered(costMs, kind = PaintKind.FULL) {
    const drawMs = Number.isFinite(costMs) && costMs > 0 ? costMs : 0
    this.isOverlayDirty = false
    if (kind === PaintKind.OVERLAY) {
      this.stats.overlayPaints++
    } else {
      this.isDirty = false
      this.isBackgroundDirty = false
    }
    this.lastPaintStartMs = this.now() - drawMs
    this.lastPaintCostMs = drawMs
    this.isAwaitingFrameAfterPaint = true
    this.stats.paints++
    this.stats.paintMs += drawMs
    // What this paint showed is the baseline the probe compares against.
    this.probe?.snapshot?.()
    for (const observer of this.paintObservers) {
      try {
        observer.afterPaint?.(drawMs, kind)
      } catch (error) {
        console.warn('[renderDemand] paint observer failed:', error)
      }
    }
  }


  /**
   * What the last paint cost, measured as `shouldRender` measures it: from
   * its start to the next frame. Read in the frame after a paint, before
   * that frame's `shouldRender` has extended the draw call's own cost, it
   * extends it here the same way, so a per-frame component sees the whole
   * cost. 0 before the first paint.
   *
   * @return {number} ms
   */
  paintCostMs() {
    if (this.isAwaitingFrameAfterPaint) {
      return Math.max(this.lastPaintCostMs, this.now() - this.lastPaintStartMs)
    }
    return this.lastPaintCostMs
  }


  /** Drop the camera listeners `begin` added. */
  detachControls_() {
    try {
      this.controls?.removeEventListener?.('controlstart', this.onUserControl)
      this.controls?.removeEventListener?.('control', this.onUserControl)
      this.controls?.removeEventListener?.(USER_CAMERA_EVENT, this.onUserControl)
      this.controls?.removeEventListener?.('update', this.onCameraUpdate)
    } catch {
      // best-effort
    }
    this.controls = null
  }
}
