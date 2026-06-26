import MeshClipper from './MeshClipper'


/**
 * Clipper — the §3c "Clipper" plugin, mounted at `viewer.clipper`.
 *
 * Slice 5d.2 of design/new/viewer-replacement.md dropped the fork's
 * `IfcClipper` backend. Every model now clips through the single in-repo
 * `MeshClipper` (renamed from `GlbClipper` once it stopped being GLB-
 * specific), so this class no longer dispatches between two backends —
 * it owns the per-model `MeshClipper` lifecycle plus the small amount of
 * cross-cutting state the rest of the app pokes (`active` / `orthogonalY`
 * / `clickDrag`).
 *
 * Why keep the facade at all, now that there's one backend? Two reasons:
 *   1. `viewer.clipper.{active, orthogonalY, clickDrag}` are written by
 *      `Containers/viewer.js` at init and `clickDrag` is read on every
 *      mousemove to gate hover-picking. These are viewer-session state,
 *      not per-model — they outlive the `MeshClipper`, which is rebuilt
 *      on every `setModel`.
 *   2. The Q/W keyboard shortcuts (`createPlane` / `deletePlane`) and the
 *      cut-plane menu (`createFromNormalAndCoplanarPoint`) both reach
 *      `viewer.clipper` through a stable name; mapping those names onto
 *      the backend in one place keeps call-sites untouched.
 *
 * (The fully-merged single-class shape sketched in §3c — fold MeshClipper
 * into this class — is a low-value follow-up; the facade/impl split keeps
 * the proven per-model drag/binding code in one focused module.)
 *
 * Property surface (mirrors what call-sites already read):
 *
 *   clipper.active                  // boolean — session flag (set at init)
 *   clipper.orthogonalY             // boolean — legacy flag; passthrough
 *   clipper.clickDrag               // boolean — gates hover pick (viewer.js)
 *   clipper.planes                  // active plane data array
 *   clipper.context                 // undefined — fork escape hatch is gone
 *
 * Method surface:
 *
 *   clipper.setModel(model)                                  // (re)bind impl
 *   clipper.createFromNormalAndCoplanarPoint(normal, point, direction?, offset?)
 *   clipper.createPlane()                                    // Q shortcut (at cursor)
 *   clipper.deletePlane()                                    // W shortcut (at cursor)
 *   clipper.deleteAllPlanes()
 *   clipper.setInteractionEnabled(enabled)
 *   clipper.dispose()
 */
export default class Clipper {
  /**
   * @param {object} viewer the parent ShareViewer.
   */
  constructor(viewer) {
    this.viewer = viewer
    this._meshClipper = null

    // Plugin-owned session state. With the fork backend gone these no
    // longer sync to any clipper impl — `MeshClipper` has no equivalent
    // concepts (it gates interaction via `setInteractionEnabled` and
    // snaps planes per-drag). They're retained because `viewer.js` writes
    // `active` / `orthogonalY` at init and reads `clickDrag` on every
    // mousemove to skip hover-picking mid-drag.
    this._state = {
      active: false,
      orthogonalY: false,
      clickDrag: false,
    }
  }


  // ─── Model lifecycle ────────────────────────────────────────────

  /**
   * Bind the clipper to the currently loaded model. Disposes any
   * previous `MeshClipper`, then constructs a fresh one for the new
   * model (any mesh-based format — IFC, GLB, etc.). Pass `null` to fully
   * detach (e.g. on model unload).
   *
   * Called by `CutPlaneMenu` after `convertToShareModel` decoration so
   * the model's geometry / bounds are settled.
   *
   * @param {object|null} model
   */
  setModel(model) {
    if (this._meshClipper) {
      this._meshClipper.dispose()
      this._meshClipper = null
    }
    if (model) {
      this._meshClipper = new MeshClipper(this.viewer, model)
    }
  }


  // ─── Cross-cutting session state (plugin-owned) ────────────────

  /** @return {boolean} */
  get active() {
    return this._state.active
  }

  /** @param {boolean} v */
  set active(v) {
    this._state.active = v
  }


  /** @return {boolean} */
  get orthogonalY() {
    return this._state.orthogonalY
  }

  /** @param {boolean} v */
  set orthogonalY(v) {
    this._state.orthogonalY = v
  }


  /** @return {boolean} */
  get clickDrag() {
    return this._state.clickDrag
  }

  /** @param {boolean} v */
  set clickDrag(v) {
    this._state.clickDrag = v
  }


  // ─── Backend accessors ─────────────────────────────────────────

  /**
   * Active plane list. Each entry exposes `.plane.normal` +
   * `.plane.constant`, which is all `hashState.js` / `getPlanesOffset`
   * read. Empty array before any model is bound.
   *
   * @return {Array<object>}
   */
  get planes() {
    return this._meshClipper?.planes ?? []
  }


  /**
   * Legacy escape hatch the fork clipper exposed as `IfcClipper.context`
   * (the renderer-context's global clipping registry). The in-repo
   * `MeshClipper` owns its own renderer-clipping binding and unbinds it
   * on `deleteAllPlanes`, so there is nothing to scrub here — always
   * `undefined`. Kept as a property so `CutPlaneMenu.removePlanes`'
   * defensive `ctx?.clippingPlanes` guard short-circuits cleanly.
   *
   * @return {undefined}
   */
  get context() {
    return undefined
  }


  // ─── Unified action surface ───────────────────────────────────

  /**
   * Create a clipping plane from a normal + coplanar point. The cut-plane
   * menu additionally passes `direction` ('x'|'y'|'z') and `offset` (signed
   * scalar from model center) to label the arrow for hover / hash-state.
   *
   * @param {object} normal three.js `Vector3`
   * @param {object} point three.js `Vector3`
   * @param {string} [direction] one of 'x'|'y'|'z'
   * @param {number} [offset] signed scalar
   */
  createFromNormalAndCoplanarPoint(normal, point, direction, offset) {
    this._meshClipper?.createPlane(normal, point, direction, offset)
  }


  /**
   * "Create a plane at the current cursor" — the Q keyboard shortcut
   * (`utils/shortcutKeys.js`). Raycasts the model under the pointer and
   * drops a plane on the hit face. No-op before a model is bound.
   */
  createPlane() {
    this._meshClipper?.createPlaneAtCursor()
  }


  /**
   * "Delete the plane at the current cursor" — the W keyboard shortcut
   * (`utils/shortcutKeys.js`). Raycasts the plane arrows under the pointer
   * and removes the matching plane. No-op before a model is bound.
   */
  deletePlane() {
    this._meshClipper?.deletePlaneAtCursor()
  }


  /**
   * Remove all clipping planes.
   */
  deleteAllPlanes() {
    this._meshClipper?.deleteAllPlanes()
  }


  /**
   * Enable / disable user interaction (the arrow drag handlers).
   *
   * @param {boolean} enabled
   */
  setInteractionEnabled(enabled) {
    this._meshClipper?.setInteractionEnabled(enabled)
  }


  /**
   * Tear down the bound `MeshClipper` (its arrows + canvas listeners).
   * Idempotent — a second call has nothing to dispose.
   */
  dispose() {
    if (this._meshClipper) {
      this._meshClipper.dispose()
      this._meshClipper = null
    }
  }
}
