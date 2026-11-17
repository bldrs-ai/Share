import {Vector3} from 'three'


/**
 * Where the pointer is against a cut plane's arrow on screen: how opaque the
 * arrow is drawn, and whether a touch grabs it. Measured from the arrow's
 * axis, tip to tip, as projected (`screenAxis`), so a long arrow is as near
 * from its ends as from its middle, and one seen at a slant is no nearer to
 * points beside it than one seen straight.
 *
 * **The fade** (owner on #2171: an arrow far from the pointer only gets in
 * the way of the model). Fully opaque within `FADE_NEAR_PX` of the axis,
 * fading out linearly to nothing `FADE_REACH` of the canvas beyond that: a
 * quarter of its width sideways and a quarter of its height up or down,
 * which is halfway to the edge from an arrow at the centre. A touch has no
 * hover, so on a phone the last touch stands in for the pointer, and the
 * arrow never fades below `TOUCH_FADE_FLOOR`: with nothing sweeping the
 * screen, an arrow faded to nothing could not be found again to grab.
 *
 * **The grab.** A finger is wider than the arrow's shaft, so a touch within
 * `TOUCH_GRAB_PX` of the axis grabs it (`isNearAxis`), where a mouse needs
 * the ray to hit the arrow.
 *
 * MeshClipper applies both (`_applyFade`, `onMouseDown`); this module is the
 * arithmetic, kept free of the clipper for its tests.
 */


/** Within this many CSS pixels of the arrow's axis it is fully opaque. */
export const FADE_NEAR_PX = 24
/** The fraction of the canvas's width (and height) over which it fades out. */
export const FADE_REACH = 0.25
/** The least a touch device fades it to (module doc). */
export const TOUCH_FADE_FLOOR = 0.3
/** A touch this many CSS pixels from the axis grabs the arrow. */
export const TOUCH_GRAB_PX = 24
/**
 * Opacity is quantized to this many steps, so a pointer sweeping the canvas
 * asks for a paint only when the arrow's look actually changes by a step.
 */
export const FADE_STEPS = 32


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
 * @param {{x: number, y: number}} pointer page coordinates
 * @param {{ax: number, ay: number, bx: number, by: number}|null} axis from `screenAxis`
 * @param {{width: number, height: number}} canvasRect
 * @param {number} [floor] the least it fades to (TOUCH_FADE_FLOOR for a touch)
 * @return {number} the opacity, in steps of 1 / FADE_STEPS
 */
export function fadeOpacity(pointer, axis, canvasRect, floor = 0) {
  if (axis === null || !(canvasRect.width > 0) || !(canvasRect.height > 0)) {
    return 1
  }
  const {dx, dy} = offsetFromAxis(pointer, axis)
  const distance = Math.hypot(dx, dy)
  if (distance <= FADE_NEAR_PX) {
    return 1
  }
  // Beyond the near band, in units of the fade's reach on each axis: 1 is a
  // quarter of the canvas away, sideways or up and down.
  const beyond = (distance - FADE_NEAR_PX) / distance
  const reach = Math.hypot((dx * beyond) / (canvasRect.width * FADE_REACH),
    (dy * beyond) / (canvasRect.height * FADE_REACH))
  const opacity = Math.round(Math.max(0, 1 - reach) * FADE_STEPS) / FADE_STEPS
  return Math.max(floor, opacity)
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
