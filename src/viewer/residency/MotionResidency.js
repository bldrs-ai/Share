import {AutoResidency, FrameRateEstimate} from './autoResidency'
import {createGpuFrameTimer} from './gpuFrameTimer'
import {ResidencyMetric} from './ResidencyController'


/** The percent at which the whole at-rest set is kept. */
const FULL_PERCENT = 100


/** How the motion residency is chosen. */
export const MotionResidencyMode = Object.freeze({
  /** From measured GPU frame time against the display's frame budget. */
  AUTO: 'auto',
  /** A fixed percent; 100 is "no change while moving". */
  MANUAL: 'manual',
})

/** No camera change for this long, and for `REST_FRAMES` frames, is rest. */
export const REST_MS = 200
/**
 * Consecutive frames without a camera change rest also needs. Time alone
 * is not enough on a slow GPU: at SwiftShader's ~380 ms per frame of a 1M-
 * triangle model, camera-controls skips an `update` on some frames of a
 * steady drag, and a single quiet frame is already past `REST_MS` — every
 * gesture ended after two frames, so Auto never saw the three samples a step
 * needs. Measured while building B3 (#2130). On a 60 Hz display three frames
 * are 50 ms, so `REST_MS` still decides there.
 */
export const REST_FRAMES = 3
/**
 * Most instances one frame's step may flip after a gesture's first (B2's
 * bounded-churn rule). A flip is a `setVisibleAt` plus three rebuilding its
 * draw list, a few tens of ns each, so this bounds a step to a few ms on
 * the largest batches. The gesture's first frame and the restore at rest are
 * not bounded: the first must already be cheap to draw and the second must
 * be the full at-rest picture, and each is one pass.
 */
export const MAX_FLIPS_PER_FRAME = 20000
/** RenderDemand's `PaintKind.OVERLAY` (renderDemand.js, #2129). */
const OVERLAY_PAINT = 'overlay'
/** With no idle callback, prepare a motion ordering this long after rest. */
const PREPARE_DELAY_MS = 100


/**
 * MotionResidency — B3 of design/new/demand-tiled-rendering.md: while the
 * camera moves, keep the frame inside its budget by holding the residency
 * controller's motion overlay at a lower fraction; when the camera comes to
 * rest, end the overlay so the still frame is the at-rest picture, and paint
 * it.
 *
 * **Motion and rest.** camera-controls' `update` event (input, damping,
 * transitions, ViewCube snaps and fits — everything that moves the camera
 * goes through it) starts motion; `REST_MS` and `REST_FRAMES` frames
 * without one is rest. Not
 * `controlstart`: a click on the canvas is a pointerdown that moves nothing,
 * and evicting on it would flicker the model under every selection. `update`
 * fires inside `controls.update()`, which IfcContext#updateAllComponents runs
 * before the frame's paint, so the eviction it starts lands in the same frame
 * as the first moved pose. Rest is noticed in the per-frame hook
 * (ThreeContext#onFrame, which also runs before the paint), and each
 * instance the restore shows asks for a paint (ResidencyController's
 * `requestPaint`), so the full set is on screen in the frame that found the
 * camera still. The load's own camera follow is not motion
 * (`RenderDemand#isFollowMoving`).
 *
 * **What is measured.** Only under Auto, only while moving: the GPU time of
 * each painted frame (gpuFrameTimer.js, bracketed by RenderDemand's paint
 * observers), fed to the policy (autoResidency.js) with the display interval
 * read off the loop's own idle animation frames. The policy's fraction
 * persists across gestures, so the next drag starts cheap.
 *
 * **What it never does.** Add a part the at-rest setting evicts, or keep one
 * evicted at rest: the overlay is drawn from the at-rest set and `endMotion`
 * replays it (ResidencyController). Manual 100% never starts an overlay at
 * all, so with it the viewer behaves exactly as without this module.
 */
export class MotionResidency {
  /**
   * @param {object} controller a ResidencyController
   * @param {object} deps
   * @param {object} [deps.controls] camera-controls instance
   * @param {Function} [deps.onFrame] ThreeContext#onFrame
   * @param {object} [deps.renderDemand] the viewer's RenderDemand
   * @param {object} [deps.gl] the renderer's WebGL context, for the timer
   * @param {Function} [deps.now] clock in ms
   * @param {Function} [deps.idle] schedules idle work; returns a canceller
   * @param {Function} [deps.onGestureEnd] (autoFraction) after each restore
   * @param {object} [deps.timerOptions] passed to createGpuFrameTimer
   */
  constructor(controller, {
    controls = null,
    onFrame = null,
    renderDemand = null,
    gl = null,
    now = () => performance.now(),
    idle = scheduleIdle,
    onGestureEnd = null,
    timerOptions = {},
  } = {}) {
    this.controller = controller
    this.controls = controls
    this.renderDemand = renderDemand
    this.now = now
    this.idle = idle
    this.onGestureEnd = onGestureEnd
    this.settings = {mode: MotionResidencyMode.AUTO, percent: FULL_PERCENT, metric: ResidencyMetric.OCCUPANCY}
    this.auto = new AutoResidency({now})
    this.rate = new FrameRateEstimate()
    this.timer = createGpuFrameTimer(gl, {
      ...timerOptions,
      now,
      onSample: (ms, epoch) => this.onSample_(ms, epoch),
    })
    this.moving = false
    this.lastMoveMs_ = -Infinity
    // Whether the camera changed since the last frame, and how many frames
    // in a row it hasn't.
    this.changedSinceFrame_ = false
    this.quietFrames_ = 0
    this.paintedSinceFrame_ = false
    this.cancelPrepare_ = null
    // Read by tests and the PR's measurements; cheap counters only.
    this.stats = {gestures: 0, samples: 0, lastSampleMs: null}

    this.onUpdate_ = () => this.noteCameraChange()
    try {
      controls?.addEventListener?.('update', this.onUpdate_)
    } catch {
      // A controls stand-in without events: nothing will start motion.
    }
    this.stopFrame_ = onFrame?.(() => this.frame()) ?? null
    this.stopObserving_ = renderDemand?.observePaints?.({
      // An overlay-only paint (the hover overlay, #2129: the cached frame
      // plus the hovered instances) says nothing about what the resident set
      // costs to draw, so it is never timed; it would read as a cheap frame
      // and walk Auto up.
      beforePaint: (kind) => {
        if (this.isMeasuring_() && kind !== OVERLAY_PAINT) {
          this.timer.beforePaint(this.auto.epoch)
        }
      },
      afterPaint: (costMs, kind) => {
        this.paintedSinceFrame_ = true
        if (this.isMeasuring_() && kind !== OVERLAY_PAINT) {
          this.timer.afterPaint(this.auto.epoch)
        }
      },
    }) ?? null
    // The first gesture needs an ordering too (a controller never applied
    // has none to reuse).
    this.schedulePrepare()
  }


  /**
   * @param {object} settings `{mode, percent, metric}`; see
   *   motionResidencyMode.js
   */
  setSettings({mode, percent, metric}) {
    const next = {mode, percent, metric}
    const was = this.settings
    if (was.mode === next.mode && was.percent === next.percent && was.metric === next.metric) {
      return
    }
    // A change mid-gesture takes effect from the next camera change; ending
    // here restores the at-rest picture rather than mixing two settings.
    if (this.moving) {
      this.endMotion_()
    }
    this.settings = next
    this.schedulePrepare()
  }


  /** @return {number} 0..1, the fraction Auto last settled on */
  get autoFraction() {
    return this.auto.fraction
  }


  /** The camera changed (camera-controls `update`). */
  noteCameraChange() {
    if (!this.isActive_() || this.renderDemand?.isFollowMoving === true) {
      return
    }
    this.lastMoveMs_ = this.now()
    this.changedSinceFrame_ = true
    this.quietFrames_ = 0
    if (!this.moving) {
      this.startMotion_()
    }
  }


  /** One animation frame, before its paint (ThreeContext#onFrame). */
  frame() {
    const now = this.now()
    this.rate.tick(now, this.paintedSinceFrame_)
    this.paintedSinceFrame_ = false
    if (!this.moving) {
      return
    }
    if (this.changedSinceFrame_) {
      this.changedSinceFrame_ = false
    } else {
      this.quietFrames_++
    }
    if (now - this.lastMoveMs_ >= REST_MS && this.quietFrames_ >= REST_FRAMES) {
      this.endMotion_()
      return
    }
    if (this.isMeasuring_()) {
      this.timer.poll()
    }
    if (this.settings.mode === MotionResidencyMode.AUTO) {
      this.auto.setBudgetMs(this.rate.budgetMs)
      if (this.auto.update()) {
        this.controller.setMotionFraction(this.auto.fraction, {maxFlips: MAX_FLIPS_PER_FRAME})
        return
      }
    }
    this.controller.stepMotion(MAX_FLIPS_PER_FRAME)
  }


  /** Detach from the camera, the loop and the paints; restore at rest. */
  dispose() {
    if (this.moving) {
      this.endMotion_()
    }
    this.cancelPrepare_?.()
    this.cancelPrepare_ = null
    try {
      this.controls?.removeEventListener?.('update', this.onUpdate_)
    } catch {
      // best-effort
    }
    this.stopFrame_?.()
    this.stopObserving_?.()
    this.timer?.dispose()
  }


  /** @return {boolean} whether this setting changes anything while moving */
  isActive_() {
    return this.settings.mode === MotionResidencyMode.AUTO || this.settings.percent < FULL_PERCENT
  }


  /** @return {boolean} whether painted frames are being timed now */
  isMeasuring_() {
    return this.moving && this.timer !== null && this.settings.mode === MotionResidencyMode.AUTO
  }


  /** @private */
  startMotion_() {
    const {controller, settings} = this
    controller.beginMotion(settings.metric)
    if (!controller.isInMotion) {
      return
    }
    this.moving = true
    this.stats.gestures++
    let fraction = settings.percent / FULL_PERCENT
    if (settings.mode === MotionResidencyMode.AUTO) {
      this.auto.startGesture(controller.motionCapacity(settings.metric))
      fraction = this.auto.fraction
      this.timer?.start()
    }
    // Unbounded: this is the frame the first moved pose paints in.
    controller.setMotionFraction(fraction)
  }


  /** @private */
  endMotion_() {
    this.moving = false
    this.timer?.stop()
    // Each instance the restore shows asks for a paint on the next frame
    // (ResidencyController#setVisible_ calls requestPaint, beside the
    // `setVisibleAt` hook's background ask), so the at-rest picture lands in
    // the frame that found the camera still.
    this.controller.endMotion()
    this.onGestureEnd?.(this.auto.fraction)
    this.schedulePrepare()
  }


  /**
   * Build the motion metric's ordering in idle time, so the next gesture
   * doesn't sort (ResidencyController#prepareMotion). Called after each
   * gesture and settings change, and by the UI after an at-rest change
   * (which drops the controller's prepared orderings).
   */
  schedulePrepare() {
    const metric = this.settings.metric
    if (!this.isActive_()) {
      return
    }
    this.cancelPrepare_?.()
    this.cancelPrepare_ = this.idle(() => {
      this.cancelPrepare_ = null
      if (!this.moving) {
        this.controller.prepareMotion(metric)
      }
    })
  }


  /**
   * @param {number} ms
   * @param {number} epoch
   * @private
   */
  onSample_(ms, epoch) {
    this.stats.samples++
    this.stats.lastSampleMs = ms
    this.auto.addSample(ms, epoch)
  }
}


/**
 * @param {Function} callback
 * @return {Function} cancels it
 */
function scheduleIdle(callback) {
  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(callback)
    return () => cancelIdleCallback(handle)
  }
  const handle = setTimeout(callback, PREPARE_DELAY_MS)
  return () => clearTimeout(handle)
}
