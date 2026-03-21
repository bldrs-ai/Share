/**
 * Measurement tool for SVG floor plan.
 *
 * Handles point-to-point distance and area measurement,
 * with snapping to geometry endpoints.
 */

const SNAP_THRESHOLD = 0.3 // meters — snap within 30cm


/**
 * @typedef {object} Measurement
 * @property {string} id
 * @property {'distance'|'area'} type
 * @property {[number,number]} from
 * @property {[number,number]} to
 * @property {number} distance
 */

/**
 * @typedef {object} AreaMeasurement
 * @property {string} id
 * @property {'area'} type
 * @property {Array<[number,number]>} points
 * @property {number} area
 */


/**
 * Find the nearest snap point from all element vertices.
 *
 * @param {number} x
 * @param {number} z
 * @param {Array<FloorPlanElement>} elements
 * @return {{x: number, z: number, snapped: boolean}}
 */
export function findSnapPoint(x, z, elements) {
  let bestDist = SNAP_THRESHOLD
  let bestX = x
  let bestZ = z
  let snapped = false

  for (const el of elements) {
    for (const [px, pz] of el.polygon) {
      const dist = Math.sqrt((x - px) ** 2 + (z - pz) ** 2)
      if (dist < bestDist) {
        bestDist = dist
        bestX = px
        bestZ = pz
        snapped = true
      }
    }

    // Also check midpoints of edges
    const poly = el.polygon
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length
      const mx = (poly[i][0] + poly[j][0]) / 2
      const mz = (poly[i][1] + poly[j][1]) / 2
      const dist = Math.sqrt((x - mx) ** 2 + (z - mz) ** 2)
      if (dist < bestDist) {
        bestDist = dist
        bestX = mx
        bestZ = mz
        snapped = true
      }
    }
  }

  return {x: bestX, z: bestZ, snapped}
}


/**
 * Create a distance measurement between two points.
 *
 * @param {[number,number]} from
 * @param {[number,number]} to
 * @return {Measurement}
 */
export function createDistanceMeasurement(from, to) {
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  const distance = Math.sqrt(dx * dx + dz * dz)

  return {
    id: `m-${Date.now()}`,
    type: 'distance',
    from,
    to,
    distance,
  }
}


/**
 * Create an area measurement from a closed polygon.
 *
 * @param {Array<[number,number]>} points
 * @return {AreaMeasurement}
 */
export function createAreaMeasurement(points) {
  // Shoelace formula
  let area = 0
  const n = points.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += points[i][0] * points[j][1]
    area -= points[j][0] * points[i][1]
  }
  area = Math.abs(area) / 2

  return {
    id: `a-${Date.now()}`,
    type: 'area',
    points,
    area,
  }
}


/**
 * Convert SVG mouse event coordinates to floor plan world coordinates.
 *
 * @param {MouseEvent} event
 * @param {SVGSVGElement} svgEl
 * @return {[number, number]}
 */
export function svgEventToWorldCoords(event, svgEl) {
  const pt = svgEl.createSVGPoint()
  pt.x = event.clientX
  pt.y = event.clientY
  const ctm = svgEl.getScreenCTM()
  if (!ctm) return [0, 0]
  const svgPt = pt.matrixTransform(ctm.inverse())
  return [svgPt.x, svgPt.y]
}
