import {REST_FRAMES, REST_MS} from './residency/MotionResidency'
import {requestPaint} from './three/renderDemand'


/** How long AO takes to fade out when the camera starts moving. */
export const FADE_OUT_MS = 100
/** How long AO takes to fade back in at rest, or once a load ends. */
// 500, not the first cut's 250: the owner found 250 still read as a pop.
export const FADE_IN_MS = 500


/**
 * MotionAO — fade ambient occlusion out while the camera moves, drop it for
 * the length of a model load, and fade it back in once the camera rests and
 * the load ends. It drives the post processor's AO level (0..1,
 * CustomPostProcessor#setAOLevel), which scales AO's strength; at 0 the AO
 * pass is skipped outright.
 *
 * **Fades, not cuts (#2167).** The owner found AO popping on and off jarring,
 * on the hosted index.ifc especially. AO fades out over `FADE_OUT_MS` when a
 * drag starts, and in over `FADE_IN_MS` at rest. Each step of a fade asks
 * for a paint, so the fade is drawn even when nothing else changes (a fade-in
 * on a still camera).
 *
 * **Why first, before geometry.** AO is a full-screen post pass (N8AO: an AO
 * pass, a denoise and a composite) whose cost scales with pixels, not with the
 * model, and a moving picture hides its absence. Motion residency (B3,
 * design/new/demand-tiled-rendering.md, MotionResidency.js) cuts geometry
 * while moving to hold the frame budget, and under Auto it decides how much by
 * timing each moved frame on the GPU. The fade-out starts on the same signal
 * that starts motion there: camera-controls `update`, which fires inside
 * `controls.update()` before the frame's paint. By `FADE_OUT_MS` in, AO is
 * gone. MotionResidency doesn't time a paint while AO still runs (its
 * `shouldTime` dep, wired by ResidencyControl to `isAORunning`), so every
 * frame Auto measures is an AO-free frame, and geometry is cut only for what
 * the frame costs once AO is gone.
 *
 * **During a load.** While RenderDemand has a load scope open
 * (`isLoading`), AO is dropped at once, without a fade. The picture changes
 * on every budgeted paint as geometry streams in, so AO over a half-loaded
 * model is wasted work. On a software rasteriser (CI's SwiftShader) it cost
 * ~220 ms a paint: index.ifc took 6.7 s to ready with it against 2.9 s with
 * the look off. The finished model fades AO in.
 *
 * **Rest.** The same rule as MotionResidency: `REST_MS` and `REST_FRAMES`
 * frames without a camera change, noticed in a ThreeContext#onFrame hook
 * (before the paint). The load's own camera follow is not motion
 * (`RenderDemand#isFollowMoving`). With AO off (Flat look, the panel's
 * toggle, the look off) the level still follows, but nothing is painted for
 * it.
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
    this.loading = false
    // The fade in progress, `{from, to, start, ms}`, or null.
    this.fade_ = null
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
    if (!this.moving) {
      this.moving = true
      if (!this.loading) {
        this.startFade_(0, FADE_OUT_MS)
      }
    }
  }


  /** One animation frame, before its paint (ThreeContext#onFrame). */
  frame() {
    const loading = this.renderDemand?.isLoading === true
    if (loading !== this.loading) {
      this.loading = loading
      if (loading) {
        this.fade_ = null
        this.postProcessor?.setAOLevel(0)
      } else if (!this.moving) {
        this.startFade_(1, FADE_IN_MS)
      }
    }
    if (this.moving) {
      if (this.changedSinceFrame_) {
        this.changedSinceFrame_ = false
      } else {
        this.quietFrames_++
      }
      if (this.now() - this.lastMoveMs_ >= REST_MS && this.quietFrames_ >= REST_FRAMES) {
        this.moving = false
        if (!this.loading) {
          this.startFade_(1, FADE_IN_MS)
        }
      }
    }
    this.step_()
  }


  /** Detach from the camera and the loop; AO back at full. */
  dispose() {
    this.loading = false
    this.moving = false
    this.fade_ = null
    this.postProcessor?.setAOLevel(1)
    try {
      this.controls?.removeEventListener?.('update', this.onUpdate_)
    } catch {
      // best-effort
    }
    this.stopFrame_?.()
    this.stopFrame_ = null
  }


  /**
   * Fade the AO level from where it is now to `to` over `ms`.
   *
   * @param {number} to 0 or 1
   * @param {number} ms
   * @private
   */
  startFade_(to, ms) {
    const from = this.postProcessor?.getAOLevel?.() ?? to
    this.fade_ = from === to ? null : {from, to, start: this.now(), ms}
  }


  /**
   * Advance the fade for this frame (smoothstep-eased), asking for a paint
   * while AO is enabled: AO is a composer pass, so nothing three or the
   * probe sees changes.
   *
   * @private
   */
  step_() {
    const fade = this.fade_
    if (fade === null) {
      return
    }
    const t = Math.min(1, (this.now() - fade.start) / fade.ms)
    const eased = t * t * (3 - (2 * t))
    this.postProcessor?.setAOLevel(fade.from + ((fade.to - fade.from) * eased))
    if (t >= 1) {
      this.fade_ = null
    }
    if (this.postProcessor?.getAOEnabled?.()) {
      this.paint()
    }
  }
}
