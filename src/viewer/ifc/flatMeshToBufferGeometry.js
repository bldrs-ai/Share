import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Matrix3,
  Matrix4,
  MeshLambertMaterial,
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
 *   expressID per-vertex, instanceID per-vertex; uint32 index). Carries
 *   `groups[]` binding each color-bin's contiguous triangle range to
 *   a `materials[]` index.
 * @property {Array<{parentExpressId: number, triangleCount: number,
 *   occurrencePath: (Array<number>|undefined)}>} ranges
 *   per-PlacedGeometry ranges in EMISSION order (color-binned), ready
 *   for `instanceMapFromOrderedPlacedRanges`. NOT the FlatMesh-walk
 *   order — color binning permutes the emission so each color's
 *   triangles stay contiguous in the merged buffer. `occurrencePath`
 *   is the STEP NAUO express-id path off `PlacedGeometry.occurrencePath`
 *   (undefined for IFC).
 * @property {Array<MeshLambertMaterial>} materials one per distinct
 *   PlacedGeometry color (RGBA). Caller assigns this to
 *   `mesh.material` (array form) — three.js's renderer pairs each
 *   `geometry.groups[i].materialIndex` with `materials[i]`.
 * @property {number} placedGeometryCount PlacedGeometries assembled
 * @property {number} skippedFlatMeshes FlatMeshes skipped (missing
 *   expressID or no geometries)
 * @property {number} skippedPlacedGeometries PlacedGeometries skipped
 *   (GetGeometry returned null, or empty geometry)
 */


/** Fallback colour used when a PlacedGeometry has no `.color` field. */
const DEFAULT_COLOR = {x: 0.8, y: 0.8, z: 0.8, w: 1}


/**
 * Stringify an RGBA colour for use as a Map key. Matches what
 * `web-ifc-three.IFCParser#storeGeometryByMaterial` does
 * (IFCLoader.js:250) — float concatenation, no quantisation. Works
 * because Conway's per-PlacedGeometry colours come from the IFC
 * source via deterministic float math: equal IFC colours produce
 * bit-equal floats, so direct concat is a stable equality test.
 *
 * @param {{x: number, y: number, z: number, w: number}} color
 * @return {string}
 */
function colorKey(color) {
  return `${color.x}|${color.y}|${color.z}|${color.w}`
}


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
  // Pass 1: collect entries with sizes + colour. No reading of vertex/
  // index data yet (that's pass 2). We need the totals to size typed
  // arrays exactly, and the colour to bin entries before emission.
  const entries = []
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
      entries.push({
        parentExpressId,
        placed,
        geom,
        vertCount,
        indexCount: indexSize,
        triangleCount,
        color: placed.color ?? DEFAULT_COLOR,
      })
    }
  }
  const placedGeometryCount = entries.length
  // Bin entries by colour. Insertion order on the Map determines
  // material indices — first-seen colour becomes material 0, etc.
  // We emit triangles in this bin order so each colour's triangle
  // range is contiguous in the index buffer (required for the
  // `geometry.groups[]` + `materials[]` pairing three.js's renderer
  // uses for multi-material meshes).
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
  // Walk bins in insertion order, computing per-bin totals and
  // assigning each entry its vertOffset in the merged vertex buffer.
  // Vertex order follows the bin walk too (so an entry's vertex slab
  // is at [vertOffset, vertOffset + vertCount) in `positions` etc.).
  let totalVerts = 0
  let totalIndices = 0
  for (const bin of bins.values()) {
    for (const entry of bin.entries) {
      entry.vertOffset = totalVerts
      totalVerts += entry.vertCount
      totalIndices += entry.indexCount
    }
  }
  // Allocate merged sinks at exact size.
  const positions = new Float32Array(totalVerts * 3)
  const normals = new Float32Array(totalVerts * 3)
  const expressIDs = new Uint32Array(totalVerts)
  const instanceIDs = new Uint32Array(totalVerts)
  // Conway always emits u32 indices.
  const indices = new Uint32Array(totalIndices)
  const ranges = []
  const groups = []
  const materials = []
  const mat4 = new Matrix4()
  const normalMat = new Matrix3()
  let vCursor = 0 // write cursor into positions/normals (vertex count)
  let iCursor = 0 // write cursor into indices
  let p = 0 // synthetic instance id; increments per entry in emission order
  // Pass 2: emit in bin order. For each bin, record a group spanning
  // the bin's contiguous index range and construct one material.
  let materialIndex = 0
  for (const bin of bins.values()) {
    const groupStart = iCursor
    // Material for this bin. Match `web-ifc-three`'s shape:
    //   MeshLambertMaterial({color, side: DoubleSide})
    //   + transparent / opacity when alpha < 1.
    // IFCLoader.js:256-262.
    const col = new Color(bin.color.x, bin.color.y, bin.color.z)
    const material = new MeshLambertMaterial({color: col, side: DoubleSide})
    if (bin.color.w !== 1) {
      material.transparent = true
      material.opacity = bin.color.w
    }
    materials.push(material)
    for (const entry of bin.entries) {
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
      // Carry the STEP occurrence path (NAUO express ids) off the
      // PlacedGeometry so `instanceMapFromOrderedPlacedRanges` can key a
      // reused part's occurrences apart. `undefined` for IFC, so the
      // downstream map leaves its occurrence tables null.
      ranges.push({parentExpressId, triangleCount, occurrencePath: placed.occurrencePath})
      p++
    }
    // Close the group spanning this colour bin's contiguous index range.
    const groupCount = iCursor - groupStart
    if (groupCount > 0) {
      groups.push({start: groupStart, count: groupCount, materialIndex})
    }
    materialIndex++
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(normals, 3))
  geometry.setAttribute('expressID', new BufferAttribute(expressIDs, 1))
  geometry.setAttribute('instanceID', new BufferAttribute(instanceIDs, 1))
  geometry.setIndex(new BufferAttribute(indices, 1))
  for (const g of groups) {
    geometry.addGroup(g.start, g.count, g.materialIndex)
  }
  return {
    geometry,
    ranges,
    materials,
    placedGeometryCount,
    skippedFlatMeshes,
    skippedPlacedGeometries,
  }
}
