import {ShareViewer} from '../ShareViewer'
import {unsortedArraysAreEqual, arrayRemove} from '../../utils/arrays'
import {clearBatchedSelection} from '../ifc/batchedHighlight'
import {eachBatch, isBatchedModel} from '../ifc/batchedModel'
import {
  applySceneGraphVisibility,
  initiallyHiddenIds,
  isSceneGraphModel,
  sceneGraphElementIds,
} from './sceneGraphVisibility'
import {occurrenceKey, occurrencePathKey, selectedOccurrences} from '../../utils/occurrencePaths'
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
 *
 * **Batched path is different: no subset is built at all.** When the model
 * is a `THREE.BatchedMesh` (or a Group of them — the opaque/transparent
 * split), hide and isolate run *in place* by flipping per-instance
 * visibility with `BatchedMesh.setVisibleAt` (`_applyBatchedVisibility`).
 * Re-baking a subset Mesh there was Share#1806: the baked Mesh gets the
 * batch's shared colourless `makeSurfaceMaterial` and cannot read the
 * batch's per-instance colour texture, so every isolated part rendered
 * light grey. Masking visibility keeps the real geometry, materials,
 * per-instance colours (`setColorAt` / `instanceColors` / the auto-colour
 * palette) and picking intact by construction, and the model never leaves
 * the scene or `pickableModels`. `batchedSubset.js` is still used on this
 * path for the reveal-hidden ghost overlay (which *wants* a flat cyan
 * material), and by the other backends for everything.
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
  // STEP per-occurrence hides: occurrence key (`occurrenceKey`: path + solid)
  // → the synthetic IfcInstanceMap instance ids placed at that occurrence.
  // Separate from `hiddenIds` (product-type / expressID hides) because a
  // reused part's occurrences share one geometry-owner expressID — hiding by
  // that id would hide every reuse. Keyed by occurrence rather than by the
  // row's NAUO id because a reused sub-assembly's copies share their row
  // ids, and each copy hides on its own. The reveal subset omits the union of
  // these instances so only the chosen occurrence disappears. Empty for IFC.
  // See design/new/step-occurrence-selection.md.
  hiddenOccurrences = new Map()
  // The occurrence each `hiddenOccurrences` entry came from, keyed the same:
  // `{nodeId, occurrencePath, solidExpressId}`. The row id for the store and
  // the eyes; the path for the permalink (visibilityHash), since instance ids
  // are per load and don't round-trip.
  hiddenOccurrencePaths = new Map()
  // What the loader left hidden (scene-graph overlays, with their subtrees):
  // the baseline the permalink's hidden-state diff is taken against. Empty
  // for IFC and STEP.
  defaultHiddenIds = []
  isolatedIds = []
  // Isolating STEP occurrences (isolateOccurrences): the instances shown, and
  // the occurrences they came from (for the permalink). Null otherwise, when
  // isolation is by element id (`isolatedIds`).
  isolatedInstanceIds = null
  isolatedOccurrences = null
  // The store's `selectedElements` when isolating dropped the selection's
  // paint (batched path), so it stays dropped until the selection changes
  // (`isSelectionPaintSuppressed`).
  _isolatedSelection = null
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
    this.defaultHiddenIds = []
    this._occurrenceKeyed = null
    this._hideableOccurrences = new Map()
    // Scene-graph models (ADF, OBJ, third-party GLB, …): elements are the
    // Object3Ds, hidden and isolated through their own `visible`
    // (sceneGraphVisibility.js). Their placeholder per-vertex `expressID`
    // (an `Int8Array(1)` serial) is not an element list, so read the objects.
    if (isSceneGraphModel(ifcModel)) {
      this.visualElementsIds = sceneGraphElementIds(ifcModel)
      this.collectSpatialElementsId(await this._getSpatialStructure())
      this.hiddenOccurrences.clear()
      this.hiddenOccurrencePaths.clear()
      // Adopt what the loader left hidden as hidden elements, with their
      // subtrees as a NavTree eye would hide them, so the eyes tell the truth.
      // Only once per model path: `CadView#onViewer` reapplies the store's
      // `hiddenElements` right after this, so on a viewer re-init (a theme
      // change reloads the model) the user's hides, or a Show All, must
      // survive rather than be reseeded over. `onViewer` clears the flag, with
      // the hidden state, when a different path loads.
      const seeded = new Set()
      for (const id of initiallyHiddenIds(ifcModel)) {
        for (const each of this.flattenChildren(id)) {
          seeded.add(each)
        }
      }
      this.defaultHiddenIds = [...seeded]
      if (useStore.getState().sceneGraphDefaultsSeeded) {
        this.hiddenIds = []
      } else {
        this.hiddenIds = [...seeded]
        this._syncHiddenStore()
        useStore.setState({sceneGraphDefaultsSeeded: true})
      }
      applySceneGraphVisibility(ifcModel, {hiddenIds: this.hiddenIds})
      return
    }
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
      const rootElement = await this._getSpatialStructure()
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
    const rootElement = await this._getSpatialStructure()
    this.collectSpatialElementsId(rootElement)
  }


  /**
   * Fetch the model's spatial structure, tolerating both load backends.
   * Cache-miss Conway-direct / wit-three expose it under
   * `ifcModel.ifcManager.getSpatialStructure`; a cache-hit GLB model exposes
   * its OWN `ifcModel.getSpatialStructure` closure (from
   * `Loader.js#convertToShareModel`) and has no `ifcManager` spatial method.
   * Preferring the own method — discriminated by `hasOwnProperty`, exactly as
   * `CadView#onModel` does — is what populates `spatialStructure` on cache-hit,
   * so `canBeHidden` returns true and the NavTree renders its hide/eye icons
   * (they were missing on every cache-hit reload otherwise).
   *
   * @return {Promise<object>} spatial-structure root (may have no children)
   * @private
   */
  _getSpatialStructure() {
    if (Object.prototype.hasOwnProperty.call(this.ifcModel, 'getSpatialStructure')) {
      return this.ifcModel.getSpatialStructure(0, false)
    }
    return this.ifcModel.ifcManager.getSpatialStructure(0, false)
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
    const batched = this._isBatchedModel()
    const sceneGraph = this._isSceneGraphModel()
    if (removeModel) {
      // The batched and scene-graph paths mask visibility on the model itself,
      // so it must stay in the scene (and in `pickableModels`) — detaching it
      // would leave an empty viewport.
      if (!batched && !sceneGraph) {
        this._removeSubsetFromScene(this.ifcModel)
      }
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
    if (sceneGraph) {
      // Same redundancy as the batched path: visibility is re-derived from
      // `hiddenIds`. Scene-graph models have no per-occurrence hides.
      applySceneGraphVisibility(this.ifcModel, {hiddenIds: this.hiddenIds})
      return
    }
    if (batched) {
      // `includedIds` is redundant here: every caller passes
      // `visualElementsIds − hiddenIds`, and the per-occurrence subtraction is
      // `_hiddenInstanceIdSet()` — both of which `_applyBatchedVisibility`
      // re-derives from the same state, along with the isolation filter that
      // a `createSubset` call could not express.
      this._applyBatchedVisibility()
      return
    }
    this.unhiddenSubset = this.ifcModel.createSubset({
      modelID: 0,
      scene: this.context.getScene(),
      ids: includedIds,
      applyBVH: true,
      removePrevious: true,
      customID: this.subsetCustomId,
      // Drop any per-occurrence-hidden instances from the reveal so one
      // occurrence of a reused part can hide while its siblings stay shown.
      // Empty (no-op) unless `hideOccurrence` has run.
      excludeInstances: this._hiddenInstanceIdSet(),
    })
    this._addSubsetToScene(this.unhiddenSubset)
  }


  /**
   * Union of every per-occurrence-hidden instance id across `hiddenOccurrences`.
   * The `excludeInstances` set the hide reveal subtracts. Empty Set when no
   * occurrence is hidden (IFC, or nothing hidden yet).
   *
   * @return {Set<number>}
   * @private
   */
  _hiddenInstanceIdSet() {
    const set = new Set()
    for (const instanceIds of this.hiddenOccurrences.values()) {
      for (const id of instanceIds) {
        set.add(id)
      }
    }
    return set
  }


  /**
   * True when the loaded model renders through the `THREE.BatchedMesh` path
   * (`buildBatchedConwayModel` / `instancedGlbToBatchedModel`) — i.e. hide and
   * isolate mask per-instance visibility in place instead of re-baking a
   * subset Mesh. Discriminated by the `instanceParents` pick table, the same
   * signal `batchedHighlight` uses.
   *
   * @return {boolean}
   * @private
   */
  _isBatchedModel() {
    return isBatchedModel(this.ifcModel)
  }


  /**
   * True for a scene-graph model (sceneGraphVisibility.js): no batches, no
   * `createSubset`, elements are Object3Ds. Hide and isolate set `visible`
   * on them in place, like the batched path masks instances in place.
   *
   * @return {boolean}
   * @private
   */
  _isSceneGraphModel() {
    return isSceneGraphModel(this.ifcModel)
  }


  /**
   * Put the source model back on screen after hide / isolate ended.
   *
   * On the subset paths that means re-attaching the model the hide/isolate
   * detached. On the batched path the model never left the scene — re-adding
   * it would push a duplicate onto `pickableModels` — so this instead
   * re-derives the visibility mask, which drops it entirely once nothing is
   * hidden or isolated. Callers must clear `hiddenIds` / `hiddenOccurrences` /
   * `isolatedIds` first.
   *
   * @private
   */
  _restoreModelToScene() {
    if (this._isSceneGraphModel()) {
      applySceneGraphVisibility(this.ifcModel, {hiddenIds: this.hiddenIds})
      return
    }
    if (this._isBatchedModel()) {
      this._applyBatchedVisibility()
      return
    }
    this._addSubsetToScene(this.ifcModel)
  }


  /**
   * Re-derive and apply per-instance visibility for every batch of a batched
   * model. A batchId is visible iff it passes **both** filters:
   *
   *   - isolation — not isolating, or its parent product is in `isolatedIds`;
   *   - hide — its parent isn't in `hiddenIds` and its occurrence id isn't in
   *     `_hiddenInstanceIdSet()` (the STEP per-occurrence hides).
   *
   * With nothing hidden and nothing isolated the mask is released and the
   * batch returns to whatever visibility its other owner (residency) had set.
   *
   * Ownership handshake with `ResidencyController`. Residency
   * (`src/viewer/residency/ResidencyController.js`) also drives `setVisibleAt`
   * — it evicts instances for the residency slider / LOD, and it tracks its own
   * `instance.visible` belief. Two owners of one bit needs an arbiter, so while
   * a mask is installed the isolator wraps the batch's `setVisibleAt`
   * (`_ensureBatchedMask`): residency's writes land in the mask's `base` array
   * (its *intent*, preserved) and reach the GPU only when the isolator's
   * `allow` bit also permits it. Isolation therefore wins for parts it hides,
   * residency wins for parts it evicts, and `_releaseBatchedMask` replays
   * `base` on the way out — so un-isolating restores exactly what residency
   * had set, not a blanket "everything visible".
   *
   * @param {object} [opts]
   * @param {Array<number>} [opts.isolatedIds] isolate this set instead of the
   *   isolator's own `isolatedIds` / `tempIsolationModeOn` state — for the
   *   direct `initTemporaryIsolationSubset` callers that never enter isolation
   *   mode (BotChat).
   * @private
   */
  _applyBatchedVisibility(opts = {}) {
    const hiddenParents = new Set(this.hiddenIds)
    const hiddenInstances = this._hiddenInstanceIdSet()
    const explicitIsolation = Array.isArray(opts.isolatedIds) || opts.isolatedInstances instanceof Set
    const isolating = explicitIsolation || this.tempIsolationModeOn
    // Isolating STEP occurrences keeps instances, not whole parents.
    const isolatedInstances = isolating ?
      (explicitIsolation ? (opts.isolatedInstances ?? null) : this.isolatedInstanceIds) : null
    const isolatedParents = isolating && !isolatedInstances ?
      new Set(explicitIsolation ? opts.isolatedIds : this.isolatedIds) : null
    const masking = isolating || hiddenParents.size > 0 || hiddenInstances.size > 0
    eachBatch(this.ifcModel, (mesh) => {
      if (!mesh.instanceParents || typeof mesh.setVisibleAt !== 'function') {
        return
      }
      if (!masking) {
        this._releaseBatchedMask(mesh)
        return
      }
      const mask = this._ensureBatchedMask(mesh)
      const parents = mesh.instanceParents
      const occurrenceIds = mesh.instanceOccurrenceIds
      for (let batchId = 0; batchId < parents.length; batchId++) {
        const parent = parents[batchId]
        const isolated = !isolating || (isolatedInstances ?
          Boolean(occurrenceIds && isolatedInstances.has(occurrenceIds[batchId])) :
          isolatedParents.has(parent))
        const allowed =
          isolated &&
          !hiddenParents.has(parent) &&
          !(occurrenceIds && hiddenInstances.has(occurrenceIds[batchId]))
        mask.allow[batchId] = allowed ? 1 : 0
        // Bypass the wrapper: this is the isolator's own write, and it must not
        // be mistaken for residency intent (which would overwrite `base`).
        mask.nativeSetVisibleAt.call(mesh, batchId, allowed && mask.base[batchId] === 1)
      }
      // three's own `setVisibleAt` sets this; poke it too since we went around
      // it, so `BatchedMesh.onBeforeRender` rebuilds its multi-draw ranges and
      // the change repaints on the next frame (cf. shadingMode.js).
      mesh._visibilityChanged = true
    })
  }


  /**
   * Install (or fetch) this batch's isolation mask: a snapshot of the
   * pre-isolation per-instance visibility (`base`), the isolator's per-instance
   * verdict (`allow`), and a `setVisibleAt` wrapper that keeps the two owners
   * from clobbering each other. See `_applyBatchedVisibility` for the handshake.
   *
   * State lives under `mesh.userData` (repo convention, cf.
   * `userData.batchedHighlight`) so it survives an isolator re-creation over
   * the same model.
   *
   * @param {object} mesh a decorated BatchedMesh
   * @return {object} `{base, allow, nativeSetVisibleAt, hadOwnSetVisibleAt}`
   * @private
   */
  _ensureBatchedMask(mesh) {
    const existing = mesh.userData.isolationMask
    if (existing) {
      return existing
    }
    const count = mesh.instanceParents.length
    const base = new Uint8Array(count)
    for (let batchId = 0; batchId < count; batchId++) {
      base[batchId] = mesh.getVisibleAt(batchId) ? 1 : 0
    }
    const nativeSetVisibleAt = mesh.setVisibleAt
    const mask = {
      base,
      allow: new Uint8Array(count).fill(1),
      nativeSetVisibleAt,
      // Normally the prototype method; remembered so release restores the mesh
      // to the exact shape it had rather than leaving a stray own property.
      hadOwnSetVisibleAt: Object.prototype.hasOwnProperty.call(mesh, 'setVisibleAt'),
    }
    mesh.userData.isolationMask = mask
    mesh.setVisibleAt = function maskedSetVisibleAt(batchId, visible) {
      mask.base[batchId] = visible ? 1 : 0
      return nativeSetVisibleAt.call(this, batchId, visible && mask.allow[batchId] === 1)
    }
    return mask
  }


  /**
   * Remove this batch's isolation mask and replay the snapshotted visibility,
   * handing the bit back to residency exactly as it left it.
   *
   * @param {object} mesh a decorated BatchedMesh
   * @private
   */
  _releaseBatchedMask(mesh) {
    const mask = mesh.userData?.isolationMask
    if (!mask) {
      return
    }
    delete mesh.userData.isolationMask
    if (mask.hadOwnSetVisibleAt) {
      mesh.setVisibleAt = mask.nativeSetVisibleAt
    } else {
      delete mesh.setVisibleAt
    }
    for (let batchId = 0; batchId < mask.base.length; batchId++) {
      mask.nativeSetVisibleAt.call(mesh, batchId, mask.base[batchId] === 1)
    }
    mesh._visibilityChanged = true
  }


  /**
   * Publish the hidden set to the store so the NavTree eye icons reflect it.
   * Keyed union of product-type hides (`hiddenIds`) and per-occurrence hides
   * (`hiddenOccurrences` keys — the NAUO node ids the tree renders eyes on).
   *
   * @private
   */
  _syncHiddenStore() {
    const hiddenElements = {}
    for (const id of this.hiddenIds) {
      hiddenElements[id] = true
    }
    // Per occurrence, for the rows' eyes (`hiddenOccurrenceKeys`); and the row
    // id, for everything that reads hidden ids (a copy of a reused
    // sub-assembly marks the id its copies share).
    const hiddenOccurrenceKeys = {}
    for (const [key, {nodeId}] of this.hiddenOccurrencePaths) {
      hiddenOccurrenceKeys[key] = true
      hiddenElements[nodeId] = true
    }
    useStore.setState({hiddenElements, hiddenOccurrenceKeys})
  }


  /**
   * Hide one STEP occurrence: the geometry instances placed at a single
   * NavTree node, leaving the reused part's other occurrences visible. This is
   * the per-occurrence counterpart to `hideElementsById` (which hides every
   * instance of a product-type expressID). `instanceIds` come from the
   * caller's occurrence-path resolution
   * (`ShareViewer.getInstanceIdsForOccurrencePath`); `nodeId` is the tree
   * node's NAUO express id, used as the store key so its eye toggles.
   *
   * No-op when there are no instances to hide (empty `instanceIds` — an IFC or
   * unresolved path). The eye / H call sites don't currently fall back to
   * `hideElementsById` in that case (occurrence nodes with geometry always
   * resolve to ≥1 instance), so an unresolved occurrence hide is a quiet no-op.
   *
   * @param {number} nodeId NAUO express id of the hidden occurrence node
   * @param {Array<number>} instanceIds synthetic instance ids to hide
   * @param {object} [occurrence] `{occurrencePath, solidExpressId}` the
   *   instances were resolved from, for the permalink. Without it the hide
   *   works but isn't written to the link.
   */
  hideOccurrence(nodeId, instanceIds, occurrence = null) {
    this.hideOccurrences([{nodeId, instanceIds, ...(occurrence ?? {})}])
  }


  /**
   * `hideOccurrence` for several occurrences at once — a multi-selection's
   * Hide — rebuilding the view once rather than per occurrence.
   *
   * Each occurrence is its own entry, so the copies of a reused
   * sub-assembly — which share their row ids, and which a selection of one
   * of their rows names together — are each hidden, rather than each
   * overwriting the last.
   *
   * @param {Array<object>} occurrences `{nodeId, instanceIds, occurrencePath?,
   *   solidExpressId?}`; entries with no instances are skipped
   */
  hideOccurrences(occurrences) {
    if (this.tempIsolationModeOn) {
      return
    }
    let changed = false
    for (const {nodeId, instanceIds, occurrencePath, solidExpressId} of occurrences) {
      if (!Array.isArray(instanceIds) || instanceIds.length === 0) {
        continue
      }
      const hasPath = Array.isArray(occurrencePath) && occurrencePath.length > 0
      const key = occurrenceKey(occurrencePath, solidExpressId, nodeId)
      this.hiddenOccurrences.set(key, [...instanceIds])
      this.hiddenOccurrencePaths.set(key, {
        nodeId,
        occurrencePath: hasPath ? [...occurrencePath] : null,
        solidExpressId: solidExpressId ?? null,
      })
      changed = true
    }
    if (!changed) {
      return
    }
    this._syncHiddenStore()
    const toBeShown = this.visualElementsIds.filter((el) => !this.hiddenIds.includes(el))
    this.initHideOperationsSubset(toBeShown)
    this._clearSelectionVisualOnly()
    this._resetRevealMode()
  }


  /**
   * Reverse `hideOccurrence`. Restores the full model when nothing remains
   * hidden (product-type or occurrence), else rebuilds the reveal.
   *
   * @param {number} nodeId NAUO express id previously passed to `hideOccurrence`
   * @param {object} [occurrence] `{occurrencePath, solidExpressId}`: show just
   *   this occurrence. Without it, every occurrence hidden under `nodeId`.
   */
  unHideOccurrence(nodeId, occurrence = null) {
    this.unHideOccurrences([occurrence ? {nodeId, ...occurrence} : {nodeId}])
  }


  /**
   * `unHideOccurrence` for several at once. An entry with a path shows that
   * one occurrence; one without shows every occurrence hidden under its row
   * id.
   *
   * @param {Array<object>} occurrences `{nodeId, occurrencePath?, solidExpressId?}`
   */
  unHideOccurrences(occurrences) {
    const keys = new Set()
    for (const {nodeId, occurrencePath, solidExpressId} of occurrences) {
      if (Array.isArray(occurrencePath) && occurrencePath.length > 0) {
        keys.add(occurrenceKey(occurrencePath, solidExpressId, nodeId))
      } else {
        for (const [key, entry] of this.hiddenOccurrencePaths) {
          if (entry.nodeId === nodeId) {
            keys.add(key)
          }
        }
      }
    }
    const hidden = [...keys].filter((key) => this.hiddenOccurrences.has(key))
    if (this.tempIsolationModeOn || hidden.length === 0) {
      return
    }
    for (const key of hidden) {
      this.hiddenOccurrences.delete(key)
      this.hiddenOccurrencePaths.delete(key)
    }
    this._syncHiddenStore()
    if (this.hiddenIds.length === 0 && this.hiddenOccurrences.size === 0) {
      this.unHideAllElements()
      return
    }
    const toBeShown = this.visualElementsIds.filter((el) => !this.hiddenIds.includes(el))
    this.initHideOperationsSubset(toBeShown)
    this._rebuildSelectionVisualFromStore()
    this._resetRevealMode()
  }


  /**
   * Tear down and rebuild the reveal-hidden ghost overlay after the hidden set
   * changed, so it doesn't linger stale. No-op when reveal mode is off. The
   * product-type hide paths inline this; the per-occurrence paths call it so
   * both stay in sync. (The ghost still only covers product-type hides — see
   * `toggleRevealHiddenElements` — so occurrence hides show no ghost; that
   * secondary gap is noted in design/new/step-occurrence-selection.md.)
   *
   * @private
   */
  _resetRevealMode() {
    if (this.revealHiddenElementsMode) {
      this.revealHiddenElementsMode = false
      this.toggleRevealHiddenElements()
    }
  }

  /**
   * Initializes temporary isolation subset
   *
   * @param {Array|null} includedIds element ids included in the subset
   * @param {Set<number>|null} [isolatedInstances] instead, the only instances
   *   shown (isolating STEP occurrences)
   */
  initTemporaryIsolationSubset(includedIds, isolatedInstances = null) {
    const batched = this._isBatchedModel()
    const sceneGraph = this._isSceneGraphModel()
    if (!batched && !sceneGraph) {
      this._removeSubsetFromScene(this.ifcModel)
    }
    // Same hover-pool cleanup reasoning as in `initHideOperationsSubset`.
    // For isolate this matters less visually (the pool's last-hovered
    // element typically IS the isolated one, so it's redundant rather
    // than wrong), but keeping the two paths symmetric avoids drift.
    if (typeof this.viewer._clearPreselectionForAllModels === 'function') {
      this.viewer._clearPreselectionForAllModels()
    }
    if (sceneGraph) {
      // Isolate in place, like the batched path; `includedIds` explicitly for
      // the same BotChat reason given there. Outline the isolated meshes.
      this.isolationOutlineEffect.setSelection(applySceneGraphVisibility(
        this.ifcModel, {hiddenIds: this.hiddenIds, isolatedIds: includedIds}))
      return
    }
    if (batched) {
      // Isolate in place (Share#1806) — see the class doc. `includedIds` is
      // passed explicitly rather than read off `isolatedIds`, because
      // `BotChat` calls this method directly without entering isolation mode
      // (no `tempIsolationModeOn` / `isolatedIds`) — reading the fields would
      // make a bot-driven isolate a no-op.
      // Drop the selection paint before masking. Isolate normally targets the
      // *selection*, so the isolated instances are exactly the ones
      // `applyBatchedSelection` painted cyan — leaving that on would show the
      // user a cyan part rather than the part's own colour, which is the whole
      // of Share#1806. Logical selection is untouched (store-side
      // `selectedElements` / `selectedInstanceIds`), and `resetTempIsolation`
      // repaints from it via `_rebuildSelectionVisualFromStore`, so a click
      // made while isolated still highlights normally.
      this._clearSelectionVisualOnly()
      if (this.tempIsolationModeOn) {
        this._isolatedSelection = useStore.getState().selectedElements ?? null
      }
      this._applyBatchedVisibility(isolatedInstances ? {isolatedInstances} : {isolatedIds: includedIds})
      // No subset Mesh exists to outline. Point the effect at the batch meshes
      // themselves: only the isolated instances are visible on them now, so the
      // outline pass's mask traces exactly the isolated geometry.
      const batches = []
      eachBatch(this.ifcModel, (mesh) => batches.push(mesh))
      this.isolationOutlineEffect.setSelection(batches)
      return
    }
    this.isolationSubset = this.ifcModel.createSubset({
      modelID: 0,
      scene: this.context.getScene(),
      // Every parent, filtered down to the isolated instances.
      ids: isolatedInstances ? this.visualElementsIds : includedIds,
      applyBVH: true,
      removePrevious: true,
      customID: this.subsetCustomId,
      ...(isolatedInstances ? {includeInstances: isolatedInstances} : {}),
    })
    this._addSubsetToScene(this.isolationSubset)
    // OutlineEffect.setSelection takes an array of Object3Ds. The
    // Conway-direct path returns Mesh[]; the wit-three path returns
    // a single Mesh. Normalise so the postprocess pass sees a flat
    // list either way.
    this.isolationOutlineEffect.setSelection(this._subsetMeshes(this.isolationSubset))
  }

  /**
   * True when the model's geometry is keyed by STEP occurrence path: its
   * batches or instance maps carry an occurrence-path index. Then the tree's
   * ids (NAUOs, solids) own no geometry themselves, and hide / isolate / the
   * NavTree eye go through `getInstanceIdsForOccurrencePath`. Cached per model.
   *
   * @return {boolean}
   * @private
   */
  _isOccurrenceKeyed() {
    if (this._occurrenceKeyed === null || this._occurrenceKeyed === undefined) {
      let keyed = false
      if (typeof this.ifcModel?.traverse === 'function' &&
          typeof this.viewer.getInstanceIdsForOccurrencePath === 'function') {
        this.ifcModel.traverse((obj) => {
          const index = obj.occurrencePathToBatchIds ?? obj.instanceMap?.occurrencePathToInstanceIds
          if (index?.size > 0) {
            keyed = true
          }
        })
      }
      this._occurrenceKeyed = keyed
    }
    return this._occurrenceKeyed
  }


  /**
   * The STEP occurrences the current selection names (`selectedOccurrences`):
   * the funnel's exact occurrence for a single selection, the selected rows'
   * occurrences for a multi-selection on an occurrence-keyed model. Empty for
   * IFC and scene-graph models.
   *
   * @return {Array<object>} `{nodeId, occurrencePath, solidExpressId}`
   * @private
   */
  _selectionOccurrences() {
    if (typeof this.viewer.getInstanceIdsForOccurrencePath !== 'function') {
      return []
    }
    const state = useStore.getState()
    const path = state.selectedOccurrencePath
    const single = Array.isArray(path) && path.length > 0
    if (!single && !this._isOccurrenceKeyed()) {
      return []
    }
    const anchors = (state.selectedAnchorIds?.length > 0) ? state.selectedAnchorIds : state.selectedElements
    return selectedOccurrences({
      rootNode: state.rootElement,
      anchorIds: anchors ?? [],
      occurrencePath: single ? path : null,
      solidExpressId: state.selectedSolidExpressId ?? null,
    })
  }


  /**
   * @param {object} occurrence `{occurrencePath, solidExpressId}`
   * @return {Array<number>} its instances, and its descendants'
   * @private
   */
  _occurrenceInstanceIds({occurrencePath, solidExpressId}) {
    return this.viewer.getInstanceIdsForOccurrencePath(
      0, occurrencePath, {geometryExpressId: solidExpressId ?? null})
  }


  /**
   * Whether a NavTree row for this occurrence gets an eye: true when the path
   * resolves to geometry. The tree's `canBeHidden` test reads element ids,
   * which a STEP occurrence row's NAUO id never is, so most rows — every
   * leaf part — had no eye. Cached per model; rows re-render often.
   *
   * @param {Array<number>} occurrencePath
   * @param {number|null} [solidExpressId] a named body's own id
   * @return {boolean}
   */
  canHideOccurrence(occurrencePath, solidExpressId = null) {
    if (!Array.isArray(occurrencePath) || occurrencePath.length === 0 ||
        typeof this.viewer.getInstanceIdsForOccurrencePath !== 'function') {
      return false
    }
    this._hideableOccurrences ??= new Map()
    const key = `${occurrencePathKey(occurrencePath)}#${solidExpressId}`
    let hideable = this._hideableOccurrences.get(key)
    if (hideable === undefined) {
      hideable = this._occurrenceInstanceIds({occurrencePath, solidExpressId}).length > 0
      this._hideableOccurrences.set(key, hideable)
    }
    return hideable
  }


  /**
   * Hides selected ifc elements
   *
   */
  hideSelectedElements() {
    if (this.tempIsolationModeOn) {
      return
    }
    // STEP per-occurrence: hide just the selected occurrences' instances rather
    // than every reuse of their parts (which product-type expressID hiding
    // below would do — the reported "H hides both assemblies"). A single
    // occurrence is keyed by the selected solid's own id when a body is
    // selected (and its instances filtered by it), so just that body
    // disappears and its hidden-state stays separate from the whole part's —
    // required where a body shares its part's occurrence path (pre-conway#628
    // solids, anonymous pieces). Toggles on repeat H: when every selected
    // occurrence is already hidden, they come back.
    const occurrences = this._selectionOccurrences()
    if (occurrences.length > 0) {
      const isHidden = ({nodeId, occurrencePath, solidExpressId}) =>
        this.hiddenOccurrences.has(occurrenceKey(occurrencePath, solidExpressId, nodeId))
      if (occurrences.every(isHidden)) {
        this.unHideOccurrences(occurrences)
      } else {
        this.hideOccurrences(occurrences
          .filter((occurrence) => !isHidden(occurrence))
          .map((occurrence) => ({...occurrence, instanceIds: this._occurrenceInstanceIds(occurrence)})))
      }
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
    // Union writer — preserve any per-occurrence hides' eye keys (see hideElementsById).
    this._syncHiddenStore()
    const toBeShown = this.visualElementsIds.filter((el) => !this.hiddenIds.includes(el))
    this.initHideOperationsSubset(toBeShown)
    this._clearSelectionVisualOnly()
  }


  /**
   * Clear the selection visual (cyan outline + fill subsets +
   * OutlineEffect selection set on the subset paths; the in-place
   * `setColorAt` selection paint on the batched path) WITHOUT
   * touching the store-side `selectedElements` /
   * `selectedInstanceIds` or the viewer's `_selectedExpressIds`
   * cache.
   *
   * Used by hide- and isolate-paths that preserve selection state for
   * H- / I-toggle semantics but still want the cyan to disappear so
   * the operation reads cleanly. The counterpart
   * `_rebuildSelectionVisualFromStore` resyncs the visual from the
   * (preserved) store state on unhide / un-isolate.
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
    // Batched path: there is no subset to remove — the selection was painted
    // onto the live instances (`applyBatchedSelection` → `setColorAt`), so the
    // only way to take it off is to repaint them from `instanceColors`. Without
    // this the two calls above are no-ops here and the cyan survives (Share#1806:
    // an isolated part stayed selection-cyan instead of showing its own colour).
    if (this._isBatchedModel()) {
      clearBatchedSelection(this.ifcModel)
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
      // Publish through the union writer so a concurrent per-occurrence hide's
      // eye keys aren't clobbered — building hiddenElements from hiddenIds alone
      // would drop them and desync the NavTree eye from the still-hidden geometry.
      this._syncHiddenStore()
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
      // Union writer — keep any per-occurrence hides' eye keys (see hideElementsById).
      this._syncHiddenStore()
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
    // Only fully restore the model when NOTHING remains hidden — product-type
    // AND per-occurrence. Checking hiddenIds alone would let unhiding the last
    // product resurrect a still-hidden occurrence (unHideAllElements clears
    // hiddenOccurrences). Mirrors the guard in unHideOccurrence.
    if (this.hiddenIds.length === 0 && this.hiddenOccurrences.size === 0) {
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
    // Clear the hidden state BEFORE restoring: `_restoreModelToScene` re-derives
    // the batched visibility mask from it, so restoring first would re-apply the
    // hides it is meant to drop. Order is irrelevant on the subset paths.
    this.hiddenIds = []
    this.hiddenOccurrences.clear()
    this.hiddenOccurrencePaths.clear()
    this._restoreModelToScene()
    useStore.setState({hiddenElements: {}, hiddenOccurrenceKeys: {}})
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
    // The reveal ghost is a `createSubset` in the hidden material, which a
    // scene-graph model can't build; there it stays off.
    if (this._isSceneGraphModel()) {
      this.revealHiddenElementsMode = false
      return
    }
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
      if (this.tempIsolationModeOn && !this.isolatedInstanceIds) {
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
   * Whether the viewer should leave the selection unpainted: isolating (on
   * the batched path) drops the selection's cyan so the isolated parts show
   * their own colours (Share#1806), and that holds until the selection
   * changes — a click made while isolated still highlights. Without this, a
   * link that restores a selection and its isolation painted the cyan back:
   * the selection effect runs after the isolate, not before it as it does
   * live. Keyed by the store's `selectedElements` array, which every
   * selection replaces.
   *
   * @return {boolean}
   */
  isSelectionPaintSuppressed() {
    return this.tempIsolationModeOn && this._isolatedSelection !== null &&
      useStore.getState().selectedElements === this._isolatedSelection
  }


  /**
   * Checks whether a certain element can be picked in scene or not
   *
   * @param {number} elementId the element id
   * @return {boolean} true if hidden, otherwise false
   */
  canBePickedInScene(elementId) {
    // Isolated by instance, only the isolated instances are drawn or hit by a
    // ray, and none of them carries a tree row's id, so there is nothing
    // to filter by id beyond what's hidden.
    if (this.tempIsolationModeOn && !this.isolatedInstanceIds) {
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
    // STEP: isolate the selected occurrences' own instances. Their tree ids
    // own no geometry, so isolating them by id showed nothing at all.
    const occurrences = this._selectionOccurrences()
    if (occurrences.length > 0) {
      this.isolateOccurrences(occurrences)
      return
    }
    this.isolateElementsById(this.viewer.getSelectedIds())
  }


  /**
   * Isolate STEP occurrences: show just their instances (and their
   * descendants'), not every reuse of their parts. The selection's path, and
   * a permalink's `iso=o…` terms (visibilityHash).
   *
   * @param {Array<object>} occurrences `{nodeId, occurrencePath, solidExpressId}`
   */
  isolateOccurrences(occurrences) {
    const instanceIds = new Set()
    for (const occurrence of occurrences) {
      for (const id of this._occurrenceInstanceIds(occurrence)) {
        instanceIds.add(id)
      }
    }
    // As for element ids: isolating nothing, or only hidden instances, would
    // show nothing at all.
    const hidden = this._hiddenInstanceIdSet()
    if ([...instanceIds].every((id) => hidden.has(id))) {
      return
    }
    this.tempIsolationModeOn = true
    useStore.setState({isTempIsolationModeOn: true})
    this.isolatedIds = occurrences.map(({nodeId}) => nodeId)
    this.isolatedInstanceIds = instanceIds
    this.isolatedOccurrences = occurrences.map(({nodeId, occurrencePath, solidExpressId}) =>
      ({nodeId, occurrencePath: [...occurrencePath], solidExpressId: solidExpressId ?? null}))
    // Keyed by the rows' ids, so the NavTree shows their isolation glasses.
    useStore.setState({isolatedElements: Object.fromEntries(this.isolatedIds.map((id) => [id, true]))})
    this.initTemporaryIsolationSubset(null, instanceIds)
  }

  /**
   * Isolates the given elements. The selection's path, and a permalink's
   * `iso=` term (visibilityHash).
   *
   * @param {Array<number>} ids element ids
   */
  isolateElementsById(ids) {
    // Isolating nothing, or only hidden elements, would show nothing at all.
    // (This used to be `selection` equal to `hiddenIds`, which misses both
    // cases once anything else is hidden, as ADF's overlays are from load.)
    if (ids.every((id) => this.hiddenIds.includes(id))) {
      return
    }
    this.tempIsolationModeOn = true
    useStore.setState({isTempIsolationModeOn: true})
    this.isolatedIds = [...ids]
    const isolatedIdsObject = Object.fromEntries(
      this.isolatedIds.map((id) => [id, true]))
    useStore.setState({isolatedElements: isolatedIdsObject})
    this.initTemporaryIsolationSubset(this.isolatedIds)
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
    this._isolatedSelection = null
    this.isolatedInstanceIds = null
    this.isolatedOccurrences = null
    useStore.setState({isolatedElements: {}})
    this._removeSubsetFromScene(this.isolationSubset)
    this.isolationSubset = null
    // Rebuild the hide reveal (which subtracts occurrence-hidden instances) when
    // ANYTHING is still hidden — product-type or per-occurrence. The bare
    // `hiddenIds.length > 0` check would re-add the full model and resurrect a
    // per-occurrence hide that outlived the isolate/reset round-trip.
    if (this.hiddenIds.length > 0 || this.hiddenOccurrences.size > 0) {
      const toBeShown = this.visualElementsIds.filter((el) => !this.hiddenIds.includes( el ))
      this.initHideOperationsSubset(toBeShown, false)
    } else {
      this._restoreModelToScene()
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
   * Release every batched visibility mask this isolator installed, handing the
   * `setVisibleAt` bit back to residency. Called by `ShareViewer#dispose` (via
   * optional chaining) when the viewer or its model goes away, so a model that
   * is unloaded while isolated doesn't keep a wrapped `setVisibleAt` — and a
   * model kept across the teardown comes back with residency's visibility.
   */
  dispose() {
    eachBatch(this.ifcModel, (mesh) => this._releaseBatchedMask(mesh))
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
