import {modelHasPostLoadEdits} from '../viewer/ifc/batchedEdit'
import {yieldToBrowser} from '../utils/scheduling'
import {buildBatchedGlbInWorker} from './GlbWriterService'
import {buildInstancedGlbFromSnapshot} from './glbBatchedBuild'
import {snapshotBatchedModel} from './glbBatchedSnapshot'
import {glbInfo, glbVerbose} from './glbLog'


/**
 * glbBatchedExport — serialize a decorated batched model to a
 * batched-NATIVE GLB via `EXT_mesh_gpu_instancing` (view-140 S9 /
 * viewer-replacement §3b.v, behind the default-on `glbBatched` flag).
 *
 * The merged bake (`batchedToMergedMesh`) de-instances every placement into
 * one giant vertex slab — that's where the instancing win dies and the
 * display-palette gets baked over the source colors. This writer keeps the
 * batch structure: each unique geometry is written ONCE, instances become
 * per-node TRS accessors, and per-instance identity + verbatim source
 * colors ride in `BLDRS_instance_tables` (see that module for why colors
 * must not round-trip through glTF materials).
 *
 * Node grouping is per (unique geometry × source color), where "unique
 * geometry" means unique CONTENT — `contentKey` interns the shapes by their
 * attribute bytes, because object identity groups two IFC types that emit
 * the same mesh separately and wrote them twice (Share#1859). A
 * generic viewer without our tables still shows an authored-color model
 * colored, while instances of one part stay one draw batch. Materials are
 * shared across every bin of one color rather than minted per bin
 * (Share#1854), and geometry accessors across every bin of one shape — so
 * two colors of one part are two nodes over one set of accessors. The
 * per-node instance transforms are shared the same way, by content: almost
 * every IFC placement is unit-scaled, so 7,220 Snowdon nodes hold 74
 * distinct SCALE payloads and 357 distinct ROTATION ones. Instance
 * matrices are written in mesh-local space via `getMatrixAt`, matching the
 * merged bake's convention (the mesh's own transform is ignored on both
 * paths).
 *
 * Collapse mode (`glbCollapse`, #1871; default-on, but this function's own
 * `collapse` option still defaults to false and the caller passes the flag):
 * single-placement groups are merged per colour into range-addressed
 * primitives instead of each getting a node — `glbCollapse.js` has the why
 * and the rules. The rest of this writer is unchanged by it; collapsed nodes
 * are simply a second kind of node in the same scene, joined to their tables
 * the same way.
 *
 * Fail-soft contract: returns null whenever the model can't round-trip
 * faithfully — a matrix that TRS decomposition can't represent (shear), a
 * geometry missing position/normal/index, an interleaved attribute — and
 * the caller falls back to the merged writer. A wrong artifact is worse
 * than a bigger one.
 *
 * **Two halves, one result** (open-205 #2030 target 1). Walking the live
 * batches is all that needs the main thread; it lives in
 * `glbBatchedSnapshot.js` and only copies. Everything that costs —
 * rebuilding and content-hashing every shape, decomposing every placement,
 * the collapse bake, building and serialising the gltf-transform document,
 * the slim pass — lives in `glbBatchedBuild.js`, which needs no scene and so
 * runs in `GlbWriter.worker.js` for the cache writer
 * ({@link exportBatchedModelOffThread}). On sp-231MB that was one 6.0 s
 * main-thread task. {@link exportBatchedModelAsInstancedGlb} runs both halves
 * in-process and is byte-for-byte the same writer; the off-thread path falls
 * back to it when the worker can't be used.
 */


/**
 * Serialize the batched model to instanced-GLB bytes plus the per-node
 * instance tables (in the same node order as the document's scene), in
 * this thread.
 *
 * @param {object} model BatchedMesh or Group of decorated batches
 * @param {object} [opts]
 * @param {boolean} [opts.collapse] merge single-placement groups into
 *   range-addressed primitives (`glbCompress#isGlbCollapseActive`; the flag
 *   is read by the caller so this stays a pure function of its arguments)
 * @return {Promise<{bytes: Uint8Array, tableNodes: Array<object>,
 *   collapsed: boolean}|null>} null when the model can't round-trip
 *   faithfully (caller falls back to the merged writer). `collapsed` echoes
 *   the mode, which picks the table version and so the OPFS slot
 */
export async function exportBatchedModelAsInstancedGlb(model, {collapse = false} = {}) {
  const taken = await snapshotBatchedModel(model)
  if (!taken) {
    return null
  }
  return await buildInstancedGlbFromSnapshot(taken.snapshot, {collapse}, glbVerbose)
}


/**
 * How long one main-thread slice of the snapshot may run before it yields.
 * Below the 50 ms long-task line, so the copy never shows up as one.
 */
const SNAPSHOT_SLICE_MS = 30


/**
 * The cache writer's form of {@link exportBatchedModelAsInstancedGlb}: the
 * snapshot is taken here in yielding slices, and the build runs in the
 * GlbWriter worker. Same bytes, same tables — the worker runs the very
 * `buildInstancedGlbFromSnapshot` the in-process writer does.
 *
 * Falls back to the in-process writer when the worker can't take the job
 * (it failed to start, or crashed). The snapshot's buffers were transferred
 * by then, so the fallback snapshots again — unless the model was edited in
 * the meantime, when the cache slot is no longer the source's to fill.
 *
 * @param {object} model BatchedMesh or Group of decorated batches
 * @param {object} [opts]
 * @param {boolean} [opts.collapse] as for the in-process writer
 * @return {Promise<{bytes: Uint8Array, tableNodes: Array<object>,
 *   collapsed: boolean}|{edited: true}|null>} as the in-process writer, plus
 *   `{edited: true}` when the model was edited while the snapshot was
 *   yielded, or before a decline that would send the caller to the merged
 *   bake of the live model (nothing should be cached)
 */
export async function exportBatchedModelOffThread(model, {collapse = false} = {}) {
  const taken = await snapshotBatchedModel(model, {
    budgetMs: SNAPSHOT_SLICE_MS,
    yieldFn: yieldToBrowser,
  })
  if (taken?.edited) {
    return taken
  }
  if (!taken) {
    return declined(model)
  }
  let result
  try {
    result = await buildBatchedGlbInWorker({snapshot: taken.snapshot, collapse}, taken.transfer)
  } catch (workerErr) {
    if (modelHasPostLoadEdits(model)) {
      return {edited: true}
    }
    glbInfo('writer: batched build worker failed, running it on the main thread:', workerErr)
    return await exportBatchedModelAsInstancedGlb(model, {collapse})
  }
  for (const line of result.logs) {
    glbVerbose(line)
  }
  return result.built ?? declined(model)
}


/**
 * The off-thread writer's "can't be written batched" answer. A null sends
 * the caller to the merged bake, which reads the LIVE model — and the live
 * model may have been edited while the build ran in the worker (seconds, on
 * a large model), where the synchronous in-process writer gave an edit no
 * such window. The snapshot's own check covers only the snapshot, so look
 * again here: an edited model gets `{edited: true}`, which caches nothing,
 * because the cache slot belongs to the unedited source (codex on #2035).
 *
 * @param {object} model the model being written
 * @return {{edited: true}|null}
 */
function declined(model) {
  return modelHasPostLoadEdits(model) ? {edited: true} : null
}
