import {
  BufferAttribute,
  BufferGeometry,
  Matrix3,
  Matrix4,
} from 'three'


/**
 * flatMeshToBufferGeometry — Conway FlatMesh → three.js BufferGeometry.
 *
 * The Conway-direct path to a renderable mesh. Walks each
 * PlacedGeometry under the captured FlatMeshes, reads its raw
 * vertex/index data from Conway's wasm HEAP (via `GetVertexArray` /
 * `GetIndexArray`), applies the per-instance `flatTransformation`,
 * and accumulates into a single merged BufferGeometry.
 *
 * Mirrors what `web-ifc-three.IFCParser#loadAllGeometry` builds
 * (IFCLoader.js:162-184) — same buffer layout (positions + normals +
 * expressID per vertex) so the rest of the viewer (raycasting,
 * picking, outline post-effect, BVH) drops in unchanged. The
 * differences from web-ifc-three's path:
 *
 *   1. **One pass, no per-PlacedGeometry Mesh churn.** web-ifc-three
 *      builds a fresh Mesh per PlacedGeometry then merges. We
 *      accumulate directly into typed-array sinks and skip the
 *      intermediate object allocation.
 *   2. **No `geometriesByMaterials` color binning.** Material
 *      handling is the caller's concern; this returns one merged
 *      geometry. (PR 3 in the slice can re-introduce per-material
 *      grouping if needed; for the smoke test a single material is
 *      fine.)
 *   3. **Emits a per-vertex `instanceID` attribute alongside
 *      `expressID`.** Same shape Conway already gives us at the
 *      PlacedGeometry level (see IfcInstanceMap); the items map
 *      consumes this for per-instance subset construction without a
 *      separate face-index lookup table.
 *
 * Vertex format from Conway: interleaved `[px, py, pz, nx, ny, nz]`
 * per vertex (6 floats). Confirmed at
 * `web-ifc-three/IFCLoader.js:280` — same de-interleave we do here.
 *
 * Index format from Conway: u32 indices into the per-PlacedGeometry
 * vertex buffer. Re-based when concatenating into the merged buffer
 * (add the per-PlacedGeometry vertex-offset).
 *
 * Returns the BufferGeometry plus the per-PlacedGeometry triangle
 * ranges so the caller can feed them straight into
 * `instanceMapFromOrderedPlacedRanges` without a second walk.
 */


/**
 * @typedef {object} AssembledModel
 * @property {BufferGeometry} geometry merged buffer (position, normal,
 *   expressID per-vertex, instanceID per-vertex; uint32 index)
 * @property {Array<{parentExpressId: number, triangleCount: number}>} ranges
 *   per-PlacedGeometry ranges in emission order, ready for
 *   `instanceMapFromOrderedPlacedRanges`
 * @property {number} placedGeometryCount PlacedGeometries assembled
 * @property {number} skippedFlatMeshes FlatMeshes skipped (missing
 *   expressID or no geometries)
 * @property {number} skippedPlacedGeometries PlacedGeometries skipped
 *   (GetGeometry returned null, or empty geometry)
 */


/**
 * Build the merged BufferGeometry from a captured FlatMesh source.
 *
 * @param {object|Array} flatMeshes FlatMesh source
 *   (size()/get(i) or Array of FlatMesh-shaped objects)
 * @param {object} api Conway-compatible IfcAPI. Needs:
 *     GetGeometry(modelID, geomExpressID) → IfcGeometry
 *     GetVertexArray(ptr, size) → Float32Array (interleaved p+n)
 *     GetIndexArray(ptr, size) → Uint32Array
 * @param {number} modelID
 * @return {AssembledModel}
 */
export function flatMeshToBufferGeometry(flatMeshes, api, modelID) {
  // First pass: total vertex / index counts so we can allocate the
  // merged typed arrays exactly. Avoids growable-array reallocation
  // overhead on big models. Also captures per-PlacedGeometry
  // ranges so the caller can build the IfcInstanceMap.
  const passOne = []
  let totalVerts = 0
  let totalIndices = 0
  let skippedFlatMeshes = 0
  let skippedPlacedGeometries = 0
  const flatMeshSize = typeof flatMeshes?.size === 'function' ?
    flatMeshes.size() : (flatMeshes?.length ?? 0)
  for (let i = 0; i < flatMeshSize; i++) {
    const flatMesh = typeof flatMeshes.get === 'function' ?
      flatMeshes.get(i) : flatMeshes[i]
    const parentExpressId = flatMesh?.expressID
    const placedVec = flatMesh?.geometries
    if (parentExpressId === undefined || !placedVec) {
      skippedFlatMeshes++
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
        skippedPlacedGeometries++
        continue
      }
      // eslint-disable-next-line new-cap
      const indexSize = geom.GetIndexDataSize()
      // eslint-disable-next-line new-cap
      const vertSize = geom.GetVertexDataSize()
      if (indexSize === 0 || vertSize === 0) {
        skippedPlacedGeometries++
        continue
      }
      // Vertex data is interleaved p+n (6 floats per vertex);
      // GetVertexDataSize is in element count (Float units), so
      // vertCount = vertSize / VERT_STRIDE_PASS1.
      const VERT_STRIDE_PASS1 = 6
      const vertCount = (vertSize / VERT_STRIDE_PASS1) | 0
      const triangleCount = (indexSize / 3) | 0
      passOne.push({
        parentExpressId,
        placed,
        geom,
        vertCount,
        indexCount: indexSize,
        vertOffset: totalVerts,
        triangleCount,
      })
      totalVerts += vertCount
      totalIndices += indexSize
    }
  }
  const placedGeometryCount = passOne.length
  // Second pass: copy + transform into the merged sinks.
  const positions = new Float32Array(totalVerts * 3)
  const normals = new Float32Array(totalVerts * 3)
  const expressIDs = new Uint32Array(totalVerts)
  const instanceIDs = new Uint32Array(totalVerts)
  // Conway always emits u32 indices.
  const indices = new Uint32Array(totalIndices)
  const ranges = []
  const mat4 = new Matrix4()
  const normalMat = new Matrix3()
  let vCursor = 0 // write cursor into positions/normals (vertex count)
  let iCursor = 0 // write cursor into indices
  for (let p = 0; p < passOne.length; p++) {
    const entry = passOne[p]
    const {parentExpressId, placed, geom, vertCount, indexCount, vertOffset, triangleCount} = entry
    // eslint-disable-next-line new-cap
    const rawVerts = api.GetVertexArray(geom.GetVertexData(), vertCount * 6)
    // eslint-disable-next-line new-cap
    const rawIndices = api.GetIndexArray(geom.GetIndexData(), indexCount)
    mat4.fromArray(placed.flatTransformation)
    // Normal matrix: inverse transpose of the upper-left 3×3.
    // Three.js' Matrix3.getNormalMatrix does exactly this.
    normalMat.getNormalMatrix(mat4)
    // De-interleave + transform vertices. Inline the transform math
    // (mat4 × vec3) instead of allocating a Vector3 per vertex —
    // big models have millions of vertices and the GC cost shows up.
    const m11 = mat4.elements[0]
    const m21 = mat4.elements[1]
    const m31 = mat4.elements[2]
    const m12 = mat4.elements[4]
    const m22 = mat4.elements[5]
    const m32 = mat4.elements[6]
    const m13 = mat4.elements[8]
    const m23 = mat4.elements[9]
    const m33 = mat4.elements[10]
    const m14 = mat4.elements[12]
    const m24 = mat4.elements[13]
    const m34 = mat4.elements[14]
    const n11 = normalMat.elements[0]
    const n21 = normalMat.elements[1]
    const n31 = normalMat.elements[2]
    const n12 = normalMat.elements[3]
    const n22 = normalMat.elements[4]
    const n32 = normalMat.elements[5]
    const n13 = normalMat.elements[6]
    const n23 = normalMat.elements[7]
    const n33 = normalMat.elements[8]
    // 6 = interleaved {p,n} stride per vertex (3 floats position + 3 floats normal)
    const VERT_STRIDE = 6
    for (let v = 0; v < vertCount; v++) {
      const src = v * VERT_STRIDE
      const px = rawVerts[src]
      const py = rawVerts[src + 1]
      const pz = rawVerts[src + 2]
      const nx = rawVerts[src + 3]
      const ny = rawVerts[src + 4]
      const nz = rawVerts[src + 5]
      const dst = (vCursor + v) * 3
      positions[dst] = (m11 * px) + (m12 * py) + (m13 * pz) + m14
      positions[dst + 1] = (m21 * px) + (m22 * py) + (m23 * pz) + m24
      positions[dst + 2] = (m31 * px) + (m32 * py) + (m33 * pz) + m34
      normals[dst] = (n11 * nx) + (n12 * ny) + (n13 * nz)
      normals[dst + 1] = (n21 * nx) + (n22 * ny) + (n23 * nz)
      normals[dst + 2] = (n31 * nx) + (n32 * ny) + (n33 * nz)
      expressIDs[vCursor + v] = parentExpressId
      instanceIDs[vCursor + v] = p
    }
    // Re-base indices into the merged vertex buffer.
    for (let k = 0; k < indexCount; k++) {
      indices[iCursor + k] = rawIndices[k] + vertOffset
    }
    vCursor += vertCount
    iCursor += indexCount
    ranges.push({parentExpressId, triangleCount})
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(normals, 3))
  geometry.setAttribute('expressID', new BufferAttribute(expressIDs, 1))
  geometry.setAttribute('instanceID', new BufferAttribute(instanceIDs, 1))
  geometry.setIndex(new BufferAttribute(indices, 1))
  return {
    geometry,
    ranges,
    placedGeometryCount,
    skippedFlatMeshes,
    skippedPlacedGeometries,
  }
}
