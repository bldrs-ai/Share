import {ResidencyMetric} from '../residency/ResidencyController'
import {MotionResidencyMode} from '../residency/MotionResidency'
import {RESIDENCY_FULL} from './residencyMode'


/**
 * motionResidencyMode — the camera-motion residency axis of the display
 * override stack (B3 of design/new/demand-tiled-rendering.md; state shape in
 * design/new/model-display-controls.md §2).
 *
 * The sibling of residencyMode.js, which is the AT-REST setting, and built
 * the same way for the same reason: the state's owner (MotionResidency) is a
 * lifecycle object rebuilt on every model swap, so the stack is the
 * authority and is pushed at it. `{mode, percent, metric}`:
 *
 *  - `mode: 'auto'` — the fraction follows measured GPU frame time; `percent`
 *    is kept (it is what the slider returns to when Auto is turned off) but
 *    not applied;
 *  - `mode: 'manual'` — `percent` of the model while moving; 100 changes
 *    nothing, exactly the viewer without this axis;
 *  - `metric` orders what survives while moving, as the at-rest metric does
 *    at rest.
 *
 * Auto + occupancy is the default and, like every default, never serialized
 * into `#d:`.
 */


/** The motion residency every model loads with. */
export const MOTION_RESIDENCY_DEFAULT = Object.freeze({
  mode: MotionResidencyMode.AUTO,
  percent: RESIDENCY_FULL,
  metric: ResidencyMetric.OCCUPANCY,
})


/**
 * Fill a partial (or absent) motion residency with the defaults.
 *
 * @param {object} [motion] `{mode?, percent?, metric?}`
 * @return {{mode: string, percent: number, metric: string}}
 */
export function motionResidencyOrDefault(motion) {
  return {
    mode: motion?.mode ?? MOTION_RESIDENCY_DEFAULT.mode,
    percent: motion?.percent ?? MOTION_RESIDENCY_DEFAULT.percent,
    metric: motion?.metric ?? MOTION_RESIDENCY_DEFAULT.metric,
  }
}


/**
 * Whether a motion residency is the default. Under Auto the percent is inert,
 * so it doesn't count.
 *
 * @param {object} [motion] `{mode?, percent?, metric?}`
 * @return {boolean}
 */
export function isDefaultMotionResidency(motion) {
  const {mode, metric} = motionResidencyOrDefault(motion)
  return mode === MOTION_RESIDENCY_DEFAULT.mode && metric === MOTION_RESIDENCY_DEFAULT.metric
}


/**
 * Push a resolved motion residency at the driver. The driver ignores a
 * setting that didn't change, so this is safe to run on every override
 * change.
 *
 * @param {object} driver a MotionResidency, or null
 * @param {object} [motion] `{mode?, percent?, metric?}`
 */
export function setMotionResidencyMode(driver, motion) {
  driver?.setSettings(motionResidencyOrDefault(motion))
}
