import {Group, Matrix4, Vector3} from 'three'
import {attachBatchedSubsets} from './batchedSubset'
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
 * The merged path's `IfcInstanceMap` / per-vertex subset construction
 * doesn't apply to a `BatchedMesh`. Instead this model gets:
 *   - native `batchId` picking (CadView resolves it via the per-batch tables),
 *   - per-geometry three-mesh-bvh bounds trees (`computeBoundsTree`) so the
 *     accelerated raycast stays sub-linear and still emits `batchId`,
 *   - in-place selection / hover highlight by recoloring the picked product's
 *     instances (`setColorAt`, via `batchedHighlight`) — a coplanar overlay
 *     subset z-fights the opaque batch and won't render reliably, so the
 *     batched path recolors the actual pixels instead,
 *   - a `createSubset` / `removeSubset` surface (`attachBatchedSubsets`) used
 *     by `IfcIsolator` to re-bake hide/isolate subsets from the instances
 *     (design/new/viewer-replacement.md §3b.iv).
 *
 * Capabilities: `expressIdPicking` + `batchedPicking` (NOT `instancePicking`
 * — per-occurrence narrowing is still a follow-up; a click highlights every
 * occurrence of the picked product). `setInstanceSelection` guards on
 * `instancePicking` and so no-ops safely; the parent-level recolor from
 * `setSelection` stands.
 *
 * @param {Array} capturedFlatMeshes FlatMeshes captured during the parse
 * @param {object} ifcAPI Conway-compatible IfcAPI
 * @param {number} modelID
 * @param {object} [opts]
 * @param {object} [opts.scene] the THREE scene; passed as the subset
 *   `fallbackParent` so selection / preselection overlays still attach (and
 *   render their fill) when a source batch has no parent at subset-build
 *   time. Mirrors the merged paths (`attachInstanceMapSubsets(model, scene)`).
 * @return {object} `{model, stats}` — `model` is a BatchedMesh or a Group of them.
 */
export function buildBatchedConwayModel(capturedFlatMeshes, ifcAPI, modelID, opts = {}) {
  const {batches, stats} = flatMeshToBatchedModel(capturedFlatMeshes, ifcAPI, modelID)

  if (batches.length === 0) {
    // Degenerate (no renderable geometry). Throw so ShareIfcLoader falls
    // back to the merged path rather than adding an empty model.
    throw new Error('buildBatchedConwayModel: no renderable geometry')
  }

  // Each batch carries its own pick tables; CadView reads them off the
  // raycast-hit child (`intersection.object`). `instanceGeometry` feeds
  // `batchedSubset` (selection / preselection / isolation re-baking).
  for (const batch of batches) {
    batch.mesh.instanceParents = batch.instanceParents
    batch.mesh.instanceOccurrenceIds = batch.instanceOccurrenceIds
    batch.mesh.instanceGeometry = batch.instanceGeometry
    batch.mesh.instanceColors = batch.instanceColors
    batch.mesh.computeBoundingBox?.()
    batch.mesh.computeBoundingSphere?.()
    // Per-geometry BVH for the batch. `ShareIfc` patches
    // `BatchedMesh.prototype.computeBoundsTree = computeBatchedBoundsTree`
    // (+ `raycast = acceleratedRaycast`), so picking on a many-instance
    // batch resolves through the bounds trees instead of brute force —
    // and `acceleratedBatchedMeshRaycast` still sets `intersection.batchId`
    // (validated against three-mesh-bvh r0.9), so the CadView pick branch
    // is unaffected. Guarded: the method is absent under the Jest `three`
    // mock and present only in the production prototype patch.
    batch.mesh.computeBoundsTree?.()
  }

  // TEMP diagnostic (batchedMesh flag only — this whole builder runs only
  // under the flag): the fit heuristic zooms to Box3().setFromObject(model);
  // Schependomlaan renders as a far dot in batched mode but frames fine on
  // the merged path, so surface each batch's bounds + the worst instance
  // translation to find the outlier. Remove once the cause is fixed.
  const _p = new Vector3()
  const _mat4Scratch = new Matrix4()
  for (const batch of batches) {
    const bb = batch.mesh.boundingBox
    const size = bb ? bb.getSize(new Vector3()).toArray() : null
    let maxTrans = 0
    const m = batch.mesh
    for (let b = 0; b < batch.instanceParents.length; b++) {
      m.getMatrixAt(b, _mat4Scratch)
      _p.setFromMatrixPosition(_mat4Scratch)
      const mag = Math.max(Math.abs(_p.x), Math.abs(_p.y), Math.abs(_p.z))
      if (mag > maxTrans) {
        maxTrans = mag
      }
    }
    // eslint-disable-next-line no-console
    console.info(
      `[batchedMesh] bounds: transparent=${batch.transparent} instances=${batch.instanceParents.length} ` +
      `boxSize=${JSON.stringify(size)} empty=${bb?.isEmpty?.()} maxInstanceTranslation=${maxTrans.toFixed(1)}`)
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
  // Provisional capabilities for the window before `Loader.js` decorates the
  // model: `expressIdPicking` + `batchedPicking` (recolor selection via
  // `batchedHighlight`, isolate via `attachBatchedSubsets`), NOT
  // `instancePicking` / `ifcSubsets`. NOTE these are *overwritten* — `Loader.js`
  // calls `decorateShareModel` (replacing `capabilities` with the format
  // default, which has `ifcSubsets: true`) then `inferModelCapabilities`, which
  // re-detects the BatchedMesh and re-establishes exactly this set. The
  // authoritative source is `inferModelCapabilities` (ShareModel.js); this
  // block only covers the pre-decoration window and keeps the model self-
  // describing in isolation (tests, direct use).
  model.capabilities.expressIdPicking = true
  model.capabilities.batchedPicking = true
  model.capabilities.ifcSubsets = false

  // Selection / preselection / isolation subsets, re-baked from the batch
  // instances (see batchedSubset.js). Same `createSubset` / `removeSubset`
  // contract the merged paths expose, so ShareViewer + IfcIsolator drive the
  // batched model unchanged. `fallbackParent = null`: in production the
  // source batch is parented into the scene, so subsets inherit its parent;
  // `opts.scene` backstops the case where a source batch has no parent yet.
  attachBatchedSubsets(model, opts.scene ?? null, {})

  // Property / spatial closures (getItemProperties, getPropertySets,
  // getSpatialStructure, getIfcType) — identical to the merged path, so the
  // STEP/IFC metadata surface is unchanged.
  attachConwayDirectModelMethods(model, ifcAPI, modelID)

  return {model, stats}
}
