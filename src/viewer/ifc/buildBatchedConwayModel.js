import {flatMeshToBatchedModel} from './flatMeshToBatchedModel'
import {
  attachConwayDirectModelMethods,
  makeConwayDirectIfcManager,
} from './conwayDirectIfcLoader'


/**
 * buildBatchedConwayModel — assemble a Conway FlatMesh stream into a
 * renderable `THREE.BatchedMesh` model, decorated with the non-geometry
 * surface call-sites expect (the `ifcManager` shim + property/spatial
 * closures), so the NavTree + Properties panel light up exactly as on the
 * merged path. The geometry-specific decoration the merged path uses
 * (three-mesh-bvh `IfcInstanceMap`, per-vertex subset construction) does
 * NOT apply to a `BatchedMesh` and is deliberately skipped — picking is
 * native (`batchId`), and 3D selection-outline / isolate is a follow-up
 * (see design/new/viewer-replacement.md §3b.iv).
 *
 * Capabilities are set to `batchedPicking` only (NOT `expressIdPicking` /
 * `instancePicking`): `CadView` resolves a pick through the `batchId`
 * tables here, while `ShareViewer.setSelection` / `setInstanceSelection`
 * guard on those other capabilities and so no-op safely (the selection
 * state — store, NavTree, Properties — still updates; only the
 * OutlineEffect subset is deferred). Nothing in the selection path throws
 * on a model without an `instanceMap`.
 *
 * @param {Array} capturedFlatMeshes FlatMeshes captured during the parse
 * @param {object} ifcAPI Conway-compatible IfcAPI
 * @param {number} modelID
 * @return {object} `{model, stats}` — `model` is the decorated BatchedMesh.
 */
export function buildBatchedConwayModel(capturedFlatMeshes, ifcAPI, modelID) {
  const {mesh, instanceParents, instanceOccurrenceIds, stats} =
    flatMeshToBatchedModel(capturedFlatMeshes, ifcAPI, modelID)

  mesh.modelID = modelID

  // Pick-resolution tables consumed by CadView's batchId branch.
  mesh.instanceParents = instanceParents
  mesh.instanceOccurrenceIds = instanceOccurrenceIds

  // `ifcManager` shim — several call-sites discriminate "is this an IFC
  // model?" by `if (!m.ifcManager)`; without it the model-loaded effects
  // (NavTree, search index) are skipped. Same shape the merged path attaches.
  mesh.ifcManager = makeConwayDirectIfcManager(ifcAPI, modelID)

  mesh.computeBoundingBox?.()
  mesh.computeBoundingSphere?.()

  mesh.capabilities = mesh.capabilities ?? {}
  // batchedPicking only — see the class doc above for why expressIdPicking /
  // instancePicking are intentionally left off.
  mesh.capabilities.batchedPicking = true
  mesh.capabilities.ifcSubsets = false

  // Property / spatial closures (getItemProperties, getPropertySets,
  // getSpatialStructure, getIfcType) — identical to the merged path, so the
  // STEP/IFC metadata surface is unchanged.
  attachConwayDirectModelMethods(mesh, ifcAPI, modelID)

  return {model: mesh, stats}
}
