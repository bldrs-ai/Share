import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
} from 'three'


/**
 * IfcInstanceMap — per-PlacedGeometry triangle ↔ instance lookup.
 *
 * Sister structure to `IfcItemsMap` (per-IFC-element keying). The
 * difference: `IfcItemsMap` keys triangles by the IFC product
 * expressID (e.g. one wall = one key, all its instances merged);
 * `IfcInstanceMap` keys triangles by a synthetic *instance* ID —
 * one entry per Conway `PlacedGeometry` — so a wall with 42
 * `IfcMappedItem`-shared visible positions becomes 42 distinct
 * selectable instances.
 *
 * Empirical evidence for needing this:
 * design/new/viewer-replacement.md §3b.ii, refreshed from the
 * `ifcItemsMapParity` smoke probe. Snowdon (Revit) loads with
 * ~50% of its 25k+ PlacedGeometries sharing shapes across instances
 * (the `multiPlacedFlatMeshes allShared=2284` line); without
 * per-instance keying every click on one of those visible positions
 * highlights all sibling instances together.
 *
 * **Synthetic instance IDs.** Internal monotonic counter assigned
 * at populate time, one per PlacedGeometry, in the order the
 * assembler emits triangles. Pickers and selectors operate on
 * these IDs as opaque identifiers. To resolve back to an IFC
 * product (e.g. for property reads), call
 * `getParentExpressIdByInstance(syntheticId)`. To go the other way
 * (e.g. "select every instance of this element"), call
 * `getInstanceIdsByParent(parentExpressId)`.
 *
 * **Storage shape:**
 *   triangleIndexToInstanceId: Uint32Array     // per-triangle synthetic ID
 *   instanceIdToTriangleIndices: Map<number, Uint32Array>  // inverse
 *   instanceIdToParentExpressId: Uint32Array   // synthetic → IFC product
 *   parentExpressIdToInstanceIds: Map<number, Uint32Array> // IFC → synthetics
 *
 * Triangle-count storage for an instance is a single contiguous
 * range in source-emission order (a PlacedGeometry contributes its
 * triangles contiguously to the merged buffer), but we materialise
 * the index list anyway so consumers can mix-and-match instances
 * across parents without range arithmetic.
 *
 * Source-agnostic by design: three populators below cover the
 * production cases — Conway FlatMesh stream (cache-miss),
 * pre-built emission-order range list (assembler hand-off), and
 * BufferGeometry per-vertex attributes (cache-hit GLB + post-BVH
 * rebuild). The consumer surface (`createSubsetMeshByInstance`,
 * `createSubsetMeshByParent`) is stable across all three.
 */


/** Sentinel for triangles not covered by any instance. */
export const NO_INSTANCE_ID = 0xFFFFFFFF


// PlacedRange = {parentExpressId: number, triangleCount: number}
// One contiguous range of triangles belonging to a single
// PlacedGeometry — what the populators below accept as input.


/** Per-PlacedGeometry triangle ↔ instance lookup. */
export class IfcInstanceMap {
  /**
   * @param {object} fields
   * @param {Uint32Array} fields.triangleIndexToInstanceId
   * @param {Map<number, Uint32Array>} fields.instanceIdToTriangleIndices
   * @param {Uint32Array} fields.instanceIdToParentExpressId
   * @param {Map<number, Uint32Array>} fields.parentExpressIdToInstanceIds
   * @param {BufferGeometry} fields.sourceGeometry
   */
  constructor({
    triangleIndexToInstanceId,
    instanceIdToTriangleIndices,
    instanceIdToParentExpressId,
    parentExpressIdToInstanceIds,
    sourceGeometry,
  }) {
    this.triangleIndexToInstanceId = triangleIndexToInstanceId
    this.instanceIdToTriangleIndices = instanceIdToTriangleIndices
    this.instanceIdToParentExpressId = instanceIdToParentExpressId
    this.parentExpressIdToInstanceIds = parentExpressIdToInstanceIds
    this.sourceGeometry = sourceGeometry
  }


  /** @return {number} triangles covered. */
  get triangleCount() {
    return this.triangleIndexToInstanceId.length
  }


  /** @return {number} distinct instances present. */
  get instanceCount() {
    return this.instanceIdToTriangleIndices.size
  }


  /** @return {number} distinct IFC products present. */
  get parentCount() {
    return this.parentExpressIdToInstanceIds.size
  }


  /**
   * Synthetic instance ID for the triangle at the given face index.
   * Returns `null` for out-of-range indices or sentinel positions.
   *
   * @param {number} triangleIndex
   * @return {number|null}
   */
  getInstanceIdByTriangle(triangleIndex) {
    if (triangleIndex < 0 || triangleIndex >= this.triangleIndexToInstanceId.length) {
      return null
    }
    const id = this.triangleIndexToInstanceId[triangleIndex]
    if (id === NO_INSTANCE_ID) {
      return null
    }
    return id
  }


  /**
   * IFC product expressID for the given synthetic instance ID.
   * Returns `null` if the instance ID is out of range.
   *
   * @param {number} instanceId
   * @return {number|null}
   */
  getParentExpressIdByInstance(instanceId) {
    if (instanceId < 0 || instanceId >= this.instanceIdToParentExpressId.length) {
      return null
    }
    return this.instanceIdToParentExpressId[instanceId]
  }


  /**
   * Synthetic instance IDs for every visible position of an IFC product.
   * Returns `null` if the product has no geometry-emission instances.
   *
   * @param {number} parentExpressId
   * @return {Uint32Array|null}
   */
  getInstanceIdsByParent(parentExpressId) {
    return this.parentExpressIdToInstanceIds.get(parentExpressId) ?? null
  }


  /**
   * Convenience for the picking pipeline: face-index → IFC product.
   * Composes `getInstanceIdByTriangle` + `getParentExpressIdByInstance`.
   * Equivalent to what `IfcItemsMap.getExpressIdByTriangle` returns,
   * so this is the drop-in replacement for the existing picker.
   *
   * @param {number} triangleIndex
   * @return {number|null}
   */
  getParentExpressIdByTriangle(triangleIndex) {
    const instId = this.getInstanceIdByTriangle(triangleIndex)
    if (instId === null) {
      return null
    }
    return this.getParentExpressIdByInstance(instId)
  }


  /**
   * Build a Mesh containing only triangles of the named instances.
   * Per-instance subset — finest granularity available.
   *
   * @param {Array<number>|Set<number>} instanceIds
   * @param {object} [opts]
   * @param {object} [opts.material]
   * @param {object} [opts.defaultMaterial]
   * @param {boolean} [opts.raycastInvisible]
   * @return {Mesh|null}
   */
  createSubsetMeshByInstance(instanceIds, opts = {}) {
    return buildSubsetMesh(
      this.sourceGeometry,
      instanceIds,
      (id) => this.instanceIdToTriangleIndices.get(id),
      opts,
    )
  }


  /**
   * Build a Mesh containing every instance of the named parents.
   * Parent-level subset — matches current per-element semantics.
   *
   * @param {Array<number>|Set<number>} parentExpressIds
   * @param {object} [opts]
   * @return {Mesh|null}
   */
  createSubsetMeshByParent(parentExpressIds, opts = {}) {
    // Collect every instance under each named parent, then run the
    // per-instance build. Two-step rather than maintaining a parallel
    // parent→triangles table — keeps populator allocation small.
    const instanceIds = []
    for (const pid of parentExpressIds) {
      const ids = this.parentExpressIdToInstanceIds.get(pid)
      if (ids) {
        for (let i = 0; i < ids.length; i++) {
          instanceIds.push(ids[i])
        }
      }
    }
    return this.createSubsetMeshByInstance(instanceIds, opts)
  }
}


/**
 * Shared subset-mesh builder used by both `createSubsetMeshByInstance`
 * and `createSubsetMeshByParent` (the latter expands to the former
 * before calling here).
 *
 * @param {BufferGeometry} sourceGeometry
 * @param {Array<number>|Set<number>} ids
 * @param {Function} lookupTriangles takes id, returns triangle indices
 * @param {object} opts
 * @return {Mesh|null}
 */
function buildSubsetMesh(sourceGeometry, ids, lookupTriangles, opts) {
  if (!sourceGeometry) {
    return null
  }
  const srcIndex = sourceGeometry.getIndex()
  if (!srcIndex) {
    return null
  }
  const srcIndexArr = srcIndex.array
  let total = 0
  for (const id of ids) {
    const list = lookupTriangles(id)
    if (list) {
      total += list.length
    }
  }
  if (total === 0) {
    return null
  }
  const ArrayCtor = srcIndexArr.constructor
  const dstIndexArr = new ArrayCtor(total * 3)
  let w = 0
  for (const id of ids) {
    const list = lookupTriangles(id)
    if (!list) {
      continue
    }
    for (let i = 0; i < list.length; i++) {
      const t = list[i]
      const base = t * 3
      dstIndexArr[w++] = srcIndexArr[base]
      dstIndexArr[w++] = srcIndexArr[base + 1]
      dstIndexArr[w++] = srcIndexArr[base + 2]
    }
  }
  const dstGeom = new BufferGeometry()
  for (const name of Object.keys(sourceGeometry.attributes)) {
    dstGeom.setAttribute(name, sourceGeometry.attributes[name])
  }
  dstGeom.setIndex(new BufferAttribute(dstIndexArr, 1))
  const subsetMaterial = opts.material ?? opts.defaultMaterial ?? null
  const mesh = new Mesh(dstGeom, subsetMaterial)
  if (opts.raycastInvisible !== false) {
    mesh.raycast = () => {/* see IfcItemsMap.createSubsetMesh */}
  }
  return mesh
}


/**
 * Build an IfcInstanceMap from a per-PlacedGeometry triangle range
 * stream. Each entry contributes `triangleCount` triangles to the
 * merged buffer; the populator assigns a fresh synthetic instance
 * ID per entry and resolves it back to `parentExpressId`.
 *
 * Stream order must match the geometry assembler's triangle emission
 * order — the table is positional. In practice both come from the
 * same `FlatMesh × PlacedGeometry` iteration.
 *
 * @param {Array} ranges per-PlacedGeometry, each
 *   `{parentExpressId, triangleCount}`
 * @param {object} [opts]
 * @param {BufferGeometry} [opts.geometry]
 * @return {IfcInstanceMap}
 */
export function instanceMapFromOrderedPlacedRanges(ranges, opts = {}) {
  let totalTriangles = 0
  const valid = []
  for (const r of ranges) {
    if (!r || r.triangleCount <= 0) {
      continue
    }
    valid.push(r)
    totalTriangles += r.triangleCount
  }
  const instanceCount = valid.length
  const triangleIndexToInstanceId = new Uint32Array(totalTriangles)
  const instanceIdToParentExpressId = new Uint32Array(instanceCount)
  const triangleListsByInstance = new Map()
  const instanceListsByParent = new Map()
  let tri = 0
  for (let inst = 0; inst < valid.length; inst++) {
    const {parentExpressId, triangleCount} = valid[inst]
    instanceIdToParentExpressId[inst] = parentExpressId
    let parentList = instanceListsByParent.get(parentExpressId)
    if (!parentList) {
      parentList = []
      instanceListsByParent.set(parentExpressId, parentList)
    }
    parentList.push(inst)
    const triList = new Uint32Array(triangleCount)
    for (let i = 0; i < triangleCount; i++) {
      triangleIndexToInstanceId[tri] = inst
      triList[i] = tri
      tri++
    }
    triangleListsByInstance.set(inst, triList)
  }
  const parentExpressIdToInstanceIds = new Map()
  for (const [pid, list] of instanceListsByParent) {
    parentExpressIdToInstanceIds.set(pid, Uint32Array.from(list))
  }
  return new IfcInstanceMap({
    triangleIndexToInstanceId,
    instanceIdToTriangleIndices: triangleListsByInstance,
    instanceIdToParentExpressId,
    parentExpressIdToInstanceIds,
    sourceGeometry: opts.geometry ?? null,
  })
}


/**
 * Derive an IfcInstanceMap from a BufferGeometry's per-vertex
 * `expressID` + `instanceID` attributes. The BVH-safe populator —
 * three-mesh-bvh reorders the index buffer in place when building
 * its acceleration tree, so a map built from emission-order ranges
 * (see `instanceMapFromOrderedPlacedRanges`) becomes incorrect:
 * `triangleIndexToInstanceId[T]` no longer matches the triangle now
 * at position T in the reordered buffer.
 *
 * Per-vertex attributes survive reorder (BVH only touches the index
 * buffer, not vertex data), so reading the parent / instance ID for
 * a triangle's first vertex always yields the correct value
 * regardless of triangle-index permutation. This populator does
 * exactly that — one walk of the (possibly reordered) index buffer,
 * reading attribute values per triangle.
 *
 * Call AFTER any BVH compute, never before.
 *
 * @param {object} geometry BufferGeometry with `expressID` +
 *   `instanceID` per-vertex attributes and an index buffer
 * @return {IfcInstanceMap}
 */
export function instanceMapFromGeometry(geometry) {
  const indexAttr = geometry?.getIndex?.()
  const exprIdAttr = geometry?.getAttribute?.('expressID')
  const instIdAttr = geometry?.getAttribute?.('instanceID')
  if (!indexAttr || !exprIdAttr || !instIdAttr) {
    throw new Error(
      'instanceMapFromGeometry: geometry missing index or per-vertex ID attributes')
  }
  const indices = indexAttr.array
  const expressIDs = exprIdAttr.array
  const instanceIDs = instIdAttr.array
  const triCount = (indices.length / 3) | 0
  // Pass 1: per-triangle instance ID + collect tri lists per instance.
  // The triangle's three vertices all carry the same parent/instance
  // by construction (the assembler emits one ID per vertex of a
  // PlacedGeometry's slab), so reading the first vertex is enough.
  const triangleIndexToInstanceId = new Uint32Array(triCount)
  const trisByInstance = new Map()
  let maxInstance = -1
  for (let t = 0; t < triCount; t++) {
    const v0 = indices[t * 3]
    const inst = instanceIDs[v0]
    triangleIndexToInstanceId[t] = inst
    let list = trisByInstance.get(inst)
    if (!list) {
      list = []
      trisByInstance.set(inst, list)
    }
    list.push(t)
    if (inst > maxInstance) {
      maxInstance = inst
    }
  }
  const instanceCount = maxInstance + 1
  const instanceIdToTriangleIndices = new Map()
  for (const [inst, tris] of trisByInstance) {
    instanceIdToTriangleIndices.set(inst, Uint32Array.from(tris))
  }
  // Pass 2: parent expressID per instance + parent → instances list.
  // Read parent ID from any triangle of the instance (all carry it).
  const instanceIdToParentExpressId = new Uint32Array(instanceCount)
  const instancesByParent = new Map()
  for (const [inst, tris] of trisByInstance) {
    const v0 = indices[tris[0] * 3]
    const parent = expressIDs[v0]
    instanceIdToParentExpressId[inst] = parent
    let plist = instancesByParent.get(parent)
    if (!plist) {
      plist = []
      instancesByParent.set(parent, plist)
    }
    plist.push(inst)
  }
  const parentExpressIdToInstanceIds = new Map()
  for (const [pid, list] of instancesByParent) {
    parentExpressIdToInstanceIds.set(pid, Uint32Array.from(list))
  }
  return new IfcInstanceMap({
    triangleIndexToInstanceId,
    instanceIdToTriangleIndices,
    instanceIdToParentExpressId,
    parentExpressIdToInstanceIds,
    sourceGeometry: geometry,
  })
}


/**
 * Conway-direct populator. Walks a captured FlatMesh source and
 * emits one synthetic instance per PlacedGeometry, tagged with the
 * parent `FlatMesh.expressID`.
 *
 * Reads `IfcGeometry.GetIndexDataSize()` for triangle count per
 * PlacedGeometry — same path `IfcItemsMap.itemsMapFromFlatMeshes`
 * uses, with the divisor-by-3 to convert index count to triangle
 * count. Different output shape: per-PlacedGeometry granularity
 * instead of per-FlatMesh.
 *
 * @param {object|Array} flatMeshes FlatMesh source (size()/get() or Array)
 * @param {object} api Conway-compatible IfcAPI (needs GetGeometry)
 * @param {number} modelID
 * @param {object} [opts]
 * @param {BufferGeometry} [opts.geometry]
 * @return {IfcInstanceMap}
 */
export function instanceMapFromFlatMeshes(flatMeshes, api, modelID, opts = {}) {
  const ranges = []
  const size = typeof flatMeshes?.size === 'function' ?
    flatMeshes.size() : (flatMeshes?.length ?? 0)
  for (let i = 0; i < size; i++) {
    const flatMesh = typeof flatMeshes.get === 'function' ?
      flatMeshes.get(i) : flatMeshes[i]
    const parentExpressId = flatMesh?.expressID
    const placedVec = flatMesh?.geometries
    if (parentExpressId === undefined || !placedVec) {
      continue
    }
    const placedSize = typeof placedVec.size === 'function' ?
      placedVec.size() : placedVec.length
    for (let j = 0; j < placedSize; j++) {
      const placed = typeof placedVec.get === 'function' ?
        placedVec.get(j) : placedVec[j]
      // eslint-disable-next-line new-cap
      const geom = api.GetGeometry(modelID, placed.geometryExpressID)
      if (!geom) {
        continue
      }
      // eslint-disable-next-line new-cap
      const triangleCount = (geom.GetIndexDataSize() / 3) | 0
      if (triangleCount <= 0) {
        continue
      }
      ranges.push({parentExpressId, triangleCount})
    }
  }
  return instanceMapFromOrderedPlacedRanges(ranges, opts)
}
