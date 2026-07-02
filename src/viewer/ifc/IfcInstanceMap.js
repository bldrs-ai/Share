import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
} from 'three'
import {occurrencePathKey} from '../../utils/occurrencePaths'


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
 *
 * TODO(format-generic): once per-instance picking lands for a second
 * format (the obvious next candidate is GLTF `EXT_mesh_features` —
 * Khronos's per-vertex feature-ID convention used by Cesium 3D Tiles
 * and similar pipelines), promote this to a format-agnostic
 * `InstanceMap` base + thin format adapters. The current shape is
 * already format-neutral at the data level — `triangleIndexToInstanceId`
 * + `instanceIdToParentExpressId` are just typed-array integer
 * tables; the IFC-specificity is purely in the naming ("expressID",
 * "Ifc-"). When abstracting:
 *
 *   - Rename `parentExpressId` → `ownerId` (or `featureId`) in the
 *     base class; IFC subclass adds a thin `getIfcProductId(instId)`
 *     alias.
 *   - The geometry populator (`instanceMapFromGeometry`) is already
 *     fully generic — only the attribute names are parameterised
 *     candidates (today both `expressID` and `instanceID` are
 *     hard-coded; the latter could become an `attrName` opt like
 *     `inferModelCapabilities` already supports).
 *   - The Conway-specific populator stays as the IFC adapter;
 *     `EXT_mesh_features` parsing would land as a sibling populator
 *     in a new `GltfFeaturesInstanceMap` file.
 *
 * Until that second format arrives, the IFC-named version is the
 * right shape — premature abstraction would obscure the IFC
 * vocabulary (`expressID`, IfcMappedItem) the design doc and
 * call-sites use throughout.
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
   * @param {Array<Array<number>|null>} [fields.instanceIdToOccurrencePath]
   *   Per-instance STEP occurrence path (NAUO express ids). Present only for
   *   STEP models on a Conway that emits `PlacedGeometry.occurrencePath`; the
   *   parent expressID collides across a reused part's occurrences, so this is
   *   what distinguishes them. Absent (null) for IFC and older engines.
   * @param {Map<string, Array<number>>} [fields.occurrencePathToInstanceIds]
   *   Reverse index of the above — occurrence-path key (`occurrencePathKey`) →
   *   the synthetic instance ids placed there. The NavTree→scene direction.
   *   Absent (null) for IFC and older engines.
   */
  constructor({
    triangleIndexToInstanceId,
    instanceIdToTriangleIndices,
    instanceIdToParentExpressId,
    parentExpressIdToInstanceIds,
    sourceGeometry,
    instanceIdToOccurrencePath = null,
    occurrencePathToInstanceIds = null,
  }) {
    this.triangleIndexToInstanceId = triangleIndexToInstanceId
    this.instanceIdToTriangleIndices = instanceIdToTriangleIndices
    this.instanceIdToParentExpressId = instanceIdToParentExpressId
    this.parentExpressIdToInstanceIds = parentExpressIdToInstanceIds
    this.sourceGeometry = sourceGeometry
    this.instanceIdToOccurrencePath = instanceIdToOccurrencePath
    this.occurrencePathToInstanceIds = occurrencePathToInstanceIds
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
   * STEP occurrence path (NAUO express ids, root→leaf) for the given synthetic
   * instance ID — the identity that disambiguates a reused part's occurrences.
   * Returns `null` when the model carries no occurrence paths (IFC, older
   * engines) or the instance ID is out of range, so callers fall back to the
   * scalar parent expressID.
   *
   * @param {number} instanceId
   * @return {Array<number>|null}
   */
  getOccurrencePathByInstance(instanceId) {
    const paths = this.instanceIdToOccurrencePath
    if (!paths || instanceId < 0 || instanceId >= paths.length) {
      return null
    }
    const path = paths[instanceId]
    // A root-level / single-occurrence placement has an empty path — no
    // disambiguating occurrence — so normalize it to null alongside the
    // no-data case, letting truthiness-testing callers fall back to the
    // scalar parent expressID instead of keying on a meaningless empty path.
    return path && path.length > 0 ? path : null
  }


  /**
   * Synthetic instance IDs placed at a given STEP occurrence path — the
   * NavTree→scene direction (a clicked node highlights only its own
   * occurrence, not every reuse of the part type). Returns `null` when the
   * model carries no occurrence paths or the path matches nothing.
   *
   * @param {Array<number>} occurrencePath NAUO express ids, root→leaf
   * @return {Uint32Array|null}
   */
  getInstanceIdsByOccurrencePath(occurrencePath) {
    const byPath = this.occurrencePathToInstanceIds
    if (!byPath || !Array.isArray(occurrencePath) || occurrencePath.length === 0) {
      return null
    }
    const list = byPath.get(occurrencePathKey(occurrencePath))
    return list ? Uint32Array.from(list) : null
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
   * `opts.excludeInstances` omits specific synthetic instance ids from the
   * result — the seam that lets the isolator hide one STEP occurrence of a
   * reused part while still showing its siblings: the reveal subset is built
   * from the still-visible parents minus the hidden occurrence's instances.
   * Empty/absent means "every instance of the parents" (today's behavior).
   *
   * @param {Array<number>|Set<number>} parentExpressIds
   * @param {object} [opts]
   * @param {Set<number>} [opts.excludeInstances] instance ids to omit
   * @return {Mesh|null}
   */
  createSubsetMeshByParent(parentExpressIds, opts = {}) {
    // Collect every instance under each named parent, then run the
    // per-instance build. Two-step rather than maintaining a parallel
    // parent→triangles table — keeps populator allocation small.
    const exclude = opts.excludeInstances
    const instanceIds = []
    for (const pid of parentExpressIds) {
      const ids = this.parentExpressIdToInstanceIds.get(pid)
      if (ids) {
        for (let i = 0; i < ids.length; i++) {
          if (exclude && exclude.has(ids[i])) {
            continue
          }
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
  let subsetMaterial = opts.material ?? opts.defaultMaterial ?? null
  // Three.js's WebGLRenderer `projectObject` (three.module.js around
  // line 17842 in r184) iterates `geometry.groups` when the material
  // is an array — and pushes NOTHING to the render list if `groups`
  // is empty. So a subset with `material: Array(N)` + no groups gets
  // silently skipped. Conway-direct's assembler always emits `material`
  // as an array (one entry per PlacedGeometry.color bin); even a
  // single-color model gets `Array(1)`. Two options here, both keep
  // the subset rendering:
  //  - If the array has a single material, unwrap to scalar — the
  //    renderer takes the `else if (material.visible)` branch and
  //    pushes once. This is the cache-hit Conway-direct path for
  //    monochrome models (the index.ifc test case that surfaced the
  //    bug).
  //  - If the array has multiple materials, add a single `group`
  //    spanning the full index buffer, pointing at `material[0]`.
  //    Subset renders monochrome (lose per-color fidelity for the
  //    visible elements) but at least it's *visible*. The proper fix
  //    is to walk the source's `geometry.groups` and emit a sub-group
  //    per material the subset's triangles span; that's a separate
  //    pass and tracked as a TODO in §3b.iii.
  if (Array.isArray(subsetMaterial)) {
    if (subsetMaterial.length === 1) {
      subsetMaterial = subsetMaterial[0]
    } else if (subsetMaterial.length > 1) {
      dstGeom.addGroup(0, dstIndexArr.length, 0)
    }
  }
  const mesh = new Mesh(dstGeom, subsetMaterial)
  if (opts.raycastInvisible !== false) {
    mesh.raycast = () => {/* see IfcItemsMap.createSubsetMesh */}
  }
  return mesh
}


/**
 * Attach STEP occurrence-path tables to an already-built `IfcInstanceMap`
 * from a global `instanceId → occurrencePath` table (the cache-hit GLB
 * restore path). The cache-miss populators derive these tables from the
 * per-PlacedGeometry stream, but a GLB cache round-trip loses the paths —
 * the per-triangle / per-vertex ID arrays only carry the scalar
 * `expressID` + `instanceID`, not the variable-length path. So the writer
 * persists the global table (see `BLDRS_face_ids`), and this reattaches it.
 *
 * Only instance ids actually present in this map (a cache-hit GLB is split
 * into per-material primitives, so each mesh owns a subset of the global
 * ids) get an entry, so the reverse `occurrencePathToInstanceIds` never
 * claims instances this mesh can't render. No-op when the map already has
 * occurrence tables, the global table is absent, or nothing matches
 * (IFC) — leaving the map's `null` tables so callers fall back to scalar
 * keying.
 *
 * @param {IfcInstanceMap} instanceMap map to enrich in place
 * @param {Array<Array<number>|null>} occurrencePathsByInstanceId global
 *   table indexed by synthetic instance id (from the cache-miss build)
 */
export function attachOccurrencePaths(instanceMap, occurrencePathsByInstanceId) {
  if (!instanceMap || instanceMap.instanceIdToOccurrencePath ||
      !Array.isArray(occurrencePathsByInstanceId)) {
    return
  }
  const count = instanceMap.instanceIdToParentExpressId?.length ?? 0
  if (count === 0) {
    return
  }
  const perInstance = new Array(count).fill(null)
  const byPath = new Map()
  let any = false
  // Walk only the instance ids this mesh actually holds triangles for.
  for (const inst of instanceMap.instanceIdToTriangleIndices.keys()) {
    const path = occurrencePathsByInstanceId[inst] ?? null
    if (!Array.isArray(path) || path.length === 0) {
      continue
    }
    perInstance[inst] = path
    any = true
    const key = occurrencePathKey(path)
    const list = byPath.get(key)
    if (list) {
      list.push(inst)
    } else {
      byPath.set(key, [inst])
    }
  }
  if (!any) {
    return
  }
  instanceMap.instanceIdToOccurrencePath = perInstance
  instanceMap.occurrencePathToInstanceIds = byPath
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
  // Only carry occurrence paths when the source actually provides them (STEP on
  // a Conway that emits them); IFC leaves this null so nothing downstream pays.
  const hasOccurrencePaths = valid.some((r) => r.occurrencePath !== undefined)
  const instanceIdToOccurrencePath = hasOccurrencePaths ? new Array(instanceCount) : null
  // Reverse index for NavTree→scene: a tree node's occurrence path → the
  // instance(s) placed there. Keyed by the path joined on '/'. Only non-empty
  // paths are indexed (an empty root path can't disambiguate occurrences).
  const occurrencePathToInstanceIds = hasOccurrencePaths ? new Map() : null
  const triangleListsByInstance = new Map()
  const instanceListsByParent = new Map()
  let tri = 0
  for (let inst = 0; inst < valid.length; inst++) {
    const {parentExpressId, triangleCount} = valid[inst]
    instanceIdToParentExpressId[inst] = parentExpressId
    if (instanceIdToOccurrencePath) {
      const path = valid[inst].occurrencePath ?? null
      instanceIdToOccurrencePath[inst] = path
      if (path && path.length > 0) {
        const key = occurrencePathKey(path)
        const list = occurrencePathToInstanceIds.get(key)
        if (list) {
          list.push(inst)
        } else {
          occurrencePathToInstanceIds.set(key, [inst])
        }
      }
    }
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
    instanceIdToOccurrencePath,
    occurrencePathToInstanceIds,
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
 * Per-triangle populator. Built for the `BLDRS_face_ids` cache-hit
 * path where per-element IDs are stored as separate per-triangle
 * arrays in a glTF extension (rather than as per-vertex attributes
 * that compression can corrupt).
 *
 * Direct twin of `instanceMapFromGeometry` minus the per-vertex
 * indirection: where that function reads
 * `instanceIDs[index[t * 3]]` to recover triangle t's instance ID,
 * this one reads `instanceIdsPerTriangle[t]` directly. Same
 * downstream output shape (`triangleIndexToInstanceId`,
 * `instanceIdToTriangleIndices`, `instanceIdToParentExpressId`,
 * `parentExpressIdToInstanceIds`) so consumers (`ShareViewer`'s
 * selection routing, picking via `getInstanceIdByTriangle`) don't
 * branch on which populator built the map.
 *
 * `instanceIdsPerTriangle` may be null when the source primitive
 * had no `_INSTANCEID` (some legacy GLBs). In that case every
 * triangle gets instance 0 — the IfcInstanceMap surface still
 * functions, just with one instance per parent expressID.
 *
 * @param {Uint32Array} expressIdsPerTriangle length = triangleCount;
 *   each entry is the parent IFC expressID for that triangle.
 * @param {Uint32Array|null} instanceIdsPerTriangle length =
 *   triangleCount (when not null); each entry is the synthetic
 *   instance ID for that triangle.
 * @param {object} [opts]
 * @param {object} [opts.geometry] the source BufferGeometry, stashed
 *   on the returned map as `sourceGeometry` for raycast-side
 *   convenience (parity with `instanceMapFromGeometry`).
 * @return {IfcInstanceMap}
 */
export function instanceMapFromTriangleIds(
  expressIdsPerTriangle,
  instanceIdsPerTriangle,
  opts = {},
) {
  if (!expressIdsPerTriangle || !expressIdsPerTriangle.length) {
    throw new Error(
      'instanceMapFromTriangleIds: expressIdsPerTriangle is required + non-empty')
  }
  if (instanceIdsPerTriangle &&
      instanceIdsPerTriangle.length !== expressIdsPerTriangle.length) {
    throw new Error(
      `instanceMapFromTriangleIds: length mismatch — expressIds ` +
      `${expressIdsPerTriangle.length}, instanceIds ${instanceIdsPerTriangle.length}`)
  }
  const triCount = expressIdsPerTriangle.length
  // Pass 1: per-triangle instance ID + collect tri lists per instance.
  // If no instance data, every triangle is instance 0 (single-instance
  // semantics — picker can still resolve parent expressID).
  const triangleIndexToInstanceId = new Uint32Array(triCount)
  const trisByInstance = new Map()
  let maxInstance = 0
  for (let t = 0; t < triCount; t++) {
    const inst = instanceIdsPerTriangle ? instanceIdsPerTriangle[t] : 0
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
    const parent = expressIdsPerTriangle[tris[0]]
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
    sourceGeometry: opts.geometry,
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
      // Conway (STEP) tags each PlacedGeometry with its occurrence path so a
      // reused part's occurrences stay distinguishable; undefined for IFC.
      ranges.push({parentExpressId, triangleCount, occurrencePath: placed.occurrencePath})
    }
  }
  return instanceMapFromOrderedPlacedRanges(ranges, opts)
}
