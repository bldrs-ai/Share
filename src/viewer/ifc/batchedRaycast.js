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
