import {computeBatchedBoundsTree, computeBoundsTree, getBVHExtremes} from 'three-mesh-bvh'
import {reportBvhDepthCap} from '../../loader/loadProgress'


/**
 * The depth at which three-mesh-bvh stops splitting and makes a leaf of
 * whatever is left, however many triangles that is. Its own default, named
 * here so the depth-cap check below and the build agree.
 */
export const BVH_MAX_DEPTH = 40


/**
 * `BufferGeometry.prototype.computeBoundsTree`, as ShareIfc installs it:
 * three-mesh-bvh's, built without its console warning, with a depth-cap hit
 * recorded on the load report instead.
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
 * @param {object} [options] three-mesh-bvh MeshBVH options
 * @return {object} the MeshBVH
 */
export function computeQuietBoundsTree(options = {}) {
  const resolved = {verbose: false, maxDepth: BVH_MAX_DEPTH, ...options}
  const bvh = computeBoundsTree.call(this, resolved)
  noteDepthCap([bvh], resolved.maxDepth)
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
 * @param {object} [options] three-mesh-bvh MeshBVH options
 * @return {object|Array<object>|null} what three-mesh-bvh returns: the
 *   bounds-tree array for -1, else the one tree (or null)
 */
export function computeQuietBatchedBoundsTree(index = -1, options = {}) {
  const resolved = {verbose: false, maxDepth: BVH_MAX_DEPTH, ...options}
  const built = computeBatchedBoundsTree.call(this, index, resolved)
  noteDepthCap(index < 0 ? built : [built], resolved.maxDepth)
  return built
}


/**
 * Which of these trees reached the depth cap, and the largest leaf among
 * them. Walks each tree once (three-mesh-bvh's `getBVHExtremes`), which costs
 * a fraction of the build it follows.
 *
 * A leaf at the cap depth is how a cap hit shows: three-mesh-bvh makes a leaf
 * at `maxDepth` whatever it holds. A run of identical centroids stops earlier
 * and silently, so it isn't counted, and isn't what the warning reported
 * either.
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
    let capped = false
    for (const root of getBVHExtremes(bvh)) {
      if (root.depth.max >= maxDepth) {
        capped = true
        maxLeafTriangles = Math.max(maxLeafTriangles, root.primitives.max)
      }
    }
    if (capped) {
      trees++
    }
  }
  return trees > 0 ? {trees, maxLeafTriangles} : null
}


/**
 * @param {Array<object|null>} bvhs
 * @param {number} maxDepth
 */
function noteDepthCap(bvhs, maxDepth) {
  const capped = depthCapExtremes(bvhs, maxDepth)
  if (capped) {
    reportBvhDepthCap({...capped, maxDepth})
  }
}
