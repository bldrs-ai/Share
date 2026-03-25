/**
 * Extract wall centerlines from floor plan element bounding boxes.
 *
 * Each wall bounding box rectangle is reduced to a single centerline
 * segment along its long axis. The short axis = wall thickness.
 */


/**
 * @typedef {object} Centerline
 * @property {[number,number]} p1 - start point [x, z]
 * @property {[number,number]} p2 - end point [x, z]
 * @property {number} thickness - wall thickness (short axis of bounding box)
 * @property {number} expressId - source wall expressID
 */


/**
 * Extract centerlines from wall elements.
 * Extends each centerline by `extension` meters at both ends
 * to bridge small gaps between walls that don't perfectly meet.
 *
 * @param {Array<{polygon: Array<[number,number]>, expressId: number, category: string}>} elements
 * @param {number} extension - meters to extend at each end (default 0.25)
 * @return {Array<Centerline>}
 */
export function extractCenterlines(elements, extension = 0.25) {
  const walls = elements.filter((e) => e.category === 'wall')
  const centerlines = []

  for (const wall of walls) {
    const cl = computeCenterline(wall.polygon)
    if (cl) {
      // Extend centerline at both ends to close gaps
      if (extension > 0) {
        const dx = cl.p2[0] - cl.p1[0]
        const dz = cl.p2[1] - cl.p1[1]
        const len = Math.sqrt(dx * dx + dz * dz)
        if (len > 0.01) {
          const ux = dx / len * extension
          const uz = dz / len * extension
          cl.p1 = [cl.p1[0] - ux, cl.p1[1] - uz]
          cl.p2 = [cl.p2[0] + ux, cl.p2[1] + uz]
        }
      }
      centerlines.push({...cl, expressId: wall.expressId})
    }
  }

  return centerlines
}


/**
 * Compute the centerline of a rectangular polygon.
 * The centerline runs along the longest axis.
 *
 * @param {Array<[number,number]>} polygon - 4-point rectangle
 * @return {{p1: [number,number], p2: [number,number], thickness: number}|null}
 */
function computeCenterline(polygon) {
  if (!polygon || polygon.length < 4) return null

  // Find the two longest edges (these are the wall faces)
  const edges = []
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length
    const dx = polygon[j][0] - polygon[i][0]
    const dz = polygon[j][1] - polygon[i][1]
    const len = Math.sqrt(dx * dx + dz * dz)
    edges.push({i, j, len, dx, dz})
  }

  edges.sort((a, b) => b.len - a.len)

  if (edges.length < 2) return null

  // The two longest edges are the wall faces
  const e1 = edges[0]
  const e2 = edges[1]

  // Centerline = midpoints of the two short edges, OR
  // average of the two long edge midpoints
  const mid1 = [
    (polygon[e1.i][0] + polygon[e1.j][0]) / 2,
    (polygon[e1.i][1] + polygon[e1.j][1]) / 2,
  ]
  const mid2 = [
    (polygon[e2.i][0] + polygon[e2.j][0]) / 2,
    (polygon[e2.i][1] + polygon[e2.j][1]) / 2,
  ]

  // For a rectangle, the centerline connects the midpoints of the short edges.
  // But it's simpler: take the average of the two long edges' endpoints.
  const p1 = [
    (polygon[e1.i][0] + polygon[e2.j][0]) / 2,
    (polygon[e1.i][1] + polygon[e2.j][1]) / 2,
  ]
  const p2 = [
    (polygon[e1.j][0] + polygon[e2.i][0]) / 2,
    (polygon[e1.j][1] + polygon[e2.i][1]) / 2,
  ]

  // Thickness = shortest edge length
  const thickness = edges[edges.length - 1].len

  // Skip degenerate cases
  const clLen = Math.sqrt((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2)
  if (clLen < 0.01) return null

  return {p1, p2, thickness}
}
