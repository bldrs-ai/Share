/* eslint-disable no-magic-numbers */
// Decorated batched models for the create-300 L0 suites (#1915), built by
// the production one-shot builder and decorated by the production
// `decorateBatchMeshes` — so a suite that deletes or pastes an instance does
// it to the tables, index and colour state a real load leaves behind, not to
// a hand-rolled double that only has the fields the suite thought of.
import {BatchedMesh, Mesh} from 'three'
import {
  acceleratedRaycast,
  computeBatchedBoundsTree,
  disposeBatchedBoundsTree,
} from 'three-mesh-bvh'
import {decorateBatchMeshes} from './buildBatchedConwayModel'
import {flatMeshToBatchedModel} from './flatMeshToBatchedModel'


export const RED = {x: 1, y: 0, z: 0, w: 1}
export const GREEN = {x: 0, y: 1, z: 0, w: 1}
export const BLUE = {x: 0, y: 0, z: 1, w: 1}
export const GREY = {x: 0.8, y: 0.8, z: 0.8, w: 1}

/** Conway geometry express id of the fixture's one shape. */
export const SHAPE_ID = 999

/** X spacing between placements, wide enough that no ray is ambiguous. */
export const SPACING = 10


/**
 * @param {number} x translation in X
 * @return {Array<number>} column-major translation matrix
 */
function translateX(x) {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1]
}


/** @return {object} mock Conway IfcAPI serving one unit triangle at SHAPE_ID. */
export function unitTriangleApi() {
  const verts = new Float32Array([
    0, 0, 0, 0, 0, 1,
    1, 0, 0, 0, 0, 1,
    0, 1, 0, 0, 0, 1,
  ])
  const indices = new Uint32Array([0, 1, 2])
  return {
    GetGeometry: (_modelID, id) => (id === SHAPE_ID ? {
      GetVertexData: () => id,
      GetIndexData: () => id,
      GetVertexDataSize: () => verts.length,
      GetIndexDataSize: () => indices.length,
    } : null),
    GetVertexArray: () => verts,
    GetIndexArray: () => indices,
  }
}


/**
 * One decorated opaque batch of four placements of the unit triangle, in
 * emission order (= batch id = occurrence id), each at x = id * SPACING:
 *
 *   0: product 100, path [10, 11]   1: product 100, path [10, 12]
 *   2: product 200, path [20]       3: product 300, path [30]
 *
 * STEP-shaped (occurrence paths) so the reverse path index is live. Colors
 * default to RED/RED/GREEN/BLUE; pass `colors` (e.g. all GREY) for a
 * colorless model the auto palette applies to.
 *
 * @param {object} [opts]
 * @param {Array<object>} [opts.colors] four `{x,y,z,w}` colors
 * @return {object} the decorated THREE.BatchedMesh
 */
export function decoratedStepBatch({colors = [RED, RED, GREEN, BLUE]} = {}) {
  const placements = [[100, [10, 11]], [100, [10, 12]], [200, [20]], [300, [30]]]
  const flatMeshes = placements.map(([expressID, occurrencePath], i) => ({
    expressID,
    geometries: [{
      geometryExpressID: SHAPE_ID,
      flatTransformation: translateX(i * SPACING),
      color: {...colors[i]},
      occurrencePath,
    }],
  }))
  const {batches} = flatMeshToBatchedModel(flatMeshes, unitTriangleApi(), 0)
  decorateBatchMeshes(batches)
  return batches[0].mesh
}


/**
 * Run `fn` with three-mesh-bvh's batched raycast + bounds trees installed on
 * the prototypes, as `ShareIfc.js` installs them in production (the Jest
 * harness mocks ShareIfc), and put the prototypes back afterwards.
 *
 * @param {Function} raycast the `BatchedMesh.prototype.raycast` to install
 * @param {Function} fn
 * @return {*} fn's result
 */
export function withBvhPrototypes(raycast, fn) {
  const original = {
    raycast: BatchedMesh.prototype.raycast,
    meshRaycast: Mesh.prototype.raycast,
    computeBoundsTree: BatchedMesh.prototype.computeBoundsTree,
    disposeBoundsTree: BatchedMesh.prototype.disposeBoundsTree,
  }
  BatchedMesh.prototype.computeBoundsTree = computeBatchedBoundsTree
  BatchedMesh.prototype.disposeBoundsTree = disposeBatchedBoundsTree
  BatchedMesh.prototype.raycast = raycast
  // The batched raycast delegates to a scratch Mesh, and only the
  // accelerated Mesh.raycast consults the bounds tree it is handed.
  Mesh.prototype.raycast = acceleratedRaycast
  try {
    return fn()
  } finally {
    BatchedMesh.prototype.raycast = original.raycast
    Mesh.prototype.raycast = original.meshRaycast
    BatchedMesh.prototype.computeBoundsTree = original.computeBoundsTree
    BatchedMesh.prototype.disposeBoundsTree = original.disposeBoundsTree
  }
}
