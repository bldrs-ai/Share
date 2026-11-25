/**
 * batchedModel — shared walkers for the Conway-direct `THREE.BatchedMesh`
 * render path. A batched model is either a lone `BatchedMesh` or a Group
 * of them (the opaque + transparent split), so every consumer that wants
 * to touch each batch needs the same "mesh-or-Group" traversal. This is
 * that traversal, factored out of `batchedHighlight` / `batchedSubset` /
 * `glbExport` so they can't drift.
 *
 * @see batchedHighlight — setColorAt selection / preselection.
 * @see batchedSubset — isolation-subset builder.
 * @see design/new/viewer-replacement.md §3b.iv
 */


/**
 * Run `fn` for every `BatchedMesh` in a batched model (the mesh itself, or
 * each batch child of a two-batch Group).
 *
 * @param {object} model BatchedMesh or Group root
 * @param {Function} fn called with each BatchedMesh
 */
export function eachBatch(model, fn) {
  if (!model) {
    return
  }
  if (model.isBatchedMesh) {
    fn(model)
    return
  }
  if (typeof model.traverse === 'function') {
    model.traverse((obj) => {
      if (obj.isBatchedMesh) {
        fn(obj)
      }
    })
  }
}


/**
 * True when the model is, or contains, a decorated BatchedMesh (carries the
 * `instanceParents` table). Lets call-sites pick the recolor path without a
 * capability lookup.
 *
 * @param {object} model
 * @return {boolean}
 */
export function isBatchedModel(model) {
  let found = false
  eachBatch(model, (mesh) => {
    if (mesh.instanceParents) {
      found = true
    }
  })
  return found
}


// Which batches make up one model. `decorateBatchMeshes` links every batch it
// decorates together — the one point every build path (one-shot, streaming,
// cache-hit hydration) hands a model's batches over as a set. A WeakMap, not a
// field, so a linked batch carries nothing extra and goes with its model.
const modelLinks = new WeakMap()


/**
 * Record that these batches are one model (the opaque / transparent split of
 * one load). Ids that are model-global — occurrence and source-geometry ids —
 * are then resolved across all of them, whichever one a caller names
 * (`batchedEdit#mintOccurrenceId`).
 *
 * @param {Array<object>} meshes the model's BatchedMeshes
 */
export function linkBatchedModel(meshes) {
  const batches = meshes.filter((mesh) => mesh?.isBatchedMesh)
  for (const mesh of batches) {
    modelLinks.set(mesh, batches)
  }
}


/**
 * Every batch of the model an object belongs to, plus a stable identity for
 * that model.
 *
 * Accepts the model root, or any one of its batches: both resolve to the same
 * `key` and the same batches when the batches were linked at decoration
 * ({@link linkBatchedModel}). An unlinked object (a hand-built test batch)
 * stands for itself: its own batches, keyed by the object.
 *
 * @param {object} object model root (BatchedMesh or Group) or one batch
 * @return {{key: object, meshes: Array<object>}}
 */
export function modelBatchesOf(object) {
  const meshes = []
  eachBatch(object, (mesh) => {
    meshes.push(mesh)
  })
  for (const mesh of meshes) {
    const linked = modelLinks.get(mesh)
    if (linked) {
      return {key: linked, meshes: linked}
    }
  }
  return {key: object, meshes}
}
