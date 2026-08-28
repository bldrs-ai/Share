import {ResidencyMetric} from '../residency/ResidencyController'


/**
 * residencyMode — the residency axis of the display-override stack (S7 slice
 * of design/new/model-display-controls.md §2, §5).
 *
 * Sibling of colorMode/shadingMode, with one structural difference worth
 * naming. Those two read and write the model's own tables, so the scene is
 * the authority and `activeColorMode` / `activeShadingMode` can recover the
 * current value from it. Residency's state lives in a `ResidencyController` —
 * an owned lifecycle object holding precomputed per-instance geometry, torn
 * down and rebuilt on every model swap — and the controller always rebuilds
 * fully resident. So here the STACK is the authority: `{percent, metric}` in
 * the override map is what the UI renders, what the `#d:` permalink
 * serializes, and what gets pushed back at a freshly built controller.
 *
 * Percent rather than the controller's 0..1 `target` because percent is what
 * the slider, the label and the token all speak; the conversion happens once,
 * here.
 *
 * @see DisplayController — resolves the stack and calls into this module.
 */


/** Percent at which the whole model is resident. */
export const RESIDENCY_FULL = 100


/**
 * The residency every model loads with. Never serialized into `#d:` — §6.1's
 * only-non-defaults rule is what keeps the common share link short.
 */
export const RESIDENCY_DEFAULT = Object.freeze({
  percent: RESIDENCY_FULL,
  metric: ResidencyMetric.OCCUPANCY,
})


/**
 * Fill a partial (or absent) residency override with the defaults.
 *
 * Partial is the normal case on the read path: a `#d:` token may carry a
 * percent it understood and a metric it didn't (or vice versa), and dropping
 * only the bad half is the "apply what I understand" tolerance the token
 * promises.
 *
 * @param {object} [residency] `{percent?, metric?}`
 * @return {{percent: number, metric: string}}
 */
export function residencyOrDefault(residency) {
  return {
    percent: residency?.percent ?? RESIDENCY_DEFAULT.percent,
    metric: residency?.metric ?? RESIDENCY_DEFAULT.metric,
  }
}


/**
 * Whether a residency is the default — fully resident, occupancy-ordered.
 *
 * The metric is inert at 100% (nothing is being evicted, so nothing is being
 * ordered), but it's still a Display-menu choice the user made, so a
 * non-default metric alone counts as non-default and does serialize.
 *
 * @param {object} [residency] `{percent?, metric?}`
 * @return {boolean}
 */
export function isDefaultResidency(residency) {
  const {percent, metric} = residencyOrDefault(residency)
  return percent === RESIDENCY_DEFAULT.percent && metric === RESIDENCY_DEFAULT.metric
}


/**
 * Push a resolved residency at the controller.
 *
 * Each setter re-scores and re-applies every instance, so both are guarded on
 * an actual change: this runs from an effect keyed on the whole override map,
 * which fires for unrelated axes too (a color click), and an unguarded apply
 * would sort the instance table on each one.
 *
 * @param {object} controller a ResidencyController, or null
 * @param {object} [residency] `{percent?, metric?}`
 */
export function setResidencyMode(controller, residency) {
  if (!controller) {
    return
  }
  const {percent, metric} = residencyOrDefault(residency)
  if (controller.metric !== metric) {
    controller.setMetric(metric)
  }
  const target = percent / RESIDENCY_FULL
  if (controller.target !== target) {
    controller.setTarget(target)
  }
}
