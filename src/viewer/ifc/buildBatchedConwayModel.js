import {Group} from 'three'
import {isFeatureEnabled} from '../../FeatureFlags'
import {attachBatchedSubsets} from './batchedSubset'
import {flatMeshToBatchedModel} from './flatMeshToBatchedModel'
import {
  attachConwayDirectModelMethods,
  makeConwayDirectIfcManager,
} from './conwayDirectIfcLoader'
import {applyProductPalette} from './productPalette'
import {occurrencePathKey} from '../../utils/occurrencePaths'


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
 * — that flag means "has an IfcInstanceMap"; the batched path carries its
 * per-occurrence identity in the per-batch tables instead:
 * `instanceOccurrenceIds` / `instanceOccurrencePaths` / `instanceGeometryIds`
 * plus the reverse `occurrencePathToBatchIds` index). `setInstanceSelection`
 * and `getInstanceIdsForOccurrencePath` branch on `batchedPicking` / the
 * tables directly, so per-occurrence selection highlight and per-occurrence
 * hide work like the merged path.
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
  return {model: assembleBatchedModel(batches, ifcAPI, modelID, opts), stats}
}


/**
 * Reverse index for the batched NavTree→scene join: occurrence-path key
 * (`occurrencePathKey`) → the batchIds placed at that exact path. Only
 * non-empty paths are indexed (an empty root path can't disambiguate
 * occurrences) — the same rule `instanceMapFromOrderedPlacedRanges` applies
 * on the merged path. Null in → null out (IFC / no occurrence data).
 *
 * @param {Array<Array<number>|null>|null} instanceOccurrencePaths
 * @return {Map<string, Array<number>>|null}
 */
function buildOccurrencePathIndex(instanceOccurrencePaths) {
  if (!instanceOccurrencePaths) {
    return null
  }
  const byPath = new Map()
  for (let batchId = 0; batchId < instanceOccurrencePaths.length; batchId++) {
    const path = instanceOccurrencePaths[batchId]
    if (!path || path.length === 0) {
      continue
    }
    const key = occurrencePathKey(path)
    const list = byPath.get(key)
    if (list) {
      list.push(batchId)
    } else {
      byPath.set(key, [batchId])
    }
  }
  return byPath
}


/**
 * Decorate prepared batches into the final batched model — shared by the
 * one-shot path above and the incremental demand-path builder (slice B1,
 * `incrementalBatchedBuilder.js`), which assembles the same BatchHandle
 * shape progressively during the pump and only needs this decoration at
 * the end.
 *
 * @param {Array} batches BatchHandle list (`{mesh, instanceParents, ...}`)
 * @param {object} ifcAPI Conway-compatible IfcAPI
 * @param {number} modelID
 * @param {object} [opts]
 * @param {object} [opts.scene] subset fallbackParent (see above)
 * @param {object} [opts.root] existing Group already holding the batch
 *   meshes (the incremental path's scene-installed root) — used as the
 *   model object so the on-screen group IS the durable model, no swap.
 * @return {object} the decorated model
 */
export function assembleBatchedModel(batches, ifcAPI, modelID, opts = {}) {
  if (batches.length === 0) {
    // Degenerate (no renderable geometry). Throw so ShareIfcLoader falls
    // back to the merged path rather than adding an empty model.
    throw new Error('buildBatchedConwayModel: no renderable geometry')
  }

  // Colorless-model fallback: a STEP/CAD file with no presentation data
  // comes back entirely default-grey. Repaint each product from a palette
  // (Onshape-style) so a multi-part assembly is legible. Strictly no-op the
  // moment any real color is present, so IFC and colored STEP are untouched.
  // Runs before the pick-table stamp below so the `instanceColors` restore
  // table `batchedHighlight` reads already carries the palette color.
  if (isFeatureEnabled('autoColorParts')) {
    applyProductPalette(batches)
  }

  // Each batch carries its own pick tables; CadView reads them off the
  // raycast-hit child (`intersection.object`). `instanceGeometry` feeds
  // `batchedSubset` (selection / preselection / isolation re-baking).
  for (const batch of batches) {
    batch.mesh.instanceParents = batch.instanceParents
    batch.mesh.instanceOccurrenceIds = batch.instanceOccurrenceIds
    batch.mesh.instanceGeometry = batch.instanceGeometry
    batch.mesh.instanceColors = batch.instanceColors
    // Per-occurrence identity tables (STEP): solid geometry ids + NAUO
    // occurrence paths, plus the reverse path→batchIds index ShareViewer's
    // `getInstanceIdsForOccurrencePath` reads (the NavTree→scene join).
    // `?? null` keeps older BatchHandle shapes (tests, external callers)
    // working — consumers treat a missing table as "no occurrence data".
    batch.mesh.instanceGeometryIds = batch.instanceGeometryIds ?? null
    batch.mesh.instanceOccurrencePaths = batch.instanceOccurrencePaths ?? null
    batch.mesh.occurrencePathToBatchIds =
      buildOccurrencePathIndex(batch.mesh.instanceOccurrencePaths)
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

  // Single batch → the BatchedMesh is the model; two → a Group of them.
  // The incremental path passes its scene-installed root instead.
  const model = opts.root ?? (batches.length === 1 ? batches[0].mesh : new Group())
  if (model.isGroup && opts.root === undefined) {
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

  return model
}
