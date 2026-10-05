/**
 * batchedGeometryCapacity — room for `addGeometry` on a batch that has
 * already finished loading (create-300 L0, #1915).
 *
 * Every builder leaves a batch with no spare vertex or index space: the
 * one-shot builder and the cache-hit hydration size it exactly up front
 * (`flatMeshToBatchedModel.js#buildBatch`,
 * `instancedGlbToBatchedModel.js#buildPartition`), and the streaming builder
 * trims its slack at `finalize` (`IncrementalBatchedBuilder.trimCapacity_`).
 * That is the right call for an unedited model — the spare space would be
 * retained for its whole life — so headroom is NOT reserved at load. It is
 * made here, on demand, the first time an edit adds geometry, which is also
 * what keeps an unedited model's memory and every output byte unchanged.
 *
 * **Why not just call `setGeometrySize`.** three r0.184's
 * `setGeometrySize` begins with a shrink check that spreads one argument per
 * ACTIVE geometry into `Math.max(...)`
 * (node_modules/three/src/objects/BatchedMesh.js:1328-1344). Past the
 * engine's argument limit — measured at ~125k on V8 and ~65k on
 * JavaScriptCore (`incrementalBatchedBuilder.js#probeSpreadLimit`) — that
 * throws before anything is resized, and large models carry batches past it
 * (sp-946MB, Share#1809). For a GROW the check is vacuous: every active range
 * ends at or before `_nextVertexStart <= _maxVertexCount`, below the new size.
 * So the call runs with `_geometryInfo` swapped for an empty list, which makes
 * the spread zero arguments on every engine, and is restored before
 * returning. Everything else — reallocating the attributes and the index
 * (switching it to 32-bit when the vertex count passes 65,535) and copying
 * the old contents across at the same offsets — is three's own code
 * (BatchedMesh.js:1346-1378). The swap touches the same private field
 * three-mesh-bvh and `batchedGeometryRanges.js` already depend on.
 *
 * **Collapsed cache-hit batches are supported**, not refused.
 * `batchedGeometryRanges.js` registers many geometry ids over one shared
 * reserved block. What breaks that is anything that MOVES a block —
 * `optimize()` (BatchedMesh.js:878-970) — not growth: the copy here keeps
 * every byte at its offset, so each synthesised range still addresses its
 * own triangles, and `addGeometry` appends past the shared block
 * (`_nextVertexStart` already sits after it). Repacking a range batch stays
 * unsupported; nothing calls `optimize()` today, and #1913's memory half is
 * where that decision belongs (design/new/model-edit.md §"L0").
 */


/**
 * Geometric growth factor for the vertex and index buffers. Amortises a run
 * of added shapes to O(1) copies per byte while keeping the one-off cost of
 * the first edit modest — the buffers being grown can be hundreds of MB, and
 * doubling them to add one box is what this avoids.
 */
const GEOMETRY_GROWTH = 1.25

/**
 * Minimum headroom added per growth, so a small model does not reallocate
 * once per shape in a burst of small additions.
 */
const MIN_VERTEX_GROWTH = 4096
const MIN_INDEX_GROWTH = 8192


/**
 * Next capacity for one buffer: enough for what is needed, and at least one
 * geometric step and one minimum step past what there is.
 *
 * @param {number} capacity current element capacity
 * @param {number} used elements in use
 * @param {number} need elements the caller is about to add
 * @param {number} minStep
 * @return {number}
 */
function nextCapacity(capacity, used, need, minStep) {
  return Math.max(used + need, Math.ceil(capacity * GEOMETRY_GROWTH), capacity + minStep)
}


/**
 * Resize the batch buffers without three's shrink check (module doc).
 *
 * @param {object} mesh THREE.BatchedMesh
 * @param {number} maxVertexCount strictly larger than the current capacity
 * @param {number} maxIndexCount at least the current capacity
 */
function growBuffers(mesh, maxVertexCount, maxIndexCount) {
  const geometryInfo = mesh._geometryInfo
  const before = mesh.geometry
  if (Array.isArray(geometryInfo)) {
    mesh._geometryInfo = []
  }
  try {
    mesh.setGeometrySize(maxVertexCount, maxIndexCount)
  } finally {
    mesh._geometryInfo = geometryInfo
  }
  if (mesh.geometry === before) {
    return
  }
  // three replaced `mesh.geometry` with a fresh BufferGeometry over the
  // copied arrays. Two things still point at the old one:
  //
  // - Each per-geometry MeshBVH (`computeBatchedBoundsTree`, installed by
  //   ShareIfc.js) holds the geometry it was built over and reads its index
  //   and positions to raycast (three-mesh-bvh GeometryBVH.js:86,119). The
  //   copy put every byte at the same offset, so the trees are still exact;
  //   rebinding them lets the old buffers be collected instead of being kept
  //   alive by the trees for the life of the model.
  // - The old geometry's `boundingBox`, which MeshBVH sets on the batch
  //   geometry while building (GeometryBVH.js:158-160) and the BVH raycast
  //   reads when a geometry has no tree (ExtensionUtilities.js:125-131).
  //   Carried over so that path finds the same state it did before.
  if (Array.isArray(mesh.boundsTrees)) {
    for (const tree of mesh.boundsTrees) {
      if (tree) {
        tree.geometry = mesh.geometry
      }
    }
  }
  if (before?.boundingBox && !mesh.geometry.boundingBox) {
    mesh.geometry.boundingBox = before.boundingBox
  }
}


/**
 * Make sure the batch has room for one more geometry of the given size,
 * growing its buffers if it does not.
 *
 * @param {object} mesh THREE.BatchedMesh
 * @param {number} vertexCount vertices about to be added
 * @param {number} indexCount indices about to be added
 * @return {boolean} whether the buffers were grown
 */
export function ensureGeometryCapacity(mesh, vertexCount, indexCount) {
  const freeVertices = mesh.unusedVertexCount
  const freeIndices = mesh.unusedIndexCount
  if (freeVertices >= vertexCount && freeIndices >= indexCount) {
    return false
  }
  // The allocated arrays ARE the capacity (`_initializeGeometry` sizes them
  // to `_maxVertexCount` / `_maxIndexCount`, BatchedMesh.js:380-414). A batch
  // that never received a geometry has none allocated, and nothing in use.
  const vertexCapacity = mesh.geometry.attributes.position?.count ?? freeVertices
  const indexCapacity = mesh.geometry.index?.count ?? freeIndices
  growBuffers(
    mesh,
    nextCapacity(vertexCapacity, vertexCapacity - freeVertices, vertexCount, MIN_VERTEX_GROWTH),
    nextCapacity(indexCapacity, indexCapacity - freeIndices, indexCount, MIN_INDEX_GROWTH))
  return true
}


/**
 * Add a shape to a batch after load, growing it first when it is full.
 *
 * When the batch carries per-geometry bounds trees (every production batch:
 * `decorateBatchMeshes` builds them), the new id gets its own. Without one,
 * three-mesh-bvh raycasts the id by reading the batch geometry's
 * `boundingBox` (ExtensionUtilities.js:127), which a grown batch does not
 * necessarily have; and when the id is one three RECYCLED from a deleted
 * geometry (BatchedMesh.js:677-682), the old tree would answer for the new
 * triangles. Building it here closes both.
 *
 * @param {object} mesh THREE.BatchedMesh
 * @param {object} geometry indexed BufferGeometry with the batch's attributes
 * @return {number} the new geometry id
 */
export function addBatchedGeometry(mesh, geometry) {
  const vertexCount = geometry.getAttribute('position').count
  const indexCount = geometry.getIndex()?.count ?? 0
  ensureGeometryCapacity(mesh, vertexCount, indexCount)
  const geometryId = mesh.addGeometry(geometry)
  if (Array.isArray(mesh.boundsTrees) && typeof mesh.computeBoundsTree === 'function') {
    mesh.computeBoundsTree(geometryId)
  }
  return geometryId
}
