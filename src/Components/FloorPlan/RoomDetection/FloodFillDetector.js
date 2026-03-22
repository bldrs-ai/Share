/**
 * Room detection via rasterization + flood fill.
 *
 * Algorithm:
 * 1. Rasterize all wall footprints onto a 2D grid
 * 2. Flood fill from the grid boundary to mark "exterior"
 * 3. Everything not exterior and not wall = "interior"
 * 4. Label connected components of interior = rooms
 * 5. Vectorize room boundaries (marching squares → polygons)
 *
 * This is robust to imperfect geometry because:
 * - Walls are rasterized with a buffer (closes small gaps)
 * - Flood fill naturally handles any wall arrangement
 * - No computational geometry edge cases
 */

const DEFAULT_RESOLUTION = 0.05 // 5cm per pixel
const WALL_BUFFER = 0.08 // 8cm buffer around walls (closes gaps)
const MIN_ROOM_PIXELS = 100 // minimum pixels for a room (~0.25m² at 5cm resolution)

const EMPTY = 0
const WALL = 1
const EXTERIOR = 2
// Room labels start at 3


/**
 * Detect rooms using rasterization + flood fill.
 *
 * @param {Array<{polygon: Array<[number,number]>, category: string}>} elements
 * @param {number} resolution - meters per pixel
 * @return {Array<{id: number, polygon: Array<[number,number]>, area: number, centroid: [number,number], name: string}>}
 */
export function detectRoomsFloodFill(elements, resolution = DEFAULT_RESOLUTION) {
  const walls = elements.filter((e) => e.category === 'wall')
  if (walls.length < 3) return []

  // 1. Compute bounding box of all elements
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const el of elements) {
    for (const [x, z] of el.polygon) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (z < minZ) minZ = z
      if (z > maxZ) maxZ = z
    }
  }

  // Add padding for flood fill border
  const pad = 1.0 // 1m padding
  minX -= pad
  minZ -= pad
  maxX += pad
  maxZ += pad

  const gridW = Math.ceil((maxX - minX) / resolution)
  const gridH = Math.ceil((maxZ - minZ) / resolution)

  if (gridW * gridH > 10000000) {
    console.warn('FloodFill: grid too large', gridW, 'x', gridH)
    return []
  }

  // 2. Create grid and rasterize walls
  const grid = new Uint16Array(gridW * gridH) // 0 = empty

  for (const wall of walls) {
    rasterizePolygon(grid, gridW, gridH, wall.polygon, minX, minZ, resolution, WALL_BUFFER)
  }

  // 3. Flood fill from border to mark exterior
  floodFillBorder(grid, gridW, gridH, EXTERIOR)

  // 4. Label connected components of interior cells
  const roomCount = labelComponents(grid, gridW, gridH)

  console.log(`FloodFill: ${gridW}x${gridH} grid, ${walls.length} walls, ${roomCount} rooms found`)

  // 5. Extract room data
  const rooms = []
  for (let label = 3; label < 3 + roomCount; label++) {
    const room = extractRoomFromGrid(grid, gridW, gridH, minX, minZ, resolution, label)
    if (room && room.pixelCount >= MIN_ROOM_PIXELS) {
      room.id = rooms.length
      room.name = `Room ${rooms.length + 1}`
      rooms.push(room)
    }
  }

  // Sort by area descending
  rooms.sort((a, b) => b.area - a.area)
  rooms.forEach((r, i) => { r.name = `Room ${i + 1}` })

  return rooms
}


/**
 * Rasterize a polygon onto the grid with buffer.
 * Uses axis-aligned bounding box rasterization (fast, works for rectangles).
 */
function rasterizePolygon(grid, gridW, gridH, polygon, minX, minZ, resolution, buffer) {
  // Get bounding box of polygon
  let pMinX = Infinity, pMaxX = -Infinity, pMinZ = Infinity, pMaxZ = -Infinity
  for (const [x, z] of polygon) {
    if (x < pMinX) pMinX = x
    if (x > pMaxX) pMaxX = x
    if (z < pMinZ) pMinZ = z
    if (z > pMaxZ) pMaxZ = z
  }

  // Expand by buffer
  pMinX -= buffer
  pMinZ -= buffer
  pMaxX += buffer
  pMaxZ += buffer

  // Convert to grid coordinates
  const gx1 = Math.max(0, Math.floor((pMinX - minX) / resolution))
  const gx2 = Math.min(gridW - 1, Math.ceil((pMaxX - minX) / resolution))
  const gz1 = Math.max(0, Math.floor((pMinZ - minZ) / resolution))
  const gz2 = Math.min(gridH - 1, Math.ceil((pMaxZ - minZ) / resolution))

  // Fill grid cells
  for (let gz = gz1; gz <= gz2; gz++) {
    for (let gx = gx1; gx <= gx2; gx++) {
      grid[gz * gridW + gx] = WALL
    }
  }
}


/**
 * Flood fill from all border cells to mark exterior.
 * Uses BFS (iterative, no recursion).
 */
function floodFillBorder(grid, gridW, gridH, label) {
  const queue = []

  // Add all border cells that are EMPTY
  for (let gx = 0; gx < gridW; gx++) {
    if (grid[gx] === EMPTY) { grid[gx] = label; queue.push(gx) }
    const bottom = (gridH - 1) * gridW + gx
    if (grid[bottom] === EMPTY) { grid[bottom] = label; queue.push(bottom) }
  }
  for (let gz = 0; gz < gridH; gz++) {
    const left = gz * gridW
    if (grid[left] === EMPTY) { grid[left] = label; queue.push(left) }
    const right = gz * gridW + gridW - 1
    if (grid[right] === EMPTY) { grid[right] = label; queue.push(right) }
  }

  // BFS flood fill
  let head = 0
  while (head < queue.length) {
    const idx = queue[head++]
    const gx = idx % gridW
    const gz = Math.floor(idx / gridW)

    // 4-connected neighbors
    const neighbors = []
    if (gx > 0) neighbors.push(idx - 1)
    if (gx < gridW - 1) neighbors.push(idx + 1)
    if (gz > 0) neighbors.push(idx - gridW)
    if (gz < gridH - 1) neighbors.push(idx + gridW)

    for (const nIdx of neighbors) {
      if (grid[nIdx] === EMPTY) {
        grid[nIdx] = label
        queue.push(nIdx)
      }
    }
  }
}


/**
 * Label connected components of remaining EMPTY cells (interior rooms).
 * Each connected component gets a unique label starting at 3.
 */
function labelComponents(grid, gridW, gridH) {
  let nextLabel = 3
  const size = gridW * gridH

  for (let i = 0; i < size; i++) {
    if (grid[i] !== EMPTY) continue

    // BFS flood fill this component
    const label = nextLabel++
    grid[i] = label
    const queue = [i]
    let head = 0

    while (head < queue.length) {
      const idx = queue[head++]
      const gx = idx % gridW
      const gz = Math.floor(idx / gridW)

      const neighbors = []
      if (gx > 0) neighbors.push(idx - 1)
      if (gx < gridW - 1) neighbors.push(idx + 1)
      if (gz > 0) neighbors.push(idx - gridW)
      if (gz < gridH - 1) neighbors.push(idx + gridW)

      for (const nIdx of neighbors) {
        if (grid[nIdx] === EMPTY) {
          grid[nIdx] = label
          queue.push(nIdx)
        }
      }
    }
  }

  return nextLabel - 3
}


/**
 * Extract room polygon from grid by finding the convex hull or
 * bounding contour of labeled cells.
 *
 * For now, uses the bounding box of the labeled region.
 * TODO: marching squares for exact boundary.
 */
function extractRoomFromGrid(grid, gridW, gridH, minX, minZ, resolution, label) {
  let rMinX = Infinity, rMaxX = -Infinity, rMinZ = Infinity, rMaxZ = -Infinity
  let pixelCount = 0
  let sumX = 0, sumZ = 0

  for (let gz = 0; gz < gridH; gz++) {
    for (let gx = 0; gx < gridW; gx++) {
      if (grid[gz * gridW + gx] === label) {
        const worldX = minX + gx * resolution
        const worldZ = minZ + gz * resolution
        if (worldX < rMinX) rMinX = worldX
        if (worldX > rMaxX) rMaxX = worldX
        if (worldZ < rMinZ) rMinZ = worldZ
        if (worldZ > rMaxZ) rMaxZ = worldZ
        sumX += worldX
        sumZ += worldZ
        pixelCount++
      }
    }
  }

  if (pixelCount === 0) return null

  // Add resolution to max to account for pixel size
  rMaxX += resolution
  rMaxZ += resolution

  const area = pixelCount * resolution * resolution
  const centroid = [sumX / pixelCount, sumZ / pixelCount]

  // For now, use convex boundary extraction via edge tracing
  const polygon = traceRoomBoundary(grid, gridW, gridH, minX, minZ, resolution, label)

  return {
    polygon: polygon || [[rMinX, rMinZ], [rMaxX, rMinZ], [rMaxX, rMaxZ], [rMinX, rMaxZ]],
    area,
    centroid,
    pixelCount,
  }
}


/**
 * Trace the boundary of a labeled region to get a polygon.
 * Uses a simplified contour tracing algorithm.
 *
 * Walks the boundary of the labeled region, collecting corner points
 * where the boundary changes direction.
 */
function traceRoomBoundary(grid, gridW, gridH, minX, minZ, resolution, label) {
  // Find the topmost-leftmost boundary pixel
  let startGx = -1, startGz = -1
  outer:
  for (let gz = 0; gz < gridH; gz++) {
    for (let gx = 0; gx < gridW; gx++) {
      if (grid[gz * gridW + gx] === label) {
        // Check if this is a boundary pixel (has a non-label neighbor)
        if (isBoundary(grid, gridW, gridH, gx, gz, label)) {
          startGx = gx
          startGz = gz
          break outer
        }
      }
    }
  }

  if (startGx === -1) return null

  // Trace boundary using Moore neighborhood tracing
  const boundary = []
  const visited = new Set()
  let gx = startGx, gz = startGz
  let dir = 0 // 0=right, 1=down, 2=left, 3=up
  const dx = [1, 0, -1, 0]
  const dz = [0, 1, 0, -1]

  const maxSteps = gridW * gridH
  for (let step = 0; step < maxSteps; step++) {
    const key = `${gx},${gz}`
    if (visited.has(key) && boundary.length > 4 && gx === startGx && gz === startGz) {
      break // completed the loop
    }
    visited.add(key)

    if (isBoundary(grid, gridW, gridH, gx, gz, label)) {
      boundary.push([minX + gx * resolution, minZ + gz * resolution])
    }

    // Try to turn left first (keeps us on the boundary)
    let turned = false
    for (let t = -1; t <= 2; t++) { // -1=left, 0=straight, 1=right, 2=back
      const newDir = (dir + t + 4) % 4
      const nx = gx + dx[newDir]
      const nz = gz + dz[newDir]
      if (nx >= 0 && nx < gridW && nz >= 0 && nz < gridH &&
          grid[nz * gridW + nx] === label) {
        gx = nx
        gz = nz
        dir = newDir
        turned = true
        break
      }
    }

    if (!turned) break
  }

  if (boundary.length < 3) return null

  // Simplify: remove collinear points
  return simplifyPolygon(boundary, resolution * 2)
}


function isBoundary(grid, gridW, gridH, gx, gz, label) {
  if (grid[gz * gridW + gx] !== label) return false
  // A boundary pixel has at least one non-label neighbor
  if (gx === 0 || gx === gridW - 1 || gz === 0 || gz === gridH - 1) return true
  return grid[gz * gridW + gx - 1] !== label ||
         grid[gz * gridW + gx + 1] !== label ||
         grid[(gz - 1) * gridW + gx] !== label ||
         grid[(gz + 1) * gridW + gx] !== label
}


/**
 * Remove points that are nearly collinear to simplify the polygon.
 */
function simplifyPolygon(points, tolerance) {
  if (points.length <= 4) return points

  const result = [points[0]]
  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1]
    const curr = points[i]
    const next = points[i + 1]

    // Check if curr is collinear with prev and next
    const cross = (curr[0] - prev[0]) * (next[1] - prev[1]) -
                  (curr[1] - prev[1]) * (next[0] - prev[0])
    if (Math.abs(cross) > tolerance * tolerance) {
      result.push(curr)
    }
  }
  result.push(points[points.length - 1])

  return result
}
