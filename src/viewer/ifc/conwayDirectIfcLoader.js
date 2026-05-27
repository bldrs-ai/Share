// Conway-direct IFC parse path. Slice 5b of Phase 5 in
// design/new/viewer-replacement.md.
//
// Replaces wit-three's `IFCLoader.parse(buffer)` on the cache-miss
// path. The old flow used wit-three to drive Conway under the hood
// (wit-three's IFCParser called `ifcAPI.OpenModel` + `StreamAllMeshes`
// internally), then we threw away its assembled geometry and rebuilt
// via the Conway-direct assembler in `installConwayDirectGeometry`.
//
// Now we call Conway directly and build the model from scratch — no
// wit-three IFCParser, no discarded geometry. The wit-three
// `ifcManager` itself is still around (we still go through
// `viewer.IFC` for `addIfcModel` and `context` access), but its
// IFCLoader.parse is bypassed entirely. Slice 5c will drop the
// `ifcManager` too.
//
// Surface:
//   - `parseIfcWithConway(buffer, ifcAPI, settings)` → `{modelID, captured}`
//     OpenModel + StreamAllMeshes; one async-shaped sync call (the
//     wrap is for symmetry with future move-to-worker paths).
//   - `decorateConwayDirectIfcModel(ifcModel, ifcAPI, modelID, opts)`
//     Post-build decoration: BVH, IfcInstanceMap, capability flips,
//     subset method, property + spatial method closures. Runs on a
//     fresh Conway-built Mesh; signature matches the post-wit-three-
//     parse path the now-removed `installConwayDirectGeometry`
//     followed.
//
// Property-method closures attached on the model:
//   - `model.getItemProperties(expressID, recursive = false)`
//   - `model.getPropertySets(expressID, recursive = false)`
//   - `model.getSpatialStructure(_modelID, withProperties = false)`
//   - `model.getIfcType(expressID)` — async; resolves the IFC entity
//     type string ('IFCWALL' etc.) by reading the entity's properties
//     and mapping the numeric type code via Conway's
//     `properties.getIfcType` (no extra dep needed; Conway's adapter
//     re-exports the `IfcTypesMap` we'd otherwise import directly).
//
// All four ignore the modelID arg (when consumers pass one) and use
// the model's own bound modelID. Mirrors the cache-hit closure
// pattern in `Loader.js#convertToShareModel` so call-sites can
// dispatch on `typeof model.X === 'function'` without branching on
// the load backend.

import {attachInstanceMapSubsets} from '../three/elementSubsets'
import {instanceMapFromGeometry} from './IfcInstanceMap'


/**
 * Parse an IFC buffer directly via Conway's IfcAPI. Returns the
 * Conway modelID + the FlatMesh stream that `buildConwayIfcModel`
 * consumes. Pure parse — no decoration, no Three.js construction.
 *
 * Conway's `OpenModel` is sync and returns -1 on failure; we throw
 * so the caller's outer try/catch surfaces the failure to the user.
 * `StreamAllMeshes` is also sync and invokes its callback once per
 * FlatMesh during the call — no async work to await.
 *
 * **Init dance:** pre-Slice-5b wit-three's `IFCLoader.parse` lazily
 * initialised Conway's wasm module on first call
 * (`if (this.state.api.wasmModule === undefined) await this.state.api.Init()`).
 * Slice 5b dropped that call path, so we re-do the lazy Init here —
 * without it `OpenModel` returns -1 on the very first cache-miss
 * load of any session. Detected by `ifcAPI.wasmModule === undefined`
 * (the same probe wit-three used).
 *
 * Settings default to the same shape wit-three's `applyWebIfcConfig`
 * was setting at the call site (origin-coordinating + boolean-faster).
 *
 * @param {ArrayBuffer|Uint8Array} buffer raw IFC bytes
 * @param {object} ifcAPI Conway-compatible IfcAPI (reach via
 *   `viewer.IFC.loader.ifcManager.ifcAPI`)
 * @param {object} [settings] OpenModel settings — defaults to
 *   `{COORDINATE_TO_ORIGIN: true, USE_FAST_BOOLS: true}` to match
 *   the wit-three baseline.
 * @return {Promise<{modelID: number, captured: Array}>}
 */
export async function parseIfcWithConway(buffer, ifcAPI, settings = undefined) {
  if (!ifcAPI || typeof ifcAPI.OpenModel !== 'function') {
    throw new Error('parseIfcWithConway: ifcAPI.OpenModel is unavailable')
  }
  if (typeof ifcAPI.StreamAllMeshes !== 'function') {
    throw new Error('parseIfcWithConway: ifcAPI.StreamAllMeshes is unavailable')
  }
  // Lazy wasm init — see the `Init dance` note above.
  if (ifcAPI.wasmModule === undefined && typeof ifcAPI.Init === 'function') {
    // eslint-disable-next-line new-cap
    await ifcAPI.Init()
  }
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  const openSettings = settings ?? {COORDINATE_TO_ORIGIN: true, USE_FAST_BOOLS: true}
  // eslint-disable-next-line new-cap
  const modelID = ifcAPI.OpenModel(data, openSettings)
  if (typeof modelID !== 'number' || modelID < 0) {
    throw new Error(`parseIfcWithConway: OpenModel returned ${modelID}`)
  }
  const captured = []
  // eslint-disable-next-line new-cap
  ifcAPI.StreamAllMeshes(modelID, (flatMesh) => {
    captured.push(flatMesh)
  })
  return {modelID, captured}
}


/**
 * Decorate a freshly-built Conway-direct Mesh with the runtime
 * surface call-sites expect from an IFC model. Idempotent — calling
 * twice on the same Mesh is a no-op (BVH already built, capabilities
 * already set, methods already attached).
 *
 * What gets attached / configured:
 *   - `computeBoundingBox`, `computeBoundingSphere` for fitToFrame +
 *     clipper bounds reads
 *   - `geometry.boundsTree` via `three-mesh-bvh`'s monkey-patched
 *     `computeBoundsTree` — fast picking; reorders the index buffer
 *     in place, so the `IfcInstanceMap` below is built AFTER
 *   - `mesh.instanceMap` — `IfcInstanceMap` from the post-reorder
 *     geometry attributes (per-vertex `expressID` + `instanceID`)
 *   - `mesh.capabilities` flips: `ifcSubsets: false`,
 *     `instancePicking: true`, `expressIdPicking: true`
 *   - `mesh.createSubset` / `mesh.removeSubset` via
 *     `attachInstanceMapSubsets` — instance-map-backed subset
 *     construction matching the cache-hit GLB path
 *   - Property/spatial method closures: `getItemProperties`,
 *     `getPropertySets`, `getSpatialStructure`, `getIfcType`. All
 *     route through `ifcAPI.properties.*` directly.
 *
 * @param {object} ifcModel freshly-built Conway-direct Mesh (output
 *   of `buildConwayIfcModel`)
 * @param {object} ifcAPI Conway IfcAPI bound to the model's modelID
 * @param {number} modelID
 * @param {object} [opts]
 * @param {object|null} [opts.scene] scene Object3D to parent subsets
 *   under as a fallback when source meshes haven't been added to the
 *   scene yet (passed through to `attachInstanceMapSubsets`)
 */
export function decorateConwayDirectIfcModel(ifcModel, ifcAPI, modelID, opts = {}) {
  const {scene = null} = opts
  ifcModel.modelID = modelID

  // `ifcManager` shim. Several call-sites discriminate "is this an
  // IFC model?" by checking `if (!m.ifcManager) { ... return }`
  // (see `CadView.jsx#onModel:438`); without this property, the
  // Conway-direct mesh is treated as a non-IFC model and the
  // model-loaded effects (NavTree population, search index, etc.)
  // are skipped entirely.
  //
  // Other call-sites reach into `ifcModel.ifcManager.getSpatialStructure(0, false)`
  // (IfcIsolator) and `ifcModel.ifcManager.ifcAPI` (Loader.js GLB
  // writer / various capture sites). The shim provides the small
  // surface those need, all backed by Conway directly. Methods
  // ignore the leading modelID arg and use the bound one.
  ifcModel.ifcManager = makeConwayDirectIfcManager(ifcAPI, modelID)

  // Bounds for fitToFrame + clipper. BufferGeometry would lazy-
  // compute on first access, but several consumers read bounds
  // eagerly (CutPlaneMenu, fitModelToFrame); explicit is cheaper
  // than the surprise.
  //
  // Optional-chained because tests `jest.mock('three')` and the
  // mocked Mesh/BufferGeometry don't have these methods. Real
  // BufferGeometry instances always do, so production behavior is
  // unchanged.
  ifcModel.geometry?.computeBoundingBox?.()
  ifcModel.geometry?.computeBoundingSphere?.()

  // BVH for fast hover-pick. `computeBoundsTree` is the monkey-patch
  // wit-three's IFCLoader's `initializeMeshBVH` installs at viewer
  // init — by Slice 5b time the patch is already on
  // `BufferGeometry.prototype` (the fork's `IfcViewerAPI` constructor
  // runs it during `new ShareViewer()`). Guarded with optional-call
  // in case the patch order ever changes.
  //
  // CRITICAL: this REORDERS the geometry's index buffer in place for
  // cache-coherent ray traversal. The pre-reorder `IfcInstanceMap`
  // returned by `buildConwayIfcModel` (keyed by emission position)
  // becomes wrong after the permute — the raycaster's `faceIndex` is
  // the post-reorder position, so the lookup mismatches and clicks
  // highlight the wrong instance. We rebuild a triangle-keyed map
  // from the post-reorder geometry attributes (per-vertex IDs stay
  // put, only the index buffer is permuted) so the new map matches
  // the geometry's actual layout.
  if (typeof ifcModel.geometry?.computeBoundsTree === 'function') {
    ifcModel.geometry.computeBoundsTree()
  }
  // Instance-map rebuild only runs when the geometry has the
  // expected attributes. Auto-mocked test BufferGeometry has none;
  // skip rather than throw. Real BufferGeometry always has them
  // because `flatMeshToBufferGeometry` sets them unconditionally.
  if (typeof ifcModel.geometry?.getIndex === 'function' &&
      ifcModel.geometry.getIndex() &&
      ifcModel.geometry.getAttribute?.('expressID') &&
      ifcModel.geometry.getAttribute?.('instanceID')) {
    ifcModel.instanceMap = instanceMapFromGeometry(ifcModel.geometry)
  }

  ifcModel.capabilities = ifcModel.capabilities ?? {}
  ifcModel.capabilities.ifcSubsets = false
  ifcModel.capabilities.instancePicking = true
  ifcModel.capabilities.expressIdPicking = true

  // Subset method backed by the instance map — matches the cache-hit
  // GLB path (`attachInstanceMapSubsets` from `elementSubsets.js`).
  // `fallbackParent` is passed through; production callers will have
  // the model parented before any subset construction (viewer.js
  // adds it to the scene), so `sourceMesh.parent` is set by the time
  // `createSubset` runs.
  attachInstanceMapSubsets(ifcModel, scene)

  attachConwayDirectModelMethods(ifcModel, ifcAPI, modelID)
}


/**
 * Build a minimal wit-three-`IFCManager`-shaped shim backed by
 * Conway. Provides just the surface call-sites read on
 * `model.ifcManager`:
 *
 *   - `getSpatialStructure(modelID, withProperties)` —
 *     `IfcIsolator.js` reads this. The leading modelID arg is
 *     ignored; the closure uses the modelID bound at decorate time.
 *   - `getItemProperties(modelID, expressID, recursive)` — used by
 *     downstream property capture if it falls through the
 *     model.getItemProperties path.
 *   - `getPropertySets(modelID, expressID, recursive)` — same.
 *   - `ifcAPI` — `Loader.js`'s GLB writer reads
 *     `viewer.IFC.loader.ifcManager.ifcAPI` to reach Conway directly;
 *     mirroring that reference here keeps the same shape work for
 *     any code that reaches via `model.ifcManager.ifcAPI`.
 *
 * @param {object} ifcAPI Conway IfcAPI
 * @param {number} modelID
 * @return {object} the shim
 */
function makeConwayDirectIfcManager(ifcAPI, modelID) {
  return {
    ifcAPI,
    getSpatialStructure: (_modelIDArg, withProperties = false) =>
      ifcAPI.properties.getSpatialStructure(modelID, withProperties),
    getItemProperties: (_modelIDArg, expressID, recursive = false) =>
      ifcAPI.properties.getItemProperties(modelID, expressID, recursive),
    getPropertySets: (_modelIDArg, expressID, recursive = false) =>
      ifcAPI.properties.getPropertySets(modelID, expressID, recursive),
  }
}


/**
 * Attach property + spatial method closures on the model that
 * route through `ifcAPI.properties.*` directly. Matches the cache-
 * hit closure shape in `Loader.js#convertToShareModel` so consumer
 * call-sites don't branch on which backend they're hitting.
 *
 * @param {object} ifcModel
 * @param {object} ifcAPI
 * @param {number} modelID
 */
function attachConwayDirectModelMethods(ifcModel, ifcAPI, modelID) {
  // Two-arg + single-arg calling conventions exist across consumers:
  //   - `(modelID, withProps)` — CadView.jsx, ShareViewer.getByFloor,
  //     IfcIsolator (mirrors `ifcManager.getSpatialStructure` shape)
  //   - `(withProps)` — cache-hit closure pattern
  // We accept both: if the first arg is a boolean (and only one arg
  // was passed), it's the `withProperties` flag; otherwise the leading
  // modelID is ignored and `withProperties` is the second arg. The
  // model's bound modelID is always used — closures are per-model.
  ifcModel.getSpatialStructure = function getSpatialStructure(...args) {
    let withProps = false
    if (args.length === 1 && typeof args[0] === 'boolean') {
      withProps = args[0]
    } else if (args.length >= 2) {
      withProps = !!args[1]
    }
    return ifcAPI.properties.getSpatialStructure(modelID, withProps)
  }
  ifcModel.getItemProperties = (expressID, recursive = false) => {
    return ifcAPI.properties.getItemProperties(modelID, expressID, recursive)
  }
  ifcModel.getPropertySets = (expressID, recursive = false) => {
    return ifcAPI.properties.getPropertySets(modelID, expressID, recursive)
  }
  // getIfcType: wit-three's surface returned the string type name
  // (e.g., 'IFCWALL') by looking up `state.models[modelID].types[id]`.
  // We resolve via getItemProperties + Conway's properties.getIfcType
  // (which is just an IfcTypesMap[] lookup under the hood). Cached
  // on first hit per expressID so the bot's bulk-property reads
  // don't re-trigger N property fetches.
  const typeCache = new Map()
  ifcModel.getIfcType = async (expressID) => {
    if (typeCache.has(expressID)) {
      return typeCache.get(expressID)
    }
    try {
      const props = await ifcAPI.properties.getItemProperties(modelID, expressID, false)
      const typeName = typeof props?.type === 'number' ?
        ifcAPI.properties.getIfcType(props.type) ?? null :
        null
      typeCache.set(expressID, typeName)
      return typeName
    } catch (e) {
      typeCache.set(expressID, null)
      return null
    }
  }
}
