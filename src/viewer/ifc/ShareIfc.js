// ShareIfc — in-repo replacement for the `web-ifc-viewer` fork's
// `IfcManager`, the last fork construct ShareViewer instantiated.
// Slice 5d.4 of design/new/viewer-replacement.md Phase 5 — replaces
// `forkIfcComposition.makeForkIfc(ifcContext)`.
//
// What the fork's IfcManager bundled, and why almost none of it
// survives on the Conway-direct default path (flag `conwayDirectIfc`,
// default-on):
//   - a web-ifc-three `IFCLoader` whose nested `web-ifc` `IfcAPI` was
//     esbuild-aliased to Conway. IFC parsing now runs through
//     `viewer.ifcLoader` (`ShareIfcLoader`, slice 5d.1) — NOT
//     `viewer.IFC.loader` — so the wit-three loader is dead weight.
//   - an `IfcSelector` (web-ifc-three subset highlighting). Selection /
//     preselection for `instancePicking` models is driven by per-mesh
//     `IfcInstanceMap` in ShareViewer; the only live remnant is the two
//     shared overlay *materials* the subset builders read. So the
//     `selector` here is a material-slot stub, not a picker (see
//     `makeMaterialSlotSelector`).
//   - `IfcUnits` — no consumer reads `viewer.IFC.units` (confirmed by
//     the §5d.4 consumption sweep); dropped.
//   - `IfcProperties` — property reads route through Conway
//     (`ifcAPI.properties.*`) via `ShareIfcManager` / the per-model
//     closures `decorateConwayDirectIfcModel` attaches.
//
// So this class is a thin Conway-backed surface exposing exactly what
// live code reads off `viewer.IFC`: `engine` (the viewer's ConwayEngine),
// `loader.ifcManager` (accessors over that engine's Conway object, for the
// GLB cache hits and mesh models that share it), a material-slot `selector`,
// `getProperties`, `addIfcModel`, `setWasmPath`, `dispose`, `context`,
// `type`, `ifcLastError`.
//
// The engine: one `ConwayEngine` (engine/ConwayEngine.js) per viewer build,
// constructed where this class constructed Conway's `IfcAPI` before slice 1a
// of design/tracks/open-t200/layering.md, with the same lifetime: idle on
// the worker route, and the engine a load parses into on the main-thread
// route (the kill switch). Slice 1b makes it a `mainThread` lease the engine
// host owns. ShareIfc is mocked in the ShareViewer test harness
// (`__mocks__/ShareViewer.js`), so no engine is constructed under Jest. The
// wasm `Init` is lazy (ConwayEngine#init, on the first open), so
// `setWasmPath` only records the path.

import {ConwayEngine} from '../../engine/ConwayEngine'
import ShareIfcManager from '../../engine/ShareIfcManager'
import {isSpaModelNavOn} from '../../utils/spaModelNavMode'
import {installBvhPatches} from '../../model/bvhPatch'


// three-mesh-bvh's accelerated raycasting, installed globally at module load
// as before the cut (model/bvhPatch.js says what each patch is for, and why
// nothing in the model installs it on import). Runs in production only:
// most Jest suites mock ShareIfc (ShareIfc.dispose.test.js imports it for
// real), so they keep running against unpatched three.
installBvhPatches()


/**
 * Build the material-slot `selector`. The fork's `IfcSelector` owned
 * subset construction on the legacy IFC path; on the Conway-direct
 * path the only thing read off `viewer.IFC.selector` is
 * `selection.material` / `preselection.material` (the theme-blue
 * translucent overlays both the instanceMap subset builder and the
 * legacy path share). The pick / preselect methods are dead —
 * `instancePicking` routes through `IfcInstanceMap` in ShareViewer —
 * so they're no-ops here rather than removed entirely, which keeps the
 * `Selector` facade's null-safe delegation a no-op (not a crash) if a
 * non-`instancePicking` model is ever loaded. The eventual
 * IfcModelService-backed Selection plugin (§3c) is the destination;
 * this stub just severs the fork dependency.
 *
 * @return {object} fork-`IfcSelector`-shaped material slot
 */
function makeMaterialSlotSelector() {
  const noop = () => undefined
  return {
    selection: {material: null, meshes: [], unpick: noop},
    preselection: {
      material: null,
      meshes: [],
      unpick: noop,
      pick: noop,
      pickByID: noop,
      toggleVisibility: noop,
    },
    pickIfcItemsByID: noop,
    unpickIfcItems: noop,
  }
}


/**
 * IFC namespace for ShareViewer (`viewer.IFC`). Conway-backed; replaces
 * the `web-ifc-viewer` fork `IfcManager`.
 */
export default class ShareIfc {
  /**
   * @param {object} context the vendored `IfcContext`
   *   (`src/viewer/three/context/`) — used by `addIfcModel` for the
   *   `items.{ifcModels,pickableIfcModels}` registries + `getScene()`.
   */
  constructor(context) {
    if (!context) {
      throw new Error('ShareIfc: context is required')
    }
    this.context = context
    // See the file header. Lazy-initialised by its first open.
    this.engine = new ConwayEngine()
    // `loader.ifcManager` is the shape consumers read:
    //   viewer.IFC.loader.ifcManager.{ifcAPI, state.models,
    //     getSpatialStructure, getIfcType, getItemProperties, ...}
    // `ShareIfcManager` (slice 5d.1) provides exactly this surface over
    // the engine's Conway object. A live IFC/STEP model reads through its own
    // `model.engine`; a GLB cache hit and a mesh model read through this.
    this.loader = {ifcManager: new ShareIfcManager(this.engine.ifcAPI)}
    this.selector = makeMaterialSlotSelector()
    // Canonical parse-error slot — `Loader.js` reads `viewer.IFC.ifcLastError`
    // and `ShareIfcLoader.parse` mirrors its writes here.
    this.ifcLastError = null
    // Legacy format discriminant `Loader.js` writes for non-IFC models
    // (`'glb'`, `'obj'`, …). Capability flags on `ShareModel` (§8.2) are
    // the real source of truth; this stays a writable slot for compat.
    this.type = undefined
    // Loads still parsing into this viewer (`ShareIfcLoader#parse`,
    // `trackEngineLoad`). A model joins `context.items.ifcModels` only once
    // its parse returns, so these are the engines `dispose` would otherwise
    // miss (open-205 #2011 step A, #2031).
    this.engineLoads = new Set()
  }


  /**
   * Note a load that is parsing into this viewer, so `dispose` can close its
   * engine if the viewer goes first.
   *
   * @param {{abort: Function}} engineLoad from engine/engineModelLoad.js
   *   #createEngineModelLoad
   * @return {function(): void} call once the parse has settled
   */
  trackEngineLoad(engineLoad) {
    this.engineLoads.add(engineLoad)
    return () => {
      this.engineLoads.delete(engineLoad)
    }
  }


  /**
   * Record the directory the Conway wasm is served from. The actual
   * `Init()` is lazy (ConwayEngine#init, on the first open), so this only
   * stores the path — matching wit-three's `setWasmPath`, which also
   * deferred `Init` to first parse. Not awaited at the single call site
   * (`Containers/viewer.js`).
   *
   * @param {string} path relative wasm directory (e.g. `'./static/js/'`)
   */
  setWasmPath(path) {
    this.engine?.setWasmPath(path)
  }


  /**
   * Register a built model with the scene + raycast registries.
   * Mirrors the fork `IfcManager.addIfcModel`: push to `ifcModels`
   * (model list) + `pickableIfcModels` (raycast targets) and add to the
   * scene. Called by `ShareIfcLoader.parse` (IFC) and `Loader.js` (GLB
   * / OBJ / … after conversion).
   *
   * @param {object} ifcMesh the model root `Object3D`
   */
  addIfcModel(ifcMesh) {
    this.context.items.ifcModels.push(ifcMesh)
    this.context.items.pickableIfcModels.push(ifcMesh)
    this.context.getScene().add(ifcMesh)
  }


  /**
   * Fetch item properties via Conway. Mirrors the fork
   * `IfcManager.getProperties(modelID, id, indirect, recursive)`. Both
   * live call-sites (`CadView.jsx`) pass `(0, expressID)` only, so
   * `indirect` is dead today; kept for surface parity (attaches psets
   * when requested — Conway also exposes type/material props if a future
   * caller needs them).
   *
   * @param {number} modelID
   * @param {number} id Express ID.
   * @param {boolean} [indirect] also attach property sets.
   * @param {boolean} [recursive]
   * @return {Promise<object|null>}
   */
  async getProperties(modelID, id, indirect = false, recursive = false) {
    if (modelID === null || modelID === undefined || id === null || id === undefined) {
      return null
    }
    const manager = this.loader.ifcManager
    const props = await manager.getItemProperties(modelID, id, recursive)
    if (indirect && props) {
      props.psets = await manager.getPropertySets(modelID, id, recursive)
    }
    return props
  }


  /**
   * Tear down: close every engine this viewer holds and drop refs.
   * Best-effort + guarded — the next `initViewer` builds a fresh ShareIfc
   * (and engine) regardless.
   *
   * @return {void}
   */
  dispose() {
    // Each registered model's engine (`model.engine`). A worker is
    // terminated, which frees the whole engine at once (§3), the one thing
    // `CloseModel` on the page's engine cannot do. The page's engine is this
    // viewer's own, closed below, and closing it twice closes it once.
    for (const model of this.context?.items?.ifcModels ?? []) {
      try {
        model?.engine?.close()
      } catch (e) {
        console.warn('ShareIfc.dispose: engine close failed:', e)
      }
    }
    // An engine still parsing into this viewer has no model registered yet.
    // Under the in-app switch (on by default, utils/spaModelNavMode.js) its
    // load is given up with the viewer: `abort` closes its engine and the
    // parse rejects as aborted, which CadView, having aborted the load itself
    // first, takes as the switch it is (Containers/CadView.jsx#abortLoadInFlight).
    // With the kill switch (`?feature=disableSpaModelNav`) or the rollback on,
    // the load keeps running into the disposed viewer, as before step F:
    // there, a viewer is disposed mid-load only by a theme change, and what
    // that load does next is the pre-step-A behaviour.
    if (isSpaModelNavOn()) {
      for (const engineLoad of this.engineLoads) {
        try {
          engineLoad.abort()
        } catch (e) {
          console.warn('ShareIfc.dispose: engine load abort failed:', e)
        }
      }
    }
    this.engineLoads.clear()
    // The viewer's own engine: CloseModel on the model it holds, if any, and
    // its Conway object dropped, which is what lets the wasm heap be
    // collected once this viewer is (in-app-model-switch.md §4.5).
    this.engine?.close().catch((e) => console.warn('ShareIfc.dispose: engine close failed:', e))
    this.engine = null
    this.selector = null
    this.loader = null
    this.context = null
  }


  /**
   * Dead on the Conway-direct path — IFC loads route through
   * `Loader.js#findLoader` → `viewer.ifcLoader` (`ShareIfcLoader`), not
   * here. ShareViewer's (equally dead) public `loadIfcUrl` delegates to
   * this; throw a clear message rather than a confusing
   * `undefined is not a function` if it's ever reached.
   */
  loadIfcUrl() {
    throw new Error(
      'ShareIfc.loadIfcUrl: unsupported — IFC loads route through ' +
      'Loader.js → viewer.ifcLoader (ShareIfcLoader)')
  }


  /**
   * Dead on the Conway-direct path — see `loadIfcUrl`.
   */
  loadIfc() {
    throw new Error(
      'ShareIfc.loadIfc: unsupported — IFC loads route through ' +
      'Loader.js → viewer.ifcLoader (ShareIfcLoader)')
  }
}
