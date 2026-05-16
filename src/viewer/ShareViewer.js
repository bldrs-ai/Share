import {IfcViewerAPI} from 'web-ifc-viewer'
import {ColorManagement, LinearSRGBColorSpace} from 'three'
import IfcViewsManager from '../Infrastructure/IfcElementsStyleManager'
import IfcCustomViewSettings from '../Infrastructure/IfcCustomViewSettings'
import IfcHighlighter from './three/IfcHighlighter'
import IfcIsolator from './three/IfcIsolator'
import CustomPostProcessor from './three/CustomPostProcessor'
import ThreeContext from './three/ThreeContext'
import debug from '../utils/debug'
import {modelHasCapability} from './ShareModel'
import {areDefinedAndNotNull} from '../utils/assert'


// Disable three.js r152+ automatic linear-sRGB color management
// (a.k.a. "Managed" color mode). With it enabled, three converts sRGB
// values to linear before lighting and back to sRGB on output — the
// physically-correct path. The fork (web-ifc-viewer) and our material
// setup were tuned in the r135 era against the *legacy* regime where
// material colors are used as-is and the rendered framebuffer flows
// straight through the monitor's sRGB curve. Under managed mode the
// Schependomlaan baseline renders washed out / overly bright.
//
// Setting this to `false` at module load (before any three object is
// constructed, including the fork's renderer/scene/materials inside
// `new IfcViewerAPI(...)`) restores r135-identical visual output. It
// also reverts the r157 `useLegacyLights = false` default's effect for
// most practical purposes — light intensities tuned for r135 (e.g.,
// the fork's hardcoded `0.8` / `0.25` in scene.js) match the r135
// visual without per-light π scaling.
//
// Goes away with Phase 5 of design/new/viewer-replacement.md, when
// ShareViewer owns its scene and we re-enable Managed mode as the new
// baseline.
ColorManagement.enabled = false


const viewParameter = (new URLSearchParams(window.location.search)).get('view')?.toLowerCase() ?? 'default'


const viewRules = {
  'default': [],
  'ch.sia380-1.heatmap': ['Rule1', 'Rule2'],
}
/* eslint-disable jsdoc/no-undefined-types */
/**
 * ShareViewer — the top-level viewer facade for Bldrs Share. Today still
 * extends `IfcViewerAPI` from the `web-ifc-viewer` fork; per
 * design/new/viewer-replacement.md §3, downstream code should depend on
 * this class rather than on the fork directly. When the fork is removed
 * (Phase 5), ShareViewer's surface stays — only its internals swap.
 */
export class ShareViewer extends IfcViewerAPI {
  // TODO: might be useful if we used a Set as well to handle large selections,
  // but for now array is more performant for small numbers
  _selectedExpressIds = []
  /**
   * @param {object} options - Configuration options
   */
  constructor(options) {
    super(options)
    // Replace the fork's `IfcContext` reference on this.context with our
    // layered wrapper. The fork's IfcManager / clipper / etc. were
    // constructed in `super()` with the original IfcContext and keep
    // their own private reference to it, so the fork side is unaffected.
    // Our code reads `viewer.context.X` through the wrapper. Guarded so
    // mocks that pre-wrap (see __mocks__/web-ifc-viewer.js) don't get
    // double-wrapped.
    if (!(this.context instanceof ThreeContext)) {
      this.context = new ThreeContext(this.context)
    }
    const renderer = this.context.getRenderer()
    // Partner to the top-level `ColorManagement.enabled = false`: that
    // disables the *input* side (auto sRGB→linear conversions on
    // materials / textures); this disables the *output* side. r184's
    // `WebGLRenderer.outputColorSpace` default is `SRGBColorSpace`,
    // which gamma-encodes the rendered framebuffer. r135's default was
    // `LinearEncoding` (no gamma encoding) — the modern equivalent is
    // `LinearSRGBColorSpace`. Postprocessing's `EffectComposer.initialize`
    // also keys off this property: when it sees SRGB it tags its render
    // target as sRGB and applies its own encoding. We need both off to
    // match r135 pixel-for-pixel. Guard for tests where the mock's
    // getRenderer() returns undefined.
    if (renderer) {
      renderer.outputColorSpace = LinearSRGBColorSpace
    }
    const scene = this.context.getScene()
    const camera = this.context.getCamera()
    this.postProcessor = new CustomPostProcessor(renderer, scene, camera)
    this.highlighter = new IfcHighlighter(this.context, this.postProcessor)
    this.isolator = new IfcIsolator(this.context, this)
    this.viewsManager = new IfcViewsManager(this.IFC.loader.ifcManager.parser, viewRules[viewParameter])
  }

  /**
   * Loads the given IFC in the current scene.
   *
   * @param {IfcCustomViewSettings} customViewSettings (optional) override the ifc elements file colors
   */
  setCustomViewSettings(customViewSettings) {
    this.viewsManager.setViewSettings(customViewSettings)
  }

  /**
   *
   * @param {Array} hits
   * @return {Array} results
   */
  async getSelectedElementsProps(hits) {
    const manager = this.IFC.loader.ifcManager
    // TODO: Update this to use the modelID
    const modelID = 0
    const results = []
    for (const expressID of hits) {
      const props = await this.IFC.getProperties(modelID, expressID, false, false)

      props.type = manager.getIfcType(modelID, expressID)

      results.push({modelID, expressID, props})
    }
    return results
  }

  /**
   *
   * @param {number} floorNumber
   * @return {Array} structure
   */
  async getByFloor(floorNumber) {
    // 1. get the full project hierarchy (includeProperties for Elevation)
    const manager = this.IFC.loader.ifcManager
    const structure = await manager.getSpatialStructure(0, true)
    const projectNode = Array.isArray(structure) ?
      structure[0] :
      structure
    if (!projectNode) {
      console.warn('No project node found in spatial structure')
      return []
    }

    // helper: pull out every IfcBuildingStorey node
    /**
     * @param {object} node
     * @param {Array} out
     * @return {Array} storeys
     */
    function collectStoreys(node, out = []) {
      if (node.type === 'IFCBUILDINGSTOREY') {
        out.push(node)
      }
      for (const c of node.children || []) {
        collectStoreys(c, out)
      }
      return out
    }

    // 2. extract & sort by Elevation
    const storeys = collectStoreys(projectNode)
      .map((s) => ({
        id: s.expressID,
        elev: Number(s.properties?.Elevation?.value ?? 0),
        node: s,
      }))
      .sort((a, b) => a.elev - b.elev)

    // 3. pick the requested floor (1-indexed)
    const idx = floorNumber - 1
    if (idx < 0 || idx >= storeys.length) {
      console.warn(`Floor ${floorNumber} out of range (1–${storeys.length})`)
      return []
    }
    const floorNode = storeys[idx].node

    // 4. collect all expressIDs under this storey via node.children
    /**
     * @param {object} node
     * @param {Array} out
     * @return {Array} elements
     */
    function collectElements(node) {
      const out = [];
      (node.children || []).forEach((child) => {
        // grab the ID of this child
        if (typeof child.expressID === 'number') {
          out.push(child.expressID)
        }
        // recurse into its children
        out.push(...collectElements(child))
      })
      return out
    }

    // 4. get every element on that floor
    const elementIDs = collectElements(floorNode)


    return elementIDs
  }

  /**
   * Loads the given IFC in the current scene.
   *
   * @param {string} url IFC as URL.
   * @param {boolean} fitToFrame (optional) if true, brings the perspectiveCamera to the loaded IFC.
   * @param {Function} onProgress (optional) a callback function to report on downloading progress
   * @param {Function} onError (optional) a callback function to report on loading errors
   * @param {IfcCustomViewSettings} customViewSettings (optional) override the ifc elements file colors
   * @return {IfcModel} ifcModel object
   */
  async loadIfcUrl(url, fitToFrame, onProgress, onError, customViewSettings) {
    this.viewsManager.setViewSettings(customViewSettings)
    return await this.IFC.loadIfcUrl(url, fitToFrame, onProgress, onError)
  }

  /**
   * Loads the given IFC in the current scene.
   *
   * @param {string} file IFC as File.
   * @param {boolean} fitToFrame (optional) if true, brings the perspectiveCamera to the loaded IFC.
   * @param {Function} onError (optional) a callback function to report on loading errors
   * @param {IfcCustomViewSettings} customViewSettings (optional) override the ifc elements file colors
   * @return {IfcModel} ifcModel object
   */
  async loadIfcFile(file, fitToFrame, onError, customViewSettings) {
    this.viewsManager.setViewSettings(customViewSettings)
    return await this.IFC.loadIfc(file, fitToFrame, onError)
  }

  /**
   * Gets the expressId of the element that the mouse is pointing at
   *
   * @return {object} the expressId of the element and modelId
   */
  castRayToIfcScene() {
    const found = this.context.castRayIfc()
    if (!found) {
      return null
    }
    const id = this.getPickedItemId(found)
    return {modelID: found.object.modelID, id}
  }

  /**
   * gets a copy of the current selected expressIds in the scene
   *
   * @return {number[]} the selected express ids in the scene
   */
  getSelectedIds = () => [...this._selectedExpressIds]


  /**
   * sets the current selected expressIds in the scene
   *
   * @param {number} modelID
   * @param {number[]} expressIds express Ids of the elements
   * @param {boolean} focusSelection Whether to focus on selection
   */
  async setSelection(modelID, expressIds, focusSelection) {
    const model = this._modelById(modelID)
    if (!modelHasCapability(model, 'expressIdPicking')) {
      debug().warn('setSelection: model does not support expressIdPicking')
      return
    }
    this._selectedExpressIds = expressIds
    const toBeSelected = this._selectedExpressIds.filter((id) => this.isolator.canBePickedInScene(id))
    if (typeof focusSelection === 'undefined') {
      // if not specified, only focus on item if it was the first one to be selected
      focusSelection = toBeSelected.length === 1
    }
    if (toBeSelected.length === 0) {
      this.highlighter.setHighlighted(null)
      if (modelHasCapability(model, 'ifcSubsets')) {
        this.IFC.selector.unpickIfcItems()
      } else if (typeof model.removeSubset === 'function') {
        model.removeSubset('selection')
      }
      return
    }
    try {
      debug().log('ShareViewer#setSelection, with Array<toBeSelected>: ', toBeSelected)
      if (modelHasCapability(model, 'ifcSubsets')) {
        // Real-IFC path: web-ifc-three holds the parser state needed
        // by createSubset / SubsetCreator.
        const focusSelection2 = false // TODO(pablo): this was hardcoded as false below; why not using above
        const removePrevious = true
        await this.IFC.selector.pickIfcItemsByID(modelID, toBeSelected, focusSelection2, removePrevious)
        debug().log('ShareViewer#setSelection, meshes: ', this.IFC.selector.selection.meshes)
        this.highlighter.setHighlighted(this.IFC.selector.selection.meshes)
      } else {
        // Per-vertex-element-ID path (today: cache-hit GLB). The model
        // owns `createSubset` (attached by attachElementSubsets at load
        // time) and synthesises the subset Mesh from the in-memory
        // per-vertex attribute. No web-ifc-three parser state required.
        //
        // Pass the legacy `selector.selection.material` so the
        // synthetic subset renders the same translucent theme-blue
        // overlay the IFC path does (CadView.jsx replaces the fork's
        // magenta defaults at viewer init). Without an explicit
        // material the subset reuses the source mesh's material — same
        // color, same opacity → no visible overlay, only the
        // OutlineEffect contributes.
        const subsetMeshes = model.createSubset({
          ids: toBeSelected,
          customID: 'selection',
          removePrevious: true,
          material: this.IFC.selector?.selection?.material,
        })
        const triCount = subsetMeshes.reduce(
          (n, m) => n + ((m.geometry?.getIndex()?.count ?? 0) / 3), 0)
        // eslint-disable-next-line no-console
        console.info(
          `[glb] picker: selection ids=${JSON.stringify(toBeSelected)} → ` +
          `${subsetMeshes.length} subset mesh(es), ${triCount} triangle(s)`)
        debug().log('ShareViewer#setSelection, subset meshes:', subsetMeshes)
        this.highlighter.setHighlighted(subsetMeshes)
      }
    } catch (e) {
      console.warn('selection failure', e)
      debug().error('ShareViewer#setSelection$onError: ', e)
    }
  }


  /**
   * Look up a registered model by modelID. Today the viewer holds
   * at most one model and call-sites always pass `0`; we still index
   * for symmetry with the underlying `ifcModels` array.
   *
   * @param {number} modelID
   * @return {object|null}
   * @private
   */
  _modelById(modelID) {
    const models = this.IFC?.context?.items?.ifcModels
    if (!Array.isArray(models)) {
      return null
    }
    return models[modelID] ?? null
  }


  /**
   * Highlights the item pointed by the cursor.
   *
   */
  async highlightIfcItem() {
    const found = this.context.castRayIfc()
    if (!found) {
      this.IFC.selector.preselection.toggleVisibility(false)
      this._clearPreselectionForAllModels()
      return
    }
    const id = this.getPickedItemId(found)
    if ((id === null || id === undefined) || !this.isolator.canBePickedInScene(id)) {
      return
    }
    const model = this._modelForPickedObject(found.object)
    if (!modelHasCapability(model, 'expressIdPicking')) {
      return
    }
    if (modelHasCapability(model, 'ifcSubsets')) {
      // Real-IFC path: web-ifc-three's preselection.pick handles
      // subset construction.
      await this.IFC.selector.preselection.pick(found)
      this.highlightPreselection()
    } else if (typeof model.createSubset === 'function') {
      // Per-vertex-element-ID path: synthesise a preselection
      // subset from the per-vertex attribute. The `'preselection'`
      // customID slot replaces the previous one each call, matching
      // IfcSelector.preselection semantics (hover replaces).
      //
      // Pass selector.preselection.material — the theme-blue
      // translucent overlay CadView installs at viewer init.
      // Without it the subset reuses the source material and no
      // visible overlay shows (only the outline edges).
      const subsetMeshes = model.createSubset({
        ids: [id],
        customID: 'preselection',
        removePrevious: true,
        material: this.IFC.selector?.preselection?.material,
      })
      for (const mesh of subsetMeshes) {
        this.highlighter.addToHighlighting(mesh)
      }
    }
  }


  /**
   * Drop any per-model preselection subset when the cursor leaves
   * all geometry. Mirrors what `IFC.selector.preselection.toggleVisibility(false)`
   * does for the real-IFC path — preselection is hover-only and
   * should not linger off-model.
   *
   * @private
   */
  _clearPreselectionForAllModels() {
    const models = this.IFC?.context?.items?.ifcModels
    if (!Array.isArray(models)) {
      return
    }
    for (const m of models) {
      if (typeof m?.removeSubset === 'function') {
        m.removeSubset('preselection')
      }
    }
  }


  /**
   * Walk a picked Object3D's ancestor chain to find the registered
   * model it belongs to. Necessary because the raycast hit gives us
   * a leaf Mesh, but capabilities live on the model root.
   *
   * @param {object} pickedObject
   * @return {object|null}
   * @private
   */
  _modelForPickedObject(pickedObject) {
    const models = this.IFC?.context?.items?.ifcModels
    if (!Array.isArray(models) || models.length === 0 || !pickedObject) {
      return null
    }
    const modelSet = new Set(models)
    let cursor = pickedObject
    while (cursor) {
      if (modelSet.has(cursor)) {
        return cursor
      }
      cursor = cursor.parent
    }
    // Fallback: single-model case (the common case today).
    return models[0] ?? null
  }


  /**
   * applies Preselection effect on an Element by Id
   *
   * @param {number} modelId
   * @param {number[]} expressIds express Ids of the elements
   */
  async preselectElementsByIds(modelId, expressIds) {
    const filteredIds = expressIds.filter((id) => this.isolator.canBePickedInScene(id)).map((a) => parseInt(a))
    debug().log('ShareViewer#preselectElementsByIds, filteredIds:', filteredIds)
    if (filteredIds.length) {
      await this.IFC.selector.preselection.pickByID(modelId, filteredIds, false, true)
      this.highlightPreselection()
    }
  }

  /**
   * adds the highlighting (outline effect) to the currently preselected element in the viewer
   */
  highlightPreselection() {
    // Deconstruct the preselection meshes set to get the first element in set
    // The preselection set always contains only one element or none
    const [targetMesh] = this.IFC.selector.preselection.meshes
    this.highlighter.addToHighlighting(targetMesh)
  }


  /** @param {Mesh} mesh */
  addToHighlighting(mesh) {
    this.highlighter.addToHighlighting(mesh)
  }


  /** @param {Array<Mesh>} meshes */
  setHighlighted(meshes) {
    this.highlighter.setHighlighted(meshes)
  }


  /**
   * Highlights the item pointed by the cursor.
   *
   * @param {object} picked item
   * @return {number} element id
   */
  getPickedItemId(picked) {
    const mesh = picked.object
    if (!areDefinedAndNotNull(mesh.geometry, picked.faceIndex)) {
      return null
    }
    const ifcManager = this.IFC
    return ifcManager.loader.ifcManager.getExpressId(mesh.geometry, picked.faceIndex)
  }


  /**
   * Uses the internal renderer to take a screenshot of the current scene.
   *
   * The image may be fetched to bytes with:
   *
   *   const res = await fetch(dataURI)
   *   const img = await res.blob()
   *
   * @return {string}
   */
  takeScreenshot() {
    // newScreenshot() lives on the fork's IfcRenderer wrapper (it spins up
    // an offscreen WebGLRenderer). It is not on the underlying WebGLRenderer
    // that getRenderer() returns. Will be inlined into ShareViewer when
    // the fork's IfcRenderer is dropped (§3a, Phase 5).
    return this.context.getLegacyRendererWrapper().newScreenshot()
  }
}
