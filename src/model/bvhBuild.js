import {computeBatchedBoundsTree, computeBoundsTree} from 'three-mesh-bvh'


/**
 * The depth at which three-mesh-bvh stops splitting and makes a leaf of
 * whatever is left, however many triangles that is. Its own default, named
 * here so the depth-cap check below and the build agree.
 */
export const BVH_MAX_DEPTH = 40


/**
 * `BufferGeometry.prototype.computeBoundsTree`, as ShareIfc installs it:
 * three-mesh-bvh's, built without its console warning, with a depth-cap hit
 * handed to the caller's `onDepthCap` instead, which records it on the load
 * report (loader/loadProgress.js#LoadReporter#bvhDepthCap). The model takes
 * a callback and imports nothing from the loader (open-t200 slice R,
 * design/tracks/open-t200/layering.md §4.4). A build with none (an edit's
 * new geometry, batchedEdit.js) is not a load's, and its cap goes nowhere.
 *
 * Why not the warning: `BVH: Max depth of 40 reached when generating BVH.
 * Consider increasing maxDepth.` is a performance note, not a defect: picks
 * stay correct, and a ray that reaches the capped leaf only tests its
 * triangles one by one. But it is a console.warn during the load, so the load
 * reporter's tee made it the title of the diagnostics event, and on large
 * models it buried the engine messages under it (SHARE-1MT, 354 users). The
 * load report's `Health:` line keeps what the warning never said: how big the
 * capped leaves are, which is the number for deciding whether to raise
 * `maxDepth` or build with the SAH strategy.
 *
 * Installed as a prototype method, so `this` is the BufferGeometry.
 *
 * @this {object}
 * @param {object} [options] three-mesh-bvh MeshBVH options, plus
 *   `onDepthCap({trees, maxLeafTriangles, maxDepth})`, which is not passed on
 * @return {object} the MeshBVH
 */
export function computeQuietBoundsTree(options = {}) {
  const {onDepthCap, ...bvhOptions} = options
  const resolved = {verbose: false, maxDepth: BVH_MAX_DEPTH, ...bvhOptions}
  const bvh = computeBoundsTree.call(this, resolved)
  noteDepthCap([bvh], resolved.maxDepth, onDepthCap)
  return bvh
}


/**
 * `BatchedMesh.prototype.computeBoundsTree`, as ShareIfc installs it: the
 * batched build (one tree per geometry, or the one at `index`) under the same
 * terms as {@link computeQuietBoundsTree}.
 *
 * Installed as a prototype method, so `this` is the BatchedMesh.
 *
 * @this {object}
 * @param {number} [index] geometry id, or -1 for every geometry
 * @param {object} [options] three-mesh-bvh MeshBVH options, plus
 *   `onDepthCap` as above
 * @return {object|Array<object>|null} what three-mesh-bvh returns: the
 *   bounds-tree array for -1, else the one tree (or null)
 */
export function computeQuietBatchedBoundsTree(index = -1, options = {}) {
  const {onDepthCap, ...bvhOptions} = options
  const resolved = {verbose: false, maxDepth: BVH_MAX_DEPTH, ...bvhOptions}
  const built = computeBatchedBoundsTree.call(this, index, resolved)
  noteDepthCap(index < 0 ? built : [built], resolved.maxDepth, onDepthCap)
  return built
}


/**
 * Which of these trees reached the depth cap, and the largest leaf at the
 * cap. Walks each tree once (`MeshBVH#traverse`, every root), which costs a
 * fraction of the build it follows.
 *
 * A leaf at the cap depth is how a cap hit shows: three-mesh-bvh makes a leaf
 * at `maxDepth` whatever it holds. Only those leaves are measured. A run of
 * identical centroids stops earlier and silently, possibly in a large leaf of
 * the same tree, but that isn't what the cap did and no `maxDepth` would
 * split it, so counting it would mislead the retune this number is for. (Not
 * `getBVHExtremes`: its `primitives.max` spans every leaf of a root.)
 *
 * @param {Array<object|null>} bvhs MeshBVH instances; nulls are skipped
 * @param {number} maxDepth the depth the trees were built with
 * @return {{trees: number, maxLeafTriangles: number}|null} null when none
 *   reached the cap
 */
export function depthCapExtremes(bvhs, maxDepth) {
  let trees = 0
  let maxLeafTriangles = 0
  for (const bvh of bvhs ?? []) {
    if (!bvh) {
      continue
    }
    const largest = largestCappedLeaf(bvh, maxDepth)
    if (largest !== null) {
      trees++
      maxLeafTriangles = Math.max(maxLeafTriangles, largest)
    }
  }
  return trees > 0 ? {trees, maxLeafTriangles} : null
}


/**
 * @param {object} bvh a MeshBVH
 * @param {number} maxDepth
 * @return {number|null} the most triangles in one leaf at `maxDepth`, or null
 *   when no leaf reached it
 */
function largestCappedLeaf(bvh, maxDepth) {
  let largest = null
  // A tree has one root per geometry group; `_roots` is how three-mesh-bvh's
  // own getBVHExtremes enumerates them, and there is no public count.
  const rootCount = bvh._roots?.length ?? 1
  const visit = (depth, isLeaf, boundingData, offsetOrSplit, count) => {
    if (isLeaf && depth >= maxDepth) {
      largest = Math.max(largest ?? 0, count)
    }
  }
  for (let rootIndex = 0; rootIndex < rootCount; rootIndex++) {
    bvh.traverse(visit, rootIndex)
  }
  return largest
}


/**
 * @param {Array<object|null>} bvhs
 * @param {number} maxDepth
 * @param {Function} [onDepthCap]
 */
function noteDepthCap(bvhs, maxDepth, onDepthCap) {
  if (typeof onDepthCap !== 'function') {
    return
  }
  const capped = depthCapExtremes(bvhs, maxDepth)
  if (capped) {
    onDepthCap({...capped, maxDepth})
  }
}
