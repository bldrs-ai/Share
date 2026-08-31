import {BufferAttribute, BufferGeometry} from 'three'


/**
 * batchedInstanceGeometry — read one instance's SOURCE geometry back out of
 * the `THREE.BatchedMesh` that already holds it, instead of retaining a
 * second copy of every shape for the life of the model.
 *
 * The batched consumers — isolation subsets (`batchedSubset`), the merged
 * and batched GLB writers (`batchedToMergedMesh`, `glbBatchedExport`) and
 * the residency controller — all used to read a per-instance table of the
 * local-space `BufferGeometry` objects the batch was assembled from,
 * stamped on the mesh as `instanceGeometry`. Those objects are a full
 * DUPLICATE of data three already owns: `addGeometry` copies every
 * position / normal / index component into the batch's own buffers and
 * keeps no reference to the source (`BatchedMesh.setGeometryAt`,
 * node_modules/three/src/objects/BatchedMesh.js:743-792). Measured at
 * **171.5 MB** retained on a 231 MB model — 24% of the whole external
 * ArrayBuffer bucket — to serve occasional selection re-bakes (Share#1810,
 * byte-lever 1 of the conway#679 attribution). This module is the
 * replacement: given a `batchId` it reconstructs the identical geometry
 * from the batch's own buffers on demand, so the payload is stored once.
 *
 * **Public accessors only.** `getGeometryIdAt` and `getGeometryRangeAt` are
 * documented API in three r0.184 (BatchedMesh.js:1217 and :1237) and return
 * exactly the `{vertexStart, vertexCount, indexStart, indexCount}` this
 * needs, so nothing here reaches into `_geometryInfo`. Both validate their
 * id and THROW on an inactive or out-of-range one, which is why the range
 * read below is wrapped: the callers' old contract for a missing entry was
 * "skip this instance", not "fail the pass".
 *
 * **Ranges are read fresh, never snapshotted.** A batch's ranges move: this
 * repo's own `finalize()` trims capacity with `setGeometrySize`, which
 * disposes the batch geometry and reallocates every buffer
 * (BatchedMesh.js:1350-1378), and three's `optimize()` compacts starts
 * outright. A cached range or a cached view onto an old array reads
 * garbage after either. The per-pass cache below therefore keys on the
 * SOURCE shape and holds finished copies, and every entry it misses goes
 * back to `getGeometryRangeAt` for the current numbers.
 */


/** Item size of an unindexed scalar attribute (the rebuilt index). */
const SCALAR = 1


/**
 * Whether a mesh can serve geometry reads through the batch buffers — the
 * replacement for the old `mesh.instanceGeometry` truthiness guard.
 *
 * @param {object} mesh candidate THREE.BatchedMesh
 * @return {boolean}
 */
export function hasBatchedGeometry(mesh) {
  return Boolean(
    mesh?.isBatchedMesh &&
    typeof mesh.getGeometryIdAt === 'function' &&
    typeof mesh.getGeometryRangeAt === 'function' &&
    mesh.geometry?.attributes?.position &&
    mesh.geometry.index)
}


/**
 * The batch-buffer range backing one instance, plus the geometry id it
 * resolved through.
 *
 * @param {object} mesh a THREE.BatchedMesh
 * @param {number} batchId instance id
 * @param {object} [target] reused result object
 * @return {?object} `{geometryId, vertexStart, vertexCount, indexStart,
 *   indexCount, …}` or null when the instance has no live geometry
 */
export function instanceGeometryRangeAt(mesh, batchId, target = {}) {
  if (!hasBatchedGeometry(mesh)) {
    return null
  }
  let geometryId
  try {
    geometryId = mesh.getGeometryIdAt(batchId)
    mesh.getGeometryRangeAt(geometryId, target)
  } catch {
    // Deleted / never-added instance or geometry: three throws from its id
    // validators. The consumers' pre-existing behaviour for a table entry
    // that wasn't there is to skip that instance, so keep it.
    return null
  }
  if (!(target.vertexCount > 0) || !(target.indexCount > 0)) {
    return null
  }
  target.geometryId = geometryId
  return target
}


/**
 * Rebuild one shape's local-space geometry from a batch range.
 *
 * Byte-identical to what `localGeometry` produced for the same shape:
 * `setGeometryAt` copies positions and normals component-wise into the same
 * float32 slots, and writes each index as `vertexStart + srcIndex`
 * (BatchedMesh.js:778) — so subtracting `vertexStart` here recovers the
 * original local index values exactly. The index is rebuilt as a
 * `Uint32Array` regardless of the batch's own index width, matching
 * `localGeometry`'s `Uint32Array.from(rawIndices)`; a batch small enough to
 * use a Uint16 index holds values that fit either way.
 *
 * @param {object} mesh a THREE.BatchedMesh
 * @param {object} range from {@link instanceGeometryRangeAt}
 * @return {BufferGeometry}
 */
function rebuildGeometry(mesh, range) {
  const batch = mesh.geometry
  const {vertexStart, vertexCount, indexStart, indexCount} = range
  const geometry = new BufferGeometry()
  for (const name of ['position', 'normal']) {
    const attribute = batch.attributes[name]
    if (!attribute) {
      continue
    }
    const {itemSize} = attribute
    const slice = attribute.array.slice(
      vertexStart * itemSize, (vertexStart + vertexCount) * itemSize)
    geometry.setAttribute(name, new BufferAttribute(slice, itemSize))
  }
  const batchIndex = batch.index.array
  const indices = new Uint32Array(indexCount)
  for (let i = 0; i < indexCount; i++) {
    indices[i] = batchIndex[indexStart + i] - vertexStart
  }
  geometry.setIndex(new BufferAttribute(indices, SCALAR))
  return geometry
}


/**
 * Cache key for the SOURCE shape behind an instance.
 *
 * Object identity used to carry this: both builders add one
 * `BufferGeometry` per `geometryExpressID` and push that same object into
 * every instance's table, including across the opaque/transparent split, so
 * consumers that dedupe by geometry reference (the GLB writer's accessor
 * table, the residency controller's per-shape use counts) saw one entry for
 * a shape used in both batches. Keying on `instanceGeometryIds` — the same
 * source id the builders dedupe by — reproduces that exactly. Meshes
 * without that table (older BatchHandle shapes, artifacts that carried no
 * geometry ids) fall back to per-mesh geometry ids, which dedupes within a
 * batch and never across one.
 *
 * @param {object} mesh a THREE.BatchedMesh
 * @param {number} batchId instance id
 * @param {number} geometryId the batch's own geometry id
 * @return {string}
 */
function sourceKey(mesh, batchId, geometryId) {
  const sourceIds = mesh.instanceGeometryIds
  const sourceId = sourceIds ? sourceIds[batchId] : undefined
  return sourceId === undefined ? `${mesh.uuid}#${geometryId}` : `src#${sourceId}`
}


/**
 * Read one instance's source geometry, optionally memoising per shape.
 *
 * @param {object} mesh a THREE.BatchedMesh
 * @param {number} batchId instance id
 * @param {?Map} [cache] per-pass shape cache (see
 *   {@link makeInstanceGeometryReader}); omit for a fresh copy every call
 * @return {?BufferGeometry} local-space geometry, or null when the instance
 *   has no live geometry in the batch
 */
export function instanceGeometryAt(mesh, batchId, cache = null) {
  const range = instanceGeometryRangeAt(mesh, batchId)
  if (range === null) {
    return null
  }
  if (cache === null) {
    return rebuildGeometry(mesh, range)
  }
  const key = sourceKey(mesh, batchId, range.geometryId)
  let geometry = cache.get(key)
  if (geometry === undefined) {
    geometry = rebuildGeometry(mesh, range)
    cache.set(key, geometry)
  }
  return geometry
}


/**
 * A reader that returns ONE geometry object per source shape for as long as
 * it is alive — the identity the consumers' dedup relies on — and releases
 * every copy the moment the caller drops it.
 *
 * Scope it to a single pass (one export, one subset build). Holding a
 * reader for the life of the model would re-create the duplicate this
 * module exists to remove; holding one across a batch mutation is worse,
 * because its copies then describe the batch as it used to be.
 *
 * @return {Function} `(mesh, batchId) => BufferGeometry|null`
 */
export function makeInstanceGeometryReader() {
  const cache = new Map()
  return (mesh, batchId) => instanceGeometryAt(mesh, batchId, cache)
}
