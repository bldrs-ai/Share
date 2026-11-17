import {Vector3} from 'three'


/**
 * A cut plane's arrow on screen: when it fades, and where a touch grabs it.
 *
 * **The fade** (owner on #2171): an arrow left alone only gets in the way of
 * the model, so it fades out after `IDLE_MS` without activity near it (over
 * `FADE_OUT_MS`), and comes back to full at once on any press or pointer move
 * within `NEAR_PX` of its axis. It stays opaque while hovered or dragged.
 * `ArrowFade` is that state machine; MeshClipper feeds it the activity and
 * applies its opacity. A phone has no hover, so on a touch device it fades
 * only to `TOUCH_FADE_FLOOR`: an arrow faded to nothing there could not be
 * found again to tap near.
 *
 * **Near, and the grab** are measured from the arrow's axis, tip to tip, as
 * projected (`screenAxis`), so a long arrow is as near from its ends as from
 * its middle, and one seen at a slant is no nearer to points beside it than
 * one seen straight. A finger is wider than the shaft, so a touch within
 * `TOUCH_GRAB_PX` of the axis grabs it (`distanceWithin`), where a mouse
 * needs the ray to hit the arrow.
 */


/** Activity within this many CSS pixels of an arrow's axis keeps it shown. */
export const NEAR_PX = 48
/** How long without activity near an arrow before it fades. */
export const IDLE_MS = 3000
/** How long the fade-out takes. */
export const FADE_OUT_MS = 400
/** The least a touch device fades it to (module doc). */
export const TOUCH_FADE_FLOOR = 0.3
/** A touch this many CSS pixels from the axis grabs the arrow. */
export const TOUCH_GRAB_PX = 40


const scratchEnd = new Vector3()


/**
 * @param {object} arrow the arrow (CutPlaneArrowHelper: its `halfLength`
 *   along local +y; 1 if it has none)
 * @param {object} camera
 * @param {{left: number, top: number, width: number, height: number}} canvasRect
 * @return {{ax: number, ay: number, bx: number, by: number}|null} the axis's
 *   ends in page coordinates; null when either end is behind the camera,
 *   where a projection means nothing (the caller then leaves the arrow be)
 */
export function screenAxis(arrow, camera, canvasRect) {
  const half = Number.isFinite(arrow.halfLength) ? arrow.halfLength : 1
  arrow.updateWorldMatrix(true, false)
  const ends = []
  for (const y of [half, -half]) {
    scratchEnd.set(0, y, 0).applyMatrix4(arrow.matrixWorld).project(camera)
    if (!(scratchEnd.z <= 1) || !Number.isFinite(scratchEnd.x) || !Number.isFinite(scratchEnd.y)) {
      return null
    }
    ends.push(canvasRect.left + (((scratchEnd.x + 1) / 2) * canvasRect.width),
      canvasRect.top + (((1 - scratchEnd.y) / 2) * canvasRect.height))
  }
  const [ax, ay, bx, by] = ends
  return {ax, ay, bx, by}
}


/**
 * @param {{x: number, y: number}} pointer
 * @param {{ax: number, ay: number, bx: number, by: number}} axis
 * @return {{dx: number, dy: number}} from the axis's nearest point to the pointer
 */
export function offsetFromAxis(pointer, axis) {
  const ux = axis.bx - axis.ax
  const uy = axis.by - axis.ay
  const lengthSq = (ux * ux) + (uy * uy)
  const t = lengthSq > 0 ?
    Math.min(1, Math.max(0, (((pointer.x - axis.ax) * ux) + ((pointer.y - axis.ay) * uy)) / lengthSq)) : 0
  return {dx: pointer.x - (axis.ax + (t * ux)), dy: pointer.y - (axis.ay + (t * uy))}
}


/**
 * @param {{x: number, y: number}} pointer
 * @param {{ax: number, ay: number, bx: number, by: number}|null} axis
 * @param {number} px
 * @return {number} the pointer's distance from the axis if within `px`, else Infinity
 */
export function distanceWithin(pointer, axis, px) {
  if (axis === null) {
    return Infinity
  }
  const {dx, dy} = offsetFromAxis(pointer, axis)
  const distance = Math.hypot(dx, dy)
  return distance <= px ? distance : Infinity
}


/**
 * The fade's state (module doc): opaque, then after `IDLE_MS` without a
 * `wake`, faded to the floor over `FADE_OUT_MS`. `hold(reason)` keeps it
 * opaque until the same reason is released (a hover, a drag), and the idle
 * clock starts again when the last hold goes. `onChange(opacity)` is called
 * on every change, a frame at a time while fading.
 */
export class ArrowFade {
  /**
   * @param {Function} onChange called with the new opacity
   * @param {object} [clock] timers and frames, for tests
   * @param {Function} [clock.now]
   * @param {Function} [clock.setTimer]
   * @param {Function} [clock.clearTimer]
   * @param {Function} [clock.nextFrame]
   * @param {Function} [clock.cancelFrame]
   */
  constructor(onChange, {
    now = () => performance.now(),
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (id) => clearTimeout(id),
    nextFrame = (fn) => (globalThis.requestAnimationFrame ?? ((f) => setTimeout(f, FRAME_MS)))(fn),
    cancelFrame = (id) => (globalThis.cancelAnimationFrame ?? clearTimeout)(id),
  } = {}) {
    this.onChange = onChange
    this.clock = {now, setTimer, clearTimer, nextFrame, cancelFrame}
    this.opacity = 1
    // The opacity a fade ends at: 0, or TOUCH_FADE_FLOOR after a touch.
    this.floor = 0
    this.holds = new Set()
    this.timer = null
    this.frame = null
    this.isStopped = true
  }


  /**
   * Activity near an arrow: full opacity, and the idle clock starts again.
   *
   * @param {number} [floor] what a fade from here ends at; the last one's if absent
   */
  wake(floor = this.floor) {
    this.floor = floor
    this.isStopped = false
    this.cancel_()
    this.set_(1)
    if (this.holds.size === 0) {
      this.timer = this.clock.setTimer(() => this.fadeOut_(), IDLE_MS)
    }
  }


  /** @param {string} reason held opaque until `release(reason)` */
  hold(reason) {
    this.holds.add(reason)
    this.cancel_()
    this.set_(1)
  }


  /** @param {string} reason */
  release(reason) {
    if (this.holds.delete(reason) && this.holds.size === 0 && !this.isStopped) {
      this.wake()
    }
  }


  /** No more fading (interaction off): opaque, no clocks. */
  stop() {
    this.isStopped = true
    this.holds.clear()
    this.cancel_()
    this.set_(1)
  }


  /** @private */
  fadeOut_() {
    this.timer = null
    const start = this.clock.now()
    const step = () => {
      const t = Math.min(1, (this.clock.now() - start) / FADE_OUT_MS)
      this.set_(1 - (t * (1 - this.floor)))
      this.frame = t < 1 ? this.clock.nextFrame(step) : null
    }
    step()
  }


  /** @private */
  cancel_() {
    if (this.timer !== null) {
      this.clock.clearTimer(this.timer)
      this.timer = null
    }
    if (this.frame !== null) {
      this.clock.cancelFrame(this.frame)
      this.frame = null
    }
  }


  /**
   * @param {number} opacity
   * @private
   */
  set_(opacity) {
    if (opacity !== this.opacity) {
      this.opacity = opacity
      this.onChange(opacity)
    }
  }
}


/** The frame fallback without requestAnimationFrame. */
const FRAME_MS = 16
