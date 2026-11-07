/**
 * Picking and highlighting the durable batches while they are still
 * streaming in (engine-worker.md §11, "Picking during the pump").
 *
 * A Conway load's durable model is assembled in place as the demand pump
 * delivers it (`ifc/incrementalBatchedBuilder.js`): its BatchedMeshes are on
 * screen from the first batch, but the model is not decorated until the load
 * ends, so the finished model's pick path (`mesh.instanceParents` and the
 * other tables `finalize` stamps) has nothing to read. Until this module the
 * only thing pickable during a load was the parse-time preview
 * (`previewSelection.js`), which on a STEP model — short parse, long geometry
 * pass — covers almost nothing: on Arty_Z7 nothing in the scene answered a
 * double-click from ~7 s to ~38 s.
 *
 * The builder keeps exactly the tables `finalize` stamps, as it appends each
 * row. It offers them on its root under `STREAMING_BATCHES_KEY`, and
 * removes the offer at `finalize`, when the decorated model takes over:
 *
 *  - `streamingBatchRoots` finds the offering root(s) in a scene,
 *  - `pickStreamingBatch` reads a pick off a raycast against them — the same
 *    `{parentExpressId, instanceId, occurrencePath, geometryId}` the finished
 *    model's batched pick reads, from the same rows, so a selection made now
 *    is the selection the finished model shows,
 *  - `paintStreamingSelection` paints the selection onto the streaming rows,
 *    and the builder keeps painting rows that arrive later until `finalize`
 *    restores every painted row to its own colour.
 *
 *  - `streamingTablesModel` stands in for the model in the viewer's
 *    per-instance queries until the model exists, so a pick's root-level and
 *    occurrence answers are the finished model's.
 *
 * Format-neutral: an IFC row's occurrence path is null, a STEP row's is its
 * occurrence (`[]` at the root).
 */


/**
 * `root.userData` key of a builder still streaming its batches. Its value
 * answers `pickRow(mesh, batchId)`, `paintSelection(selection, rgba)` and
 * `liveTables()`.
 */
export const STREAMING_BATCHES_KEY = 'streamingBatches'


/**
 * `scene.userData` key of the selection painted during a load, for a
 * streaming builder that installs after it was made to adopt at its first
 * batch (IncrementalBatchedBuilder#appendBatch). Present only while a load
 * is in flight (`beginLoadSelection` / `endLoadSelection`, ShareIfcLoader
 * #parse), so nothing a finished or failed load selected reaches the next
 * load's builder; `{selection, color}`, or null while there is nothing to
 * adopt, so an empty selection costs a batch nothing.
 */
export const LOAD_SELECTION_KEY = 'loadSelection'


/**
 * A load has begun streaming into `scene`: selections made from now on are
 * kept for its builder.
 *
 * @param {object|null} scene three.js scene
 */
export function beginLoadSelection(scene) {
  if (scene?.userData) {
    scene.userData[LOAD_SELECTION_KEY] = null
  }
}


/**
 * The load is over, however it ended: keep nothing for a builder.
 *
 * @param {object|null} scene three.js scene
 */
export function endLoadSelection(scene) {
  if (scene?.userData) {
    delete scene.userData[LOAD_SELECTION_KEY]
  }
}


/**
 * @param {object} selection `{parents, instances, occurrencePath}`
 * @return {boolean} whether it selects nothing
 */
function isEmptySelection(selection) {
  return (selection?.parents ?? []).length === 0 && (selection?.instances ?? []).length === 0 &&
    !(Array.isArray(selection?.occurrencePath) && selection.occurrencePath.length > 0)
}


/**
 * The streaming builders' roots among the scene's top-level children.
 * `ShareIfcLoader` adds the root straight to the scene, so this never walks
 * the scene graph.
 *
 * @param {object} scene three.js scene (or anything with `children`)
 * @return {Array<object>} roots, usually zero or one
 */
export function streamingBatchRoots(scene) {
  const children = scene?.children
  if (!Array.isArray(children)) {
    return []
  }
  return children.filter((child) => child?.userData?.[STREAMING_BATCHES_KEY] !== undefined)
}


/**
 * The row a raycast hit on a streaming batch, or null when the hit is not on
 * one (or is on a row past what the builder has written, which three cannot
 * report but a stale intersection list could).
 *
 * @param {object} hit one three.js intersection
 * @return {object|null} `{parentExpressId, instanceId, occurrencePath,
 *   geometryId}`
 */
export function streamingPickOf(hit) {
  const mesh = hit?.object
  if (!mesh?.isBatchedMesh) {
    return null
  }
  let node = mesh.parent
  while (node) {
    const builder = node.userData?.[STREAMING_BATCHES_KEY]
    if (builder !== undefined) {
      return builder.pickRow(mesh, hit.batchId)
    }
    node = node.parent
  }
  return null
}


/**
 * Paint the selection onto every streaming batch in the scene, restoring
 * rows that left it. A no-op when nothing is streaming.
 *
 * @param {object} scene three.js scene
 * @param {object} selection `{parents, instances, occurrencePath}`: the
 *   selected element ids, the per-instance narrowing (when non-empty it
 *   decides alone, as `setInstanceSelection` does on the finished model),
 *   and a STEP occurrence path whose rows (and descendants') are selected
 * @param {object|null} color three.js Color of the selection, or null to
 *   restore everything
 * @return {number} rows now painted
 */
export function paintStreamingSelection(scene, selection, color) {
  // Kept on the scene, while a load is in flight, for a builder that installs
  // later: a selection made after the index but before the first batch finds
  // no streaming root yet, and nothing else would replay it onto the rows
  // when they come (codex round 5 on #2084). See LOAD_SELECTION_KEY.
  if (scene?.userData && LOAD_SELECTION_KEY in scene.userData) {
    scene.userData[LOAD_SELECTION_KEY] =
      color === null || isEmptySelection(selection) ? null : {selection, color}
  }
  let painted = 0
  for (const root of streamingBatchRoots(scene)) {
    painted += root.userData[STREAMING_BATCHES_KEY].paintSelection(selection, color)
  }
  return painted
}


/**
 * The streaming batches' rows as a stand-in model for the viewer's
 * per-instance queries, while the load has no model 0 yet: an object with a
 * `traverse` over the builders' table views (`IncrementalBatchedBuilder
 * #liveTables`). This is what makes a STEP pick made mid-pump get the
 * finished model's answers to "which instances are root-level" and "which
 * instances sit at this occurrence" (a shift-pick toggling a root-level shell
 * needs the first; codex on Share#2084). Null when nothing is streaming.
 *
 * @param {object} scene three.js scene
 * @return {object|null} `{traverse(fn)}`
 */
export function streamingTablesModel(scene) {
  const roots = streamingBatchRoots(scene)
  if (roots.length === 0) {
    return null
  }
  return {
    traverse(fn) {
      for (const root of roots) {
        for (const view of root.userData[STREAMING_BATCHES_KEY].liveTables()) {
          fn(view)
        }
      }
    },
  }
}
