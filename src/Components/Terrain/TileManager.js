import {getTileKeys, lv95ToWGS84} from './CoordinateTransform'
import {getCachedTile, cacheTile, isTileCached} from './TileCache'
import debug from '../../utils/debug'


const STAC_API = 'https://data.geo.admin.ch/api/stac/v1'
const COLLECTION = 'ch.swisstopo.swissalti3d'


/**
 * Load terrain tiles for a given LV95 center point.
 *
 * Checks cache first, downloads missing tiles from swisstopo, caches them.
 *
 * @param {number} centerEast - LV95 easting
 * @param {number} centerNorth - LV95 northing
 * @param {number} [radius=1] - Tile radius (1 = 3x3 grid)
 * @param {function} [onProgress] - Called with {downloaded, total, currentTile}
 * @return {Promise<Array<{key: string, east: number, north: number, buffer: ArrayBuffer}>>}
 */
export async function loadTiles(centerEast, centerNorth, radius = 1, onProgress) {
  const tileSpecs = getTileKeys(centerEast, centerNorth, radius)
  const results = []
  let downloaded = 0
  const total = tileSpecs.length

  // Discover download URLs for tiles that aren't cached
  const uncachedSpecs = tileSpecs.filter((spec) => !isTileCached(spec.key))
  let urlMap = {}

  if (uncachedSpecs.length > 0) {
    urlMap = await discoverTileUrls(centerEast, centerNorth, radius)
  }

  for (const spec of tileSpecs) {
    try {
      // Check cache first
      let buffer = await getCachedTile(spec.key)

      if (!buffer) {
        // Download from swisstopo
        const url = urlMap[spec.key]
        if (!url) {
          debug().log('TileManager: No URL found for tile', spec.key, '— skipping')
          continue
        }

        debug().log('TileManager: Downloading tile', spec.key)
        buffer = await fetchTile(url)
        await cacheTile(spec.key, buffer)
      } else {
        debug().log('TileManager: Loaded tile from cache', spec.key)
      }

      results.push({
        key: spec.key,
        east: spec.east,
        north: spec.north,
        buffer,
      })
    } catch (e) {
      debug().log('TileManager: Error loading tile', spec.key, e)
      // Continue with remaining tiles
    }

    downloaded++
    if (onProgress) {
      onProgress({downloaded, total, currentTile: spec.key})
    }
  }

  return results
}


/**
 * Discover download URLs for tiles using the swisstopo STAC API.
 *
 * Queries with a WGS84 bounding box and maps tile IDs to GeoTIFF URLs.
 *
 * @param {number} centerEast - LV95 easting
 * @param {number} centerNorth - LV95 northing
 * @param {number} radius - Tile radius
 * @return {Promise<Object>} Map of tileKey → download URL
 */
async function discoverTileUrls(centerEast, centerNorth, radius) {
  // Compute bbox in LV95 (with margin)
  const margin = (radius + 1) * 1000
  const minEast = centerEast - margin
  const maxEast = centerEast + margin
  const minNorth = centerNorth - margin
  const maxNorth = centerNorth + margin

  // Convert to WGS84 for STAC API
  const sw = lv95ToWGS84(minEast, minNorth)
  const ne = lv95ToWGS84(maxEast, maxNorth)
  const bbox = `${sw.lon},${sw.lat},${ne.lon},${ne.lat}`

  const urlMap = {}
  let nextUrl = `${STAC_API}/collections/${COLLECTION}/items?bbox=${bbox}&limit=50`

  // Paginate through STAC results
  while (nextUrl) {
    debug().log('TileManager: Querying STAC API', nextUrl)
    const response = await fetch(nextUrl)

    if (!response.ok) {
      debug().log('TileManager: STAC API error', response.status)
      break
    }

    const data = await response.json()

    for (const feature of (data.features || [])) {
      // Extract tile coordinate from the item ID
      // Format: "swissalti3d_2019_2600-1200"
      const tileKey = extractTileKeyFromId(feature.id)
      if (!tileKey) {
        continue
      }

      // Find the 2m resolution GeoTIFF asset
      const asset = findGeoTiffAsset(feature.assets, '_2_2056_5728.tif')
      if (asset) {
        urlMap[tileKey] = asset.href
      }
    }

    // Follow pagination
    const nextLink = (data.links || []).find((link) => link.rel === 'next')
    nextUrl = nextLink ? nextLink.href : null
  }

  debug().log('TileManager: Discovered', Object.keys(urlMap).length, 'tile URLs')
  return urlMap
}


/**
 * Extract tile key from a STAC item ID.
 *
 * @param {string} itemId - e.g. "swissalti3d_2019_2600-1200"
 * @return {string|null} e.g. "2600-1200"
 */
function extractTileKeyFromId(itemId) {
  // Match the coordinate part: digits-digits at the end
  const match = itemId.match(/(\d{4})-(\d{4})$/)
  if (!match) {
    return null
  }
  return `${match[1]}-${match[2]}`
}


/**
 * Find a GeoTIFF asset matching a suffix pattern.
 *
 * @param {Object} assets - STAC item assets
 * @param {string} suffix - e.g. "_2_2056_5728.tif"
 * @return {Object|null} Asset with href
 */
function findGeoTiffAsset(assets, suffix) {
  if (!assets) {
    return null
  }
  for (const [key, asset] of Object.entries(assets)) {
    if (key.endsWith(suffix) || (asset.href && asset.href.endsWith(suffix))) {
      return asset
    }
  }
  return null
}


/**
 * Fetch a single GeoTIFF tile.
 *
 * @param {string} url - Direct download URL
 * @return {Promise<ArrayBuffer>}
 */
async function fetchTile(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download tile: ${response.status} ${response.statusText}`)
  }
  return response.arrayBuffer()
}
