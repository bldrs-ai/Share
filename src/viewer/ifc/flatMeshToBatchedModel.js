import {
  BatchedMesh,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Matrix4,
  Vector4,
} from 'three'
import {forEachVectorItem} from './conwayVector'
import {makeSurfaceMaterial} from '../lookMaterial'


/**
 * flatMeshToBatchedModel — Conway FlatMesh stream → `THREE.BatchedMesh`
 * batches.
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
 * instead of N vertex copies — the ~60% reduction §3b.iv measured.
 *
 * Why `BatchedMesh` and not `InstancedMesh`-per-shape: the §3b.iv numbers
 * showed naive per-shape instancing explodes the draw count (Snowdon
 * 1 → ~10k). `BatchedMesh` draws *all* its geometries + instances in one
 * multi-draw call.
 *
 * **Transparency:** opaque and transparent instances need different
 * material states (a transparent material disables `depthWrite` and goes
 * through the blended pass), so they cannot share one `BatchedMesh`.
 * Placements are split by alpha into an opaque batch and a transparent
 * batch, each with per-instance RGBA colour (`setColorAt(Vector4)` writes
 * alpha into the batch's RGBA colours texture). A shape used both ways has
 * its geometry in both batches. The caller wraps >1 batch in a Group.
 *
 * Picking: `BatchedMesh` raycasts return `intersection.batchId`, so each
 * batch carries `batchId → parentExpressId` / `batchId → occurrenceId`
 * tables. The occurrence id is a single emission-order id space across
 * both batches, so selection is consistent regardless of the split.
 *
 * @see flatMeshToInstancedModel — the grouping/measurement-only sibling.
 */


/** Fallback colour used when a PlacedGeometry has no `.color` field. */
export const DEFAULT_COLOR = {x: 0.8, y: 0.8, z: 0.8, w: 1}

/** Interleaved vertex stride from Conway: `[px, py, pz, nx, ny, nz]`. */
export const VERT_STRIDE = 6

/** Floats per position / normal vector. */
const VEC3 = 3

/** Indices per triangle. */
export const INDICES_PER_TRIANGLE = 3

/** An instance is transparent (own blended batch) when alpha is below this. */
export const OPAQUE_ALPHA = 1

/**
 * Translation magnitude (metres) past which a placement is treated as
 * georeferenced and its whole model recentered to the origin for the render.
 *
 * Why: Conway's `COORDINATE_TO_ORIGIN` recenters a model's geometry to the
 * origin on the classic open, but the browser demand open (`OpenModelStreamed`,
 * shipped default-on in #1614) hands back RAW source-world placements. Swiss
 * LV95 and other national grids put those at ~1e6–1e7 m, where float32 (the
 * GPU vertex + BatchedMesh instance-matrix format) resolves to ~1 m — so the
 * whole model swims by up to a metre as the camera rotates. Subtracting a
 * single model-wide offset brings the render back to the origin (the local
 * geometry is only ~100 m), restoring float32 precision. Normal near-origin
 * models never cross this threshold, so the recenter is a strict no-op for
 * them.
 */
export const LARGE_COORD_THRESHOLD = 1e4


/**
 * The origin-recenter offset for a georeferenced placement, or null when the
 * placement is near enough to the origin to leave untouched. Rounded to whole
 * metres so the offset is exactly float-representable and stable across the
 * incremental demand batches (every batch subtracts the same value).
 *
 * @param {Array<number>} flatTransformation 16-element column-major matrix
 * @return {?Array<number>} `[x, y, z]` to subtract, or null
 */
export function coordinationOffsetFor(flatTransformation) {
  const x = flatTransformation[12]
  const y = flatTransformation[13]
  const z = flatTransformation[14]
  if (Math.abs(x) > LARGE_COORD_THRESHOLD ||
      Math.abs(y) > LARGE_COORD_THRESHOLD ||
      Math.abs(z) > LARGE_COORD_THRESHOLD) {
    return [Math.round(x), Math.round(y), Math.round(z)]
  }
  return null
}


/**
 * @typedef {object} BatchHandle
 * @property {BatchedMesh} mesh the batch (one geometry per unique shape it
 *   uses, one instance per placement).
 * @property {import('three').Material} material the batch material.
 * @property {boolean} transparent whether this is the blended batch.
 * @property {Uint32Array} instanceParents `batchId → parent IFC product
 *   expressID`.
 * @property {Uint32Array} instanceOccurrenceIds `batchId → synthetic 0-based
 *   occurrence id` (global emission order across both batches).
 * @property {Uint32Array} instanceGeometryIds `batchId → the placement's
 *   geometryExpressID` (the solid's own id for STEP). Lets per-solid
 *   selection narrow a multibody part's shared occurrence path to one body,
 *   mirroring the merged path's `getGeometryExpressIdByInstance`.
 * @property {Array<Array<number>|null>|null} instanceOccurrencePaths
 *   `batchId → STEP occurrence path` (NAUO express ids, root→leaf) off
 *   `PlacedGeometry.occurrencePath`. Null (whole table) for IFC / engines
 *   that don't emit paths, so nothing downstream pays; per-entry null when
 *   a single placement has no path.
 * @property {Array<BufferGeometry>} instanceGeometry `batchId → the shared
 *   local-space shape geometry` this instance was added from. Retained so
 *   `batchedSubset` can re-bake a selection/isolation subset (the packed
 *   batch buffers aren't conveniently re-readable per instance).
 * @property {Array<object>} instanceColors `batchId → original `{x,y,z,w}`
 *   RGBA`. Retained so `batchedHighlight` can recolor a selected instance
 *   via `setColorAt` and restore the exact original afterwards (alpha
 *   included — `getColorAt` would drop it).
 */


/**
 * @typedef {object} BatchedModel
 * @property {Array<BatchHandle>} batches 1-2 batches (opaque, transparent),
 *   non-empty only.
 * @property {object} stats `{uniqueGeometryCount, instanceCount, vertexCount,
 *   triangleCount, parentCount, materialCount, transparentInstanceCount,
 *   skippedFlatMeshes, skippedPlacedGeometries}`.
 */


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
export function localGeometry(rawVerts, rawIndices, vertCount) {
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
 * and the list of placements referencing it, tagging each placement with a
 * global emission-order occurrence id.
 *
 * @param {object|Array} flatMeshes FlatMesh source
 * @param {object} api Conway-compatible IfcAPI
 * @param {number} modelID
 * @return {{groups: Map, totals: object}}
 */
function collectGroups(flatMeshes, api, modelID) {
  const groups = new Map()
  const bad = new Set() // geomExpressIDs that resolved to no usable geometry
  const totals = {
    placements: 0, transparentPlacements: 0, vertexCount: 0, indexCount: 0,
    skippedFlatMeshes: 0, skippedPlacedGeometries: 0,
    // Origin-recenter offset for georeferenced models, decided from the first
    // placement (see coordinationOffsetFor); null for near-origin models.
    coordOffset: undefined,
  }
  let occurrenceId = 0 // global, emission order — shared across both batches
  forEachVectorItem(flatMeshes, (flatMesh) => {
    const parentExpressId = flatMesh?.expressID
    const placedVec = flatMesh?.geometries
    if (parentExpressId === undefined || !placedVec) {
      totals.skippedFlatMeshes++
      return
    }
    forEachVectorItem(placedVec, (placed) => {
      const geomExpressID = placed?.geometryExpressID
      // Skip a placement with no geometry id — mirrors the parent guard
      // above. Without it, an undefined id would key one shared "undefined"
      // group and cross the Conway boundary with a bogus id.
      if (geomExpressID === undefined) {
        totals.skippedPlacedGeometries++
        return
      }
      let group = groups.get(geomExpressID)
      if (group === undefined) {
        // Known-bad shape: count this placement as skipped (matching the
        // merged path's per-placement semantics) but don't re-cross the
        // Conway boundary for a geometry we already rejected.
        if (bad.has(geomExpressID)) {
          totals.skippedPlacedGeometries++
          return
        }
        // eslint-disable-next-line new-cap
        const geom = api.GetGeometry(modelID, geomExpressID)
        if (!geom) {
          bad.add(geomExpressID)
          totals.skippedPlacedGeometries++
          return
        }
        // eslint-disable-next-line new-cap
        const indexSize = geom.GetIndexDataSize()
        // eslint-disable-next-line new-cap
        const vertSize = geom.GetVertexDataSize()
        // vertSize must be a whole number of `[p,n]` vertices — otherwise the
        // truncated vertCount would leave indices pointing past the copied
        // vertices (a corrupt triangle in the shared batch buffer).
        if (indexSize === 0 || vertSize === 0 || vertSize % VERT_STRIDE !== 0) {
          bad.add(geomExpressID)
          totals.skippedPlacedGeometries++
          return
        }
        const vertCount = (vertSize / VERT_STRIDE) | 0
        // eslint-disable-next-line new-cap
        const rawVerts = api.GetVertexArray(geom.GetVertexData(), vertCount * VERT_STRIDE)
        // eslint-disable-next-line new-cap
        const rawIndices = api.GetIndexArray(geom.GetIndexData(), indexSize)
        group = {
          geometry: localGeometry(rawVerts, rawIndices, vertCount),
          vertCount,
          indexCount: indexSize,
          placements: [],
        }
        groups.set(geomExpressID, group)
        totals.vertexCount += vertCount
        totals.indexCount += indexSize
      }
      const color = placed.color ?? DEFAULT_COLOR
      if (totals.coordOffset === undefined) {
        totals.coordOffset = coordinationOffsetFor(placed.flatTransformation)
      }
      group.placements.push({
        matrix: placed.flatTransformation,
        color,
        parentExpressId,
        occurrenceId,
        // Per-occurrence identity (STEP): the NAUO path disambiguates a
        // reused part's placements; the geometry id names the solid. Both
        // ride into the per-batch pick tables so the batched path can
        // narrow selection / hide to one occurrence like the merged path.
        occurrencePath: placed.occurrencePath ?? null,
        geometryExpressId: geomExpressID,
      })
      occurrenceId++
      totals.placements++
      if (color.w < OPAQUE_ALPHA) {
        totals.transparentPlacements++
      }
    })
  })
  return {groups, totals}
}


/**
 * Build one `BatchedMesh` from the placements of every group that match the
 * given transparency, or null when none do.
 *
 * @param {Map} groups geometryExpressID → group
 * @param {boolean} transparent select transparent (alpha<1) placements
 * @param {?Array<number>} coordOffset `[x,y,z]` origin-recenter offset to
 *   subtract from every instance matrix, or null for no recenter.
 * @return {BatchHandle|null}
 */
function buildBatch(groups, transparent, coordOffset) {
  // Size the batch up front: a geometry slot for each shape with a matching
  // placement, an instance slot per matching placement.
  let vertexCount = 0
  let indexCount = 0
  let instanceCount = 0
  const used = []
  for (const group of groups.values()) {
    const placements = group.placements.filter((p) => (p.color.w < OPAQUE_ALPHA) === transparent)
    if (placements.length === 0) {
      continue
    }
    used.push({group, placements})
    vertexCount += group.vertCount
    indexCount += group.indexCount
    instanceCount += placements.length
  }
  if (instanceCount === 0) {
    return null
  }

  const material = makeSurfaceMaterial({side: DoubleSide})
  if (transparent) {
    material.transparent = true
    // Don't occlude geometry behind the glass; per-instance alpha blends.
    material.depthWrite = false
  }
  const mesh = new BatchedMesh(instanceCount, vertexCount, indexCount, material)
  const instanceParents = new Uint32Array(instanceCount)
  const instanceOccurrenceIds = new Uint32Array(instanceCount)
  const instanceGeometryIds = new Uint32Array(instanceCount)
  const instanceOccurrencePaths = new Array(instanceCount)
  let hasOccurrencePaths = false
  const instanceGeometry = new Array(instanceCount)
  const instanceColors = new Array(instanceCount)
  const matrix = new Matrix4()
  const rgba = new Vector4()

  for (const {group, placements} of used) {
    const geometryId = mesh.addGeometry(group.geometry)
    for (const placement of placements) {
      const batchId = mesh.addInstance(geometryId)
      matrix.fromArray(placement.matrix)
      if (coordOffset !== null && coordOffset !== undefined) {
        // Recenter a georeferenced model to the origin (see
        // coordinationOffsetFor) so its float32 render stays precise.
        matrix.elements[12] -= coordOffset[0]
        matrix.elements[13] -= coordOffset[1]
        matrix.elements[14] -= coordOffset[2]
      }
      mesh.setMatrixAt(batchId, matrix)
      // Vector4 carries alpha into the batch's RGBA colours texture.
      mesh.setColorAt(batchId, rgba.set(
        placement.color.x, placement.color.y, placement.color.z, placement.color.w))
      instanceParents[batchId] = placement.parentExpressId
      instanceOccurrenceIds[batchId] = placement.occurrenceId
      instanceGeometryIds[batchId] = placement.geometryExpressId
      instanceOccurrencePaths[batchId] = placement.occurrencePath
      if (placement.occurrencePath) {
        hasOccurrencePaths = true
      }
      instanceGeometry[batchId] = group.geometry
      instanceColors[batchId] = placement.color
    }
  }
  return {
    mesh, material, transparent,
    instanceParents, instanceOccurrenceIds, instanceGeometry, instanceColors,
    instanceGeometryIds,
    // Null (not an all-null array) for IFC so consumers can cheaply skip
    // occurrence lookups — mirrors the merged path's IfcInstanceMap.
    instanceOccurrencePaths: hasOccurrencePaths ? instanceOccurrencePaths : null,
  }
}


/**
 * Build `THREE.BatchedMesh` batches from a captured Conway FlatMesh stream.
 *
 * @param {object|Array} flatMeshes FlatMesh source
 * @param {object} api Conway-compatible IfcAPI. Needs `GetGeometry`,
 *   `GetVertexArray`, `GetIndexArray`.
 * @param {number} modelID
 * @return {BatchedModel}
 */
export function flatMeshToBatchedModel(flatMeshes, api, modelID) {
  const {groups, totals} = collectGroups(flatMeshes, api, modelID)
  const coordOffset = totals.coordOffset ?? null

  const batches = [
    buildBatch(groups, false, coordOffset),
    buildBatch(groups, true, coordOffset),
  ].filter(Boolean)

  const parents = new Set()
  for (const batch of batches) {
    for (const p of batch.instanceParents) {
      parents.add(p)
    }
  }

  return {
    batches,
    stats: {
      uniqueGeometryCount: groups.size,
      instanceCount: totals.placements,
      vertexCount: totals.vertexCount,
      // Keys below mirror buildConwayIfcModel's stats so the shared
      // `[conwayDirect] parsed` log line works unchanged. triangleCount /
      // vertexCount are the *unique* (deduped) totals — the memory win.
      triangleCount: (totals.indexCount / INDICES_PER_TRIANGLE) | 0,
      parentCount: parents.size,
      materialCount: batches.length,
      transparentInstanceCount: totals.transparentPlacements,
      skippedFlatMeshes: totals.skippedFlatMeshes,
      skippedPlacedGeometries: totals.skippedPlacedGeometries,
    },
    // `[x,y,z]` origin offset already subtracted from the batch matrices for a
    // georeferenced model (null for near-origin models). The caller stamps it
    // on the model root so a rendered point maps back to true world coords.
    coordinationOffset: coordOffset,
  }
}
