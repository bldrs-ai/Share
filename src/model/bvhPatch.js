// three-mesh-bvh's prototype patches, cut from viewer/ifc/ShareIfc.js
// (design/tracks/open-t200/layering.md §2.2). The model's builders call
// `geometry.computeBoundsTree()`, so they need the patch, but nothing in
// the model installs it on import: whoever composes the app does, which is
// ShareIfc.js at its module load on the page. Most Jest suites mock ShareIfc
// (ShareIfc.dispose.test.js imports it for real), so they run on unpatched
// three on purpose; a module that patched three's
// prototypes on import would change what every later test in its Jest file
// exercises. A test that wants the patch installs it and calls the function
// this returns to put the originals back.

import {BatchedMesh, BufferGeometry, Mesh} from 'three'
import {acceleratedRaycast, disposeBoundsTree} from 'three-mesh-bvh'
import {raycastActiveInstances} from './batchedRaycast'
import {computeQuietBatchedBoundsTree, computeQuietBoundsTree} from './bvhBuild'
import {disposeDeferredBatchedBoundsTree} from './deferredBatchedBvh'


/**
 * Install the six prototype patches below. Idempotent.
 *
 * @return {Function} restores the prototypes as they were before this call
 */
export function installBvhPatches() {
  const originals = {
    geometryCompute: BufferGeometry.prototype.computeBoundsTree,
    geometryDispose: BufferGeometry.prototype.disposeBoundsTree,
    meshRaycast: Mesh.prototype.raycast,
    batchedCompute: BatchedMesh.prototype.computeBoundsTree,
    batchedDispose: BatchedMesh.prototype.disposeBoundsTree,
    batchedRaycast: BatchedMesh.prototype.raycast,
  }
  // Install three-mesh-bvh's accelerated raycasting globally. The fork's
  // `IfcManager.setupThreeMeshBVH` did this (via web-ifc-three) at viewer
  // construction; with the fork gone, ShareIfc owns it. The prototype patch
  // is what makes `geometry.computeBoundsTree()` (Conway-direct parse +
  // cache-hit GLB decoration in Loader.js) and BVH-accelerated
  // `mesh.raycast` work, and `geometry.disposeBoundsTree()` (IfcContext
  // teardown) defined — without it, picking on multi-million-triangle
  // models falls back to O(triangles) brute force. Module-level +
  // idempotent (re-assigning the same functions is harmless). Runs in
  // production only: ShareIfc is mocked in the Jest harness (mirroring the
  // fork's manager, which was also mocked), so tests keep running against
  // unpatched three exactly as before. The build is three-mesh-bvh's without
  // its depth-cap console warning, which became the title of SHARE-1MT's load
  // diagnostics; the cap is recorded on the load report instead (bvhBuild.js).
  // Every format's BVH goes through these two patches.
  BufferGeometry.prototype.computeBoundsTree = computeQuietBoundsTree
  BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree
  Mesh.prototype.raycast = acceleratedRaycast

  // Same accelerated raycast for the Conway-direct BatchedMesh path. The
  // shared `acceleratedRaycast` dispatches on `this.isBatchedMesh` to
  // `acceleratedBatchedMeshRaycast`, which walks each instance's per-geometry
  // bounds tree (populated by `computeBatchedBoundsTree`) and still sets
  // `intersection.batchId` — the per-occurrence handle CadView reads to
  // resolve a pick. When a batch has no bounds trees built it falls back to
  // three's native BatchedMesh raycast (also batchId-bearing), so the patch
  // is safe even on batches we never call `computeBoundsTree()` on.
  // `raycastActiveInstances` is that same call, made safe for a batch with a
  // deleted instance, which the library's walk would otherwise throw on
  // (create-300 L0, #1915 — see batchedRaycast.js). A model's trees are
  // built after it is on screen (deferredBatchedBvh.js), so the dispose also
  // stops a build still running for a model being torn down.
  BatchedMesh.prototype.computeBoundsTree = computeQuietBatchedBoundsTree
  BatchedMesh.prototype.disposeBoundsTree = disposeDeferredBatchedBoundsTree
  BatchedMesh.prototype.raycast = raycastActiveInstances
  return () => {
    BufferGeometry.prototype.computeBoundsTree = originals.geometryCompute
    BufferGeometry.prototype.disposeBoundsTree = originals.geometryDispose
    Mesh.prototype.raycast = originals.meshRaycast
    BatchedMesh.prototype.computeBoundsTree = originals.batchedCompute
    BatchedMesh.prototype.disposeBoundsTree = originals.batchedDispose
    BatchedMesh.prototype.raycast = originals.batchedRaycast
  }
}
