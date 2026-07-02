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
