// A Conway model's reads, over its `Engine` (engine/Engine.js), and the
// decoration a freshly built merged model needs. The model half of what was
// `loader/conwayDirectIfcLoader.js`, written over `Engine` in slice 1a of
// design/tracks/open-t200/layering.md (§7), so the model no longer reaches up
// into the loader for it.
//
// Every live IFC/STEP model, and the model at its index, carries:
//   - `model.engine`: the read handle, a WorkerEngine or a ConwayEngine;
//   - `model.ifcManager`: the wit-three-`IFCManager`-shaped shim several call
//     sites still discriminate on (`if (!m.ifcManager)` in CadView#onModel)
//     and read (`ifcManager.getSpatialStructure(0, false)` in IfcIsolator).
//     Its `ifcAPI` is the load's IfcAPI-shaped alias of the engine
//     (engine/engineModelLoad.js#makeEngineIfcApi), kept until slice N
//     renames its readers onto `model.engine`;
//   - `getSpatialStructure`, `getItemProperties`, `getPropertySets`,
//     `getIfcType`: the cache-hit closure shape (`Loader.js
//     #convertToShareModel`), so call sites dispatch on `typeof model.X ===
//     'function'` without branching on the load backend.
// All of them ignore a leading modelID argument when a consumer passes one:
// an engine holds one model.
import {attachInstanceMapSubsets} from './elementSubsets'
import {instanceMapFromGeometry} from './IfcInstanceMap'


/**
 * Attach the model's engine and its reads (see the file header).
 *
 * @param {object} target the model, or the model at its index
 * @param {object} engine an Engine
 * @param {object} ifcAPI the load's alias of it (`model.ifcManager.ifcAPI`)
 * @return {object} target
 */
export function attachEngineReads(target, engine, ifcAPI) {
  target.engine = engine
  // The IfcIsolator's surface: product-only, no `includeSolids` (hide and
  // isolate key on product subsets, and a sub-solid has no meaning there yet).
  target.ifcManager = {
    ifcAPI,
    getSpatialStructure: (_modelIDArg, withProperties = false) => engine.tree({mode: withProperties}),
    getItemProperties: (_modelIDArg, expressID, recursive = false) => engine.properties(expressID, {recursive}),
    getPropertySets: (_modelIDArg, expressID, recursive = false) => engine.propertySets(expressID, {recursive}),
  }
  // Two calling conventions exist across consumers:
  //   - `(modelID, withProps)`: CadView.jsx, ShareViewer#getByFloor,
  //     IfcIsolator (the `ifcManager.getSpatialStructure` shape);
  //   - `(withProps)`: the cache-hit closure pattern.
  // If the only argument is a boolean or Conway's `'names'` mode, it is the
  // mode; otherwise the leading modelID is ignored and the mode is the second.
  // `'names'` must pass through un-coerced: conway reads it as the light
  // per-node Name/LongName/GlobalId walk, and a boolean coercion would
  // silently upgrade it to the full-record `true` visit it exists to avoid.
  target.getSpatialStructure = function getSpatialStructure(...args) {
    const isMode = (v) => typeof v === 'boolean' || v === 'names'
    let mode = false
    if (args.length === 1 && isMode(args[0])) {
      mode = args[0]
    } else if (args.length >= 2) {
      mode = isMode(args[1]) ? args[1] : Boolean(args[1])
    }
    // `includeSolids` (Conway ≥1.376.1184) surfaces STEP multibody sub-solids
    // as ephemeral `type: 'solid'` NavTree nodes (named SolidWorks bodies like
    // the NEMA 23 motor's `Boss-Extrude7`; anonymous solid dumps stay
    // suppressed engine-side). The IFC surface ignores it. This is the
    // NavTree and search feed; the isolator's surface above stays
    // product-only. See Conway `design/new/step-nonproduct-semantics.md`.
    return engine.tree({mode, includeSolids: true})
  }
  target.getItemProperties = (expressID, recursive = false) => engine.properties(expressID, {recursive})
  target.getPropertySets = (expressID, recursive = false) => engine.propertySets(expressID, {recursive})
  // Identity. SearchIndex reaches it through `Ifc.getType(model, elt)` →
  // `model.properties.getIfcType(elt.type)`, and Conway's spatial tree
  // already gives every node a string `.type` ('IFCWALL'), so it is handed
  // back. Must stay synchronous: a Promise here breaks SearchIndex's
  // downstream `key.toLowerCase()` (see the cross-ref there).
  target.getIfcType = (eltType) => eltType
  return target
}


/**
 * The model as it is at the index (open-205 #2029): a plain object carrying
 * the property and spatial surface the finished model will have, before any
 * geometry exists. It is what the NavTree, Properties and search read while
 * the pump streams, and is replaced by the finished model when the load
 * resolves. Not an Object3D and has no geometry or capabilities, so it must
 * never stand in for `model` where a scene object is expected (clipper,
 * isolator, ViewCube), which is why it travels as `indexedModel`, not
 * `model` (store/IFCSlice.js).
 *
 * @param {object} engine the load's Engine, at its index
 * @param {object} ifcAPI the load's alias of it
 * @return {object} the handle
 */
export function makeIndexedModelHandle(engine, ifcAPI) {
  return attachEngineReads({isIndexedModel: true, modelID: engine.modelID}, engine, ifcAPI)
}


/**
 * Decorate a freshly built merged model (`buildConwayIfcModel`, the last of
 * `ShareIfcLoader#parse`'s end-of-load builds) with the runtime surface call
 * sites expect of an IFC model. Idempotent.
 *
 * What it attaches:
 *   - bounds, for fitToFrame and the clipper (BufferGeometry would compute
 *     them lazily, but several consumers read them eagerly);
 *   - `geometry.boundsTree`, through three-mesh-bvh's patched
 *     `computeBoundsTree` (model/bvhPatch.js): fast picking. It REORDERS the
 *     index buffer in place, so the `IfcInstanceMap` is rebuilt after it;
 *   - `instanceMap`, from the post-reorder geometry, with the STEP tables
 *     carried over (below);
 *   - capabilities: `ifcSubsets: false`, `instancePicking`,
 *     `expressIdPicking`;
 *   - `createSubset` / `removeSubset` over the instance map, the cache-hit
 *     GLB path's (`attachInstanceMapSubsets`);
 *   - the engine and its reads (`attachEngineReads`).
 *
 * @param {object} ifcModel the merged Mesh
 * @param {object} engine the load's Engine
 * @param {object} ifcAPI the load's alias of it
 * @param {number} modelID the engine's handle for the model
 * @param {object} [opts]
 * @param {object|null} [opts.scene] the parent subsets fall back to when the
 *   model has not been added to the scene yet
 */
export function decorateConwayDirectIfcModel(ifcModel, engine, ifcAPI, modelID, {scene = null} = {}) {
  ifcModel.modelID = modelID
  // Optional-chained because tests `jest.mock('three')`, whose mocked
  // BufferGeometry has none of these; a real one always does.
  ifcModel.geometry?.computeBoundingBox?.()
  ifcModel.geometry?.computeBoundingSphere?.()
  if (typeof ifcModel.geometry?.computeBoundsTree === 'function') {
    ifcModel.geometry.computeBoundsTree()
  }
  // The pre-reorder map from `buildConwayIfcModel` is keyed by emission
  // position; the raycaster's `faceIndex` is the post-reorder one, so a
  // lookup through the old map highlights the wrong instance. Rebuilt from
  // the geometry's per-vertex ids, which the permute leaves in place. Only
  // when the attributes are there: auto-mocked test geometry has none.
  if (typeof ifcModel.geometry?.getIndex === 'function' &&
      ifcModel.geometry.getIndex() &&
      ifcModel.geometry.getAttribute?.('expressID') &&
      ifcModel.geometry.getAttribute?.('instanceID')) {
    // `instanceMapFromGeometry` reads only `expressID` + `instanceID` per
    // vertex, so it cannot recover STEP's per-occurrence tables (a path is a
    // variable-length array, not a per-vertex scalar) or the per-instance
    // solid ids. Carried over by hand: the synthetic instance ids line up 1:1,
    // since `flatMeshToBufferGeometry` stamps per-vertex `instanceID` in the
    // order `instanceMapFromOrderedPlacedRanges` numbered the build map, and
    // the reorder permutes only the index buffer. Without it, scene → NavTree
    // picks fall back to the colliding part-type expressID (every reuse of a
    // nut highlights together).
    const buildMap = ifcModel.instanceMap
    ifcModel.instanceMap = instanceMapFromGeometry(ifcModel.geometry)
    if (buildMap?.instanceIdToOccurrencePath || buildMap?.instanceIdToGeometryExpressId) {
      // The 1:1 assumption is guarded, not trusted: if the two populators
      // ever number instances differently, copying the tables would bind
      // paths to the wrong instances, a silent wrong-nut-highlights bug.
      // On a mismatch, degrade to type-level selection instead.
      if (buildMap.instanceCount === ifcModel.instanceMap.instanceCount) {
        if (buildMap.instanceIdToOccurrencePath) {
          ifcModel.instanceMap.instanceIdToOccurrencePath = buildMap.instanceIdToOccurrencePath
          ifcModel.instanceMap.occurrencePathToInstanceIds = buildMap.occurrencePathToInstanceIds
        }
        // The second half of the (occurrencePath, solid expressID) identity
        // per-solid selection joins on.
        if (buildMap.instanceIdToGeometryExpressId) {
          ifcModel.instanceMap.instanceIdToGeometryExpressId = buildMap.instanceIdToGeometryExpressId
        }
      } else {
        console.warn(
          '[conwayDirect] occurrence-path transfer skipped: instance-count mismatch ' +
          `(build ${buildMap.instanceCount}, geometry ${ifcModel.instanceMap.instanceCount}); ` +
          'STEP selection degrades to type-level for this model')
      }
    }
  }
  ifcModel.capabilities = ifcModel.capabilities ?? {}
  ifcModel.capabilities.ifcSubsets = false
  ifcModel.capabilities.instancePicking = true
  ifcModel.capabilities.expressIdPicking = true
  // In production the model is parented into the scene before any subset is
  // built (viewer.js adds it), so `scene` is only the backstop.
  attachInstanceMapSubsets(ifcModel, scene)
  attachEngineReads(ifcModel, engine, ifcAPI)
}
