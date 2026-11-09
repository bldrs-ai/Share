import {Box3} from 'three'
import {acceleratedRaycast} from 'three-mesh-bvh'
import {hasInactiveInstances, isActive} from './batchedInstanceTables'


/**
 * BVH-accelerated `BatchedMesh.raycast` that survives deleted instances —
 * installed on the prototype by `ShareIfc.js` in place of three-mesh-bvh's
 * bare `acceleratedRaycast`.
 *
 * three-mesh-bvh 0.9.10's batched raycast walks EVERY id three has issued
 * and asks `this.getVisibleAt(i)` first
 * (node_modules/three-mesh-bvh/src/utils/ExtensionUtilities.js:110-116).
 * three r0.184's `getVisibleAt` validates the id and throws on a deleted
 * instance (node_modules/three/src/objects/BatchedMesh.js:1185-1190, via
 * `validateInstanceId` :452-462). So after one `deleteInstance` every pick and
 * every hover on that batch would throw — not just miss. (three's own,
 * non-BVH raycast checks `active` and is fine, BatchedMesh.js:1407; the BVH
 * path is the one production uses.)
 *
 * The fix answers `getVisibleAt` with "not visible" for an inactive id, and
 * only for the duration of this call: an own-property shadow on the
 * instance, removed in `finally`, so three's validator stays strict for
 * every other caller. A batch with nothing deleted — every model nobody has
 * edited — takes the library call unchanged.
 *
 * Installed as a prototype method, so `this` is the BatchedMesh raycast.
 *
 * @this {object}
 * @param {object} raycaster THREE.Raycaster
 * @param {Array<object>} intersects
 */
export function raycastActiveInstances(raycaster, intersects) {
  ensureFallbackBoundingBox(this)
  if (!this.isBatchedMesh || !hasInactiveInstances(this)) {
    acceleratedRaycast.call(this, raycaster, intersects)
    return
  }
  const hadOwn = Object.prototype.hasOwnProperty.call(this, 'getVisibleAt')
  const getVisibleAt = this.getVisibleAt
  this.getVisibleAt = function getVisibleAtSkippingDeleted(batchId) {
    return isActive(this, batchId) && getVisibleAt.call(this, batchId)
  }
  try {
    acceleratedRaycast.call(this, raycaster, intersects)
  } finally {
    if (hadOwn) {
      this.getVisibleAt = getVisibleAt
    } else {
      delete this.getVisibleAt
    }
  }
}


/**
 * Give the batch geometry a `boundingBox` for three-mesh-bvh's per-geometry
 * fallback to write into.
 *
 * For an instance whose geometry has no tree yet, the batched raycast does
 * `this.getBoundingBoxAt(geometryId, this.geometry.boundingBox)`
 * (node_modules/three-mesh-bvh/src/utils/ExtensionUtilities.js:121-126), and
 * `getBoundingBoxAt` copies into its target, so a null box throws. It never
 * came up while every tree was built at load, because the first tree's build
 * sets the box. Now trees are built after the model is shown
 * (deferredBatchedBvh.js), so a pick can arrive before the first one; and a
 * capacity grow (batchedGeometryCapacity.js) swaps in a fresh geometry with
 * no box. The library overwrites the box per pick, so its value means
 * nothing; it only has to exist.
 *
 * @param {object} mesh
 */
function ensureFallbackBoundingBox(mesh) {
  if (mesh.isBatchedMesh && Array.isArray(mesh.boundsTrees) && mesh.geometry?.boundingBox === null) {
    mesh.geometry.boundingBox = new Box3()
  }
}
