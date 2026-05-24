/**
 * Selector — the §3c "Selection" plugin facade.
 *
 * Wraps the fork's (`web-ifc-viewer`) `IFC.selector` behind a stable
 * local API. Every consumer that previously reached into
 * `viewer.IFC.selector.{selection|preselection}.X` routes through
 * `viewer.selector.X` instead. The fork's selector still owns the
 * subset construction on the legacy IFC path (`IFCSubset` meshes,
 * `web-ifc-three.SubsetCreator` state); this class is a thin
 * delegating layer so call-sites don't depend on its shape.
 *
 * Why: design/new/viewer-replacement.md §3c.iv. Phase 5 replaces the
 * fork's selector with an `IfcModelService`-backed implementation
 * built on `model.createSubset` + `postprocessing.OutlineEffect`.
 * Routing every call through this facade today means the Phase 5
 * swap touches one file (this one) rather than the ~16 call-sites
 * scattered across ShareViewer / IfcIsolator / CadView.
 *
 * Conway-direct path: `instancePicking` models don't go through this
 * facade for picking — `ShareViewer._setConwaySelectionFromModel` /
 * `_setConwayPreselectionFromHit` drive picking via `IfcInstanceMap`
 * directly. The facade still owns the *materials* both paths share
 * (the theme-blue translucent overlays), because both paths read
 * `getSelectionMaterial()` / `getPreselectionMaterial()` when
 * constructing subsets.
 *
 * Null-safety: every method tolerates a missing fork selector or a
 * partially-built fork shape (tests / mocks build a minimal selector
 * stub). Reads return safe defaults (`null` for materials, `[]` for
 * meshes); writes / actions no-op silently.
 */
export default class Selector {
  /**
   * @param {object|null|undefined} forkSelector
   *   The fork's `viewer.IFC.selector` object. Required at
   *   construction time on the real path; tests may pass `null` and
   *   later inject a different selector via `setForkSelector`.
   */
  constructor(forkSelector = null) {
    this._forkSelector = forkSelector
  }


  /**
   * Swap the underlying fork selector. Used by ShareViewer if the
   * fork's `IFC.selector` is reconstructed (e.g. on model reload);
   * also a test seam.
   *
   * @param {object|null} forkSelector
   */
  setForkSelector(forkSelector) {
    this._forkSelector = forkSelector
  }


  /**
   * @return {boolean} true when a fork selector object is attached.
   *   Does NOT verify sub-objects (`.selection`, `.preselection`);
   *   individual methods already null-safe-chain through those, so
   *   this getter only answers "is there a fork to delegate to at
   *   all?". Call-sites that want to skip legacy IFC selector work
   *   entirely (e.g. capabilities-only paths) branch on this.
   */
  get hasForkSelector() {
    return Boolean(this._forkSelector)
  }


  // ─── Materials ─────────────────────────────────────────────────

  /** @return {object|null} */
  getSelectionMaterial() {
    return this._forkSelector?.selection?.material ?? null
  }


  /** @param {object|null} material */
  setSelectionMaterial(material) {
    const selection = this._forkSelector?.selection
    if (selection) {
      selection.material = material
    }
  }


  /** @return {object|null} */
  getPreselectionMaterial() {
    return this._forkSelector?.preselection?.material ?? null
  }


  /** @param {object|null} material */
  setPreselectionMaterial(material) {
    const preselection = this._forkSelector?.preselection
    if (preselection) {
      preselection.material = material
    }
  }


  // ─── Mesh accessors (legacy IFC path) ──────────────────────────

  /**
   * Returns the current set of meshes the fork's selector is
   * tracking as "selected". On the legacy IFC path these are
   * `IFCSubset` instances built by `web-ifc-three.SubsetCreator`.
   *
   * @return {Array<object>}
   */
  getSelectionMeshes() {
    return this._forkSelector?.selection?.meshes ?? []
  }


  /**
   * Returns the current set of meshes the fork's selector is
   * tracking as "preselected" (hover overlay). On the legacy IFC
   * path this is a single-element set (or empty).
   *
   * @return {Array<object>}
   */
  getPreselectionMeshes() {
    return this._forkSelector?.preselection?.meshes ?? []
  }


  // ─── Selection actions (legacy IFC path) ───────────────────────

  /**
   * Equivalent of `selector.pickIfcItemsByID` — replaces the current
   * selection with the given expressIds.
   *
   * @param {number} modelID
   * @param {number[]} ids
   * @param {boolean} [focusSelection] default false
   * @param {boolean} [removePrevious] default true
   * @return {Promise<void>}
   */
  async pickByIds(modelID, ids, focusSelection = false, removePrevious = true) {
    const pick = this._forkSelector?.pickIfcItemsByID
    if (typeof pick !== 'function') {
      return
    }
    await pick.call(this._forkSelector, modelID, ids, focusSelection, removePrevious)
  }


  /**
   * Equivalent of `selector.unpickIfcItems` — clears every IFCSubset
   * the selector is holding (selection + preselection on the legacy
   * IFC path). Use when transitioning a model out of pickability
   * entirely (hide, model unload).
   */
  unpick() {
    this._forkSelector?.unpickIfcItems?.()
  }


  /**
   * Equivalent of `selector.selection.unpick()` — clears the
   * selection slot only (leaves preselection intact). Used by
   * IfcIsolator when entering hide / isolate mode.
   */
  clearSelection() {
    this._forkSelector?.selection?.unpick?.()
  }


  // ─── Preselection actions (legacy IFC path) ────────────────────

  /**
   * Equivalent of `selector.preselection.unpick()` — clears the
   * preselection slot only. Used by IfcIsolator alongside
   * `clearSelection()`.
   */
  clearPreselection() {
    this._forkSelector?.preselection?.unpick?.()
  }


  /**
   * Equivalent of `selector.preselection.toggleVisibility(visible)`.
   * Used by ShareViewer's `highlightIfcItem` when the cursor leaves
   * all geometry — hides the legacy preselection overlay without
   * tearing down its subset state.
   *
   * @param {boolean} visible
   */
  togglePreselectionVisibility(visible) {
    this._forkSelector?.preselection?.toggleVisibility?.(visible)
  }


  /**
   * Equivalent of `selector.preselection.pick(raycastHit)` — installs
   * a preselection subset from a raycaster hit. Used on the legacy
   * IFC hover path.
   *
   * @param {object} raycastHit
   * @return {Promise<void>}
   */
  async preselectFromPick(raycastHit) {
    const pick = this._forkSelector?.preselection?.pick
    if (typeof pick !== 'function') {
      return
    }
    await pick.call(this._forkSelector.preselection, raycastHit)
  }


  /**
   * Equivalent of `selector.preselection.pickByID(modelID, ids, ...)`.
   * Used by `preselectElementsByIds` (programmatic preselection from
   * URL state, search results, etc.).
   *
   * @param {number} modelID
   * @param {number[]} ids
   * @param {boolean} [focusSelection] default false
   * @param {boolean} [removePrevious] default true
   * @return {Promise<void>}
   */
  async preselectByIds(modelID, ids, focusSelection = false, removePrevious = true) {
    const pickByID = this._forkSelector?.preselection?.pickByID
    if (typeof pickByID !== 'function') {
      return
    }
    await pickByID.call(this._forkSelector.preselection, modelID, ids, focusSelection, removePrevious)
  }
}
