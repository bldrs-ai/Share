import {
  PlaneGeometry,
  Mesh,
  MeshLambertMaterial,
  Float32BufferAttribute,
  Group,
  Color,
  DoubleSide,
} from 'three'
import {fromArrayBuffer} from 'geotiff'
import debug from '../../utils/debug'


// Downsample factor: take every Nth sample from the 500×500 grid
const DOWNSAMPLE = 5
const GRID_SIZE = 100 // 500 / 5


/**
 * Build Three.js terrain meshes from downloaded GeoTIFF tile buffers.
 *
 * @param {Array<{key, east, north, buffer}>} tiles - Downloaded tile data
 * @param {{lv95East, lv95North, elevation, coordinationMatrix}} location - Model location
 * @return {Promise<Group>} Three.js group containing terrain meshes
 */
export async function buildTerrainGroup(tiles, location) {
  const group = new Group()
  group.name = 'TerrainOverlay'

  // Model origin in LV95 — this is where Three.js (0,0,0) maps to
  const originEast = location.lv95East
  const originNorth = location.lv95North
  const originElev = location.elevation || 0

  for (const tile of tiles) {
    try {
      const mesh = await buildTileMesh(tile.buffer, tile.east, tile.north, originEast, originNorth, originElev)
      if (mesh) {
        group.add(mesh)
      }
    } catch (e) {
      debug().log('TerrainMeshBuilder: Error building tile mesh', tile.key, e)
    }
  }

  debug().log('TerrainMeshBuilder: Built terrain group with', group.children.length, 'tiles')
  return group
}


/**
 * Build a single terrain mesh from a GeoTIFF tile.
 *
 * @param {ArrayBuffer} buffer - Raw GeoTIFF data
 * @param {number} tileEast - Tile SW corner easting in LV95
 * @param {number} tileNorth - Tile SW corner northing in LV95
 * @param {number} originEast - Model origin easting
 * @param {number} originNorth - Model origin northing
 * @param {number} originElev - Model origin elevation (meters above sea level)
 * @return {Promise<Mesh>}
 */
async function buildTileMesh(buffer, tileEast, tileNorth, originEast, originNorth, originElev) {
  // Parse GeoTIFF
  const tiff = await fromArrayBuffer(buffer)
  const image = await tiff.getImage()
  const rasters = await image.readRasters()
  const elevations = rasters[0] // First band = elevation values
  const fullWidth = image.getWidth()
  const fullHeight = image.getHeight()

  // Downsample: pick every Nth point
  const gridX = Math.floor(fullWidth / DOWNSAMPLE)
  const gridY = Math.floor(fullHeight / DOWNSAMPLE)
  const tileSize = 1000 // 1km in meters

  // Create plane geometry (XZ plane after rotation)
  const geometry = new PlaneGeometry(tileSize, tileSize, gridX - 1, gridY - 1)
  const positions = geometry.attributes.position.array
  const colors = new Float32Array(positions.length)

  // Track elevation range for color mapping
  let minElev = Infinity
  let maxElev = -Infinity

  // First pass: set elevations and find range
  const sampledElevations = new Float32Array(gridX * gridY)
  for (let iy = 0; iy < gridY; iy++) {
    for (let ix = 0; ix < gridX; ix++) {
      const srcX = ix * DOWNSAMPLE
      // GeoTIFF rows go top to bottom (north to south)
      const srcY = iy * DOWNSAMPLE
      const srcIdx = srcY * fullWidth + srcX
      const elev = elevations[srcIdx]

      const dstIdx = iy * gridX + ix
      sampledElevations[dstIdx] = elev

      if (elev < minElev) {
        minElev = elev
      }
      if (elev > maxElev) {
        maxElev = elev
      }
    }
  }

  const elevRange = maxElev - minElev || 1

  // Second pass: update vertex positions (Z = elevation) and assign colors
  // PlaneGeometry vertices go left-to-right, top-to-bottom
  const color = new Color()

  for (let i = 0; i < gridX * gridY; i++) {
    const relativeElev = sampledElevations[i] - originElev
    // PlaneGeometry Z axis → will become Y after rotation
    positions[i * 3 + 2] = relativeElev

    // Color based on elevation: green (low) → brown (mid) → white (high)
    const t = (sampledElevations[i] - minElev) / elevRange
    elevationColor(color, t)
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }

  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()

  // Material with vertex colors
  const material = new MeshLambertMaterial({
    vertexColors: true,
    side: DoubleSide,
  })

  const mesh = new Mesh(geometry, material)

  // Rotate from XY plane to XZ plane (terrain is horizontal)
  mesh.rotation.x = -Math.PI / 2

  // Position: tile offset from model origin
  // After rotation: mesh X = east offset, mesh Z = -(north offset)
  // Tile center is at (tileEast + 500, tileNorth + 500)
  const tileCenterEast = tileEast + tileSize / 2
  const tileCenterNorth = tileNorth + tileSize / 2
  mesh.position.x = tileCenterEast - originEast
  mesh.position.z = -(tileCenterNorth - originNorth)

  mesh.receiveShadow = true
  mesh.name = `Terrain_${tileEast}-${tileNorth}`

  return mesh
}


/**
 * Map a normalized elevation value (0-1) to a terrain color.
 *
 * 0.0 = dark green (valleys)
 * 0.4 = light green (hills)
 * 0.7 = brown (mountains)
 * 1.0 = white (peaks/snow)
 *
 * @param {Color} color - Color object to set (mutated)
 * @param {number} t - Normalized value 0-1
 */
function elevationColor(color, t) {
  if (t < 0.4) {
    // Dark green → light green
    const s = t / 0.4
    color.setRGB(
      0.2 + 0.3 * s,
      0.4 + 0.3 * s,
      0.15 + 0.1 * s,
    )
  } else if (t < 0.7) {
    // Light green → brown
    const s = (t - 0.4) / 0.3
    color.setRGB(
      0.5 + 0.2 * s,
      0.7 - 0.3 * s,
      0.25 - 0.1 * s,
    )
  } else {
    // Brown → white
    const s = (t - 0.7) / 0.3
    color.setRGB(
      0.7 + 0.3 * s,
      0.4 + 0.6 * s,
      0.15 + 0.85 * s,
    )
  }
}
