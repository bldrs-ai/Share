import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Matrix3,
  Matrix4,
  Mesh,
  Vector3,
} from 'three'
import {eachBatch} from './batchedModel'
import {makeSurfaceColor, makeSurfaceMaterial} from '../lookMaterial'


/**
 * batchedToMergedMesh — flatten a Conway-direct `THREE.BatchedMesh` model
 * (`?feature=batchedMesh`) into a single merged `THREE.Mesh` for GLB
 * export / caching.
 *
 * A `BatchedMesh` stores each unique shape once in local space plus a
 * per-instance matrix / colour, and keeps the source IFC ids in per-batch
 * side tables (`instanceParents` / `instanceOccurrenceIds`) rather than on
 * any vertex. `GLTFExporter` can't serialise that packed representation,
 * and a serialised batch would carry no per-vertex `_EXPRESSID` for the
 * `BLDRS_face_ids` picking capture — so the batched path used to skip the
 * cache entirely.
 *
 * This bakes it back into exactly the shape the merged Conway-direct path
 * (`flatMeshToBufferGeometry`) produces: one indexed `BufferGeometry` with
 * per-vertex `position` / `normal` / `expressID` / `instanceID`, colour-
 * binned into `geometry.groups[]` + an array of look-gated surface materials.
 * `GLTFExporter` renames `expressID` → `_EXPRESSID` and `instanceID` →
 * `_INSTANCEID` verbatim, so the resulting GLB is byte-compatible with a
 * merged Conway-direct cache artifact — the reader hydrates it as an
 * `instancePicking` model through the existing cache-hit path with **no
 * reader-side changes and no schema bump**. (The consequence: a reload
 * from cache is the merged mesh, not a live BatchedMesh — the same
 * cache-hit/cache-miss shape divergence §3b.iii already notes for the
 * Conway-direct path.)
 *
 * Instance matrices are baked into the vertices in model-local space; the
 * coordination matrix (stamped on the batched *root* node with
 * `matrixAutoUpdate` off, see `ShareIfcLoader`) is copied onto the merged
 * mesh's node so on-screen placement is reproduced exactly — matching how
 * the merged path keeps the coordination transform on the node and the
 * `flatTransformation` baked into vertices.
 *
 * @see flatMeshToBufferGeometry — the merged-path template this mirrors.
 * @see design/new/viewer-replacement.md §3b.iv
 */


/** Fallback colour when an instance carries no colour entry. */
const DEFAULT_COLOR = {x: 0.8, y: 0.8, z: 0.8, w: 1}

/** Floats per position / normal vector. */
const VEC3 = 3

/** Alpha at/above which a colour is opaque (gets a non-transparent material). */
const OPAQUE_ALPHA = 1


/**
 * Stringify an RGBA colour for use as a colour-bin Map key. Mirrors
 * `flatMeshToBufferGeometry.colorKey` — float concat, no quantisation
 * (equal IFC colours produce bit-equal floats).
 *
 * @param {{x: number, y: number, z: number, w: number}} color
 * @return {string}
 */
function colorKey(color) {
  return `${color.x}|${color.y}|${color.z}|${color.w}`
}


/**
 * Collect one entry per rendered instance across every batch of a batched
 * model, snapshotting the placement matrix and the source local geometry.
 *
 * @param {object} model BatchedMesh or Group of BatchedMeshes
 * @return {Array<object>} `{parentExpressId, instanceId, geom, matrix, color,
 *   vertCount, indexCount}` per instance
 */
function collectInstanceEntries(model) {
  const entries = []
  const scratch = new Matrix4()
  eachBatch(model, (mesh) => {
    // Only a decorated batch (carrying the side tables) is convertible; a
    // bare BatchedMesh has no source ids to bake in. Skip it — the caller
    // treats an empty entry list as "nothing to export".
    if (!mesh.instanceParents || !mesh.instanceGeometry ||
        typeof mesh.getMatrixAt !== 'function') {
      return
    }
    const parents = mesh.instanceParents
    const occurrences = mesh.instanceOccurrenceIds
    const geometries = mesh.instanceGeometry
    const colors = mesh.instanceColors
    for (let batchId = 0; batchId < parents.length; batchId++) {
      const geom = geometries[batchId]
      const pos = geom?.attributes?.position
      const idx = geom?.index
      if (!pos || !idx) {
        continue
      }
      mesh.getMatrixAt(batchId, scratch)
      entries.push({
        parentExpressId: parents[batchId],
        // `instanceOccurrenceIds` is globally unique across both batches
        // (minted in FlatMesh emission order) — the id per-instance picking
        // needs. Fall back to batchId only if the table is absent.
        instanceId: occurrences ? occurrences[batchId] : batchId,
        geom,
        matrix: scratch.clone(),
        color: colors?.[batchId] ?? DEFAULT_COLOR,
        vertCount: pos.count,
        indexCount: idx.count,
      })
    }
  })
  return entries
}


/**
 * Bake a Conway-direct batched model into a single merged `THREE.Mesh`
 * suitable for `GLTFExporter`, in the same layout `flatMeshToBufferGeometry`
 * emits (see module doc).
 *
 * @param {object} model BatchedMesh or Group of BatchedMeshes
 * @return {Mesh|null} merged mesh (array material + colour groups), or null
 *   when the model has no convertible instances
 */
export function batchedModelToMergedMesh(model) {
  const entries = collectInstanceEntries(model)
  if (entries.length === 0) {
    return null
  }

  // Bin by colour in first-seen order (→ material index), so each colour's
  // triangles stay contiguous for the `geometry.groups[]` / `materials[]`
  // pairing three.js's multi-material renderer uses.
  const bins = new Map()
  for (const entry of entries) {
    const key = colorKey(entry.color)
    let bin = bins.get(key)
    if (!bin) {
      bin = {color: entry.color, entries: []}
      bins.set(key, bin)
    }
    bin.entries.push(entry)
  }
  let totalVerts = 0
  let totalIndices = 0
  for (const bin of bins.values()) {
    for (const entry of bin.entries) {
      entry.vertOffset = totalVerts
      totalVerts += entry.vertCount
      totalIndices += entry.indexCount
    }
  }

  const positions = new Float32Array(totalVerts * VEC3)
  const normals = new Float32Array(totalVerts * VEC3)
  const expressIDs = new Uint32Array(totalVerts)
  const instanceIDs = new Uint32Array(totalVerts)
  const indices = new Uint32Array(totalIndices)
  const materials = []
  const groups = []
  const p = new Vector3()
  const n = new Vector3()
  const normalMatrix = new Matrix3()
  let vCursor = 0
  let iCursor = 0
  let materialIndex = 0

  for (const bin of bins.values()) {
    const groupStart = iCursor
    // Match flatMeshToBufferGeometry via the §6e-flag-gated factory: Standard
    // + sRGB albedo under `?feature=look`, else legacy Lambert + untagged
    // colour (src/viewer/lookMaterial.js). Transparent/opacity on alpha < 1.
    const col = makeSurfaceColor(bin.color.x, bin.color.y, bin.color.z)
    const material = makeSurfaceMaterial({color: col, side: DoubleSide})
    if (bin.color.w !== OPAQUE_ALPHA) {
      material.transparent = true
      material.opacity = bin.color.w
    }
    materials.push(material)
    for (const entry of bin.entries) {
      const posAttr = entry.geom.attributes.position
      const nrmAttr = entry.geom.attributes.normal
      const srcIdx = entry.geom.index.array
      normalMatrix.getNormalMatrix(entry.matrix)
      for (let v = 0; v < entry.vertCount; v++) {
        p.fromBufferAttribute(posAttr, v).applyMatrix4(entry.matrix)
        const dst = (vCursor + v) * VEC3
        positions[dst] = p.x
        positions[dst + 1] = p.y
        positions[dst + 2] = p.z
        if (nrmAttr) {
          n.fromBufferAttribute(nrmAttr, v).applyMatrix3(normalMatrix).normalize()
          normals[dst] = n.x
          normals[dst + 1] = n.y
          normals[dst + 2] = n.z
        }
        expressIDs[vCursor + v] = entry.parentExpressId
        instanceIDs[vCursor + v] = entry.instanceId
      }
      for (let k = 0; k < entry.indexCount; k++) {
        indices[iCursor + k] = srcIdx[k] + entry.vertOffset
      }
      vCursor += entry.vertCount
      iCursor += entry.indexCount
    }
    const groupCount = iCursor - groupStart
    if (groupCount > 0) {
      groups.push({start: groupStart, count: groupCount, materialIndex})
    }
    materialIndex++
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, VEC3))
  geometry.setAttribute('normal', new BufferAttribute(normals, VEC3))
  geometry.setAttribute('expressID', new BufferAttribute(expressIDs, 1))
  geometry.setAttribute('instanceID', new BufferAttribute(instanceIDs, 1))
  geometry.setIndex(new BufferAttribute(indices, 1))
  for (const g of groups) {
    geometry.addGroup(g.start, g.count, g.materialIndex)
  }

  const merged = new Mesh(geometry, materials)
  // Carry the coordination transform from the batched root node (stamped
  // with matrixAutoUpdate off) so the exported GLB reproduces on-screen
  // placement; instance matrices are already baked into the vertices.
  if (model.matrix && typeof model.matrix.copy === 'function') {
    merged.matrixAutoUpdate = model.matrixAutoUpdate ?? false
    merged.matrix.copy(model.matrix)
    merged.matrix.decompose(merged.position, merged.quaternion, merged.scale)
  }
  if (typeof model.name === 'string') {
    merged.name = model.name
  }
  return merged
}


/**
 * Dispose a merged mesh built by `batchedModelToMergedMesh` — frees its
 * freshly-baked geometry + per-bin materials. The source batched model is
 * untouched (the merged mesh owns independent buffers).
 *
 * @param {Mesh} mesh
 */
export function disposeMergedMesh(mesh) {
  if (!mesh) {
    return
  }
  mesh.geometry?.dispose?.()
  const material = mesh.material
  if (Array.isArray(material)) {
    material.forEach((m) => m?.dispose?.())
  } else {
    material?.dispose?.()
  }
}
