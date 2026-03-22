/**
 * Room Detector — orchestrates the full pipeline:
 * wall elements → centerlines → planar graph → face detection → rooms
 */

import {extractCenterlines} from './WallCenterlines'
import {buildPlanarGraph} from './PlanarGraph'
import {detectRooms} from './FaceDetection'


/**
 * Detect rooms from floor plan wall elements.
 *
 * @param {Array<{polygon: Array<[number,number]>, expressId: number, category: string}>} elements
 * @return {Array<DetectedRoom>}
 */
export function detectRoomsFromElements(elements) {
  // Strategy 1: Use floor finish slabs (dekvloer) as rooms if available
  // These are per-room floor finishes that directly define room boundaries
  const slabRooms = detectRoomsFromSlabs(elements)
  if (slabRooms.length >= 3) {
    console.log(`RoomDetect: Found ${slabRooms.length} rooms from floor slabs`)
    return slabRooms
  }

  // Strategy 2: Fall back to wall centerline graph algorithm
  // 1. Extract wall centerlines
  // Extension bridges gaps between walls that don't perfectly meet.
  // Use half the average wall thickness — just enough to close typical gaps
  // without over-extending into adjacent rooms.
  const wallElements = elements.filter((e) => e.category === 'wall')
  const avgWallThickness = estimateAvgThickness(wallElements)
  const extension = avgWallThickness * 0.5

  const centerlines = extractCenterlines(elements, extension)

  if (centerlines.length < 3) return []

  // Compute average wall thickness for inset
  const thicknesses = centerlines.map((cl) => cl.thickness).filter((t) => t > 0.05)
  const avgThickness = thicknesses.length > 0
    ? thicknesses.reduce((s, t) => s + t, 0) / thicknesses.length
    : 0.2

  // 2. Build planar graph with intersections and snapping
  const graph = buildPlanarGraph(centerlines)

  // 3. Find enclosed faces (rooms) from centerline graph
  const rooms = detectRooms(graph)

  // 4. Inset each room polygon inward by half wall thickness
  //    to get the actual room area (inner face of walls)
  const insetAmount = avgThickness / 2

  for (const room of rooms) {
    const inset = insetPolygon(room.polygon, insetAmount)
    if (inset && inset.length >= 3) {
      room.polygon = inset
      room.area = polygonArea(inset)
      room.centroid = polygonCentroid(inset)
    }
  }

  console.log(`RoomDetect: ${centerlines.length} walls → ${rooms.length} rooms (inset ${(insetAmount * 100).toFixed(0)}cm from centerline)`)

  return rooms
}


/**
 * Inset (shrink) a polygon inward by a given distance.
 *
 * For each edge, compute the inward-shifted line, then find
 * intersection of adjacent shifted lines to get new vertices.
 *
 * @param {Array<[number,number]>} polygon - CCW or CW vertices
 * @param {number} distance - inset distance in meters
 * @return {Array<[number,number]>|null} - inset polygon, or null if collapsed
 */
function insetPolygon(polygon, distance) {
  const n = polygon.length
  if (n < 3 || distance <= 0) return polygon

  // Determine winding direction (CW or CCW)
  let signedArea = 0
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    signedArea += polygon[i][0] * polygon[j][1] - polygon[j][0] * polygon[i][1]
  }
  // If CW (signedArea < 0), inward = left of edge direction
  // If CCW (signedArea > 0), inward = right of edge direction
  const sign = signedArea > 0 ? 1 : -1

  // For each edge, compute the inward-offset line
  const offsetLines = []
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const dx = polygon[j][0] - polygon[i][0]
    const dz = polygon[j][1] - polygon[i][1]
    const len = Math.sqrt(dx * dx + dz * dz)
    if (len < 1e-9) continue

    // Inward normal (perpendicular, pointing inward)
    const nx = -dz / len * sign * distance
    const nz = dx / len * sign * distance

    // Offset the edge endpoints
    offsetLines.push({
      p1: [polygon[i][0] + nx, polygon[i][1] + nz],
      p2: [polygon[j][0] + nx, polygon[j][1] + nz],
    })
  }

  if (offsetLines.length < 3) return null

  // Find intersection of adjacent offset lines → new vertices
  const result = []
  for (let i = 0; i < offsetLines.length; i++) {
    const j = (i + 1) % offsetLines.length
    const inter = lineIntersection(
      offsetLines[i].p1, offsetLines[i].p2,
      offsetLines[j].p1, offsetLines[j].p2,
    )
    if (inter) {
      result.push(inter)
    } else {
      // Parallel lines — use midpoint of the gap
      result.push(offsetLines[j].p1)
    }
  }

  // Check the inset polygon hasn't collapsed (negative area = self-intersecting)
  const insetArea = polygonArea(result)
  if (insetArea < 0.1) return null

  return result
}


/**
 * Intersect two infinite lines (each defined by two points).
 */
function lineIntersection(p1, p2, p3, p4) {
  const d1x = p2[0] - p1[0]
  const d1z = p2[1] - p1[1]
  const d2x = p4[0] - p3[0]
  const d2z = p4[1] - p3[1]

  const denom = d1x * d2z - d1z * d2x
  if (Math.abs(denom) < 1e-9) return null // parallel

  const t = ((p3[0] - p1[0]) * d2z - (p3[1] - p1[1]) * d2x) / denom
  return [p1[0] + t * d1x, p1[1] + t * d1z]
}


function estimateAvgThickness(wallElements) {
  const thicknesses = wallElements.map((w) => {
    const xs = w.polygon.map((p) => p[0])
    const zs = w.polygon.map((p) => p[1])
    return Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs))
  }).filter((t) => t > 0.01)

  if (thicknesses.length === 0) return 0.1
  return thicknesses.reduce((s, t) => s + t, 0) / thicknesses.length
}


function polygonArea(polygon) {
  let area = 0
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length
    area += polygon[i][0] * polygon[j][1] - polygon[j][0] * polygon[i][1]
  }
  return Math.abs(area) / 2
}


function polygonCentroid(polygon) {
  let cx = 0, cz = 0
  for (const [x, z] of polygon) { cx += x; cz += z }
  return [cx / polygon.length, cz / polygon.length]
}


/**
 * Detect rooms from floor slab elements.
 *
 * Many IFC files have per-room floor slabs (dekvloer, screed, finish floor)
 * that directly define room boundaries. These are more reliable than
 * wall-based detection.
 *
 * We use slabs that:
 * - Are NOT the largest slab (that's the structural floor spanning the whole storey)
 * - Have area between 1m² and 100m² (typical room size)
 * - Have minimum width > 0.5m
 *
 * @param {Array} elements
 * @return {Array<DetectedRoom>}
 */
function detectRoomsFromSlabs(elements) {
  const slabs = elements.filter((e) => e.category === 'slab')
  if (slabs.length < 2) return []

  // Compute area and dimensions for each slab
  const slabData = slabs.map((slab) => {
    const xs = slab.polygon.map((p) => p[0])
    const zs = slab.polygon.map((p) => p[1])
    const w = Math.max(...xs) - Math.min(...xs)
    const h = Math.max(...zs) - Math.min(...zs)
    const area = w * h
    const minDim = Math.min(w, h)
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2
    return {slab, area, w, h, minDim, cx, cz}
  })

  // Find the largest slab (structural floor) to exclude it
  const maxArea = Math.max(...slabData.map((s) => s.area))

  // Filter to room-sized slabs
  const roomSlabs = slabData.filter((s) =>
    s.area < maxArea * 0.8 && // not the main structural slab
    s.area >= 1.0 && // at least 1m²
    s.area <= 100 && // not unreasonably large
    s.minDim >= 0.5, // not a thin strip
  )

  if (roomSlabs.length === 0) return []

  // Remove overlapping/duplicate slabs (keep the smaller one — more specific)
  const deduped = []
  for (const rs of roomSlabs) {
    const isDuplicate = deduped.some((existing) => {
      // Check if centers are very close (same room, different slab layers)
      const dx = Math.abs(rs.cx - existing.cx)
      const dz = Math.abs(rs.cz - existing.cz)
      return dx < 0.5 && dz < 0.5
    })
    if (!isDuplicate) {
      deduped.push(rs)
    }
  }

  // Convert to rooms
  const rooms = deduped.map((s, i) => ({
    id: i,
    polygon: s.slab.polygon,
    area: s.area,
    centroid: [s.cx, s.cz],
    name: `Room ${i + 1}`,
  }))

  // Sort by area descending
  rooms.sort((a, b) => b.area - a.area)

  // Re-number after sorting
  rooms.forEach((r, i) => { r.name = `Room ${i + 1}` })

  return rooms
}


/**
 * Generate distinct colors for room display.
 *
 * @param {number} count
 * @return {Array<string>} hex colors
 */
export function generateRoomColors(count) {
  const palette = [
    '#4fc3f7', '#81c784', '#ffb74d', '#ce93d8',
    '#f06292', '#4dd0e1', '#aed581', '#ff8a65',
    '#ba68c8', '#4db6ac', '#dce775', '#e57373',
    '#64b5f6', '#a1887f', '#90a4ae', '#fff176',
  ]

  const colors = []
  for (let i = 0; i < count; i++) {
    colors.push(palette[i % palette.length])
  }
  return colors
}
