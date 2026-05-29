// FirstPersonControl — no-op stub. The fork's IfcCamera constructor
// instantiates one for `NavigationModes.FirstPerson`, but Bldrs Share
// only uses `NavigationModes.Orbit` — we never call `setNavigationMode`
// to switch to FirstPerson. Lifted from the fork in slice 5d.3 as a
// shell so `camera.js`'s `navMode[NavigationModes.FirstPerson]` slot
// still constructs (instead of breaking on a missing import).
//
// `onChange` / `onChangeProjection` are present so the
// `Object.values(this.navMode).forEach((mode) => { mode.onChange.on(…)
// })` loop in IfcCamera's constructor doesn't blow up.

import {IfcComponent, NavigationModes} from '../../base-types'
import {LiteEvent} from '../../LiteEvent'


/**
 * No-op FirstPerson nav mode. Toggle / fitModelToFrame are wired but
 * intentionally do nothing — we never become the active nav mode.
 */
export class FirstPersonControl extends IfcComponent {
  /**
   * @param {object} context
   * @param {object} _camera
   */
  constructor(context, _camera) {
    super(context)
    this.mode = NavigationModes.FirstPerson
    this.enabled = false
    this.onChange = new LiteEvent()
    this.onChangeProjection = new LiteEvent()
  }


  /** @param {boolean} active */
  toggle(active) {
    this.enabled = active
  }


  /**
   * Standard fit-model-to-frame shim. Never called — we only fit in
   * Orbit mode.
   */
  fitModelToFrame() {
    // no-op
  }
}
