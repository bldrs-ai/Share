/**
 * flatMeshToInstancedModel — group a Conway FlatMesh stream by shared
 * geometry so it can be rendered with GPU instancing.
 *
 * The instancing counterpart to `flatMeshToBufferGeometry`. Conway's
 * compat surface already emits the web-ifc instancing model: every
 * `PlacedGeometry` references a shared, source-unit *local*-space
 * geometry by `geometryExpressID` plus its own `flatTransformation`
 * placement matrix (`GetGeometry(geometryExpressID)` returns the shared
 * buffer — the conway #308 "port cluster" fix preserves that sharing
 * for AP214 instances / `IfcMappedItem`s). `flatMeshToBufferGeometry`
 * discards it: it bakes each matrix into a private vertex slab and
 * merges, so N placements of one shape become N full vertex copies.
 *
 * This grouper keeps the sharing instead: it dedupes by
 * `geometryExpressID` so each unique shape is recorded once, with the
 * list of per-placement matrices / colours / parent ids that a
 * `THREE.InstancedMesh` / `BatchedMesh` consumes. It is intentionally
 * PURE — no Conway vertex reads, no three.js object construction — so
 * the measurement path (`?feature=instancedMeshes`) can report the
 * shared-vs-baked win cheaply, and PR2's render swap can build the
 * actual instanced scene graph from the same output. See
 * `design/new/viewer-replacement.md` §3b.iv.
 *
 * @see flatMeshToBufferGeometry — the merge (baked) path this mirrors.
 */


/** Fallback colour used when a PlacedGeometry has no `.color` field. */
const DEFAULT_COLOR = {x: 0.8, y: 0.8, z: 0.8, w: 1}

/**
 * Interleaved vertex stride from Conway: `[px, py, pz, nx, ny, nz]`
 * (6 floats per vertex). `GetVertexDataSize()` is in float-element
 * units, so `vertCount = vertexDataSize / VERT_STRIDE`.
 */
const VERT_STRIDE = 6

/** Indices per triangle. */
const INDICES_PER_TRIANGLE = 3

/**
 * Bytes a merged-path vertex costs in the GPU buffer: position (3) +
 * normal (3) + per-vertex `expressID` (1) + per-vertex `instanceID` (1),
 * all 4-byte. The merged path needs the two per-vertex id attributes to
 * recover picking identity after the index buffer is BVH-reordered.
 */
const MERGED_BYTES_PER_VERTEX = (3 + 3 + 1 + 1) * 4

/**
 * Bytes an instanced-path vertex costs: position (3) + normal (3),
 * 4-byte. The instanced path drops the per-vertex id attributes —
 * picking resolves through the native `instanceId`/`batchId`, so the
 * shared shape's vertices carry no identity.
 */
const INSTANCED_BYTES_PER_VERTEX = (3 + 3) * 4

/**
 * Per-instance GPU overhead the instanced path adds in place of the
 * duplicated vertices: a 4×4 matrix (16 floats) + an RGBA instance
 * colour (4 floats), 4-byte each.
 */
const INSTANCED_BYTES_PER_INSTANCE = ((4 * 4) + 4) * 4


/**
 * @typedef {object} InstancePlacement
 * @property {Array<number>} matrix the PlacedGeometry's
 *   `flatTransformation` (column-major 16-element 4×4), kept as-is —
 *   NOT applied to vertices.
 * @property {{x: number, y: number, z: number, w: number}} color RGBA.
 * @property {number} parentExpressId owning IFC product (the
 *   `FlatMesh.expressID`).
 * @property {number} instanceId synthetic 0-based id, assigned in
 *   emission order across the whole stream — the same id space
 *   `flatMeshToBufferGeometry` mints, so the two paths agree.
 */


/**
 * @typedef {object} InstanceGroup
 * @property {number} geometryExpressID the shared shape's id; fetch its
 *   local-space buffer once via `GetGeometry(modelID, geometryExpressID)`.
 * @property {number} vertCount vertices in the shared shape.
 * @property {number} triangleCount triangles in the shared shape.
 * @property {Array<InstancePlacement>} placements one per visible
 *   occurrence; `placements.length > 1` is the instanceable
 *   (`IfcMappedItem` / AP214-occurrence) case.
 */


/**
 * @typedef {object} InstancedModel
 * @property {Array<InstanceGroup>} groups unique shapes, in first-seen
 *   order, each with its placement list.
 * @property {object} stats see `computeStats` — draw-call and
 *   vertex-memory comparison of the merged vs. instanced shapes.
 */


/**
 * Iterate the FlatMesh source uniformly whether it is a Conway
 * `Vector` (size()/get(i)) or a plain Array of FlatMesh-shaped objects.
 *
 * @param {object|Array} vec
 * @param {Function} fn called with each element
 */
function forEachVectorItem(vec, fn) {
  const size = typeof vec?.size === 'function' ? vec.size() : (vec?.length ?? 0)
  for (let i = 0; i < size; i++) {
    fn(typeof vec.get === 'function' ? vec.get(i) : vec[i])
  }
}


/**
 * Derive the draw-call + vertex-memory comparison between the current
 * merged path and the instanced path.
 *
 * @param {Map<number, InstanceGroup>} groupsById
 * @param {number} instanceCount total placements (= synthetic id count)
 * @return {object} stats
 */
function computeStats(groupsById, instanceCount) {
  let sharedGeometryCount = 0 // shapes placed >1× (instancing pays off)
  let mergedVertexCount = 0 // vertices the merge path materialises
  let instancedVertexCount = 0 // vertices the instanced path materialises
  let topInstancedCount = 0
  let topInstancedGeometryID = -1
  for (const group of groupsById.values()) {
    const placements = group.placements.length
    if (placements > 1) {
      sharedGeometryCount++
    }
    mergedVertexCount += group.vertCount * placements
    instancedVertexCount += group.vertCount
    if (placements > topInstancedCount) {
      topInstancedCount = placements
      topInstancedGeometryID = group.geometryExpressID
    }
  }
  const mergedBytes = mergedVertexCount * MERGED_BYTES_PER_VERTEX
  const instancedBytes =
    (instancedVertexCount * INSTANCED_BYTES_PER_VERTEX) +
    (instanceCount * INSTANCED_BYTES_PER_INSTANCE)
  return {
    // Draw calls: the merged path is a single mesh (1); the instanced
    // path is one InstancedMesh per unique shape. A hybrid (§3b.iv)
    // would instance only the shared shapes and merge the singletons,
    // landing between these — reported here as the un-hybridised bound.
    uniqueGeometryCount: groupsById.size,
    sharedGeometryCount,
    singletonGeometryCount: groupsById.size - sharedGeometryCount,
    instanceCount,
    mergedVertexCount,
    instancedVertexCount,
    // 0..1; how much of the merged vertex memory the sharing removes.
    vertexReductionRatio: mergedVertexCount > 0 ?
      1 - (instancedVertexCount / mergedVertexCount) : 0,
    mergedVertexBytes: mergedBytes,
    instancedVertexBytes: instancedBytes,
    estimatedBytesSaved: mergedBytes - instancedBytes,
    topInstancedGeometryID,
    topInstancedCount,
  }
}


/**
 * Group a captured Conway FlatMesh stream by shared `geometryExpressID`.
 *
 * @param {object|Array} flatMeshes FlatMesh source (Conway `Vector` or
 *   Array of FlatMesh-shaped objects).
 * @param {object} api Conway-compatible IfcAPI. Needs `GetGeometry`
 *   returning an `IfcGeometry` with `GetVertexDataSize()` /
 *   `GetIndexDataSize()`. Vertex/index *data* is NOT read here — only
 *   sizes, to record the shared shape's vert/triangle counts.
 * @param {number} modelID
 * @return {InstancedModel}
 */
export function flatMeshToInstancedModel(flatMeshes, api, modelID) {
  const groupsById = new Map()
  let skippedFlatMeshes = 0
  let skippedPlacedGeometries = 0
  let instanceId = 0 // synthetic, emission order — matches the merge path

  forEachVectorItem(flatMeshes, (flatMesh) => {
    const parentExpressId = flatMesh?.expressID
    const placedVec = flatMesh?.geometries
    if (parentExpressId === undefined || !placedVec) {
      skippedFlatMeshes++
      return
    }
    forEachVectorItem(placedVec, (placed) => {
      const geomExpressID = placed?.geometryExpressID
      let group = groupsById.get(geomExpressID)
      if (group === undefined) {
        // First time we see this shape — measure it once.
        // eslint-disable-next-line new-cap
        const geom = api.GetGeometry(modelID, geomExpressID)
        if (!geom) {
          skippedPlacedGeometries++
          return
        }
        // eslint-disable-next-line new-cap
        const indexSize = geom.GetIndexDataSize()
        // eslint-disable-next-line new-cap
        const vertSize = geom.GetVertexDataSize()
        if (indexSize === 0 || vertSize === 0) {
          skippedPlacedGeometries++
          return
        }
        group = {
          geometryExpressID: geomExpressID,
          vertCount: (vertSize / VERT_STRIDE) | 0,
          triangleCount: (indexSize / INDICES_PER_TRIANGLE) | 0,
          placements: [],
        }
        groupsById.set(geomExpressID, group)
      }
      group.placements.push({
        matrix: placed.flatTransformation,
        color: placed.color ?? DEFAULT_COLOR,
        parentExpressId,
        instanceId,
      })
      instanceId++
    })
  })

  const stats = computeStats(groupsById, instanceId)
  stats.skippedFlatMeshes = skippedFlatMeshes
  stats.skippedPlacedGeometries = skippedPlacedGeometries
  return {groups: [...groupsById.values()], stats}
}
