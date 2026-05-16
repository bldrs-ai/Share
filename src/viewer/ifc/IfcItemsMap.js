import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
} from 'three'


/**
 * IfcItemsMap — per-mesh per-instance triangle ↔ element-ID lookup.
 *
 * Two tables held together:
 *
 *   triangleIndexToExpressId: Uint32Array, one entry per triangle.
 *     triangleIndexToExpressId[t] = expressID of triangle t,
 *     or NO_EXPRESS_ID for triangles that straddle elements.
 *
 *   expressIdToTriangleIndices: Map<number, Uint32Array>, inverse.
 *     get(id) = sorted triangle indices belonging to that element.
 *
 * Why this shape — viewer-replacement §3b.i sketch
 * (design/new/viewer-replacement.md §3b.i) calls for exactly these two
 * tables on the model. We collapse web-ifc-three's per (expressID,
 * materialIndex) range structure (IFCLoader.js:309) down to a flat
 * triangle-index list per element; the subset path needs one material
 * at a time, and materialising the triangle indices eagerly turns
 * subset creation into O(matching triangles) instead of O(all
 * triangles + N range lookups).
 *
 * Why this matters — the per-vertex `expressID` attribute we read
 * today in `src/viewer/three/elementSubsets.js#buildSubsetMesh` is
 * a derived signal that conway can collapse when an IFC source uses
 * `IfcMappedItem` to share one representation across many visible
 * positions (design/new/viewer-replacement.md §3b.ii). Once we own
 * the populator we can fill the table per-IFC-instance directly from
 * conway's `streamAllMeshes`, bypassing the shared-geometry collapse
 * the vertex attribute encodes. This module is the receiver shape
 * that work targets.
 *
 * Source-agnostic by design — today we populate from the per-vertex
 * attribute (`fromPerVertexAttribute`); Phase 3 adds a populator
 * that takes conway's per-instance placed-geometry stream directly;
 * the GLB cache adds a populator that restores from the
 * `BLDRS_per_triangle_express_ids` glTF extension. All three feed
 * the same consumer surface (`createSubsetMesh`,
 * `getExpressIdByTriangle`).
 */


/**
 * Sentinel triangle-ID for triangles that straddle elements (a
 * triangle whose three vertices carry different expressIDs). Matches
 * the "drop straddling triangles" rule in `elementSubsets.buildSubsetMesh`.
 * Chosen as max-uint32 because real IFC expressIDs are positive 32-bit
 * integers that never reach this value in practice.
 */
export const NO_EXPRESS_ID = 0xFFFFFFFF


/**
 * Per-mesh items map.
 */
export class IfcItemsMap {
  /**
   * @param {object} fields
   * @param {Uint32Array} fields.triangleIndexToExpressId
   * @param {Map<number, Uint32Array>} fields.expressIdToTriangleIndices
   * @param {BufferGeometry} fields.sourceGeometry geometry the tables
   *   were built against. Subsets share its vertex attributes.
   */
  constructor({
    triangleIndexToExpressId,
    expressIdToTriangleIndices,
    sourceGeometry,
  }) {
    this.triangleIndexToExpressId = triangleIndexToExpressId
    this.expressIdToTriangleIndices = expressIdToTriangleIndices
    this.sourceGeometry = sourceGeometry
  }


  /** @return {number} triangles covered by the table. */
  get triangleCount() {
    return this.triangleIndexToExpressId.length
  }


  /** @return {number} distinct elements present. */
  get elementCount() {
    return this.expressIdToTriangleIndices.size
  }


  /**
   * Element ID for the triangle at the given face index. Returns
   * `null` for straddling triangles (sentinel NO_EXPRESS_ID) and
   * out-of-range indices. Replaces the per-vertex attribute lookup
   * `IFCLoader#getExpressId(geom, faceIndex)` does today.
   *
   * @param {number} triangleIndex
   * @return {number|null}
   */
  getExpressIdByTriangle(triangleIndex) {
    if (triangleIndex < 0 || triangleIndex >= this.triangleIndexToExpressId.length) {
      return null
    }
    const id = this.triangleIndexToExpressId[triangleIndex]
    if (id === NO_EXPRESS_ID) {
      return null
    }
    return id
  }


  /**
   * Build a Mesh containing only the triangles whose triangle-index
   * belongs to one of the requested expressIDs.
   *
   * Vertex attributes are **shared** with the source geometry — same
   * underlying typed arrays — so the only allocation is the new
   * index buffer + the subset Mesh.
   *
   * Returns `null` when nothing matches.
   *
   * @param {Array<number>|Set<number>} ids element IDs to keep
   * @param {object} [opts]
   * @param {object} [opts.material] override material (defaults to
   *   the caller-passed `defaultMaterial` if supplied).
   * @param {object} [opts.defaultMaterial] fallback material when
   *   `opts.material` is not supplied.
   * @param {boolean} [opts.raycastInvisible] when true (default), the
   *   returned Mesh's `raycast` is a no-op — matches
   *   elementSubsets.buildSubsetMesh's behavior so picks always
   *   resolve through the source mesh.
   * @return {Mesh|null}
   */
  createSubsetMesh(ids, opts = {}) {
    const {material, defaultMaterial, raycastInvisible = true} = opts
    if (!this.sourceGeometry) {
      return null
    }
    const srcIndex = this.sourceGeometry.getIndex()
    if (!srcIndex) {
      return null
    }
    const srcIndexArr = srcIndex.array
    // First pass: total matching triangle count, so we can allocate
    // the destination index buffer exactly.
    let total = 0
    for (const id of ids) {
      const triList = this.expressIdToTriangleIndices.get(id)
      if (triList) {
        total += triList.length
      }
    }
    if (total === 0) {
      return null
    }
    const ArrayCtor = srcIndexArr.constructor
    const dstIndexArr = new ArrayCtor(total * 3)
    let w = 0
    for (const id of ids) {
      const triList = this.expressIdToTriangleIndices.get(id)
      if (!triList) {
        continue
      }
      for (let i = 0; i < triList.length; i++) {
        const t = triList[i]
        const base = t * 3
        dstIndexArr[w++] = srcIndexArr[base]
        dstIndexArr[w++] = srcIndexArr[base + 1]
        dstIndexArr[w++] = srcIndexArr[base + 2]
      }
    }
    const dstGeom = new BufferGeometry()
    for (const name of Object.keys(this.sourceGeometry.attributes)) {
      dstGeom.setAttribute(name, this.sourceGeometry.attributes[name])
    }
    dstGeom.setIndex(new BufferAttribute(dstIndexArr, 1))
    const subsetMaterial = material ?? defaultMaterial ?? null
    const mesh = new Mesh(dstGeom, subsetMaterial)
    if (raycastInvisible) {
      // Same rationale as elementSubsets.buildSubsetMesh: the subset
      // is coplanar with the source and its bounding sphere covers
      // the full shared vertex buffer, so leaving it raycast-active
      // breaks pick tie-breaking. Subsets exist to drive the
      // OutlineEffect, not to be picked through.
      mesh.raycast = () => {/* see comment above */}
    }
    return mesh
  }
}


/**
 * Build an IfcItemsMap from a geometry's per-vertex element-ID
 * attribute. This is the "clean room" populator — same data shape
 * elementSubsets.buildSubsetMesh consumes today, repackaged into the
 * decoupled IfcItemsMap structure so subset creation no longer needs
 * to know where the IDs came from.
 *
 * Triangle-level classification rule matches buildSubsetMesh:
 * a triangle belongs to element X iff all three of its vertices
 * carry ID X. Straddling triangles get NO_EXPRESS_ID.
 *
 * Returns `null` when the geometry has no usable per-vertex attribute
 * (missing, single-value synthetic, or no index buffer).
 *
 * @param {BufferGeometry} geometry
 * @param {object} [opts]
 * @param {string} [opts.attrName] per-vertex element-ID attribute
 *   name. Default `expressID`.
 * @return {IfcItemsMap|null}
 */
export function itemsMapFromPerVertexAttribute(geometry, opts = {}) {
  if (!geometry) {
    return null
  }
  const {attrName = 'expressID'} = opts
  const idAttr = geometry.attributes?.[attrName]
  if (!idAttr || idAttr.count <= 1) {
    return null
  }
  const index = geometry.getIndex?.()
  if (!index) {
    return null
  }
  const indexArr = index.array
  const triCount = (indexArr.length / 3) | 0
  const triangleIndexToExpressId = new Uint32Array(triCount)
  const triangleListsById = new Map()
  for (let t = 0; t < triCount; t++) {
    const base = t * 3
    const a = indexArr[base]
    const b = indexArr[base + 1]
    const c = indexArr[base + 2]
    const idA = idAttr.getX(a)
    if (idAttr.getX(b) !== idA || idAttr.getX(c) !== idA) {
      triangleIndexToExpressId[t] = NO_EXPRESS_ID
      continue
    }
    triangleIndexToExpressId[t] = idA
    let list = triangleListsById.get(idA)
    if (!list) {
      list = []
      triangleListsById.set(idA, list)
    }
    list.push(t)
  }
  const expressIdToTriangleIndices = new Map()
  for (const [id, list] of triangleListsById) {
    expressIdToTriangleIndices.set(id, Uint32Array.from(list))
  }
  return new IfcItemsMap({
    triangleIndexToExpressId,
    expressIdToTriangleIndices,
    sourceGeometry: geometry,
  })
}
