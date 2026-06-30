import {
  BatchedMesh,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Matrix4,
  MeshLambertMaterial,
} from 'three'


/**
 * flatMeshToBatchedModel — Conway FlatMesh stream → a `THREE.BatchedMesh`.
 *
 * The GPU-instanced counterpart to `flatMeshToBufferGeometry` (the merge
 * path). Conway's compat surface already emits the web-ifc instancing
 * model: each `PlacedGeometry` references a shared, source-unit *local*-
 * space geometry by `geometryExpressID` plus its own `flatTransformation`
 * placement matrix. The merge path discards that sharing — it bakes each
 * matrix into a private vertex slab. This builder keeps it: each unique
 * `geometryExpressID` is fetched once and added to a `BatchedMesh` as one
 * geometry; every placement becomes an *instance* with its own matrix +
 * colour. So N placements of a shape cost 1 vertex copy + N matrices
 * instead of N vertex copies — the ~60% reduction the §3b.iv measurements
 * showed on instance-heavy models.
 *
 * Why `BatchedMesh` and not `InstancedMesh`-per-shape: the §3b.iv numbers
 * showed naive per-shape instancing explodes the draw count (Snowdon
 * 1 → ~10k). `BatchedMesh` draws *all* its geometries + instances in one
 * multi-draw call, so the draw count stays ~1 while the memory win is
 * taken. Singletons cost nothing extra — they are just instance-count-1
 * geometries in the same batch.
 *
 * Picking: `BatchedMesh` raycasts return `intersection.batchId` (the
 * per-instance id from `addInstance`), so this returns the
 * `batchId → parentExpressId` and `batchId → occurrenceId` tables a pick
 * resolves through — no triangle→instance lookup needed. The occurrence id
 * is the same synthetic per-placement id the merge path mints, so
 * selection parity is preserved.
 *
 * Returns the `BatchedMesh` plus those tables and the assembly stats.
 *
 * @see flatMeshToInstancedModel — the grouping/measurement-only sibling.
 */


/** Fallback colour used when a PlacedGeometry has no `.color` field. */
const DEFAULT_COLOR = {x: 0.8, y: 0.8, z: 0.8, w: 1}

/** Interleaved vertex stride from Conway: `[px, py, pz, nx, ny, nz]`. */
const VERT_STRIDE = 6

/** Floats per position / normal vector. */
const VEC3 = 3


/**
 * @typedef {object} BatchedModel
 * @property {BatchedMesh} mesh the assembled batch (one geometry per unique
 *   `geometryExpressID`, one instance per placement, per-instance matrix +
 *   colour).
 * @property {MeshLambertMaterial} material the (single) batch material.
 * @property {Uint32Array} instanceParents `batchId → parent IFC product
 *   expressID` (the `FlatMesh.expressID`); the pick resolution table.
 * @property {Uint32Array} instanceOccurrenceIds `batchId → synthetic 0-based
 *   occurrence id` (emission order, the same id space the merge path mints).
 * @property {object} stats `{uniqueGeometryCount, instanceCount,
 *   vertexCount, skippedFlatMeshes, skippedPlacedGeometries}`.
 */


/**
 * Iterate a Conway `Vector` (size()/get(i)) or a plain Array uniformly.
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
 * De-interleave a Conway `[p,n]` vertex buffer into a local-space
 * `BufferGeometry` (position + normal + index). No transform is applied —
 * placement is per-instance on the BatchedMesh.
 *
 * @param {Float32Array} rawVerts interleaved p+n, `vertCount * 6` floats
 * @param {Uint32Array} rawIndices u32 indices
 * @param {number} vertCount vertices
 * @return {BufferGeometry}
 */
function localGeometry(rawVerts, rawIndices, vertCount) {
  const positions = new Float32Array(vertCount * VEC3)
  const normals = new Float32Array(vertCount * VEC3)
  for (let v = 0; v < vertCount; v++) {
    const src = v * VERT_STRIDE
    const dst = v * VEC3
    positions[dst] = rawVerts[src]
    positions[dst + 1] = rawVerts[src + 1]
    positions[dst + 2] = rawVerts[src + 2]
    normals[dst] = rawVerts[src + 3]
    normals[dst + 1] = rawVerts[src + 4]
    normals[dst + 2] = rawVerts[src + 5]
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, VEC3))
  geometry.setAttribute('normal', new BufferAttribute(normals, VEC3))
  geometry.setIndex(new BufferAttribute(Uint32Array.from(rawIndices), 1))
  return geometry
}


/**
 * Collect, per unique `geometryExpressID`, its local geometry (fetched once)
 * and the list of placements referencing it.
 *
 * @param {object|Array} flatMeshes FlatMesh source
 * @param {object} api Conway-compatible IfcAPI
 * @param {number} modelID
 * @return {{groups: Map, totals: object}}
 */
function collectGroups(flatMeshes, api, modelID) {
  const groups = new Map()
  const totals = {
    placements: 0, vertexCount: 0, indexCount: 0,
    skippedFlatMeshes: 0, skippedPlacedGeometries: 0,
  }
  forEachVectorItem(flatMeshes, (flatMesh) => {
    const parentExpressId = flatMesh?.expressID
    const placedVec = flatMesh?.geometries
    if (parentExpressId === undefined || !placedVec) {
      totals.skippedFlatMeshes++
      return
    }
    forEachVectorItem(placedVec, (placed) => {
      const geomExpressID = placed?.geometryExpressID
      let group = groups.get(geomExpressID)
      if (group === undefined) {
        // eslint-disable-next-line new-cap
        const geom = api.GetGeometry(modelID, geomExpressID)
        if (!geom) {
          totals.skippedPlacedGeometries++
          return
        }
        // eslint-disable-next-line new-cap
        const indexSize = geom.GetIndexDataSize()
        // eslint-disable-next-line new-cap
        const vertSize = geom.GetVertexDataSize()
        if (indexSize === 0 || vertSize === 0) {
          totals.skippedPlacedGeometries++
          return
        }
        const vertCount = (vertSize / VERT_STRIDE) | 0
        // eslint-disable-next-line new-cap
        const rawVerts = api.GetVertexArray(geom.GetVertexData(), vertCount * VERT_STRIDE)
        // eslint-disable-next-line new-cap
        const rawIndices = api.GetIndexArray(geom.GetIndexData(), indexSize)
        group = {geometry: localGeometry(rawVerts, rawIndices, vertCount), placements: []}
        groups.set(geomExpressID, group)
        totals.vertexCount += vertCount
        totals.indexCount += indexSize
      }
      group.placements.push({
        matrix: placed.flatTransformation,
        color: placed.color ?? DEFAULT_COLOR,
        parentExpressId,
      })
      totals.placements++
    })
  })
  return {groups, totals}
}


/**
 * Build a `THREE.BatchedMesh` from a captured Conway FlatMesh stream.
 *
 * @param {object|Array} flatMeshes FlatMesh source
 * @param {object} api Conway-compatible IfcAPI. Needs `GetGeometry`,
 *   `GetVertexArray`, `GetIndexArray`.
 * @param {number} modelID
 * @return {BatchedModel}
 */
export function flatMeshToBatchedModel(flatMeshes, api, modelID) {
  const {groups, totals} = collectGroups(flatMeshes, api, modelID)

  const material = new MeshLambertMaterial({side: DoubleSide})
  // Capacities must bound the whole batch up front: one geometry slot per
  // unique shape worth of verts/indices, one instance slot per placement.
  const mesh = new BatchedMesh(
    Math.max(totals.placements, 1),
    Math.max(totals.vertexCount, 1),
    Math.max(totals.indexCount, 1),
    material)

  const instanceParents = new Uint32Array(totals.placements)
  const instanceOccurrenceIds = new Uint32Array(totals.placements)
  const matrix = new Matrix4()
  const color = new Color()
  let occurrenceId = 0 // synthetic, emission order — matches the merge path

  for (const group of groups.values()) {
    const geometryId = mesh.addGeometry(group.geometry)
    for (const placement of group.placements) {
      const batchId = mesh.addInstance(geometryId)
      mesh.setMatrixAt(batchId, matrix.fromArray(placement.matrix))
      mesh.setColorAt(batchId, color.setRGB(
        placement.color.x, placement.color.y, placement.color.z))
      instanceParents[batchId] = placement.parentExpressId
      instanceOccurrenceIds[batchId] = occurrenceId++
    }
  }

  const INDICES_PER_TRIANGLE = 3
  return {
    mesh,
    material,
    instanceParents,
    instanceOccurrenceIds,
    stats: {
      uniqueGeometryCount: groups.size,
      instanceCount: totals.placements,
      vertexCount: totals.vertexCount,
      // Keys below mirror buildConwayIfcModel's stats so the shared
      // `[conwayDirect] parsed` log line works unchanged. triangleCount /
      // vertexCount are the *unique* (deduped) totals — the memory win.
      triangleCount: (totals.indexCount / INDICES_PER_TRIANGLE) | 0,
      parentCount: new Set(instanceParents).size,
      materialCount: 1,
      skippedFlatMeshes: totals.skippedFlatMeshes,
      skippedPlacedGeometries: totals.skippedPlacedGeometries,
    },
  }
}
