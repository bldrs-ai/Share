// PlanControl — no-op stub. Same rationale as `first-person-control.js`:
// the fork's IfcCamera constructor instantiates one for
// `NavigationModes.Plan` but we never activate it. Slot exists so
// IfcCamera's `navMode[NavigationModes.Plan] = …` assignment + the
// `Object.values(this.navMode).forEach(…)` event wire-up work.

import {IfcComponent, NavigationModes} from '../../base-types'
import {LiteEvent} from '../../LiteEvent'


/**
 * No-op Plan nav mode.
 */
export class PlanControl extends IfcComponent {
  /**
   * @param {object} context
   * @param {object} _camera
   */
  constructor(context, _camera) {
    super(context)
    this.mode = NavigationModes.Plan
    this.enabled = false
    this.onChange = new LiteEvent()
    this.onChangeProjection = new LiteEvent()
  }


  /** @param {boolean} active */
  toggle(active) {
    this.enabled = active
  }


  /** No-op fit. */
  fitModelToFrame() {
    // no-op
  }
}
