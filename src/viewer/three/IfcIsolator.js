import {ShareViewer} from '../ShareViewer'
import {unsortedArraysAreEqual, arrayRemove} from '../../utils/arrays'
import {MeshLambertMaterial, DoubleSide, Mesh} from 'three'
import useStore from '../../store/useStore'
import {BlendFunction} from 'postprocessing'
import {isDefinedAndNotNull} from '../../utils/assert'
import ThreeContext from './ThreeContext'


/**
 * Provides hiding, unhiding, isolation, and unisolation functionalities.
 *
 * Subset-shape contract. The three subset slots (`unhiddenSubset`,
 * `isolationSubset`, `revealedElementsSubset`) hold whatever
 * `ifcModel.createSubset(...)` returned: a single `Mesh` for the
 * web-ifc-three native path, or a `Mesh[]` for the Conway-direct path
 * (via `attachInstanceMapSubsets`). Internal `_addSubsetToScene` /
 * `_removeSubsetFromScene` / `_subsetMeshes` helpers normalise both
 * shapes so the public methods don't branch. See
 * design/new/viewer-replacement.md §3b.iii.
 */
export default class IfcIsolator {
  subsetCustomId = 'Bldrs::Share::Isolator'
  revealSubsetCustomId = 'Bldrs::Share::HiddenElements'
  context = null
  ifcModel = null
  viewer = null
  /** @type {Mesh|Mesh[]|null} */
  unhiddenSubset = null
  /** @type {Mesh|Mesh[]|null} */
  isolationSubset = null
  /** @type {Mesh|Mesh[]|null} */
  revealedElementsSubset = null
  currentSelectionSubsets = []
  visualElementsIds = []
  spatialStructure = {}
  hiddenIds = []
  isolatedIds = []
  tempIsolationModeOn = false
  revealHiddenElementsMode = false
  hiddenMaterial = null
  isolationOutlineEffect = null

  /**
   * Instantiates a new instance of IfcIsolator
   *
   * @param {ThreeContext} context of the viewer
   * @param {ShareViewer} viewer
   */
  constructor(context, viewer) {
    this.context = context
    this.viewer = viewer
    this.initHiddenMaterial()
    this.isolationOutlineEffect = viewer.postProcessor.createOutlineEffect({
      blendFunction: BlendFunction.SCREEN,
      edgeStrength: 5,
      pulseSpeed: 0.0,
      visibleEdgeColor: 0x00FFFF,
      hiddenEdgeColor: 0x00FFFF,
      height: window.innerHeight,
      windth: window.innerWidth,
      blur: false,
      xRay: true,
      opacity: 1,
    })
  }

  /**
   * Sets the loaded model to the isolator context.
   *
   * Two model shapes are supported:
   *
   *  - **Single Mesh.** Web-ifc-three native (wit-three model is an
   *    `IFCModel` subclass of `Mesh`) and Conway-direct cache-miss
   *    (same `IFCModel` instance with geometry swapped, single Mesh
   *    rooted with per-vertex `expressID`). Read element IDs straight
   *    from `ifcModel.geometry.attributes.expressID`.
   *  - **Group / hierarchy.** Conway-direct cache-hit: GLTFExporter
   *    splits the merged mesh into N per-material child Meshes, each
   *    with its own `expressID` per-vertex attribute. Traverse and
   *    union the IDs across children.
   *
   * @param {Mesh|object} ifcModel The loaded ifc model (Mesh or Group)
   */
  async setModel(ifcModel) {
    this.ifcModel = ifcModel
    const ids = new Set()
    // BatchedMesh render path (`?feature=batchedMesh`): element IDs aren't a
    // per-vertex attribute — they live in each batch's `instanceParents`
    // table. Union those so hide / isolate (which gate on `visualElementsIds`
    // and drive the `createSubset` surface attachBatchedSubsets installed)
    // see the model's elements. Checked first because a BatchedMesh also has
    // a `.geometry` (its packed buffer) that would mislead the branch below.
    let foundBatched = false
    if (typeof ifcModel.traverse === 'function') {
      ifcModel.traverse((obj) => {
        if (obj.isBatchedMesh && obj.instanceParents) {
          foundBatched = true
          for (const id of obj.instanceParents) {
            ids.add(id)
          }
        }
      })
    }
    if (foundBatched) {
      this.visualElementsIds = [...ids]
      const rootElement = await this.ifcModel.ifcManager.getSpatialStructure(0, false)
      this.collectSpatialElementsId(rootElement)
      return
    }
    if (ifcModel.geometry && ifcModel.geometry.attributes) {
      const attr = ifcModel.geometry.attributes.expressID
      if (attr) {
        const arr = attr.array
        for (let i = 0; i < arr.length; i++) {
          ids.add(arr[i])
        }
      }
    } else if (typeof ifcModel.traverse === 'function') {
      // Hierarchical model (cache-hit Conway-direct). Union across
      // child meshes' per-vertex `expressID` attribute.
      ifcModel.traverse((obj) => {
        if (!obj.isMesh) {
          return
        }
        const attr = obj.geometry?.attributes?.expressID
        if (!attr) {
          return
        }
        const arr = attr.array
        for (let i = 0; i < arr.length; i++) {
          ids.add(arr[i])
        }
      })
    } else if (ifcModel.expressID) {
      for (const id of ifcModel.expressID) {
        ids.add(id)
      }
    }
    if (ids.size === 0 && !isDefinedAndNotNull(ifcModel.geometry) &&
        typeof ifcModel.traverse !== 'function') {
      // Pre-existing guard: bail when there's nothing to read from.
      return
    }
    this.visualElementsIds = [...ids]
    const rootElement = await this.ifcModel.ifcManager.getSpatialStructure(0, false)
    this.collectSpatialElementsId(rootElement)
  }


  /**
   * Normalise a subset value to a `Mesh[]`. The web-ifc-three
   * `createSubset` returns a single Mesh; the Conway-direct path
   * (`attachInstanceMapSubsets`) returns an array of Meshes — one per
   * child mesh of a hierarchical model. The slot fields below hold
   * whichever shape `createSubset` returned, and the public methods
   * call this helper before iterating.
   *
   * @param {Mesh|Mesh[]|null|undefined} subset
   * @return {Mesh[]}
   * @private
   */
  _subsetMeshes(subset) {
    if (!subset) {
      return []
    }
    return Array.isArray(subset) ? subset : [subset]
  }


  /**
   * Add a subset (single Mesh or Mesh[]) to the scene + pickable-models
   * registry. Mirrors the legacy `scene.add(subset) +
   * pickableModels.push(subset)` pair, generalised to handle the
   * array shape returned by the Conway-direct `createSubset`.
   *
   * For the array shape, every mesh is pushed onto `pickableModels`
   * individually so the raycaster sees them as siblings — this matches
   * the per-mesh shape ShareViewer already produces for selection /
   * preselection on the same models, keeping picking behaviour
   * consistent across overlapping highlight sources.
   *
   * Uses `scene.attach(m)` (not `scene.add(m)`) for two reasons:
   *
   *   1. **Preserves world transform under reparent.** For a
   *      cache-hit Conway-direct model (ifcModel is a `Group`,
   *      children are per-material Meshes), `attachInstanceMapSubsets`
   *      parents each subset under its source mesh's parent — the
   *      Group itself. By the time `_addSubsetToScene` runs the Group
   *      has already been detached from the scene (above), so the
   *      subsets are in a dangling subtree. `scene.attach` lifts each
   *      subset to the scene root while baking the Group's accumulated
   *      ancestor transform into the subset's local matrix, so it
   *      renders at the same world position the source did.
   *      `scene.add(m)` would skip dangling-parent subsets entirely
   *      (since they're not orphan, `m.parent !== null`) and leave
   *      them invisible — see the H-toggle bug fixed in this PR.
   *   2. **Idempotent for already-in-scene subsets.** For cache-miss
   *      single-Mesh `ifcModel`, source.parent was the scene itself,
   *      so the subset is already a scene child. `scene.attach` of
   *      an existing-child is a transform-preserving no-op (apart
   *      from order-in-children).
   *
   * @param {Mesh|Mesh[]|null} subset
   * @private
   */
  _addSubsetToScene(subset) {
    const meshes = this._subsetMeshes(subset)
    if (meshes.length === 0) {
      return
    }
    const scene = this.context.getScene()
    const pickable = this.context.getPickableModels()
    for (const m of meshes) {
      scene.attach(m)
      pickable.push(m)
    }
  }


  /**
   * Remove a subset (single Mesh or Mesh[]) from the scene +
   * pickable-models registry. Counterpart to `_addSubsetToScene`.
   *
   * Uses `m.removeFromParent()` (not `scene.remove(m)`) because the
   * subset's current parent may not be the scene root — e.g.,
   * `attachInstanceMapSubsets` may have left it under the source
   * mesh's parent (a Group for cache-hit Conway-direct). `removeFromParent`
   * always cleans up regardless of which parent.
   *
   * For `pickableModels`, removes each entry by reference rather than
   * `pop()` — the array may have other models pushed by the loader
   * between this isolator's add and remove (e.g., a second model
   * loaded mid-isolation), so popping is unsafe. The single-element
   * wit-three case still works because the loop iterates one ref.
   *
   * @param {Mesh|Mesh[]|null} subset
   * @private
   */
  _removeSubsetFromScene(subset) {
    const meshes = this._subsetMeshes(subset)
    if (meshes.length === 0) {
      return
    }
    const pickable = this.context.getPickableModels()
    for (const m of meshes) {
      m.removeFromParent()
      const idx = pickable.indexOf(m)
      if (idx >= 0) {
        pickable.splice(idx, 1)
      }
    }
  }

  /**
   * Collects spatial elements ids.
   *
   * @param {object} element IFC element
   */
  collectSpatialElementsId(element) {
    if (element.children.length > 0) {
      this.spatialStructure[element.expressID] = element.children.map((e) => e.expressID)
      element.children.forEach((e) => {
        this.collectSpatialElementsId(e)
      })
    }
  }

  /**
   * Flattens element's children if it has any.
   *
   * @param {number} elementId IFC element Id
   * @param {Array} result Result array
   * @return {number} element id if no children or {number[]} if has children
   */
  flattenChildren(elementId, result = null) {
    if (Number.isInteger(elementId)) {
      const children = this.spatialStructure[elementId]
      if (result === null) {
        result = [elementId]
      }
      if (children !== undefined && children.length > 0) {
        children.forEach((c) => {
          result.push(c)
          this.flattenChildren(c, result)
        })
      }
      return result
    } else {
      const types = useStore.getState().elementTypesMap
      const elements = types.filter((t) => t.name === elementId)[0].elements
      const flattenedTypeElements = []
      elements.forEach((e) => {
        flattenedTypeElements.push(e.expressID)
        this.flattenChildren(e.expressID, flattenedTypeElements)
      })
      return flattenedTypeElements
    }
  }

  /**
   * Initializes hide operations subset
   *
   * @param {Array} includedIds element ids included in the subset
   * @param {boolean} removeModel Whether to remove the model
   */
  initHideOperationsSubset(includedIds, removeModel = true) {
    if (removeModel) {
      this._removeSubsetFromScene(this.ifcModel)
      this.viewer.selector?.clearSelection()
      this.viewer.selector?.clearPreselection()
    }
    // Conway-direct: also clear the hover preselection pool. It
    // lives on ShareViewer (not the IFC selector), tracks the last-
    // hovered instance, and stays visible at its last position until
    // the next mousemove. After hide / isolate, the user's cursor
    // hasn't moved — so the pool is still showing the just-clicked
    // element. Since selection click also focuses the camera on that
    // element, the pool overlay ends up being the only thing on
    // screen, masking the actual subset render (which is correct but
    // at other parts of the model that are now off-camera). Clear
    // the pool here so the subset is what the user actually sees.
    if (typeof this.viewer._clearPreselectionForAllModels === 'function') {
      this.viewer._clearPreselectionForAllModels()
    }
    this.unhiddenSubset = this.ifcModel.createSubset({
      modelID: 0,
      scene: this.context.getScene(),
      ids: includedIds,
      applyBVH: true,
      removePrevious: true,
      customID: this.subsetCustomId,
    })
    this._addSubsetToScene(this.unhiddenSubset)
  }

  /**
   * Initializes temporary isolation subset
   *
   * @param {Array} includedIds element ids included in the subset
   */
  initTemporaryIsolationSubset(includedIds) {
    this._removeSubsetFromScene(this.ifcModel)
    // Same hover-pool cleanup reasoning as in `initHideOperationsSubset`.
    // For isolate this matters less visually (the pool's last-hovered
    // element typically IS the isolated one, so it's redundant rather
    // than wrong), but keeping the two paths symmetric avoids drift.
    if (typeof this.viewer._clearPreselectionForAllModels === 'function') {
      this.viewer._clearPreselectionForAllModels()
    }
    this.isolationSubset = this.ifcModel.createSubset({
      modelID: 0,
      scene: this.context.getScene(),
      ids: includedIds,
      applyBVH: true,
      removePrevious: true,
      customID: this.subsetCustomId,
    })
    this._addSubsetToScene(this.isolationSubset)
    // OutlineEffect.setSelection takes an array of Object3Ds. The
    // Conway-direct path returns Mesh[]; the wit-three path returns
    // a single Mesh. Normalise so the postprocess pass sees a flat
    // list either way.
    this.isolationOutlineEffect.setSelection(this._subsetMeshes(this.isolationSubset))
  }

  /**
   * Hides selected ifc elements
   *
   */
  hideSelectedElements() {
    if (this.tempIsolationModeOn) {
      return
    }
    const selection = this.viewer.getSelectedIds()
    if (selection.length === 0) {
      return
    }
    // Toggle semantics: a second H press on an already-hidden
    // selection unhides it. The store-side selection list is
    // preserved across hide / unhide so the same H press can flip
    // back; the React effect's deps (`selectedElements`,
    // `selectedInstanceIds`) stay unchanged, which also avoids the
    // "selection rebirth" path that re-created the cyan subset on a
    // stale `selectedInstanceIds`. On the visual side we DO clear
    // the cyan selection overlay (see `_clearSelectionVisualOnly`
    // below) so the hide reads cleanly; the unhide branch
    // (`unHideElementsById` / `unHideAllElements`) rebuilds it from
    // the preserved store state via `_rebuildSelectionVisualFromStore`.
    const allSelectedHidden = selection.every((id) => this.hiddenIds.includes(id))
    if (allSelectedHidden) {
      this.unHideElementsById([...selection])
      return
    }

    const toBeHidden = new Set(selection.concat(this.hiddenIds))
    this.hiddenIds = [...toBeHidden]
    const hiddenIdsObject = Object.fromEntries(
      this.hiddenIds.map((id) => [id, true]))
    useStore.setState({hiddenElements: hiddenIdsObject})
    const toBeShown = this.visualElementsIds.filter((el) => !this.hiddenIds.includes(el))
    this.initHideOperationsSubset(toBeShown)
    this._clearSelectionVisualOnly()
  }


  /**
   * Clear the Conway-direct selection visual (cyan outline + fill
   * subsets + OutlineEffect selection set) WITHOUT touching the
   * store-side `selectedElements` / `selectedInstanceIds` or the
   * viewer's `_selectedExpressIds` cache.
   *
   * Used by hide-paths that preserve selection state for H-toggle
   * semantics but still want the cyan to disappear so the hide reads
   * cleanly. The counterpart `_rebuildSelectionVisualFromStore`
   * resyncs the visual from the (preserved) store state on unhide.
   *
   * @private
   */
  _clearSelectionVisualOnly() {
    if (this.viewer.highlighter && typeof this.viewer.highlighter.setHighlighted === 'function') {
      this.viewer.highlighter.setHighlighted(null)
    }
    if (typeof this.viewer._clearConwaySelectionSubsets === 'function') {
      this.viewer._clearConwaySelectionSubsets()
    }
  }


  /**
   * Rebuild the selection visual (cyan subset + outline) from the
   * current store state. Called by unhide-paths after the hide-subset
   * teardown so the cyan returns to its original spot.
   *
   * Mirrors what `CadView`'s `[selectedElements, selectedInstanceIds]`
   * useEffect does — first `setSelection` for parent-level highlight,
   * then `setInstanceSelection` to narrow to a specific PlacedGeometry
   * if the click handler tagged us with one. The React effect won't
   * re-run on its own because hide didn't change either dep.
   *
   * @private
   */
  _rebuildSelectionVisualFromStore() {
    const sel = useStore.getState().selectedElements
    if (!Array.isArray(sel) || sel.length === 0) {
      return
    }
    const ids = sel.map((e) => Number(e))
    this.viewer.setSelection(0, ids, false)
    const instIds = useStore.getState().selectedInstanceIds
    if (Array.isArray(instIds) && instIds.length > 0 &&
        typeof this.viewer.setInstanceSelection === 'function') {
      this.viewer.setInstanceSelection(0, instIds)
    }
  }

  /**
   * Hides ifc elements by their ids
   *
   * @param {Array} toBeHiddenElementIds element ids to be hidden
   */
  hideElementsById(toBeHiddenElementIds) {
    if (Array.isArray(toBeHiddenElementIds)) {
      const noChanges = unsortedArraysAreEqual(toBeHiddenElementIds, this.hiddenIds)
      if (noChanges) {
        return
      }
      const toBeHidden = new Set(toBeHiddenElementIds.concat(this.hiddenIds))
      this.hiddenIds = [...toBeHidden]
      const hiddenIdsObject = Object.fromEntries(
        this.hiddenIds.map((id) => [id, true]))
      useStore.setState({hiddenElements: hiddenIdsObject})
    } else if (Number.isFinite(toBeHiddenElementIds)) {
      if (this.hiddenIds.includes(toBeHiddenElementIds)) {
        return
      }
      this.hiddenIds.push(toBeHiddenElementIds)
      useStore.getState().updateHiddenStatus(toBeHiddenElementIds, true)
    } else {
      return
    }
    const toBeShown = this.visualElementsIds.filter((el) => !this.hiddenIds.includes(el))
    this.initHideOperationsSubset(toBeShown)
    const selection = useStore.getState().selectedElements.filter((el) => !this.hiddenIds.includes(Number(el)))
    useStore.setState({selectedElements: selection})
    if (this.revealHiddenElementsMode) {
      this.revealHiddenElementsMode = false
      this.toggleRevealHiddenElements()
    }
  }

  /**
   * Unhides ifc elements by their ids
   *
   * @param {Array} toBeUnhiddenElementIds element ids to be unhidden
   */
  unHideElementsById(toBeUnhiddenElementIds) {
    if (Array.isArray(toBeUnhiddenElementIds)) {
      const toBeShown = toBeUnhiddenElementIds.filter((el) => this.hiddenIds.includes(el))
      if (toBeShown.length === 0) {
        return
      }
      const toBeHidden = new Set(this.hiddenIds.filter((el) => !toBeShown.includes(el)))
      this.hiddenIds = [...toBeHidden]
      const hiddenIdsObject = Object.fromEntries(
        this.hiddenIds.map((id) => [id, true]))
      useStore.setState({hiddenElements: hiddenIdsObject})
    } else if (Number.isFinite(toBeUnhiddenElementIds)) {
      if (this.hiddenIds.includes(toBeUnhiddenElementIds)) {
        this.hiddenIds = arrayRemove(this.hiddenIds, toBeUnhiddenElementIds)
        useStore.getState().updateHiddenStatus(toBeUnhiddenElementIds, false)
      } else {
        return
      }
    } else {
      return
    }
    if (this.hiddenIds.length === 0) {
      this.unHideAllElements()
    } else {
      const toBeShown = this.visualElementsIds.filter((el) => !this.hiddenIds.includes(el))
      this.initHideOperationsSubset(toBeShown)
    }
    // Rebuild the selection visual (cyan) from the preserved store
    // state. Goes through both `setSelection` (parent-level) and
    // `setInstanceSelection` (per-PlacedGeometry narrowing) to match
    // what the original click handler set up — without this, the H-
    // toggle that hides per-instance + unhides would land on a
    // parent-level cyan and lose the per-instance precision.
    this._rebuildSelectionVisualFromStore()
    // reset reveal mode
    if (this.revealHiddenElementsMode) {
      this.revealHiddenElementsMode = false
      this.toggleRevealHiddenElements()
    }
  }

  /**
   * Unhides all hidden elements
   *
   */
  unHideAllElements() {
    if (this.tempIsolationModeOn) {
      return
    }
    this._removeSubsetFromScene(this.unhiddenSubset)
    this.unhiddenSubset = null
    this._addSubsetToScene(this.ifcModel)
    this.hiddenIds = []
    useStore.setState({hiddenElements: {}})
    // Rebuild the cyan selection visual from the preserved store
    // state. `hideSelectedElements` cleared the visual but kept the
    // store side (for H-toggle semantics); the Show All button
    // routes through here without going through `unHideElementsById`'s
    // setSelection call, so without this the visual stays cleared
    // even though the store still has a selection.
    this._rebuildSelectionVisualFromStore()
    if (this.revealHiddenElementsMode) {
      this.toggleRevealHiddenElements()
    }
  }

  /**
   * Toggles reveal hidden elements from hide and isolate operations
   *
   */
  toggleRevealHiddenElements() {
    if (this.revealHiddenElementsMode) {
      this.revealHiddenElementsMode = false
      // Reveal subsets aren't added to `pickableModels` (the
      // translucent cyan overlay isn't a click target — it shows
      // hidden elements as ghosts), so we go around the helper and
      // just remove them from the scene by-mesh.
      for (const m of this._subsetMeshes(this.revealedElementsSubset)) {
        this.context.getScene().remove(m)
      }
      this.revealedElementsSubset = null
    } else {
      let hidden = this.hiddenIds
      if (this.tempIsolationModeOn) {
        hidden = hidden.concat(this.visualElementsIds.filter((e) => !this.isolatedIds.includes(e)))
      }
      if (hidden.length === 0) {
        for (const m of this._subsetMeshes(this.revealedElementsSubset)) {
          this.context.getScene().remove(m)
        }
        this.revealedElementsSubset = null
        return
      }
      this.revealHiddenElementsMode = true
      this.revealedElementsSubset = this.ifcModel.createSubset({
        modelID: 0,
        scene: this.context.getScene(),
        ids: hidden,
        applyBVH: true,
        removePrevious: true,
        customID: this.revealSubsetCustomId,
        material: this.hiddenMaterial,
      })
      // Two paths reach the scene differently:
      //   - wit-three: `createSubset` itself does `config.scene.add(subset)`,
      //     so the subset is already parented at the scene root.
      //   - Conway-direct (`attachInstanceMapSubsets`): the subset is
      //     parented under the source mesh's parent. For cache-miss
      //     (single Mesh source) that parent IS the scene; for cache-
      //     hit (Group source) it's the Group, which the isolator
      //     just removed from scene. `scene.attach` lifts the subset
      //     to the scene root either way, baking the ancestor
      //     transform so the ghost renders at the source's world
      //     position. Idempotent for the wit-three / cache-miss path
      //     (already-a-scene-child reattach is a no-op apart from
      //     children-order). Reveal subsets stay out of
      //     `pickableModels` — the cyan ghost overlay is decorative
      //     and not a click target.
      for (const m of this._subsetMeshes(this.revealedElementsSubset)) {
        this.context.getScene().attach(m)
      }
    }
  }

  /**
   * Checks whether a certain element can be picked in scene or not
   *
   * @param {number} elementId the element id
   * @return {boolean} true if hidden, otherwise false
   */
  canBePickedInScene(elementId) {
    if (this.tempIsolationModeOn) {
      return !this.hiddenIds.includes(elementId) && this.isolatedIds.includes(elementId)
    }
    return !this.hiddenIds.includes(elementId)
  }

  /**
   * Checks whether a certain element can be hidden in scene or not
   *
   * @param {number} elementId the element id
   * @return {boolean} true if can be hidden, otherwise false
   */
  canBeHidden(elementId) {
    return this.visualElementsIds.includes(elementId) || Object.keys(this.spatialStructure).includes(`${elementId}`)
  }

  /**
   * Toggles isolation mode
   *
   */
  toggleIsolationMode() {
    if (this.revealHiddenElementsMode) {
      this.toggleRevealHiddenElements()
    }
    if (this.tempIsolationModeOn) {
      this.resetTempIsolation()
    } else {
      this.isolateSelectedElements()
    }
  }

  /**
   * Isolates selected ifc elements
   *
   */
  isolateSelectedElements() {
    const selection = this.viewer.getSelectedIds()
    const noChanges = unsortedArraysAreEqual(selection, this.hiddenIds)
    if (noChanges) {
      return
    }
    this.tempIsolationModeOn = true
    useStore.setState({isTempIsolationModeOn: true})
    this.isolatedIds = selection
    const isolatedIdsObject = Object.fromEntries(
      this.isolatedIds.map((id) => [id, true]))
    useStore.setState({isolatedElements: isolatedIdsObject})
    this.initTemporaryIsolationSubset(selection)
  }

  /**
   * Resets temporary isolation
   *
   */
  resetTempIsolation() {
    if (!this.tempIsolationModeOn) {
      return
    }
    this.tempIsolationModeOn = false
    useStore.setState({isTempIsolationModeOn: false})
    this.isolatedIds = []
    useStore.setState({isolatedElements: {}})
    this._removeSubsetFromScene(this.isolationSubset)
    this.isolationSubset = null
    if (this.hiddenIds.length > 0) {
      const toBeShown = this.visualElementsIds.filter((el) => !this.hiddenIds.includes( el ))
      this.initHideOperationsSubset(toBeShown, false)
    } else {
      this._addSubsetToScene(this.ifcModel)
    }
    this.isolationOutlineEffect.setSelection([])
    // Rebuild the cyan selection visual. Covers the hide-then-
    // isolate-then-deisolate flow: hide cleared the visual, isolate
    // didn't touch it, and resetTempIsolation now restores it from
    // the preserved store-side selection. For the non-hide-prior
    // isolate-toggle flow this is effectively a no-op (the visual
    // was never cleared, `_setConwaySelectionFromModel` inside
    // setSelection clears + rebuilds at the same position).
    this._rebuildSelectionVisualFromStore()
  }

  /**
   * Initialize hidden elements material.
   *
   */
  initHiddenMaterial() {
    const planes = this.context.getClippingPlanes()
    const color = 0x00FFFF
    const opacity = 0.3
    this.hiddenMaterial = new MeshLambertMaterial({
      color,
      opacity,
      transparent: true,
      depthTest: true,
      side: DoubleSide,
      clippingPlanes: planes,
    })
  }
}
