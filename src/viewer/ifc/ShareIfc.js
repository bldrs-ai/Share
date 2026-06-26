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
// live code reads off `viewer.IFC`: `loader.ifcManager` (Conway IfcAPI +
// accessors), a material-slot `selector`, `getProperties`,
// `addIfcModel`, `setWasmPath`, `dispose`, `context`, `type`,
// `ifcLastError`.
//
// Conway construction: `new IfcAPI()` from 'web-ifc'. In production the
// esbuild `webIfcShimAlias` plugin resolves 'web-ifc' to
// `@bldrs-ai/conway-web-ifc-adapter/compiled/src/ifc_api.js`
// (tools/esbuild/plugins.js; the alias itself is removed in slice 5f).
// In Jest 'web-ifc' resolves to the real package, but ShareIfc is mocked
// in the ShareViewer test harness (`__mocks__/ShareViewer.js`) so the
// real `IfcAPI` is never constructed there. The wasm `Init` is lazy —
// `parseIfcWithConway` runs `if (ifcAPI.wasmModule === undefined) await
// ifcAPI.Init()` on the first parse — so `setWasmPath` only records the
// path; it deliberately does not await an Init that hasn't been kicked
// off yet.

import {BufferGeometry, Mesh} from 'three'
import {acceleratedRaycast, computeBoundsTree, disposeBoundsTree} from 'three-mesh-bvh'
import {IfcAPI} from 'web-ifc'
import ShareIfcManager from './ShareIfcManager'


// Install three-mesh-bvh's accelerated raycasting globally. The fork's
// `IfcManager.setupThreeMeshBVH` did this (via web-ifc-three) at viewer
// construction; with the fork gone, ShareIfc owns it. The prototype patch
// is what makes `geometry.computeBoundsTree()` (Conway-direct parse +
// cache-hit GLB decoration in Loader.js) and BVH-accelerated
// `mesh.raycast` work, and `geometry.disposeBoundsTree()` (IfcContext
// teardown) defined — without it, picking on multi-million-triangle
// models falls back to O(triangles) brute force. Module-level +
// idempotent (re-assigning the same functions is harmless). Runs in
// production only: ShareIfc is mocked in the Jest harness (mirroring the
// fork's manager, which was also mocked), so tests keep running against
// unpatched three exactly as before.
BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree
Mesh.prototype.raycast = acceleratedRaycast


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
    // Conway IfcAPI. Was constructed inside the fork's web-ifc-three
    // IFCLoader; we own it directly now. Lazy-init'd by
    // `parseIfcWithConway` (see file header).
    const ifcAPI = new IfcAPI()
    // `loader.ifcManager` is the shape consumers read:
    //   viewer.IFC.loader.ifcManager.{ifcAPI, parser, state.models,
    //     getSpatialStructure, getIfcType, getItemProperties, ...}
    // `ShareIfcManager` (slice 5d.1) already provides exactly this
    // Conway-backed surface; reuse it rather than duplicate.
    this.loader = {ifcManager: new ShareIfcManager(ifcAPI)}
    this.selector = makeMaterialSlotSelector()
    // Canonical parse-error slot — `Loader.js` reads `viewer.IFC.ifcLastError`
    // and `ShareIfcLoader.parse` mirrors its writes here.
    this.ifcLastError = null
    // Legacy format discriminant `Loader.js` writes for non-IFC models
    // (`'glb'`, `'obj'`, …). Capability flags on `ShareModel` (§8.2) are
    // the real source of truth; this stays a writable slot for compat.
    this.type = undefined
  }


  /**
   * Record the directory the Conway wasm is served from. The actual
   * `Init()` is lazy (first `parseIfcWithConway`), so this only stores
   * the path on the IfcAPI — matching wit-three's `setWasmPath`, which
   * also deferred `Init` to first parse. Not awaited at the single call
   * site (`Containers/viewer.js`).
   *
   * @param {string} path relative wasm directory (e.g. `'./static/js/'`)
   */
  setWasmPath(path) {
    // eslint-disable-next-line new-cap -- Conway IfcAPI methods are PascalCase, not constructors
    this.loader?.ifcManager?.ifcAPI?.SetWasmPath?.(path)
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
   * Tear down: close any open Conway models and drop refs. The fork
   * delegated to web-ifc-three's `ifcManager.dispose()`; Conway exposes
   * per-model `CloseModel(modelID)`. Best-effort + guarded — the next
   * `initViewer` builds a fresh ShareIfc (and IfcAPI) regardless.
   *
   * @return {void}
   */
  dispose() {
    const ifcAPI = this.loader?.ifcManager?.ifcAPI
    const models = ifcAPI?.models
    if (models && typeof models.keys === 'function' && typeof ifcAPI.CloseModel === 'function') {
      try {
        for (const modelID of Array.from(models.keys())) {
          // eslint-disable-next-line new-cap -- Conway IfcAPI methods are PascalCase, not constructors
          ifcAPI.CloseModel(modelID)
        }
      } catch (e) {
        console.warn('ShareIfc.dispose: CloseModel failed:', e)
      }
    }
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
