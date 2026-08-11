import {MathUtils} from 'three'


/**
 * The single place camera dolly range and clip planes are derived from a
 * framing sphere.
 *
 * This exists because there are two call sites that must agree and
 * previously didn't: the end-of-load fit (`OrbitControl#
 * fitCameraLimitsToModel`) and the streaming camera follow
 * (`ProgressiveLoadSession#fitUnionToFrame_`). Each had its own copy of
 * the constants, and the follow's copy simply had no `MIN_DISTANCE_FACTOR`,
 * `NEAR_RADIUS_FRACTION` or `ABSOLUTE_MIN_NEAR` — so it grew `maxDistance`
 * and `far` as geometry streamed in and left `minDistance` and `near` at
 * the OrbitControl activation defaults of 1.
 *
 * On a true-scale sub-metre model (a millimetre STEP board is ~0.1 scene
 * units across) that is ruinous in two ways at once: `near = 1` sits
 * beyond the whole model so it renders half-clipped, and `minDistance = 1`
 * clamps the follow's `fitToSphere` — which wants ~0.15 — so the model
 * also appears tiny. Both cleared the moment the end-of-load fit ran,
 * which is why it read as "resizing during load" rather than as a bug in
 * either fit on its own.
 *
 * Deriving every limit here means a call site cannot silently omit one:
 * it gets the whole set or none of it.
 */


// Leave ~1/3 of the canvas as whitespace (≈1/6 per side): inflate the
// framed sphere so the model fills ~2/3 of the viewport rather than
// sitting edge-to-edge.
export const FRAMING_MARGIN = 1.5
/** Zoom-in limit as a fraction of the fit distance. */
const MIN_DISTANCE_FACTOR = 0.01
/** Zoom-out headroom over the fit distance. */
const MAX_DISTANCE_HEADROOM = 10
/** Far plane must clear the whole zoom-out range plus the model. */
const FAR_PLANE_SLACK = 1.5
/**
 * Floor for the near plane, as a fraction of the framing radius. Inert at
 * the current MIN_DISTANCE_FACTOR — the derived near below works out to at
 * least 0.005·radius — but it keeps the floor model-relative if the dolly
 * range is ever retuned tighter, so depth precision degrades with the model
 * rather than with the scene's unit of measure.
 */
const NEAR_RADIUS_FRACTION = 0.001
/**
 * Absolute backstop under that, only to keep the near plane off zero and out
 * of denormal range for a degenerate bounding sphere.
 *
 * This replaces a flat 0.1-scene-unit floor (#1742), which sat *inside* any
 * part smaller than a couple of metres. Latent until conway#458 (PR
 * conway#460, shipped in 1.460.1363) stopped scaling millimetre STEP files
 * by the reciprocal of their unit factor: a 50 mm part that used to arrive
 * as 50 km now arrives at its true size, with minDistance ≈ 0.0024, so the
 * old floor clipped it as you zoomed and ate it entirely past 0.1. IFC
 * never tripped it — building-scale geometry sits well above the floor.
 */
const ABSOLUTE_MIN_NEAR = 1e-6
const HALF = 0.5


/**
 * Distance `camera-controls` will dolly to in order to fit `radius`,
 * mirroring its getDistanceToFitSphere: radius / sin(½·limitingFOV),
 * where the limiting FOV is the narrower of the two axes.
 *
 * @param {object} camera perspective camera (reads fov + aspect)
 * @param {number} radius framing radius, margin already applied
 * @return {number}
 */
export function fitDistanceForRadius(camera, radius) {
  const vFov = MathUtils.degToRad(camera.fov)
  const hFov = Math.atan(Math.tan(vFov * HALF) * camera.aspect) * 2
  const limitingFov = camera.aspect > 1 ? vFov : hFov
  return radius / Math.sin(limitingFov * HALF)
}


/**
 * Derive the complete limit set for a framing sphere.
 *
 * Every term scales with the model, so the frustum is scale-invariant:
 * a millimetre part and a 200m building get the same limits relative to
 * their own size. `far/near` is ~3e3 on the normal path.
 *
 * @param {object} camera perspective camera (reads fov + aspect)
 * @param {object} sphere framing sphere, margin already applied
 * @param {number} [minMaxDistance] floor for maxDistance. The end-of-load
 *   fit passes where the camera currently sits, so a shrinking range can't
 *   snap an already-dollied-out camera inwards on the user's next drag.
 * @return {{fitDistance: number, minDistance: number, maxDistance: number,
 *   near: number, far: number}}
 */
export function cameraLimitsForSphere(camera, sphere, minMaxDistance = 0) {
  const fitDistance = fitDistanceForRadius(camera, sphere.radius)
  const minDistance = fitDistance * MIN_DISTANCE_FACTOR
  const maxDistance = Math.max(fitDistance * MAX_DISTANCE_HEADROOM, minMaxDistance)
  // Keep the model between the planes across the whole zoom range: far
  // must clear the pulled-back camera (maxDistance + model radius), near
  // must stay inside the closest dolly.
  const near = Math.max(
    minDistance * HALF,
    sphere.radius * NEAR_RADIUS_FRACTION,
    ABSOLUTE_MIN_NEAR)
  const far = (maxDistance + sphere.radius) * FAR_PLANE_SLACK
  return {fitDistance, minDistance, maxDistance, near, far}
}


/**
 * Write a limit set onto the camera and controls.
 *
 * @param {object} camera perspective camera
 * @param {object} controls camera-controls instance
 * @param {object} limits from cameraLimitsForSphere
 * @param {boolean} [growOnly] when true, `maxDistance` and `far` only ever
 *   increase. The streaming follow wants this: its union grows
 *   monotonically, and letting the outward range shrink mid-load would pop
 *   the projection between refits. `minDistance` and `near` are always
 *   written — they must be free to come *down* from the activation
 *   defaults of 1, which is the entire sub-metre bug.
 */
export function applyCameraLimits(camera, controls, limits, growOnly = false) {
  controls.minDistance = limits.minDistance
  const currentMax = typeof controls.maxDistance === 'number' ? controls.maxDistance : 0
  controls.maxDistance = growOnly ? Math.max(currentMax, limits.maxDistance) : limits.maxDistance
  camera.near = limits.near
  camera.far = growOnly ? Math.max(camera.far, limits.far) : limits.far
  camera.updateProjectionMatrix()
}
