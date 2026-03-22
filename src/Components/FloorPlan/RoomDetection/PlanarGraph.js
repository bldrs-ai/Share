/**
 * Build a planar graph from line segments.
 *
 * Handles three connection types:
 * 1. Endpoint snapping — nearby endpoints merged (tolerance 25cm)
 * 2. Segment crossing — two segments intersect, both split
 * 3. T-junctions — endpoint near middle of another segment, segment split
 */

const SNAP_TOLERANCE = 0.25 // 25cm — handles wall thickness offsets
const T_JUNCTION_TOLERANCE = 0.25 // endpoint-to-segment proximity
const EPSILON = 1e-9


/**
 * Build a planar graph from centerline segments.
 *
 * @param {Array<{p1: [number,number], p2: [number,number]}>} segments
 * @return {{nodes: Map<number, GraphNode>, edges: Array<{id: number, from: number, to: number}>}}
 */
export function buildPlanarGraph(segments) {
  // Collect all points and edges
  let points = []
  let edges = []

  for (const seg of segments) {
    const i1 = points.length
    points.push([...seg.p1])
    const i2 = points.length
    points.push([...seg.p2])
    edges.push([i1, i2])
  }

  // 1. Find segment-segment crossings and split
  edges = findAndSplitCrossings(points, edges)

  // 2. Find T-junctions: endpoint near middle of another segment
  edges = findAndSplitTJunctions(points, edges)

  // 3. Snap nearby endpoints
  const {points: snapped, mapping} = snapPoints(points, SNAP_TOLERANCE)

  // 4. Remap edges to snapped points, deduplicate
  const seen = new Set()
  const finalEdges = []
  let edgeId = 0

  for (const [a, b] of edges) {
    const sa = mapping[a]
    const sb = mapping[b]
    if (sa === sb) continue

    const key = sa < sb ? `${sa}-${sb}` : `${sb}-${sa}`
    if (seen.has(key)) continue
    seen.add(key)

    finalEdges.push({id: edgeId++, from: sa, to: sb})
  }

  // 5. Build adjacency with angular sorting
  const nodes = new Map()
  for (let i = 0; i < snapped.length; i++) {
    nodes.set(i, {id: i, x: snapped[i][0], z: snapped[i][1], edges: []})
  }

  for (const edge of finalEdges) {
    const fn = nodes.get(edge.from)
    const tn = nodes.get(edge.to)
    if (!fn || !tn) continue

    fn.edges.push({
      targetId: edge.to,
      angle: Math.atan2(tn.z - fn.z, tn.x - fn.x),
      edgeId: edge.id,
    })
    tn.edges.push({
      targetId: edge.from,
      angle: Math.atan2(fn.z - tn.z, fn.x - tn.x),
      edgeId: edge.id,
    })
  }

  for (const node of nodes.values()) {
    node.edges.sort((a, b) => a.angle - b.angle)
  }

  return {nodes, edges: finalEdges}
}


/**
 * Find segment-segment crossings and split both segments at intersection.
 */
function findAndSplitCrossings(points, edges) {
  const newEdges = []
  const splitMap = new Map() // edgeIndex → array of split point indices

  // Initialize: each original edge starts unsplit
  for (let i = 0; i < edges.length; i++) {
    splitMap.set(i, [])
  }

  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const p1 = points[edges[i][0]]
      const p2 = points[edges[i][1]]
      const p3 = points[edges[j][0]]
      const p4 = points[edges[j][1]]

      const inter = segmentIntersection(p1, p2, p3, p4)
      if (inter) {
        const pi = points.length
        points.push(inter)
        splitMap.get(i).push(pi)
        splitMap.get(j).push(pi)
      }
    }
  }

  // Rebuild edges: split each edge at its intersection points
  for (let i = 0; i < edges.length; i++) {
    const splits = splitMap.get(i)
    if (splits.length === 0) {
      newEdges.push(edges[i])
    } else {
      // Sort split points along the edge
      const [a, b] = edges[i]
      const pa = points[a]
      const allPts = [a, ...splits, b]
      allPts.sort((x, y) => {
        const dx = points[x][0] - pa[0]
        const dy = points[x][1] - pa[1]
        const ex = points[y][0] - pa[0]
        const ey = points[y][1] - pa[1]
        return (dx * dx + dy * dy) - (ex * ex + ey * ey)
      })
      for (let k = 0; k < allPts.length - 1; k++) {
        newEdges.push([allPts[k], allPts[k + 1]])
      }
    }
  }

  return newEdges
}


/**
 * Find T-junctions: endpoints that are near the middle of another segment.
 * Split the segment and connect.
 */
function findAndSplitTJunctions(points, edges) {
  const newEdges = [...edges]
  const tolSq = T_JUNCTION_TOLERANCE * T_JUNCTION_TOLERANCE

  // For each endpoint, check if it's near any segment (not its own)
  const endpointSet = new Set()
  for (const [a, b] of edges) {
    endpointSet.add(a)
    endpointSet.add(b)
  }

  const toSplit = [] // [{edgeIdx, pointIdx}]

  for (const ptIdx of endpointSet) {
    const pt = points[ptIdx]

    for (let ei = 0; ei < newEdges.length; ei++) {
      const [a, b] = newEdges[ei]
      if (a === ptIdx || b === ptIdx) continue // skip own edges

      const pa = points[a]
      const pb = points[b]

      // Find closest point on segment to pt
      const closest = closestPointOnSegment(pa, pb, pt)
      const dx = pt[0] - closest[0]
      const dz = pt[1] - closest[1]
      const distSq = dx * dx + dz * dz

      if (distSq < tolSq) {
        // Check it's not near an endpoint (those are handled by snapping)
        const daSq = (pt[0] - pa[0]) ** 2 + (pt[1] - pa[1]) ** 2
        const dbSq = (pt[0] - pb[0]) ** 2 + (pt[1] - pb[1]) ** 2
        if (daSq > tolSq * 0.5 && dbSq > tolSq * 0.5) {
          // This is a T-junction: ptIdx is near the middle of edge ei
          // Use the original endpoint as the split point (not a projection)
          // so that snapping will merge them into the same node
          toSplit.push({edgeIdx: ei, projIdx: ptIdx, origPtIdx: ptIdx})
        }
      }
    }
  }

  // Apply splits (in reverse to keep indices stable)
  const edgeSplits = new Map()
  for (const {edgeIdx, projIdx} of toSplit) {
    if (!edgeSplits.has(edgeIdx)) edgeSplits.set(edgeIdx, [])
    edgeSplits.get(edgeIdx).push(projIdx)
  }

  const result = []
  for (let i = 0; i < newEdges.length; i++) {
    const splits = edgeSplits.get(i)
    if (!splits) {
      result.push(newEdges[i])
    } else {
      const [a, b] = newEdges[i]
      const pa = points[a]
      const allPts = [a, ...splits, b]
      allPts.sort((x, y) => {
        const dx = points[x][0] - pa[0]
        const dy = points[x][1] - pa[1]
        const ex = points[y][0] - pa[0]
        const ey = points[y][1] - pa[1]
        return (dx * dx + dy * dy) - (ex * ex + ey * ey)
      })
      for (let k = 0; k < allPts.length - 1; k++) {
        result.push([allPts[k], allPts[k + 1]])
      }
    }
  }

  return result
}


/**
 * Compute intersection point of two line segments.
 */
export function segmentIntersection(p1, p2, p3, p4) {
  const d1x = p2[0] - p1[0]
  const d1z = p2[1] - p1[1]
  const d2x = p4[0] - p3[0]
  const d2z = p4[1] - p3[1]

  const denom = d1x * d2z - d1z * d2x
  if (Math.abs(denom) < EPSILON) return null

  const t = ((p3[0] - p1[0]) * d2z - (p3[1] - p1[1]) * d2x) / denom
  const u = ((p3[0] - p1[0]) * d1z - (p3[1] - p1[1]) * d1x) / denom

  const tol = 0.01
  if (t < tol || t > 1 - tol || u < tol || u > 1 - tol) return null

  return [p1[0] + t * d1x, p1[1] + t * d1z]
}


/**
 * Closest point on segment AB to point P.
 */
function closestPointOnSegment(a, b, p) {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const lenSq = dx * dx + dz * dz
  if (lenSq < EPSILON) return [...a]

  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / lenSq
  t = Math.max(0, Math.min(1, t))
  return [a[0] + t * dx, a[1] + t * dz]
}


/**
 * Snap nearby points together.
 */
function snapPoints(points, tolerance) {
  const snapped = []
  const mapping = new Array(points.length)
  const tolSq = tolerance * tolerance

  for (let i = 0; i < points.length; i++) {
    let merged = false
    for (let j = 0; j < snapped.length; j++) {
      const dx = points[i][0] - snapped[j][0]
      const dz = points[i][1] - snapped[j][1]
      if (dx * dx + dz * dz < tolSq) {
        mapping[i] = j
        merged = true
        break
      }
    }
    if (!merged) {
      mapping[i] = snapped.length
      snapped.push([...points[i]])
    }
  }

  return {points: snapped, mapping}
}
