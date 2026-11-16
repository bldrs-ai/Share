import {REST_FRAMES, REST_MS} from './residency/MotionResidency'
import {requestPaint} from './three/renderDemand'


/**
 * MotionAO — drop ambient occlusion while the camera moves, and put it back
 * the moment it comes to rest.
 *
 * **Why first, before geometry.** AO is a full-screen post pass (N8AO: an AO
 * pass, a denoise and a composite) whose cost scales with pixels, not with the
 * model, and a moving picture hides its absence. Motion residency (B3,
 * design/new/demand-tiled-rendering.md, MotionResidency.js) cuts geometry
 * while moving to hold the frame budget, and under Auto it decides how much by
 * timing each moved frame on the GPU. This module suspends AO on the same
 * signal that starts motion there — camera-controls `update`, which fires
 * inside `controls.update()` before the frame's paint — so the first moved
 * frame is already drawn without AO, and every frame Auto times is an AO-free
 * frame. Geometry is cut only for what the frame costs once AO is gone.
 * Auto's fraction persists across gestures, so it settles where an AO-free
 * frame fits.
 *
 * **Rest.** The same rule as MotionResidency: `REST_MS` and `REST_FRAMES`
 * frames without a camera change, noticed in a ThreeContext#onFrame hook
 * (before the paint). Resuming asks for a paint, so the still frame with AO
 * lands in the frame that found the camera still, with MotionResidency's
 * restore of the full set in the same frame. The load's own camera follow is
 * not motion (`RenderDemand#isFollowMoving`), and with AO off (Flat look, the
 * panel's toggle, the look off) nothing is suspended.
 *
 * Independent of MotionResidency on purpose: that driver exists only for a
 * model with a residency controller and a motion setting that changes
 * something, while AO runs on every model.
 */
export class MotionAO {
  /**
   * @param {object} postProcessor CustomPostProcessor
   * @param {object} deps
   * @param {object} [deps.controls] camera-controls instance
   * @param {Function} [deps.onFrame] ThreeContext#onFrame; returns a remover
   * @param {object} [deps.renderDemand] the viewer's RenderDemand
   * @param {Function} [deps.now] clock in ms
   * @param {Function} [deps.paint] asks for a paint (default requestPaint)
   */
  constructor(postProcessor, {
    controls = null,
    onFrame = null,
    renderDemand = null,
    now = () => performance.now(),
    paint = requestPaint,
  } = {}) {
    this.postProcessor = postProcessor
    this.controls = controls
    this.renderDemand = renderDemand
    this.now = now
    this.paint = paint
    this.moving = false
    this.lastMoveMs_ = -Infinity
    this.changedSinceFrame_ = false
    this.quietFrames_ = 0
    this.onUpdate_ = () => this.noteCameraChange()
    try {
      controls?.addEventListener?.('update', this.onUpdate_)
    } catch {
      // A controls stand-in without events: nothing will start motion.
    }
    this.stopFrame_ = onFrame?.(() => this.frame()) ?? null
  }


  /** The camera changed (camera-controls `update`). */
  noteCameraChange() {
    if (this.renderDemand?.isFollowMoving === true) {
      return
    }
    this.lastMoveMs_ = this.now()
    this.changedSinceFrame_ = true
    this.quietFrames_ = 0
    if (!this.moving && this.postProcessor?.getAOEnabled?.()) {
      this.moving = true
      this.postProcessor.setAOSuspended(true)
    }
  }


  /** One animation frame, before its paint (ThreeContext#onFrame). */
  frame() {
    if (!this.moving) {
      return
    }
    if (this.changedSinceFrame_) {
      this.changedSinceFrame_ = false
    } else {
      this.quietFrames_++
    }
    if (this.now() - this.lastMoveMs_ >= REST_MS && this.quietFrames_ >= REST_FRAMES) {
      this.resume_()
    }
  }


  /** Detach from the camera and the loop; AO back on if it was dropped. */
  dispose() {
    if (this.moving) {
      this.resume_()
    }
    try {
      this.controls?.removeEventListener?.('update', this.onUpdate_)
    } catch {
      // best-effort
    }
    this.stopFrame_?.()
    this.stopFrame_ = null
  }


  /** @private */
  resume_() {
    this.moving = false
    this.postProcessor?.setAOSuspended(false)
    // AO is a composer pass: nothing three or the probe sees changes.
    this.paint()
  }
}
