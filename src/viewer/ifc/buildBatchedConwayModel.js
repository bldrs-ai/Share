import {Group} from 'three'
import {flatMeshToBatchedModel} from './flatMeshToBatchedModel'
import {
  attachConwayDirectModelMethods,
  makeConwayDirectIfcManager,
} from './conwayDirectIfcLoader'


/**
 * buildBatchedConwayModel — assemble a Conway FlatMesh stream into a
 * renderable batched model, decorated with the non-geometry surface
 * call-sites expect (the `ifcManager` shim + property/spatial closures), so
 * the NavTree + Properties panel light up exactly as on the merged path.
 *
 * The render object is one or two `THREE.BatchedMesh` batches (opaque +
 * transparent — see `flatMeshToBatchedModel`): a single batch is returned
 * directly; two are wrapped in a `Group` (the same hierarchical-model shape
 * the GLB cache-hit path already produces and the viewer already handles).
 *
 * Geometry-specific decoration the merged path uses (three-mesh-bvh
 * `IfcInstanceMap`, per-vertex subset construction) does NOT apply to a
 * `BatchedMesh` and is skipped; picking is native (`batchId`), and 3D
 * selection-outline / isolate is a follow-up (design/new/viewer-replacement.md
 * §3b.iv).
 *
 * Capabilities are `batchedPicking` only (NOT `expressIdPicking` /
 * `instancePicking`): `CadView` resolves a pick through the per-batch
 * `batchId` tables, while `ShareViewer.setSelection` / `setInstanceSelection`
 * guard on those other capabilities and so no-op safely (selection *state* —
 * store, NavTree, Properties — still flows; only the OutlineEffect subset is
 * deferred). Nothing in the selection path throws on a model without an
 * `instanceMap`.
 *
 * @param {Array} capturedFlatMeshes FlatMeshes captured during the parse
 * @param {object} ifcAPI Conway-compatible IfcAPI
 * @param {number} modelID
 * @return {object} `{model, stats}` — `model` is a BatchedMesh or a Group of them.
 */
export function buildBatchedConwayModel(capturedFlatMeshes, ifcAPI, modelID) {
  const {batches, stats} = flatMeshToBatchedModel(capturedFlatMeshes, ifcAPI, modelID)

  if (batches.length === 0) {
    // Degenerate (no renderable geometry). Throw so ShareIfcLoader falls
    // back to the merged path rather than adding an empty model.
    throw new Error('buildBatchedConwayModel: no renderable geometry')
  }

  // Each batch carries its own pick tables; CadView reads them off the
  // raycast-hit child (`intersection.object`).
  for (const batch of batches) {
    batch.mesh.instanceParents = batch.instanceParents
    batch.mesh.instanceOccurrenceIds = batch.instanceOccurrenceIds
    batch.mesh.computeBoundingBox?.()
    batch.mesh.computeBoundingSphere?.()
  }

  // Single batch → the BatchedMesh is the model; two → a Group of them.
  const model = batches.length === 1 ? batches[0].mesh : new Group()
  if (model.isGroup) {
    for (const batch of batches) {
      model.add(batch.mesh)
    }
  }

  model.modelID = modelID

  // `ifcManager` shim — several call-sites discriminate "is this an IFC
  // model?" by `if (!m.ifcManager)`; without it the model-loaded effects
  // (NavTree, search index) are skipped. Same shape the merged path attaches.
  model.ifcManager = makeConwayDirectIfcManager(ifcAPI, modelID)

  model.capabilities = model.capabilities ?? {}
  // batchedPicking only — see the class doc above for why expressIdPicking /
  // instancePicking are intentionally left off.
  model.capabilities.batchedPicking = true
  model.capabilities.ifcSubsets = false

  // Property / spatial closures (getItemProperties, getPropertySets,
  // getSpatialStructure, getIfcType) — identical to the merged path, so the
  // STEP/IFC metadata surface is unchanged.
  attachConwayDirectModelMethods(model, ifcAPI, modelID)

  return {model, stats}
}
