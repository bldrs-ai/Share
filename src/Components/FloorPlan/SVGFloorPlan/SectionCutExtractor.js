/**
 * Section Cut Geometry Extractor
 *
 * Cuts a horizontal plane through the Three.js mesh at a given height
 * to produce exact 2D floor plan outlines.
 *
 * Uses three-mesh-bvh for accelerated plane-triangle intersection.
 * Each triangle edge is tested against the cutting plane; where two
 * edges intersect, a line segment is produced. These segments are the
 * exact cross-section of the building at that height.
 *
 * The result is per-element (using expressID attribute) so walls,
 * columns, slabs can be styled differently.
 */

import {MeshBVH} from 'three-mesh-bvh'
import {Plane, Vector3, Line3, Matrix4, Box3} from 'three'


/**
 * @typedef {object} SectionSegment
 * @property {[number,number]} start - [x, z] in world coordinates
 * @property {[number,number]} end - [x, z] in world coordinates
 * @property {number|null} expressId - IFC element express ID
 */

/**
 * @typedef {object} FloorPlanElement
 * @property {number} expressId
 * @property {string} type
 * @property {string|null} name
 * @property {Array<[number,number]>} polygon - 2D outline points [x, z]
 * @property {string} category - 'wall' | 'column' | 'slab' | 'other'
 */


/**
 * Extract 2D floor plan geometry by section-cutting the mesh
 * at a horizontal plane.
 *
 * @param {THREE.Mesh} model - The IFC model mesh
 * @param {number} cutHeight - Y coordinate to cut at (meters)
 * @return {Array<SectionSegment>} Line segments in plan view
 */
export function extractSectionCut(model, cutHeight) {
  if (!model || !model.geometry) return []

  const geometry = model.geometry
  if (!geometry.attributes.position) return []

  // Build BVH if not already cached
  if (!geometry.boundsTree) {
    try {
      geometry.boundsTree = new MeshBVH(geometry)
    } catch (e) {
      console.warn('SectionCut: Failed to build BVH', e)
      return []
    }
  }

  // Define horizontal cutting plane at cutHeight
  // Plane normal (0,1,0) pointing up, plane at y = cutHeight
  const worldPlane = new Plane(new Vector3(0, 1, 0), -cutHeight)

  // Transform plane to mesh local space
  const localPlane = worldPlane.clone()
  const inverseMat = new Matrix4().copy(model.matrixWorld).invert()
  localPlane.applyMatrix4(inverseMat)

  // Get expressID attribute (if available)
  const eidAttr = geometry.attributes.expressID || null
  const indexAttr = geometry.index

  // Collect intersection segments
  const segments = []
  const tempLine = new Line3()
  const tempVec = new Vector3()

  geometry.boundsTree.shapecast({
    intersectsBounds: (box) => {
      return localPlane.intersectsBox(box)
    },

    intersectsTriangle: (tri, triIndex) => {
      const pts = []

      // Test each edge of the triangle
      const edges = [[tri.a, tri.b], [tri.b, tri.c], [tri.c, tri.a]]
      for (const [a, b] of edges) {
        tempLine.start.copy(a)
        tempLine.end.copy(b)
        const intersection = localPlane.intersectLine(tempLine, tempVec)
        if (intersection) {
          pts.push(intersection.clone().applyMatrix4(model.matrixWorld))
        }
      }

      // Handle degenerate case: plane passes through vertex → 3 hits
      if (pts.length === 3) {
        // Remove the duplicate (two of the three will be nearly identical)
        const d01 = pts[0].distanceTo(pts[1])
        const d12 = pts[1].distanceTo(pts[2])
        const d02 = pts[0].distanceTo(pts[2])
        if (d01 < 1e-6) pts.splice(0, 1)
        else if (d12 < 1e-6) pts.splice(2, 1)
        else if (d02 < 1e-6) pts.splice(2, 1)
        else pts.pop() // fallback: drop last
      }

      if (pts.length === 2) {
        // Get expressID for this triangle
        let expressId = null
        if (eidAttr) {
          const vertexIndex = indexAttr
            ? indexAttr.getX(triIndex * 3)
            : triIndex * 3
          expressId = eidAttr.getX(vertexIndex)
        }

        segments.push({
          start: [pts[0].x, pts[0].z],
          end: [pts[1].x, pts[1].z],
          expressId,
        })
      }
    },
  })

  // Log stats
  const uniqueElements = new Set(segments.map((s) => s.expressId).filter((id) => id !== null))
  console.log(`SectionCut: ${segments.length} segments from ${uniqueElements.size} elements at Y=${cutHeight.toFixed(2)}`)

  // Debug: show Y range of model
  const posAttr = geometry.attributes.position
  let yMin = Infinity, yMax = -Infinity
  for (let i = 0; i < posAttr.count; i++) {
    const y = posAttr.getY(i)
    if (y < yMin) yMin = y
    if (y > yMax) yMax = y
  }
  console.log(`SectionCut: model Y range: ${yMin.toFixed(2)} to ${yMax.toFixed(2)}`)

  return segments
}


/**
 * Convert raw section cut segments into FloorPlanElements
 * by grouping segments by expressID.
 *
 * Each element gets its IFC type looked up via the viewer,
 * and its segments are rendered as SVG paths (not polygons).
 *
 * @param {Array<SectionSegment>} segments
 * @param {object} viewer - Share viewer for property lookup (optional)
 * @return {Array<FloorPlanElement>}
 */
export async function segmentsToFloorPlanElements(segments, viewer) {
  if (segments.length === 0) return []

  // Group segments by expressID
  const byElement = new Map()

  for (const seg of segments) {
    const eid = seg.expressId ?? -1
    if (!byElement.has(eid)) {
      byElement.set(eid, [])
    }
    byElement.get(eid).push(seg)
  }

  const elements = []

  // Look up IFC types for each expressID
  for (const [expressId, segs] of byElement) {
    if (segs.length === 0) continue

    let type = 'Unknown'
    let name = null
    let category = 'wall'

    // Look up IFC properties if viewer available
    if (viewer && expressId > 0) {
      try {
        const props = await viewer.getProperties(0, expressId)
        if (props) {
          type = props.constructor?.name || props.type || 'Unknown'
          name = unwrapProp(props.Name) || unwrapProp(props.LongName) || null

          // Categorize by IFC type
          const upper = type.toUpperCase()
          if (upper.includes('WALL')) category = 'wall'
          else if (upper.includes('COLUMN')) category = 'column'
          else if (upper.includes('SLAB')) category = 'slab'
          else if (upper.includes('DOOR')) category = 'door'
          else if (upper.includes('WINDOW')) category = 'window'
          else if (upper.includes('STAIR')) category = 'stair'
          else if (upper.includes('BEAM')) category = 'beam'
          else if (upper.includes('COVERING')) category = 'covering'
          else if (upper.includes('CURTAINWALL')) category = 'wall'
          else category = 'other'
        }
      } catch (_) {
        // Property lookup failed — keep defaults
      }
    }

    // Try to chain segments into a polygon
    const polygon = chainSegmentsToPolygon(segs)

    elements.push({
      expressId,
      type,
      name,
      polygon: polygon && polygon.length >= 3 ? polygon : [],
      category,
      rawSegments: segs,
    })
  }

  // Log element type distribution
  const typeCounts = {}
  for (const el of elements) {
    typeCounts[el.category] = (typeCounts[el.category] || 0) + 1
  }
  console.log('SectionCut elements:', Object.entries(typeCounts).map(([k, v]) => `${k}:${v}`).join(', '))

  return elements
}


function unwrapProp(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'object' && 'value' in v) return v.value
  return typeof v === 'string' ? v : null
}


/**
 * Chain line segments into a closed polygon by matching endpoints.
 *
 * @param {Array<SectionSegment>} segments
 * @param {number} tolerance
 * @return {Array<[number,number]>|null}
 */
function chainSegmentsToPolygon(segments, tolerance = 0.01) {
  if (segments.length < 2) return null

  const tolSq = tolerance * tolerance
  const unused = new Set(segments.map((_, i) => i))
  const chains = []

  while (unused.size > 0) {
    const startIdx = unused.values().next().value
    unused.delete(startIdx)

    const chain = [segments[startIdx].start, segments[startIdx].end]
    let changed = true

    while (changed) {
      changed = false
      for (const idx of unused) {
        const seg = segments[idx]
        const last = chain[chain.length - 1]
        const first = chain[0]

        if (distSq2D(seg.start, last) < tolSq) {
          chain.push(seg.end)
          unused.delete(idx)
          changed = true
        } else if (distSq2D(seg.end, last) < tolSq) {
          chain.push(seg.start)
          unused.delete(idx)
          changed = true
        } else if (distSq2D(seg.start, first) < tolSq) {
          chain.unshift(seg.end)
          unused.delete(idx)
          changed = true
        } else if (distSq2D(seg.end, first) < tolSq) {
          chain.unshift(seg.start)
          unused.delete(idx)
          changed = true
        }
      }
    }

    if (chain.length >= 3) {
      chains.push(chain)
    }
  }

  // Return the longest chain as the polygon
  if (chains.length === 0) return null
  chains.sort((a, b) => b.length - a.length)
  return chains[0]
}


function distSq2D(a, b) {
  const dx = a[0] - b[0]
  const dz = a[1] - b[1]
  return dx * dx + dz * dz
}
