import GlbClipper from './GlbClipper'
import {modelHasUnstructuredMeshClipper} from '../ShareModel'


/**
 * Clipper — the §3c "Clipper" plugin facade.
 *
 * Unifies two clipping-plane implementations that previously co-existed
 * behind a `viewer.IFC.type === 'glb'` branch in `CutPlaneMenu.jsx`:
 *
 *   1. **IFC clipper** — the fork's `IfcClipper` (mounted at
 *      `viewer.clipper` by `IfcViewerAPI` construction). Tied to
 *      `pickableIfcModels` raycast; supports the keyboard-shortcut
 *      "create plane at current cursor" mode (Q/W keys in
 *      `utils/shortcutKeys.js`).
 *   2. **GLB clipper** — `GlbClipper` in this directory. 3-axis arrow-
 *      handle drag interaction; works on any unstructured-mesh model
 *      (glb / gltf / etc.).
 *
 * The plugin dispatches per-model: `setModel(model)` rebuilds the
 * appropriate impl from the model's `capabilities`/`format`, and
 * every API method routes to it. Call-sites no longer branch on
 * model type — they all call `viewer.clipper.X` and trust the plugin.
 *
 * Why: design/new/viewer-replacement.md §3c.iv slice 3. Phase 5
 * (drop `web-ifc-viewer`) replaces the fork-clipper backing with a
 * three-only impl; routing every call through this facade today
 * means the swap is a localized change inside this class.
 *
 * Property surface (mirrors what call-sites already read on the fork):
 *
 *   clipper.active                  // boolean — clip-on-click activation
 *   clipper.orthogonalY             // boolean — fork-only quirk; passthrough
 *   clipper.clickDrag               // boolean — fork-only; gates hover pick
 *   clipper.planes                  // unified plane data array
 *   clipper.context                 // legacy escape hatch (fork-only)
 *
 * Method surface:
 *
 *   clipper.setModel(model)                                  // active impl rebuild
 *   clipper.createFromNormalAndCoplanarPoint(normal, point, direction?, offset?)
 *   clipper.createPlane()                                    // IFC shortcut (Q key)
 *   clipper.deletePlane()                                    // IFC shortcut (W key)
 *   clipper.deleteAllPlanes()
 *   clipper.setInteractionEnabled(enabled)
 *   clipper.dispose()
 */
export default class Clipper {
  /**
   * @param {object} viewer the parent ShareViewer.
   * @param {object|null} forkClipper the fork's `IfcClipper`
   *   instance (the one `IfcViewerAPI` constructor wired up). Passed
   *   in explicitly so this class stays independent of `viewer.IFC`
   *   shape; null on test paths with no real fork.
   */
  constructor(viewer, forkClipper = null) {
    this.viewer = viewer
    this._forkClipper = forkClipper
    this._glbClipper = null
    this._currentModel = null
  }


  // ─── Model lifecycle ────────────────────────────────────────────

  /**
   * Bind the clipper to the currently loaded model. Disposes any
   * previous `GlbClipper` instance, then constructs a fresh one
   * when the new model wants the unstructured-mesh implementation.
   * Pass `null` to fully detach (e.g. on model unload).
   *
   * Called by the loader after `convertToShareModel` decoration so
   * the model's `capabilities` / `format` are settled.
   *
   * @param {object|null} model
   */
  setModel(model) {
    if (this._glbClipper) {
      this._glbClipper.dispose()
      this._glbClipper = null
    }
    this._currentModel = model
    if (model && modelHasUnstructuredMeshClipper(model)) {
      this._glbClipper = new GlbClipper(this.viewer, model)
    }
  }


  /**
   * @return {boolean} true when the active impl is the GLB / unstructured-
   *   mesh clipper (arrow-handle drag controls). false when on the
   *   legacy IFC clipper path (or no model loaded).
   */
  isUnstructuredMeshMode() {
    return Boolean(this._glbClipper)
  }


  // ─── Property passthroughs (fork-only state) ───────────────────

  /** @return {boolean} */
  get active() {
    if (this.isUnstructuredMeshMode()) {
      // GLB clipper is always "active" — the arrow-handle drag mode
      // doesn't gate on this flag. Report true so call-sites reading
      // `if (viewer.clipper.active)` see consistent state.
      return true
    }
    return this._forkClipper?.active ?? false
  }

  /** @param {boolean} v */
  set active(v) {
    if (this._forkClipper) {
      this._forkClipper.active = v
    }
  }


  /** @return {boolean} */
  get orthogonalY() {
    return this._forkClipper?.orthogonalY ?? false
  }

  /** @param {boolean} v */
  set orthogonalY(v) {
    if (this._forkClipper) {
      this._forkClipper.orthogonalY = v
    }
  }


  /** @return {boolean} */
  get clickDrag() {
    return this._forkClipper?.clickDrag ?? false
  }

  /** @param {boolean} v */
  set clickDrag(v) {
    if (this._forkClipper) {
      this._forkClipper.clickDrag = v
    }
  }


  /**
   * Active plane list. Per-impl plane data shape differs slightly
   * (IFC: `{plane}`; GLB: `{plane, arrow, direction, offset, normal,
   * point}`) but both expose `.plane.normal` + `.plane.constant`,
   * which is all `hashState.js` / `getPlanesOffset` read.
   *
   * @return {Array<object>}
   */
  get planes() {
    if (this.isUnstructuredMeshMode()) {
      return this._glbClipper.planes
    }
    return this._forkClipper?.planes ?? []
  }


  /**
   * Legacy escape hatch to the fork's `IfcClipper.context`. Only used
   * by `CutPlaneMenu.removePlanes` to scrub the global clipping-plane
   * registry. Returns `undefined` on GLB mode (the GLB clipper owns
   * its own renderer-clipping state).
   *
   * @return {object|undefined}
   */
  get context() {
    return this._forkClipper?.context
  }


  // ─── Unified action surface ───────────────────────────────────

  /**
   * Create a clipping plane. Both impls accept `normal` + `point`;
   * the GLB impl additionally needs `direction` ('x'|'y'|'z') and
   * `offset` (signed scalar from model center) to label the arrow
   * for hover / hash-state. Fork ignores the extra args.
   *
   * @param {object} normal three.js `Vector3`
   * @param {object} point three.js `Vector3`
   * @param {string} [direction] one of 'x'|'y'|'z' — GLB only
   * @param {number} [offset] signed scalar — GLB only
   */
  createFromNormalAndCoplanarPoint(normal, point, direction, offset) {
    if (this.isUnstructuredMeshMode()) {
      this._glbClipper.createPlane(normal, point, direction, offset)
      return
    }
    this._forkClipper?.createFromNormalAndCoplanarPoint?.(normal, point)
  }


  /**
   * Fork-only "create a plane at current cursor" mode. Bound to the
   * Q keyboard shortcut in `utils/shortcutKeys.js`. No-op on GLB —
   * the unstructured-mesh clipper is menu-driven, not click-driven.
   */
  createPlane() {
    if (this.isUnstructuredMeshMode()) {
      return
    }
    this._forkClipper?.createPlane?.()
  }


  /**
   * Fork-only "delete plane at current cursor" mode. Bound to the
   * W keyboard shortcut in `utils/shortcutKeys.js`. No-op on GLB —
   * planes there are removed via the cut-plane menu.
   */
  deletePlane() {
    if (this.isUnstructuredMeshMode()) {
      return
    }
    this._forkClipper?.deletePlane?.()
  }


  /**
   * Remove all clipping planes. Works on both impls.
   */
  deleteAllPlanes() {
    if (this.isUnstructuredMeshMode()) {
      this._glbClipper.deleteAllPlanes()
      return
    }
    this._forkClipper?.deleteAllPlanes?.()
  }


  /**
   * Enable / disable user interaction. On the GLB clipper this
   * attaches the arrow drag handlers; on the fork clipper it's a
   * no-op (the fork's clipper is always interactive via the
   * `clickDrag` flag).
   *
   * @param {boolean} enabled
   */
  setInteractionEnabled(enabled) {
    if (this.isUnstructuredMeshMode()) {
      this._glbClipper.setInteractionEnabled(enabled)
    }
  }


  /**
   * Tear down the GLB clipper if any, then delegate to the fork's
   * `IfcClipper.dispose()` so its `planes` (and their `TransformControls`
   * DOM listeners) are released.
   *
   * Called from two places:
   *   1. `Containers/viewer.js#disposeViewer` — explicit clipper.dispose()
   *      before `viewer.dispose()`.
   *   2. The fork's `IfcViewerAPI.dispose()` — which internally calls
   *      `this.clipper.dispose()` (then sets `this.clipper = null`).
   *      Without the delegation below the fork clipper's resources
   *      would leak on every theme-change reload (viewer.js disposes
   *      and re-creates the viewer for each Day/Night swap).
   *
   * Idempotent: a second call has nothing to dispose. The fork
   * clipper's own `dispose()` is safe to call once but defensively
   * we null `_forkClipper` after the first call so a double-dispose
   * (viewer.js then IfcViewerAPI.dispose) doesn't hit it twice.
   */
  dispose() {
    if (this._glbClipper) {
      this._glbClipper.dispose()
      this._glbClipper = null
    }
    if (this._forkClipper && typeof this._forkClipper.dispose === 'function') {
      this._forkClipper.dispose()
      this._forkClipper = null
    }
  }
}
