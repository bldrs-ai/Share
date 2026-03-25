/**
 * Coordinate transformations for Swiss terrain data.
 *
 * WGS84 ↔ LV95 (EPSG:2056) using Swiss Federal approximate formulae.
 * Accuracy ~1m, sufficient for terrain tile alignment at 2m resolution.
 *
 * Reference: https://www.swisstopo.admin.ch/en/knowledge-facts/surveying-geodesy/reference-frames/local/lv95.html
 */


/**
 * Convert IFC DMS (degrees-minutes-seconds) array to decimal degrees.
 *
 * IFC stores lat/lon as arrays: [degrees, minutes, seconds, millionths_of_seconds]
 * Some files use 3 elements: [degrees, minutes, seconds]
 *
 * @param {number[]} dms - Array of [deg, min, sec] or [deg, min, sec, microsec]
 * @return {number} Decimal degrees
 */
export function dmsToDecimal(dms) {
  if (!dms || dms.length < 3) {
    return null
  }
  const deg = dms[0]
  const min = dms[1]
  const sec = dms[2] + (dms.length > 3 ? dms[3] / 1000000 : 0)
  return deg + min / 60 + sec / 3600
}


/**
 * Convert WGS84 lat/lon to Swiss LV95 (EPSG:2056) coordinates.
 *
 * Uses the approximate formulae published by swisstopo.
 * Input: decimal degrees. Output: meters (easting, northing).
 *
 * @param {number} lat - Latitude in decimal degrees
 * @param {number} lon - Longitude in decimal degrees
 * @return {{east: number, north: number}}
 */
export function wgs84ToLV95(lat, lon) {
  // Convert to sexagesimal seconds then to auxiliary values
  const latSec = lat * 3600
  const lonSec = lon * 3600

  // Auxiliary values (differences to Bern reference point in 10000")
  const latAux = (latSec - 169028.66) / 10000
  const lonAux = (lonSec - 26782.5) / 10000

  // LV95 East
  const east = 2600072.37 +
    211455.93 * lonAux -
    10938.51 * lonAux * latAux -
    0.36 * lonAux * latAux * latAux -
    44.54 * lonAux * lonAux * lonAux

  // LV95 North
  const north = 1200147.07 +
    308807.95 * latAux +
    3745.25 * lonAux * lonAux +
    76.63 * latAux * latAux -
    194.56 * lonAux * lonAux * latAux +
    119.79 * latAux * latAux * latAux

  return {east, north}
}


/**
 * Convert Swiss LV95 coordinates to WGS84 lat/lon.
 *
 * Inverse of wgs84ToLV95. Approximate formulae from swisstopo.
 *
 * @param {number} east - LV95 easting (e.g. 2600000)
 * @param {number} north - LV95 northing (e.g. 1200000)
 * @return {{lat: number, lon: number}} Decimal degrees
 */
export function lv95ToWGS84(east, north) {
  // Auxiliary values (differences to Bern in 1000km)
  const eastAux = (east - 2600000) / 1000000
  const northAux = (north - 1200000) / 1000000

  // Longitude in sexagesimal seconds
  const lonSec = 10000 * (
    2.6779094 +
    4.728982 * eastAux +
    0.791484 * eastAux * northAux +
    0.1306 * eastAux * northAux * northAux -
    0.0436 * eastAux * eastAux * eastAux
  )

  // Latitude in sexagesimal seconds
  const latSec = 10000 * (
    16.9023892 +
    3.238272 * northAux -
    0.270978 * eastAux * eastAux -
    0.002528 * northAux * northAux -
    0.0447 * eastAux * eastAux * northAux -
    0.0140 * northAux * northAux * northAux
  )

  return {
    lat: latSec / 3600,
    lon: lonSec / 3600,
  }
}


/**
 * Get the 1km tile key for a given LV95 coordinate.
 * SwissALTI3D tiles are aligned to 1km grid.
 *
 * @param {number} east - LV95 easting
 * @param {number} north - LV95 northing
 * @return {string} Tile key like "2683-1248"
 */
export function lv95ToTileKey(east, north) {
  const tileEast = Math.floor(east / 1000)
  const tileNorth = Math.floor(north / 1000)
  return `${tileEast}-${tileNorth}`
}


/**
 * Get all tile keys in a grid around a center point.
 *
 * @param {number} centerEast - LV95 easting of center
 * @param {number} centerNorth - LV95 northing of center
 * @param {number} [radius=1] - Number of tiles to extend in each direction (1 = 3x3 grid)
 * @return {Array<{key: string, east: number, north: number}>} Tile keys with their SW corner coordinates
 */
export function getTileKeys(centerEast, centerNorth, radius = 1) {
  const centerTileEast = Math.floor(centerEast / 1000)
  const centerTileNorth = Math.floor(centerNorth / 1000)

  const tiles = []
  for (let de = -radius; de <= radius; de++) {
    for (let dn = -radius; dn <= radius; dn++) {
      const tileEast = centerTileEast + de
      const tileNorth = centerTileNorth + dn
      tiles.push({
        key: `${tileEast}-${tileNorth}`,
        east: tileEast * 1000,
        north: tileNorth * 1000,
      })
    }
  }
  return tiles
}


/**
 * Check if WGS84 coordinates fall within Swiss bounds.
 *
 * @param {number} lat - Latitude in decimal degrees
 * @param {number} lon - Longitude in decimal degrees
 * @return {boolean}
 */
export function isInSwitzerland(lat, lon) {
  return lat >= 45.8 && lat <= 47.9 && lon >= 5.9 && lon <= 10.6
}
