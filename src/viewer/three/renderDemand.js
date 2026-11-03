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
 *    once the user has touched the camera, a selection change, a resize;
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
 * Outside a load (`isOnDemand === false`) every frame paints, as before:
 * everything that changes the picture after a load (cut planes, isolation,
 * looks, hover, splat sorting) keeps working without having to ask.
 *
 * One instance per viewer, on the legacy `IfcContext`, reached through
 * `ThreeContext#getRenderDemand`. CadView begins it when a load starts and
 * ends it when the load settles, whatever the format; `ProgressiveLoadSession`
 * begins it again for a progressive parse (attaching the controls it frames)
 * and ends it at its finish, as the durable model goes in. The render closure
 * (`IfcHighlighter#newUpdateFunction`) consults it.
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
    this.lastPaintStartMs = -Infinity
    this.lastPaintCostMs = 0
    // Set by a paint, cleared by the next frame, which measures it.
    this.isAwaitingFrameAfterPaint = false
    // Whether the user has driven the camera during this load. Until they
    // have, camera updates are the follow's (ProgressiveLoadSession), which
    // paint in the background like the geometry it is following.
    this.isUserDriving = false
    this.controls = null
    // Paint counters for the whole life of the viewer, read by the load
    // measurement probes to show what on-demand painting saved.
    this.stats = {paints: 0, paintMs: 0}
    this.onUserControl = () => {
      this.isUserDriving = true
      this.invalidate()
    }
    this.onCameraUpdate = () => {
      if (this.isUserDriving) {
        this.invalidate()
      } else {
        this.invalidateBackground()
      }
    }
    this.onResize = () => this.invalidate()
  }


  /**
   * Start painting on demand, for a load. The first frame paints so the scene
   * is current when the mode starts.
   *
   * @param {object} [controls] camera-controls instance, whose `control` /
   *   `controlstart` (user input; a wheel zoom sends only `control`) and
   *   `update` (the camera moved) events drive the camera half of the demand
   */
  begin(controls = null) {
    if (this.isOnDemand) {
      this.detach_()
    }
    this.isOnDemand = true
    this.isUserDriving = false
    this.isDirty = true
    this.controls = controls
    try {
      controls?.addEventListener?.('controlstart', this.onUserControl)
      controls?.addEventListener?.('control', this.onUserControl)
      controls?.addEventListener?.('update', this.onCameraUpdate)
    } catch {
      // A controls stand-in without events: camera moves fall to the heartbeat.
    }
    globalThis.addEventListener?.('resize', this.onResize)
  }


  /** Back to painting every frame. Safe to call when not on demand. */
  end() {
    if (!this.isOnDemand) {
      return
    }
    this.detach_()
    this.isOnDemand = false
    this.isUserDriving = false
  }


  /** Paint on the next frame: the user is looking for a response. */
  invalidate() {
    this.isDirty = true
  }


  /** Paint when the frame budget allows: the load changed the scene. */
  invalidateBackground() {
    this.isBackgroundDirty = true
  }


  /**
   * Should this animation frame paint?
   *
   * @return {boolean}
   */
  shouldRender() {
    const now = this.now()
    if (this.isAwaitingFrameAfterPaint) {
      this.isAwaitingFrameAfterPaint = false
      this.lastPaintCostMs = Math.max(this.lastPaintCostMs, now - this.lastPaintStartMs)
    }
    if (!this.isOnDemand || this.isDirty) {
      return true
    }
    const sinceLastPaint = now - this.lastPaintStartMs
    if (sinceLastPaint >= HEARTBEAT_MS) {
      this.isBackgroundDirty = true
    }
    if (!this.isBackgroundDirty) {
      return false
    }
    const gap = Math.max(BACKGROUND_MIN_GAP_MS, BACKGROUND_COST_FACTOR * this.lastPaintCostMs)
    return sinceLastPaint >= gap
  }


  /**
   * Record a paint that just finished. Its cost so far is the draw call's;
   * the next frame extends it to the time that frame took to come (see the
   * module doc).
   *
   * @param {number} costMs how long the draw call took on the main thread
   */
  rendered(costMs) {
    const drawMs = Number.isFinite(costMs) && costMs > 0 ? costMs : 0
    this.isDirty = false
    this.isBackgroundDirty = false
    this.lastPaintStartMs = this.now() - drawMs
    this.lastPaintCostMs = drawMs
    this.isAwaitingFrameAfterPaint = true
    this.stats.paints++
    this.stats.paintMs += drawMs
  }


  /** Drop the listeners `begin` added. */
  detach_() {
    try {
      this.controls?.removeEventListener?.('controlstart', this.onUserControl)
      this.controls?.removeEventListener?.('control', this.onUserControl)
      this.controls?.removeEventListener?.('update', this.onCameraUpdate)
    } catch {
      // best-effort
    }
    this.controls = null
    globalThis.removeEventListener?.('resize', this.onResize)
  }
}
