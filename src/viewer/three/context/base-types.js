// base-types — shared enums + IfcComponent base class for the vendored
// IfcContext family. Lifted verbatim from
// `web-ifc-viewer/dist/base-types.js` in slice 5d.3 (vendoring of
// `web-ifc-viewer/dist/components/context/*` into
// `src/viewer/three/context/`). Same shape; same NavigationModes
// numeric constants (Orbit=0, FirstPerson=1, Plan=2) — kept stable so
// the fork's IfcManager / IfcClipper (still imported from
// `web-ifc-viewer`) interoperate with our context.


/** @enum {number} */
export const NavigationModes = Object.freeze({
  Orbit: 0,
  FirstPerson: 1,
  Plan: 2,
})


/** @enum {number} */
export const CameraProjections = Object.freeze({
  Perspective: 0,
  Orthographic: 1,
})


/**
 * IfcComponent — base class for IfcContext sub-objects (IfcScene,
 * IfcRenderer, IfcCamera, IfcRaycaster, etc.). The constructor
 * registers `this` with the context's update list so the per-frame
 * `updateAllComponents` loop calls `component.update(delta)`.
 *
 * Sub-classes that don't need per-frame work leave the default no-op
 * `update`. Sub-classes that do (IfcRaycaster, OrbitControl) override it.
 */
export class IfcComponent {
  /**
   * @param {object} context the IfcContext owning this component.
   */
  constructor(context) {
    context.addComponent(this)
  }

  /**
   * @param {number} _delta seconds since the last frame.
   */
  update(_delta) {
    // no-op default
  }
}
