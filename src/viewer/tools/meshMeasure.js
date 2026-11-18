/* eslint-disable no-magic-numbers, no-mixed-operators */
// The cross-product, determinant and tetrahedron expressions below are the
// textbook formulas; parenthesising every product would hide them.
/**
 * Measuring triangle meshes for `model.measure` (assist-310, #1674): surface
 * area, signed-tetrahedron volume and the world box of a "piece" — one
 * placed run of triangles ({@link ./elementPieces}).
 *
 * A piece is `{position, index, indexStart, indexCount, matrix, shape}`:
 *  - `position` a BufferAttribute-like `{array, itemSize}` (read, never
 *    copied — a BatchedMesh's whole packed buffer is passed as is);
 *  - `index` the index array (absolute into `position`, as a BatchedMesh
 *    stores it) or null for a non-indexed mesh, which reads
 *    `indexCount` consecutive vertices from `indexStart`;
 *  - `matrix` the piece's local→world Matrix4 (instance matrix × mesh
 *    matrixWorld), applied to every vertex before an area or box is taken;
 *  - `shape` a cache key shared by every instance of one source geometry,
 *    or null.
 *
 * Why volume is done in LOCAL space and only scaled by the matrix: a
 * piece's signed volume under an affine map is `det(M3) × local volume`
 * exactly (a mirror flips the sign, a uniform scale `s` multiplies by
 * `s³`), so a shape that is instanced a thousand times is welded and
 * checked for closure once. Area has no such law for a non-uniform scale,
 * so it is summed per triangle in world space.
 *
 * Volume is only meaningful for a CLOSED mesh, so a piece is closed only
 * when, after welding coincident vertices, every directed edge occurs
 * exactly once and its reverse exactly once (a watertight, consistently
 * wound surface). Anything else (an open shell, an inconsistently wound or
 * non-manifold mesh) is reported as not closed and its volume is withheld,
 * never guessed: a wrong number looks exactly like a right one to a model.
 */

// Vertices closer than this fraction of the piece's bounding-box diagonal are
// one vertex. Triangulations emit a corner once per face, so closure needs a
// weld; relative to the diagonal because a batched shape's positions are in
// SOURCE units (the unit scale lives in the placement matrix,
// flatMeshToBatchedModel.js), so any fixed distance would be a micrometre in
// a metre model and a nanometre in a millimetre one.
const WELD_RELATIVE = 1e-6
// Triangles a loop runs before it offers the caller a chance to yield.
export const DEFAULT_CHUNK = 200_000
const NEIGHBOUR_CELLS = [-1, 0, 1]
const TRIANGLE = 3
const HALF = 0.5
const SIXTH = 1 / 6
// Edge keys pack two vertex ids into one safe-integer number.
const EDGE_STRIDE = 2 ** 26


/**
 * @param {object} piece
 * @return {number} how many triangles it has
 */
export function pieceTriangleCount(piece) {
  return Math.floor(piece.indexCount / TRIANGLE)
}


/**
 * @param {object} piece
 * @param {number} corner 0-based corner number across the piece's triangles
 * @return {number} the vertex index it reads
 */
function vertexAt(piece, corner) {
  return piece.index ? piece.index[piece.indexStart + corner] : piece.indexStart + corner
}


/**
 * Surface area and bounding box of one piece in world space.
 *
 * Async only so a large piece can yield: every `chunk` triangles it awaits
 * `pause()`, which is where the caller lets the page and a Stop through.
 *
 * @param {object} piece
 * @param {{wantBox: boolean, chunk: number, pause: ?Function}} opts
 * @return {Promise<{area: number, min: Array<number>, max: Array<number>}>}
 *   `min` and `max` are `[Infinity…]` / `[-Infinity…]` for a piece with no
 *   triangles
 */
export async function measureWorld(piece, {wantBox = false, chunk = DEFAULT_CHUNK, pause = null} = {}) {
  const {array, itemSize} = piece.position
  const e = piece.matrix.elements
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  const p = new Float64Array(TRIANGLE * TRIANGLE)
  let area = 0
  const triangles = pieceTriangleCount(piece)
  for (let t = 0; t < triangles; t++) {
    if (pause && t > 0 && t % chunk === 0) {
      await pause()
    }
    for (let c = 0; c < TRIANGLE; c++) {
      const base = vertexAt(piece, t * TRIANGLE + c) * itemSize
      const x = array[base]
      const y = array[base + 1]
      const z = array[base + 2]
      const o = c * TRIANGLE
      p[o] = e[0] * x + e[4] * y + e[8] * z + e[12]
      p[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]
      p[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]
      if (wantBox) {
        for (let k = 0; k < TRIANGLE; k++) {
          min[k] = Math.min(min[k], p[o + k])
          max[k] = Math.max(max[k], p[o + k])
        }
      }
    }
    const ux = p[3] - p[0]
    const uy = p[4] - p[1]
    const uz = p[5] - p[2]
    const vx = p[6] - p[0]
    const vy = p[7] - p[1]
    const vz = p[8] - p[2]
    const cx = uy * vz - uz * vy
    const cy = uz * vx - ux * vz
    const cz = ux * vy - uy * vx
    area += HALF * Math.sqrt(cx * cx + cy * cy + cz * cz)
  }
  return {area, min, max}
}


/**
 * @param {object} matrix a Matrix4
 * @return {number} the determinant of its upper-left 3x3: the factor a
 *   volume scales by under the map
 */
export function linearDeterminant(matrix) {
  const e = matrix.elements
  return e[0] * (e[5] * e[10] - e[9] * e[6]) -
    e[4] * (e[1] * e[10] - e[9] * e[2]) +
    e[8] * (e[1] * e[6] - e[5] * e[2])
}


/**
 * Closure and signed volume of a piece's source triangles, in the piece's
 * own (local) coordinates. Async for the same reason as {@link measureWorld}:
 * each of its loops (bounding box, weld and volume, edge pairing) awaits
 * `pause()` every `chunk` steps.
 *
 * Welding is O(n): a spatial hash with cells of the weld tolerance, each
 * new vertex checked against its own and the 26 neighbouring cells, so two
 * copies of a corner that straddle a cell boundary still merge (a plain
 * rounding grid would split them).
 *
 * @param {object} piece
 * @param {{chunk: number, pause: ?Function}} [opts]
 * @return {Promise<{closed: boolean, volume: number, reason: ?string}>}
 *   `volume` is the signed tetrahedron sum, meaningful only when `closed`
 */
export async function localSolid(piece, {chunk = DEFAULT_CHUNK, pause = null} = {}) {
  const {array, itemSize} = piece.position
  const triangles = pieceTriangleCount(piece)
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let corner = 0; corner < triangles * TRIANGLE; corner++) {
    // The chunk boundary is tested inline: awaiting on every step would cost a
    // promise and a microtask per corner, ~20M of them at the triangle cap.
    if (pause && corner > 0 && corner % chunk === 0) {
      await pause()
    }
    const base = vertexAt(piece, corner) * itemSize
    for (let k = 0; k < TRIANGLE; k++) {
      min[k] = Math.min(min[k], array[base + k])
      max[k] = Math.max(max[k], array[base + k])
    }
  }
  const diagonal = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2])
  if (!(diagonal > 0)) {
    return {closed: false, volume: 0, reason: 'no extent'}
  }
  const tolerance = WELD_RELATIVE * diagonal
  const buckets = new Map()
  const reps = []
  const byVertex = new Map()
  const cellHash = (ix, iy, iz) => (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)
  const welded = (vertex) => {
    const known = byVertex.get(vertex)
    if (known !== undefined) {
      return known
    }
    const base = vertex * itemSize
    const x = array[base]
    const y = array[base + 1]
    const z = array[base + 2]
    const ix = Math.floor((x - min[0]) / tolerance)
    const iy = Math.floor((y - min[1]) / tolerance)
    const iz = Math.floor((z - min[2]) / tolerance)
    for (const dx of NEIGHBOUR_CELLS) {
      for (const dy of NEIGHBOUR_CELLS) {
        for (const dz of NEIGHBOUR_CELLS) {
          // A hash collision only adds candidates: each is distance-checked.
          for (const id of buckets.get(cellHash(ix + dx, iy + dy, iz + dz)) ?? []) {
            const rep = reps[id]
            if (Math.abs(rep[0] - x) <= tolerance && Math.abs(rep[1] - y) <= tolerance &&
                Math.abs(rep[2] - z) <= tolerance) {
              byVertex.set(vertex, id)
              return id
            }
          }
        }
      }
    }
    const id = reps.length
    reps.push([x, y, z])
    const key = cellHash(ix, iy, iz)
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.push(id)
    } else {
      buckets.set(key, [id])
    }
    byVertex.set(vertex, id)
    return id
  }
  const edges = new Map()
  let volume = 0
  let degenerate = 0
  for (let t = 0; t < triangles; t++) {
    if (pause && t > 0 && t % chunk === 0) {
      await pause()
    }
    const va = vertexAt(piece, t * TRIANGLE)
    const vb = vertexAt(piece, t * TRIANGLE + 1)
    const vc = vertexAt(piece, t * TRIANGLE + 2)
    const a = welded(va)
    const b = welded(vb)
    const c = welded(vc)
    const ia = va * itemSize
    const ib = vb * itemSize
    const ic = vc * itemSize
    volume += SIXTH * (
      array[ia] * (array[ib + 1] * array[ic + 2] - array[ib + 2] * array[ic + 1]) -
      array[ia + 1] * (array[ib] * array[ic + 2] - array[ib + 2] * array[ic]) +
      array[ia + 2] * (array[ib] * array[ic + 1] - array[ib + 1] * array[ic]))
    if (a === b || b === c || a === c) {
      // A collapsed triangle has no area and bounds nothing; it must not
      // add edges that no neighbour pairs with.
      degenerate++
      continue
    }
    for (const [from, to] of [[a, b], [b, c], [c, a]]) {
      const key = from * EDGE_STRIDE + to
      edges.set(key, (edges.get(key) ?? 0) + 1)
    }
  }
  if (triangles - degenerate < TRIANGLE + 1) {
    return {closed: false, volume: 0, reason: 'fewer than four triangles'}
  }
  let checked = 0
  for (const [key, count] of edges) {
    if (pause && checked > 0 && checked % chunk === 0) {
      await pause()
    }
    checked++
    const from = Math.floor(key / EDGE_STRIDE)
    const to = key - from * EDGE_STRIDE
    if (count !== 1 || edges.get(to * EDGE_STRIDE + from) !== 1) {
      return {closed: false, volume: 0, reason: 'open, non-manifold or inconsistently wound surface'}
    }
  }
  return {closed: true, volume, reason: null}
}
