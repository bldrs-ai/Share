// Slice 5d.4 removed the `web-ifc-viewer` fork: the IFC namespace
// (`this.IFC`) is now the in-repo Conway-backed `ShareIfc`, so no bare
// fork import remains. The Jest harness registers its sub-mocks
// (`./ifc/ShareIfc`, `./three/context`, IfcHighlighter, …) from the test
// files that import it before the component under test — see
// `__mocks__/shareViewerTestHarness.js` for the load-order rationale.
import {BufferAttribute, BufferGeometry, ColorManagement, LinearSRGBColorSpace, Mesh} from 'three'
import IfcViewsManager from '../Infrastructure/IfcElementsStyleManager'
import IfcCustomViewSettings from '../Infrastructure/IfcCustomViewSettings'
import Clipper from './three/Clipper'
import IfcHighlighter from './three/IfcHighlighter'
import IfcIsolator from './three/IfcIsolator'
import CustomPostProcessor from './three/CustomPostProcessor'
import Selector from './three/Selector'
import ShareIfcLoader from './ifc/ShareIfcLoader'
import ShareIfc from './ifc/ShareIfc'
import {IfcContext} from './three/context'
import ThreeContext from './three/ThreeContext'
import debug from '../utils/debug'
import {modelHasCapability} from './ShareModel'


// Minimum index-buffer capacity for the preselection pool. 256 u32
// entries ≈ 85 triangles — covers the vast majority of single-
// PlacedGeometry instances without growing the buffer on first hover.
const MIN_PRESELECTION_INDEX_CAP = 256


/**
 * @param {number} n
 * @return {number} smallest power of 2 ≥ n.
 */
function nextPow2(n) {
  let p = 1
  while (p < n) {
    p <<= 1
  }
  return p
}
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
 * ShareViewer — the top-level viewer facade for Bldrs Share.
 *
 * Slice 5c flipped this from `extends IfcViewerAPI` to composition;
 * slice 5d.3 dropped the `new IfcViewerAPI()` call too. ShareViewer
 * now instantiates the three pieces it actually uses directly:
 *
 *   1. `IfcContext` — vendored at `src/viewer/three/context/` (was
 *      `web-ifc-viewer/dist/components/context/context.js`).
 *   2. `ShareIfc` — the in-repo Conway-backed IFC namespace (slice
 *      5d.4, replaced the fork's `IfcManager`). Constructs Conway's
 *      `IfcAPI` directly and exposes the `loader.ifcManager` /
 *      `selector` / `getProperties` / `addIfcModel` surface live code
 *      reads off `this.IFC`. Dropping it removed the last
 *      `web-ifc-viewer` import.
 *
 * Clipping no longer touches the fork — slice 5d.2 routed every model
 * (IFC + GLB) through the in-repo `MeshClipper` behind `this.clipper`.
 *
 * Property surface (stable since slice 5c):
 *   - `this.IFC` — in-repo `ShareIfc` (Conway-backed IFC namespace)
 *   - `this.context` — ThreeContext wrapping our vendored IfcContext
 *   - `this.clipper` — in-repo `Clipper` (MeshClipper-backed)
 *   - `this.selector` — local `Selector` facade over `IFC.selector`
 *   - `this.ifcLoader` — `ShareIfcLoader` (Conway-direct IFC parse)
 *   - `this.isolator`, `this.highlighter`, `this.postProcessor`,
 *     `this.viewsManager` — local plugins constructed here.
 */
export class ShareViewer {
  // TODO: might be useful if we used a Set as well to handle large selections,
  // but for now array is more performant for small numbers
  _selectedExpressIds = []
  // Conway-direct selection / preselection slots. Tracked as class
  // fields so the `_clearXxx` helpers don't need defensive
  // initialisation on first call. Mutated in place by the
  // `_setConwayXxxFrom*` helpers; the previous slot's subsets are
  // removed from scene + highlighter + disposed before the new ones
  // land. See §3b.ii of design/new/viewer-replacement.md.
  _conwaySelectionSubsets = []
  // Reusable preselection mesh pool — see `_setConwayPreselectionFromHit`.
  // Hover at interactive rates churns through subset meshes; the pool
  // keeps one Mesh/BufferGeometry/Uint32Array alive across calls and
  // updates the index buffer in place rather than allocating per hover.
  _conwayPreselectionPool = null
  /**
   * @param {object} options - Configuration options
   */
  constructor(options) {
    // Slice 5d.3: stop instantiating `new IfcViewerAPI(options)`. Build
    // the three pieces we actually need ourselves:
    //
    //   1. `IfcContext` — vendored at `src/viewer/three/context/`
    //      (was `web-ifc-viewer/dist/components/context/context.js`).
    //      Owns the render loop, scene, camera, renderer, mouse,
    //      raycaster, animator. Fork-side `IfcGrid` / `IfcAxes` /
    //      `PlanManager` / `SectionFillManager` / `IfcDimensions` /
    //      `Edges` / `ShadowDropper` / `EdgeProjector` / `DXFWriter` /
    //      `PDFWriter` / `GLTFManager` / `SelectionWindow` — built but
    //      unused before — are gone from the bundle.
    //   2. `ShareIfc` — in-repo Conway-backed IFC namespace (slice 5d.4,
    //      was the fork's `IfcManager`). Holds `IFC.loader.ifcManager`
    //      (a `ShareIfcManager` over Conway's IfcAPI), a material-slot
    //      `IFC.selector`, plus `getProperties` / `addIfcModel` /
    //      `setWasmPath` / `dispose`. No `web-ifc-viewer` import remains.
    //
    // Slice 5d.2 dropped the fork's `IfcClipper`: clipping now runs
    // through the in-repo `MeshClipper` (via `this.clipper`), so the
    // Q/W shortcut + drag UX no longer depend on the fork.
    //
    // ThreeContext continues to wrap IfcContext (the consumer-facing
    // surface — `getScene`, `getCameraControls`, `getNormalizedMouse…`,
    // `setRenderUpdate`, …); only what it wraps changed (was fork
    // node_modules IfcContext, now our vendored copy).
    const ifcContext = new IfcContext(options)
    this.context = new ThreeContext(ifcContext)
    // Slice 5d.4: in-repo Conway-backed IFC namespace (was the fork's
    // `IfcManager` via `makeForkIfc(ifcContext)`).
    this.IFC = new ShareIfc(ifcContext)
    // Install `ShareIfcLoader` at the top-level `viewer.ifcLoader` slot
    // (slice 5d.1). It owns the Conway-direct `parse(buffer)` entry point
    // `Loader.js#findLoader` reads for `case 'ifc'`, and shares ShareIfc's
    // Conway IfcAPI handle (`viewer.IFC.loader.ifcManager.ifcAPI`). Kept
    // distinct from `viewer.IFC.loader` — which since 5d.4 is ShareIfc's
    // own `ShareIfcManager` (Conway-backed), not a wit-three IFCLoader.
    const conwayIfcAPI = this.IFC.loader?.ifcManager?.ifcAPI
    if (conwayIfcAPI) {
      this.ifcLoader = new ShareIfcLoader({ifcAPI: conwayIfcAPI, ifc: this.IFC})
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
    // Selector — §3c.iv facade over `IFC.selector`. Every call-site that
    // poked at `viewer.IFC.selector.X` routes through `viewer.selector.X`.
    // Since 5d.4 the backing `IFC.selector` is ShareIfc's material-slot
    // stub (the live remnant of the fork selector — the two shared
    // overlay materials); picking runs through IfcInstanceMap. Phase 5's
    // IfcModelService-backed `Selection` plugin is the destination.
    this.selector = new Selector(this.IFC?.selector)
    // Clipper — the in-repo cut-plane plugin. Slice 5d.2 dropped the
    // fork's `IfcClipper`; every model (IFC + GLB) now clips through the
    // single `MeshClipper` this facade builds per `setModel`. Call-sites
    // call `viewer.clipper.X` and never branch on model type.
    this.clipper = new Clipper(this)
    this.viewsManager = new IfcViewsManager(this.IFC.loader.ifcManager.parser, viewRules[viewParameter])
  }


  /**
   * Tear down the composed viewer.
   *
   * Order matters: local plugins first (they hold direct refs to the
   * fork's scene / IFC manager and would crash if those die first),
   * then delegate to `_fork.dispose()` for IfcContext + IfcManager
   * teardown (renderer.dispose, scene.dispose, IFC.dispose). The
   * grid/axes/GLTF/etc. dispose chain inside the fork is no-op for our
   * usage but cheap to leave running.
   *
   * `Containers/viewer.js#disposeViewer` already handles scene-traversal
   * + renderer.forceContextLoss before calling this method; we don't
   * double up on that work here.
   *
   * @return {Promise<void>}
   */
  async dispose() {
    // Local plugins. Each is null-safe individually so partial-init
    // teardown (e.g. constructor throw mid-build) still works.
    try {
      this.viewsManager?.dispose?.()
    } catch (e) {
      console.warn('viewsManager.dispose failed:', e)
    }
    try {
      this.isolator?.dispose?.()
    } catch (e) {
      console.warn('isolator.dispose failed:', e)
    }
    try {
      this.highlighter?.dispose?.()
    } catch (e) {
      console.warn('highlighter.dispose failed:', e)
    }
    try {
      this.postProcessor?.dispose?.()
    } catch (e) {
      console.warn('postProcessor.dispose failed:', e)
    }
    // Clipper.dispose tears down the bound MeshClipper (its arrows +
    // canvas listeners). Idempotent, so the viewer.js disposeViewer
    // call and this one don't conflict.
    try {
      this.clipper?.dispose?.()
    } catch (e) {
      console.warn('clipper.dispose failed:', e)
    }
    // Slice 5d.3: with `new IfcViewerAPI(options)` gone, there's no
    // composite-viewer dispose to delegate to. Tear down the pieces we
    // own directly (the clipper was already disposed just above).
    if (this.IFC) {
      try {
        await this.IFC.dispose?.()
      } catch (e) {
        console.warn('IFC.dispose failed:', e)
      }
    }
    if (this.context) {
      try {
        this.context.dispose?.()
      } catch (e) {
        console.warn('context.dispose failed:', e)
      }
    }
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
   * Fetch item properties. Carries over the deprecated convenience
   * method from `IfcViewerAPI.getProperties` — `extends IfcViewerAPI`
   * used to inherit this; post-slice-5c composition we re-publish it
   * here so call-sites (`CadView.jsx#convertElement`) don't churn.
   *
   * @param {number} modelID
   * @param {number} id Express ID.
   * @param {boolean} [indirect] If true, also returns psets, qsets and type properties.
   * @param {boolean} [recursive]
   * @return {Promise<any>}
   */
  getProperties(modelID, id, indirect, recursive) {
    return this.IFC.getProperties(modelID, id, indirect, recursive)
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
      this._clearConwaySelectionSubsets()
      if (modelHasCapability(model, 'ifcSubsets')) {
        this.selector.unpick()
      } else if (typeof model.removeSubset === 'function') {
        model.removeSubset('selection')
      }
      return
    }
    try {
      debug().log('ShareViewer#setSelection, with Array<toBeSelected>: ', toBeSelected)
      if (modelHasCapability(model, 'instancePicking')) {
        // Conway-direct path: build the highlight from per-Mesh
        // IfcInstanceMaps. Parent-level subset — every PlacedGeometry
        // instance of each requested IFC product across every child
        // Mesh. The `setInstanceSelection` method called afterwards
        // by the click handler overrides this with a one-instance
        // subset when `selectedInstanceIds` is non-empty; the parent-
        // level mesh produced here is the right default (nav-tree
        // selection, search-result selection, Shift-click).
        //
        // Traversal handles both cache-miss (single Mesh = ifcModel)
        // and cache-hit (Group containing N child Meshes per material
        // group); each Mesh's instanceMap is built against its own
        // geometry, so subsets are constructed per-mesh too. The
        // parented-into-scene step is what makes the translucent x-ray
        // overlay actually render — OutlineEffect alone only draws
        // edges.
        this._setConwaySelectionFromModel(model, (mesh) =>
          mesh.instanceMap.createSubsetMeshByParent(toBeSelected, {
            material: this.selector.getSelectionMaterial(),
          }))
      } else if (modelHasCapability(model, 'ifcSubsets')) {
        // Real-IFC path: web-ifc-three holds the parser state needed
        // by createSubset / SubsetCreator.
        const focusSelection2 = false // TODO(pablo): this was hardcoded as false below; why not using above
        const removePrevious = true
        await this.selector.pickByIds(modelID, toBeSelected, focusSelection2, removePrevious)
        debug().log('ShareViewer#setSelection, meshes: ', this.selector.getSelectionMeshes())
        this.highlighter.setHighlighted(this.selector.getSelectionMeshes())
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
          material: this.selector.getSelectionMaterial(),
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
   * Per-instance highlight using the model's `IfcInstanceMap`.
   * Called from `CadView`'s selection useEffect alongside
   * `setSelection` when the user clicks a specific PlacedGeometry
   * (default behavior on the Conway-direct path). The highlight
   * covers ONE visible placement of an IFC product rather than every
   * instance of it — the IfcMappedItem case the parity probe
   * surfaced.
   *
   * Properties / nav tree / search still track the parent IFC
   * product through `setSelection`'s `expressIds` argument; this
   * method only changes what the OutlineEffect renders.
   *
   * Pass `instanceIds = []` to clear the per-instance highlight
   * without touching parent-level selection.
   *
   * @param {number} modelID
   * @param {number[]} instanceIds synthetic IfcInstanceMap IDs
   */
  setInstanceSelection(modelID, instanceIds) {
    const model = this._modelById(modelID)
    if (!modelHasCapability(model, 'instancePicking')) {
      debug().warn('setInstanceSelection: model lacks instancePicking capability')
      return
    }
    if (!Array.isArray(instanceIds) || instanceIds.length === 0) {
      // Caller asked for "no per-instance highlight." Don't touch the
      // highlighter — `setSelection` is the source of truth for
      // parent-level highlight and will have run alongside this
      // method.
      return
    }
    // Traverse per-Mesh instanceMaps. Cache-miss is the degenerate
    // single-Mesh case; cache-hit has N child Meshes per material
    // group, instance IDs are globally unique across them
    // (GLTFExporter preserves attribute values verbatim through the
    // split) so we just build a subset from every Mesh whose map
    // covers any of the requested instance IDs.
    this._setConwaySelectionFromModel(model, (mesh) =>
      mesh.instanceMap.createSubsetMeshByInstance(instanceIds, {
        material: this.selector.getSelectionMaterial(),
      }))
  }


  /**
   * Traverse a Conway-direct model, build a subset Mesh from every
   * child Mesh's `instanceMap` via `buildSubset(mesh)`, parent each
   * subset under the corresponding source mesh's parent (so the
   * subset inherits the model's world transform), track the set so
   * the next selection can remove them, and install the array as the
   * highlighter's selection. Empty array → highlight cleared.
   *
   * Parenting matters: the highlighter's OutlineEffect only draws
   * edges; the translucent x-ray fill comes from the subset Mesh
   * actually being in the scene tree (rendered as a regular Mesh
   * with the selection material's `transparent + opacity`). Without
   * this step, clicks update selection state but no overlay shows.
   *
   * Mirrors what `attachElementSubsets`'s `createSubset` does for the
   * legacy per-vertex GLB-cache path (elementSubsets.js:329) — same
   * parent-under-source-parent dance + customID slot management,
   * specialised here to the Conway-direct call site instead of being
   * attached as a model method (we don't replace `model.createSubset`
   * because the isolator binds to web-ifc-three's stock version).
   *
   * @param {object} model top-level Object3D (may itself be a Mesh)
   * @param {Function} buildSubset
   *   `mesh` → Mesh|null. Returns the subset Mesh for this child, or
   *   null when the child contributes nothing to the selection.
   * @private
   */
  _setConwaySelectionFromModel(model, buildSubset) {
    this._clearConwaySelectionSubsets()
    const subsets = []
    model.traverse((obj) => {
      if (!obj.isMesh || !obj.instanceMap) {
        return
      }
      const subset = buildSubset(obj)
      if (!subset) {
        return
      }
      const parent = obj.parent ?? this.context.getScene()
      parent.add(subset)
      subset.userData.sourceMesh = obj
      subsets.push(subset)
    })
    this._conwaySelectionSubsets = subsets
    this.highlighter.setHighlighted(subsets.length > 0 ? subsets : null)
  }


  /**
   * Remove the tracked Conway-direct selection subsets from their
   * parents and dispose their per-subset index buffers. Vertex
   * attribute buffers are shared with the source meshes — never
   * disposed here.
   *
   * @private
   */
  _clearConwaySelectionSubsets() {
    if (!this._conwaySelectionSubsets || this._conwaySelectionSubsets.length === 0) {
      this._conwaySelectionSubsets = []
      return
    }
    for (const m of this._conwaySelectionSubsets) {
      m.removeFromParent()
      const subsetGeom = m.geometry
      if (subsetGeom && subsetGeom !== m.userData.sourceMesh?.geometry) {
        subsetGeom.dispose?.()
      }
    }
    this._conwaySelectionSubsets = []
  }


  /**
   * Install a per-instance preselection (hover) subset against the
   * Conway-direct model. Two essential differences from the selection
   * helper:
   *
   *   1. **One mesh, one instance.** Hover always resolves to a single
   *      face → single PlacedGeometry instance, so we build just one
   *      subset from the picked Mesh's own `instanceMap` (no model-
   *      wide traversal — the cache-hit case still works because the
   *      hovered Mesh is one of the per-material child Meshes, and
   *      its map covers exactly the instances in its triangle subset).
   *
   *   2. **Adds, doesn't replace.** The highlighter holds *both* the
   *      selection set and the preselection at once; the user sees the
   *      selected element outlined alongside whatever they're hovering
   *      over. So we `addToHighlighting(subset)` rather than
   *      `setHighlighted([subset])` — replacing would clobber the
   *      selection-level highlights.
   *
   * **Pooling.** A naïve implementation allocates a fresh
   * `BufferGeometry` + `Uint32Array` + `Mesh` per call, which at
   * interactive mouse-move rates on big models (Snowdon, 25k+
   * PlacedGeometries) makes hover visibly stutter from GC pressure.
   * Instead we keep a single `Mesh` alive in `_conwayPreselectionPool`
   * and update its index buffer in place:
   *
   *   - Index buffer grows on demand to the largest instance seen so
   *     far (rounded to a power of two so we don't re-allocate on
   *     every adjacent instance click).
   *   - Vertex attributes are reassigned per hover (cheap reference
   *     copy) so the pool can serve any child Mesh on a cache-hit
   *     multi-Mesh model.
   *   - Parent re-attach only happens when the hovered Mesh's parent
   *     actually changed (within one child Mesh this is a no-op).
   *   - `addToHighlighting` is called once per show; subsequent
   *     hovers leave the pool in the OutlineEffect's selection set.
   *   - Hide path sets `mesh.visible = false` and prunes the
   *     highlighter; nothing is disposed, so the next hover skips
   *     allocation entirely in steady state.
   *
   * The pool object is initialised lazily on first hover so models
   * that never engage `instancePicking` pay nothing.
   *
   * @param {object} pickedMesh the Mesh under the cursor
   * @param {number} faceIndex triangle index from the raycaster hit
   * @private
   */
  _setConwayPreselectionFromHit(pickedMesh, faceIndex) {
    if (!pickedMesh?.instanceMap) {
      this._clearConwayPreselectionSubsets()
      return
    }
    const instanceId = pickedMesh.instanceMap.getInstanceIdByTriangle(faceIndex)
    if (instanceId === null) {
      this._clearConwayPreselectionSubsets()
      return
    }
    const tris = pickedMesh.instanceMap.instanceIdToTriangleIndices.get(instanceId)
    if (!tris || tris.length === 0) {
      this._clearConwayPreselectionSubsets()
      return
    }
    const srcGeom = pickedMesh.geometry
    const srcIndex = srcGeom?.getIndex()
    if (!srcGeom || !srcIndex) {
      this._clearConwayPreselectionSubsets()
      return
    }
    const srcIndexArr = srcIndex.array
    const needed = tris.length * 3

    const pool = this._ensureConwayPreselectionPool(needed)

    // Fill the index buffer in place. Writing past `needed` is
    // harmless since `setDrawRange` below caps the rendered count.
    const dstArr = pool.indexArray
    let w = 0
    for (let i = 0; i < tris.length; i++) {
      const t = tris[i]
      const base = t * 3
      dstArr[w++] = srcIndexArr[base]
      dstArr[w++] = srcIndexArr[base + 1]
      dstArr[w++] = srcIndexArr[base + 2]
    }
    pool.indexAttribute.needsUpdate = true

    // Reassign vertex attributes from the source. Cheap reference
    // copies — the underlying typed arrays are already on the GPU,
    // so this doesn't trigger re-upload. Only iterates when the
    // source actually changed (cache-hit multi-Mesh hover moves
    // between primitives).
    if (pool.attributeSource !== srcGeom) {
      const dstGeom = pool.geometry
      for (const name of Object.keys(srcGeom.attributes)) {
        dstGeom.setAttribute(name, srcGeom.attributes[name])
      }
      pool.attributeSource = srcGeom
    }

    pool.geometry.setDrawRange(0, needed)

    // Re-parent only when the hovered Mesh's parent changed. Avoids
    // scene-graph churn while hovering within one child Mesh.
    const parent = pickedMesh.parent ?? this.context.getScene()
    if (pool.mesh.parent !== parent) {
      pool.mesh.removeFromParent()
      parent.add(pool.mesh)
    }
    pool.mesh.userData.sourceMesh = pickedMesh
    pool.mesh.visible = true

    if (!pool.inHighlighter) {
      this.highlighter.addToHighlighting(pool.mesh)
      pool.inHighlighter = true
    }
  }


  /**
   * Lazy-init / grow the preselection mesh pool. Returns the live
   * pool object. Called by `_setConwayPreselectionFromHit` immediately
   * before each fill; the `neededIndexLen` arg drives the growth
   * policy (round-up to a power of 2 keeps reallocs sparse across a
   * model's normal range of instance triangle counts).
   *
   * @param {number} neededIndexLen
   * @return {object} the pool — `{mesh, geometry, indexArray, indexAttribute, inHighlighter, attributeSource}`
   * @private
   */
  _ensureConwayPreselectionPool(neededIndexLen) {
    let pool = this._conwayPreselectionPool
    if (!pool) {
      const geometry = new BufferGeometry()
      const mesh = new Mesh(geometry, this.selector.getPreselectionMaterial())
      // The pool sits in the scene tree once a hover lands it there.
      // Without raycast-invisible the pool would compete with source
      // meshes for picks (it's geometrically coplanar with whichever
      // instance it's currently visualising).
      mesh.raycast = () => {/* raycast-invisible — see IfcInstanceMap subset */}
      mesh.visible = false
      mesh.userData.isConwayPreselectionPool = true
      pool = {
        mesh,
        geometry,
        indexArray: null,
        indexAttribute: null,
        attributeSource: null,
        inHighlighter: false,
      }
      this._conwayPreselectionPool = pool
    }
    // Grow if needed. Round up to the next power of 2 so adjacent
    // hovers of slightly-different instance sizes reuse the same
    // buffer without reallocation.
    if (!pool.indexArray || pool.indexArray.length < neededIndexLen) {
      const cap = nextPow2(Math.max(neededIndexLen, MIN_PRESELECTION_INDEX_CAP))
      pool.indexArray = new Uint32Array(cap)
      pool.indexAttribute = new BufferAttribute(pool.indexArray, 1)
      pool.geometry.setIndex(pool.indexAttribute)
    }
    return pool
  }


  /**
   * Hide the preselection pool. Sets `mesh.visible = false`, prunes
   * the highlighter, leaves the pool's GPU buffers alone so the next
   * hover is allocation-free. Idempotent.
   *
   * Named `_clearConwayPreselectionSubsets` (plural) for symmetry
   * with the older pluggable-tracker callers — kept stable so the
   * `_clearPreselectionForAllModels` site doesn't need to change.
   *
   * @private
   */
  _clearConwayPreselectionSubsets() {
    const pool = this._conwayPreselectionPool
    if (!pool) {
      return
    }
    if (pool.inHighlighter) {
      this.highlighter.removeFromHighlighting(pool.mesh)
      pool.inHighlighter = false
    }
    pool.mesh.visible = false
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
      this.selector.togglePreselectionVisibility(false)
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
    if (modelHasCapability(model, 'instancePicking')) {
      // Conway-direct path: per-instance preselection. Resolves the
      // raycaster hit's faceIndex through the picked Mesh's own
      // `instanceMap` to find the exact PlacedGeometry under the
      // cursor, then highlights just its triangles. Matches the click
      // handler's no-shift semantic — hover preview should match what
      // a click would select.
      this._setConwayPreselectionFromHit(found.object, found.faceIndex)
    } else if (modelHasCapability(model, 'ifcSubsets')) {
      // Real-IFC path: web-ifc-three's preselection.pick handles
      // subset construction.
      await this.selector.preselectFromPick(found)
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
        material: this.selector.getPreselectionMaterial(),
      })
      for (const mesh of subsetMeshes) {
        this.highlighter.addToHighlighting(mesh)
      }
    }
  }


  /**
   * Drop any per-model preselection subset when the cursor leaves
   * all geometry. Mirrors what `selector.togglePreselectionVisibility(false)`
   * does for the real-IFC path — preselection is hover-only and
   * should not linger off-model.
   *
   * @private
   */
  _clearPreselectionForAllModels() {
    // Conway-direct preselection lives on the viewer (a single tracker
    // slot, not on each model) — clear it before walking models for
    // the legacy per-vertex subset removal. Cheap no-op when the slot
    // is empty / the flag isn't on.
    //
    // TODO(preselection-routing): the two clears are independent today
    // (different storage), but if Conway-direct models eventually also
    // gain a per-model `removeSubset('preselection')` (e.g. via the
    // isolate-routing follow-up that unifies subset construction —
    // viewer-replacement.md §3b.iii item 1), the order will matter.
    // The Conway path takes precedence on `instancePicking` models, so
    // it clears first; the IFC-model walk is a no-op then. Worth
    // revisiting once the unified subset API lands so this routing
    // logic stays in one place instead of being split between
    // ShareViewer (Conway) and each model's `removeSubset` (legacy).
    this._clearConwayPreselectionSubsets()
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
      await this.selector.preselectByIds(modelId, filteredIds, false, true)
      this.highlightPreselection()
    }
  }

  /**
   * adds the highlighting (outline effect) to the currently preselected element in the viewer
   */
  highlightPreselection() {
    // Deconstruct the preselection meshes set to get the first element in set
    // The preselection set always contains only one element or none
    const [targetMesh] = this.selector.getPreselectionMeshes()
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
