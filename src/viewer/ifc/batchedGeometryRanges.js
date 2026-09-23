/**
 * batchedGeometryRanges — register SLICES of one already-uploaded
 * BufferGeometry as separate `THREE.BatchedMesh` geometry ids.
 *
 * This is the reader half of the mesh-collapse work deferred in
 * design/new/glb-export-premium.md §1.1c. That deferral's blocking fact:
 * a DSA-shaped artifact spends ~89% of its bytes declaring 28,674 glTF
 * meshes, each holding one 3-vertex shape, because per-element identity
 * lives in the glTF node graph. Collapsing those into one merged primitive
 * per color group removes essentially all of that declaration — but only if
 * the reader can still address each element INDEPENDENTLY, for picking,
 * per-element color, visibility and isolation.
 *
 * `BatchedMesh` has no API for that. `addGeometry()` copies a whole
 * `BufferGeometry` into the batch buffers via `setGeometryAt`
 * (node_modules/three/src/objects/BatchedMesh.js:626-700), and there is no
 * public way to say "this range of what you already hold is a geometry".
 * Re-splitting the merged buffer into N standalone geometries on every cache
 * hit would spend the whole win at load time, which is exactly the objection
 * §1.1c records. So this module synthesises the `_geometryInfo` entries
 * `addGeometry` would have produced, pointing them at data that is already
 * uploaded.
 *
 * **Why reaching into private state is the right call here, and what it
 * costs.** The repo already depends on `BatchedMesh` internals through
 * three-mesh-bvh, which reads `this._geometryInfo` and `this._instanceInfo`
 * directly in the `computeBatchedBoundsTree` / `acceleratedBatchedMeshRaycast`
 * pair that `ShareIfc.js:80-82` installs on the prototype
 * (node_modules/three-mesh-bvh/src/utils/ExtensionUtilities.js:92-93,229-230).
 * So the private shape is already load-bearing for picking; this module makes
 * that dependency explicit and, unlike the library, VERSION-GUARDS it:
 * `addGeometryRanges` compares the entry three actually produced against the
 * fields it is about to synthesise and refuses on any mismatch, so a three
 * upgrade that reshapes `_geometryInfo` turns into a fail-soft null (caller
 * keeps the un-collapsed path) rather than a model that picks the wrong
 * element.
 *
 * **What a synthesised range is, exactly.** `setGeometryAt` writes each index
 * as `vertexStart + srcIndex` (BatchedMesh.js:778), so a batch's index buffer
 * holds ABSOLUTE vertex indices and a draw is fully described by the index
 * range `{start, count}` alone. Everything downstream reads that and nothing
 * else: `raycast` sets `_mesh.geometry.setDrawRange(info.start, info.count)`
 * (BatchedMesh.js:1416); `getBoundingBoxAt` / `getBoundingSphereAt` walk
 * `[start, start + count)` dereferencing the index (BatchedMesh.js:992,1042);
 * three-mesh-bvh builds one `MeshBVH` per range with `options.range =
 * drawRanges[i]` (ExtensionUtilities.js:246-249); and this repo's own
 * `batchedInstanceGeometry` re-derives an instance's local geometry from
 * `getGeometryRangeAt`. A range therefore behaves as a first-class geometry
 * for every consumer that exists today.
 *
 * **The one invariant that makes it safe** is that an element's index range
 * dereferences ONLY vertices in its own vertex range. `rebuildGeometry`
 * (`batchedInstanceGeometry.js`) recovers local index values by subtracting
 * `vertexStart`, so a stray cross-element index would silently produce a
 * negative or out-of-slice index in every isolation subset and every
 * re-export. The writer is supposed to guarantee it by construction; this
 * module VERIFIES it, because the failure is silent corruption rather than a
 * throw, and a linear scan of the index buffer is cheap next to the upload
 * that just happened.
 *
 * **Not compatible with `optimize()` or `setGeometrySize()`.** Both re-pack
 * geometry by moving `reservedVertexCount` / `reservedIndexCount` blocks
 * (BatchedMesh.js:886-962,1325-1378) and assume each entry owns its block.
 * Synthesised ranges deliberately share one block, so a re-pack would
 * scatter them. Neither is called on the cache-hit hydration path; a batch
 * carrying ranges is marked so callers can assert that.
 */
import {glbInfo} from '../../loader/glbLog'


/**
 * Marker set on a `BatchedMesh` whose geometry ids include synthesised
 * ranges — see the `optimize()` / `setGeometrySize()` note in the module doc.
 */
export const BATCHED_GEOMETRY_RANGES_FLAG = 'bldrsHasGeometryRanges'


/**
 * The exact own-property set of a three r0.184 `_geometryInfo` entry, as
 * `addGeometry` builds it (BatchedMesh.js:630-649). Synthesising an entry
 * means reproducing this shape; a three release that adds or renames a field
 * would leave the new field at `undefined` on our entries, which is why the
 * check below is equality rather than a subset test.
 */
const GEOMETRY_INFO_FIELDS = [
  'active',
  'boundingBox',
  'boundingSphere',
  'count',
  'indexCount',
  'indexStart',
  'reservedIndexCount',
  'reservedVertexCount',
  'start',
  'vertexCount',
  'vertexStart',
]


/**
 * Whether a mesh's private geometry bookkeeping is the shape this module
 * knows how to extend.
 *
 * @param {object} mesh candidate THREE.BatchedMesh
 * @return {boolean}
 */
export function supportsGeometryRanges(mesh) {
  return Boolean(
    mesh?.isBatchedMesh &&
    Array.isArray(mesh._geometryInfo) &&
    Number.isInteger(mesh._geometryCount) &&
    typeof mesh.addGeometry === 'function' &&
    typeof mesh.getGeometryRangeAt === 'function')
}


/**
 * Whether one entry three produced carries exactly the fields we synthesise.
 *
 * @param {object} info a `_geometryInfo` entry
 * @return {boolean}
 */
function hasKnownGeometryInfoShape(info) {
  if (!info || typeof info !== 'object') {
    return false
  }
  const keys = Object.keys(info).sort()
  return keys.length === GEOMETRY_INFO_FIELDS.length &&
    keys.every((key, i) => key === GEOMETRY_INFO_FIELDS[i])
}


/**
 * Whether one caller-supplied range is well formed against the merged
 * geometry it slices.
 *
 * @param {object} range `{vertexStart, vertexCount, indexStart, indexCount}`
 * @param {number} vertexTotal merged geometry's position count
 * @param {number} indexTotal merged geometry's index count
 * @return {boolean}
 */
function isWellFormedRange(range, vertexTotal, indexTotal) {
  const fields = [range?.vertexStart, range?.vertexCount, range?.indexStart, range?.indexCount]
  if (!fields.every((v) => Number.isInteger(v) && v >= 0)) {
    return false
  }
  // Empty ranges are refused rather than tolerated: an instance drawing zero
  // triangles is invisible and unpickable, so it would present as "that
  // element is missing" — the collapse's worst failure mode — while every
  // structural check still passed.
  return range.vertexCount > 0 && range.indexCount > 0 &&
    range.vertexStart + range.vertexCount <= vertexTotal &&
    range.indexStart + range.indexCount <= indexTotal
}


/**
 * Verify each range's indices dereference only its own vertices (module doc,
 * "the one invariant").
 *
 * @param {object} index merged geometry's index BufferAttribute
 * @param {Array<object>} ranges caller ranges, merged-geometry-relative
 * @return {number} the index of the first range that violates it, or -1
 */
function findRangeEscapingItsVertices(index, ranges) {
  const values = index.array
  for (let r = 0; r < ranges.length; r++) {
    const {vertexStart, vertexCount, indexStart, indexCount} = ranges[r]
    const end = vertexStart + vertexCount
    for (let i = indexStart; i < indexStart + indexCount; i++) {
      const v = values[i]
      if (v < vertexStart || v >= end) {
        return r
      }
    }
  }
  return -1
}


/**
 * Upload one merged geometry and register each of its ranges as its own
 * geometry id, ready for `addInstance`.
 *
 * The merged geometry is uploaded through the public `addGeometry`, so the
 * copy into the batch buffers, the index rebasing and the capacity check are
 * all three's own. What this adds is the range bookkeeping afterwards: the id
 * `addGeometry` returned is REPURPOSED as range 0 rather than kept alongside.
 * Keeping it would leave a geometry id spanning the whole merged buffer, and
 * `decorateBatchMeshes` calls `computeBoundsTree()` with no index — which
 * builds a BVH for every id (ExtensionUtilities.js:245-252). A whole-buffer
 * id would therefore add a second, model-sized BVH next to the per-element
 * ones, paying in memory for something nothing draws.
 *
 * @param {object} mesh a THREE.BatchedMesh with room for `geometry`
 * @param {object} geometry merged, indexed BufferGeometry
 * @param {Array<object>} ranges `{vertexStart, vertexCount, indexStart,
 *   indexCount}` per element, relative to `geometry`
 * @return {?Array<number>} geometry ids parallel to `ranges`, or null when
 *   the batch, the geometry or the ranges fail a check (caller falls back)
 */
export function addGeometryRanges(mesh, geometry, ranges) {
  if (!supportsGeometryRanges(mesh) || !Array.isArray(ranges) || ranges.length === 0) {
    return null
  }
  const position = geometry?.getAttribute?.('position')
  const index = geometry?.getIndex?.()
  if (!position || !index) {
    return null
  }
  for (const range of ranges) {
    if (!isWellFormedRange(range, position.count, index.count)) {
      glbInfo('geometry ranges: range outside the merged geometry; declining')
      return null
    }
  }
  const escaped = findRangeEscapingItsVertices(index, ranges)
  if (escaped >= 0) {
    glbInfo(`geometry ranges: range ${escaped} indexes outside its own vertices; declining`)
    return null
  }

  const baseId = mesh.addGeometry(geometry)
  const base = mesh._geometryInfo[baseId]
  if (!hasKnownGeometryInfoShape(base)) {
    // The upload already happened and cannot be undone, so the batch is now
    // holding geometry no instance will reference. That is wasted space, not
    // a wrong picture: the caller's fallback rebuilds from scratch on its own
    // mesh and this one is dropped with it.
    glbInfo('geometry ranges: unrecognised BatchedMesh geometry bookkeeping; declining')
    return null
  }
  // `addGeometry` may place the merged buffer at a non-zero offset when the
  // batch already holds other geometry, so ranges rebase onto where it landed
  // rather than assuming an empty batch.
  const vertexBase = base.vertexStart
  const indexBase = base.indexStart

  const ids = []
  for (let r = 0; r < ranges.length; r++) {
    const {vertexStart, vertexCount, indexStart, indexCount} = ranges[r]
    const info = {
      vertexStart: vertexBase + vertexStart,
      vertexCount,
      reservedVertexCount: vertexCount,
      indexStart: indexBase + indexStart,
      indexCount,
      reservedIndexCount: indexCount,
      // Indexed by construction (an unindexed merged geometry is refused
      // above), so the draw range is the index range — the `hasIndex` branch
      // of BatchedMesh.js:795-796.
      start: indexBase + indexStart,
      count: indexCount,
      // Left null so `getBoundingBoxAt` / `getBoundingSphereAt` compute them
      // from `[start, start + count)` on demand. That is the only bounds path
      // that is correct for a slice: the merged geometry's own boundingBox
      // spans every element in the group.
      boundingBox: null,
      boundingSphere: null,
      active: true,
    }
    if (r === 0) {
      mesh._geometryInfo[baseId] = info
      ids.push(baseId)
    } else {
      ids.push(mesh._geometryCount)
      mesh._geometryCount++
      mesh._geometryInfo.push(info)
    }
  }
  mesh[BATCHED_GEOMETRY_RANGES_FLAG] = true
  return ids
}
