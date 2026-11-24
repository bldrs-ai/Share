import {Box3, Mesh, Sphere} from 'three'
import {acceleratedRaycast} from 'three-mesh-bvh'
import {instanceCandidates} from './batchedInstanceBvh'
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
  const drawRange = this.isBatchedMesh ? this.geometry?.drawRange : null
  const {start, count} = drawRange ?? {}
  try {
    raycastSkippingDeleted(this, raycaster, intersects)
  } finally {
    // The library's per-geometry fallback (a geometry with no tree yet,
    // deferredBatchedBvh.js) narrows the batch geometry's draw range to each
    // geometry it tests, and its "restore" puts back the same object, already
    // narrowed (ExtensionUtilities.js:128-146). Nothing reads a batch's draw
    // range today (a BatchedMesh draws through its multi-draw lists), but
    // leave it as it was rather than as the last geometry tested.
    if (drawRange) {
      drawRange.start = start
      drawRange.count = count
    }
  }
}


/**
 * The raycast itself, with deleted instances answered "not visible" (see
 * {@link raycastActiveInstances}).
 *
 * @param {object} mesh
 * @param {object} raycaster
 * @param {Array<object>} intersects
 */
function raycastSkippingDeleted(mesh, raycaster, intersects) {
  // The instance tree, once built, names the few instances the ray can reach
  // (batchedInstanceBvh.js); until then, and for a batch three-mesh-bvh would
  // not take its per-instance path on, the library walks them all.
  const candidates = mesh.isBatchedMesh && mesh.boundsTrees ?
    instanceCandidates(mesh, raycaster.ray) : null
  if (candidates !== null) {
    raycastInstances(mesh, raycaster, intersects, candidates)
    return
  }
  if (!mesh.isBatchedMesh || !hasInactiveInstances(mesh)) {
    acceleratedRaycast.call(mesh, raycaster, intersects)
    return
  }
  const hadOwn = Object.prototype.hasOwnProperty.call(mesh, 'getVisibleAt')
  const getVisibleAt = mesh.getVisibleAt
  mesh.getVisibleAt = function getVisibleAtSkippingDeleted(batchId) {
    return isActive(this, batchId) && getVisibleAt.call(this, batchId)
  }
  try {
    acceleratedRaycast.call(mesh, raycaster, intersects)
  } finally {
    if (hadOwn) {
      mesh.getVisibleAt = getVisibleAt
    } else {
      delete mesh.getVisibleAt
    }
  }
}


const _mesh = new Mesh()
const _batchIntersects = []


/**
 * three-mesh-bvh 0.9.10's `acceleratedBatchedMeshRaycast`
 * (node_modules/three-mesh-bvh/src/utils/ExtensionUtilities.js:86-160), line
 * for line, over the ids `batchedInstanceBvh` names instead of every id, so
 * the hits it pushes are the library's own, in the library's order (ascending
 * id). The changes are in the visibility test: it asks {@link isActive}
 * first, because three's `getVisibleAt` throws on a deleted id (see
 * {@link raycastActiveInstances}), and it skips an id past three's span,
 * which `instanceCandidates` never names. That skip is a guard, so a
 * candidate list that ever did name one costs a miss rather than a throw. Keep it in step with the library on an
 * upgrade; `batchedInstanceBvh.test.js` compares the two hit for hit.
 *
 * `_mesh` is a scratch Mesh of our own rather than the library's, so its
 * `raycast` is whatever `Mesh.prototype.raycast` is: three-mesh-bvh's
 * accelerated one in production (ShareIfc.js), as for the library's scratch.
 *
 * @param {object} mesh BatchedMesh with `boundsTrees` armed
 * @param {object} raycaster
 * @param {Array<object>} intersects
 * @param {Array<number>} ids ascending batch ids
 */
function raycastInstances(mesh, raycaster, intersects, ids) {
  const boundsTrees = mesh.boundsTrees
  const drawInfo = mesh._instanceInfo
  const drawRanges = mesh._geometryInfo
  const matrixWorld = mesh.matrixWorld
  _mesh.material = mesh.material
  _mesh.geometry = mesh.geometry
  const oldBoundsTree = _mesh.geometry.boundsTree
  const oldDrawRange = _mesh.geometry.drawRange
  if (_mesh.geometry.boundingSphere === null) {
    _mesh.geometry.boundingSphere = new Sphere()
  }
  try {
    for (const i of ids) {
      if (i >= drawInfo.length || !isActive(mesh, i) || !mesh.getVisibleAt(i)) {
        continue
      }
      const geometryId = drawInfo[i].geometryIndex
      _mesh.geometry.boundsTree = boundsTrees[geometryId]
      mesh.getMatrixAt(i, _mesh.matrixWorld).premultiply(matrixWorld)
      if (!_mesh.geometry.boundsTree) {
        mesh.getBoundingBoxAt(geometryId, _mesh.geometry.boundingBox)
        mesh.getBoundingSphereAt(geometryId, _mesh.geometry.boundingSphere)
        const drawRange = drawRanges[geometryId]
        _mesh.geometry.setDrawRange(drawRange.start, drawRange.count)
      }
      _mesh.raycast(raycaster, _batchIntersects)
      for (const intersect of _batchIntersects) {
        intersect.object = mesh
        intersect.batchId = i
        intersects.push(intersect)
      }
      _batchIntersects.length = 0
    }
  } finally {
    _batchIntersects.length = 0
    _mesh.geometry.boundsTree = oldBoundsTree
    _mesh.geometry.drawRange = oldDrawRange
    _mesh.material = null
    _mesh.geometry = null
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
