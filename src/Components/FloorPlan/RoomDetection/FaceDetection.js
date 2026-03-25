/**
 * Find all enclosed faces (rooms) in a planar graph via half-edge traversal.
 *
 * Correct algorithm (matches CGAL Arrangement, Boost planar_face_traversal,
 * NetworkX PlanarEmbedding.traverse_face):
 *
 * For each directed half-edge u→v:
 *   1. At node v, find the edge back to u in v's CCW-sorted neighbor list
 *   2. Take the PREVIOUS entry (next CW neighbor) — this is the next half-edge
 *   3. Follow until returning to the starting half-edge
 *   4. The traced boundary = one face of the planar subdivision
 *
 * Every directed half-edge belongs to exactly one face.
 * The unbounded (exterior) face is the one with the largest area.
 */

const MIN_ROOM_AREA = 1.0 // m²
const MIN_ROOM_WIDTH = 0.8 // m


/**
 * @typedef {object} DetectedRoom
 * @property {number} id
 * @property {Array<[number,number]>} polygon
 * @property {number} area
 * @property {[number,number]} centroid
 * @property {string} name
 */


/**
 * Detect all enclosed rooms from a planar graph.
 *
 * @param {{nodes: Map<number, GraphNode>, edges: Array}} graph
 * @return {Array<DetectedRoom>}
 */
export function detectRooms(graph) {
  const {nodes, edges} = graph

  if (nodes.size === 0 || edges.length === 0) return []

  // Track which directed half-edges have been used
  const usedHalfEdges = new Set() // "fromId->toId"

  const faces = []

  // For each edge, trace the face on BOTH sides (two directed half-edges)
  for (const edge of edges) {
    for (const [fromId, toId] of [[edge.from, edge.to], [edge.to, edge.from]]) {
      const key = `${fromId}->${toId}`
      if (usedHalfEdges.has(key)) continue

      const face = traceFace(nodes, fromId, toId, usedHalfEdges)
      if (face && face.length >= 3) {
        faces.push(face)
      }
    }
  }

  // Convert faces to polygons, calculate areas, filter
  const rooms = []
  let maxArea = 0
  let maxIdx = -1

  for (let i = 0; i < faces.length; i++) {
    const polygon = faces[i].map((nodeId) => {
      const node = nodes.get(nodeId)
      return [node.x, node.z]
    })
    const area = polygonArea(polygon)

    if (area > maxArea) {
      maxArea = area
      maxIdx = i
    }

    if (area >= MIN_ROOM_AREA) {
      const minWidth = polygonMinWidth(polygon)
      if (minWidth >= MIN_ROOM_WIDTH) {
        const centroid = polygonCentroid(polygon)
        rooms.push({id: i, polygon, area, centroid, name: null})
      }
    }
  }

  // Remove the largest face (the exterior)
  const result = rooms.filter((r) => r.id !== maxIdx)

  // Assign room names, sort by area descending
  result.sort((a, b) => b.area - a.area)
  result.forEach((room, i) => {
    room.name = `Room ${i + 1}`
  })

  return result
}


/**
 * Trace a face boundary using the correct half-edge traversal rule.
 *
 * At each node, we turn to the "next CW" neighbor — which is the
 * PREVIOUS entry in the CCW-sorted adjacency list from the incoming direction.
 *
 * @param {Map<number, GraphNode>} nodes
 * @param {number} startFrom - start of the first half-edge
 * @param {number} startTo - end of the first half-edge
 * @param {Set<string>} usedHalfEdges
 * @return {Array<number>|null}
 */
function traceFace(nodes, startFrom, startTo, usedHalfEdges) {
  const boundary = []
  let prevId = startFrom
  let currId = startTo
  const maxSteps = nodes.size * 2 // safety limit

  for (let step = 0; step < maxSteps; step++) {
    const key = `${prevId}->${currId}`
    if (usedHalfEdges.has(key)) {
      // Already traced — check if we've completed our cycle
      if (step > 0 && currId === startFrom && prevId !== startFrom) {
        break
      }
      return null
    }
    usedHalfEdges.add(key)
    boundary.push(prevId)

    // Find the next half-edge using the "previous in CCW-sorted list" rule
    const nextNodeId = findNextCW(nodes, prevId, currId)
    if (nextNodeId === null) return null

    prevId = currId
    currId = nextNodeId

    // Check if we've completed the cycle
    if (currId === startFrom && prevId === startTo) {
      boundary.push(prevId)
      // Mark the closing half-edge
      usedHalfEdges.add(`${prevId}->${currId}`)
      break
    }
    if (currId === startFrom) {
      boundary.push(prevId)
      usedHalfEdges.add(`${prevId}->${currId}`)
      break
    }
  }

  return boundary.length >= 3 ? boundary : null
}


/**
 * Find the next node in CW order (the "previous" in CCW-sorted neighbors).
 *
 * At node `curr`, arriving from `prev`:
 * 1. Find the edge to `prev` in curr's CCW-sorted edge list
 * 2. Take the PREVIOUS entry (wrapping around)
 * 3. Return that neighbor's ID
 *
 * This traces the LEFT face of the half-edge prev→curr.
 *
 * @param {Map} nodes
 * @param {number} prevId
 * @param {number} currId
 * @return {number|null}
 */
function findNextCW(nodes, prevId, currId) {
  const currNode = nodes.get(currId)
  if (!currNode || currNode.edges.length === 0) return null

  // Only one neighbor — can only go back (dead end)
  if (currNode.edges.length === 1) return null

  // Find the index of the edge pointing back to prevId
  const backIdx = currNode.edges.findIndex((e) => e.targetId === prevId)
  if (backIdx === -1) return null

  // Take the PREVIOUS entry in the CCW-sorted list (wrapping around)
  // This gives us the next CW turn — which traces the left face
  const prevIdx = (backIdx - 1 + currNode.edges.length) % currNode.edges.length
  return currNode.edges[prevIdx].targetId
}


/**
 * Compute signed polygon area using shoelace formula.
 */
function polygonArea(polygon) {
  let area = 0
  const n = polygon.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += polygon[i][0] * polygon[j][1]
    area -= polygon[j][0] * polygon[i][1]
  }
  return Math.abs(area) / 2
}


/**
 * Compute polygon centroid.
 */
function polygonCentroid(polygon) {
  let cx = 0, cz = 0
  for (const [x, z] of polygon) {
    cx += x
    cz += z
  }
  return [cx / polygon.length, cz / polygon.length]
}


/**
 * Compute minimum bounding box dimension of a polygon.
 * Filters out thin slivers (wall cavities).
 */
function polygonMinWidth(polygon) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const [x, z] of polygon) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  return Math.min(maxX - minX, maxZ - minZ)
}
