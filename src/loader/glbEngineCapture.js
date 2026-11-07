// The GLB writer's engine-side captures, as ONE job: everything the cache
// artifact needs from the parsed model rather than from the scene
// (design/new/engine-worker.md §2.4 G2, §7 step 5).
//
//   - `BLDRS_spatial_tree` — the spatial tree, with node names;
//   - `BLDRS_element_properties` — the property closure, as the packed
//     block-indexed container;
//   - the geometry-identity table `BLDRS_face_ids` carries for STEP
//     (`{type, name}` per distinct geometry id), when the writer asks.
//
// The geometry, instance tables and title come from the main-side scene and
// stay in `glbExport.js`.
//
// The same code runs wherever the model's engine is, so the two engines
// cannot drift:
//   - main-thread load: `glbExport.js#exportAndCacheGlb` calls it over
//     `viewer.IFC.loader.ifcManager`;
//   - engine-worker load (`?feature=engineWorker`): the worker's `capture`
//     op (engine/engineHandler.js) calls it over its own engine, through
//     `ifcManagerOver`, and the result crosses back as one reply with the
//     container bytes transferred — not hundreds of thousands of property
//     RPCs, which is what running the captures page-side over the worker
//     facade would cost.
//
// Worker-safe: imported by the engine worker bundle, so no store, DOM or
// three (engine/engineWorkerImports.test.js holds it to that).
import {captureBldrsElementProperties} from './bldrsElementPropertiesCapture'
import {captureGeometryItemIdentities} from './bldrsFaceIds'
import {captureBldrsSpatialTree} from './bldrsSpatialTree'
import {glbVerbose} from './glbLog'
import {yieldToBrowser} from '../utils/scheduling'


/**
 * Run the writer's engine captures, in the order the writer has always run
 * them: geometry identities, then the tree, then the element properties
 * (the slow path seeds its BFS from the tree).
 *
 * Each capture fails soft on its own and answers null, as it does today, so
 * one missing piece never costs the others.
 *
 * @param {object|null} ifcManager IfcManager-like (`ifcAPI`,
 *   `getItemProperties`, `getPropertySets`); null captures nothing
 * @param {number} modelID the engine's handle for the model
 * @param {object} [options]
 * @param {Array<number>|null} [options.geometryExpressIds] per-instance
 *   geometry ids whose identities to resolve (STEP merged layout); null for
 *   none
 * @param {function(): Promise<void>} [options.yieldToLoop] passed to the
 *   element-properties sweep (see captureBldrsElementProperties)
 * @return {Promise<{spatialTree: (object|null), elementProperties:
 *   (Uint8Array|null), geometryItemIdentities: (object|null)}>}
 */
export async function captureEngineExtensions(ifcManager, modelID, {geometryExpressIds = null, yieldToLoop} = {}) {
  let geometryItemIdentities = null
  if (Array.isArray(geometryExpressIds)) {
    const identitiesStartMs = Date.now()
    geometryItemIdentities = await captureGeometryItemIdentities(ifcManager, modelID, geometryExpressIds)
    glbVerbose(
      `writer: geometry identity sweep took ${Date.now() - identitiesStartMs}ms ` +
      `(${Object.keys(geometryItemIdentities ?? {}).length} identities)`)
  }
  // Per-phase timing (glbVerbose): the writer's post-export phases are
  // otherwise silent for minutes on big models, which makes write stalls
  // unattributable from the console (#1639 follow-up observation).
  const treeStartMs = Date.now()
  const spatialTree = await captureBldrsSpatialTree(ifcManager, modelID)
  glbVerbose(`writer: spatial-tree capture took ${Date.now() - treeStartMs}ms`)
  await (yieldToLoop ?? yieldToBrowser)()
  const propsStartMs = Date.now()
  const captured = await captureBldrsElementProperties(
    ifcManager, modelID, spatialTree, yieldToLoop ? {yieldToLoop} : undefined)
  glbVerbose(`writer: element-properties capture took ${Date.now() - propsStartMs}ms`)
  return {spatialTree, elementProperties: captured?.compressedBytes ?? null, geometryItemIdentities}
}


/**
 * The IfcManager shape the captures read, over a bare conway `IfcAPI`: what
 * `viewer/ifc/ShareIfcManager.js` offers on the page (the same three calls
 * through `ifcAPI.properties`), without its three/viewer dependencies. For
 * the engine worker, which has an `IfcAPI` and no viewer.
 *
 * @param {object} ifcAPI conway's web-ifc compat IfcAPI
 * @return {object}
 */
export function ifcManagerOver(ifcAPI) {
  return {
    ifcAPI,
    getSpatialStructure: (modelID, withProperties = false) =>
      ifcAPI.properties.getSpatialStructure(modelID, withProperties),
    getItemProperties: (modelID, id, recursive = false) =>
      ifcAPI.properties.getItemProperties(modelID, id, recursive),
    getPropertySets: (modelID, id, recursive = false) =>
      ifcAPI.properties.getPropertySets(modelID, id, recursive),
  }
}
