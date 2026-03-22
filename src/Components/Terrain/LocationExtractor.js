import {dmsToDecimal, wgs84ToLV95, isInSwitzerland} from './CoordinateTransform'
import debug from '../../utils/debug'


/**
 * Extract real-world location from a loaded IFC model.
 *
 * Checks IfcSite RefLatitude/RefLongitude and optionally IfcMapConversion.
 * Returns null if no usable location data is found or if outside Switzerland.
 *
 * @param {object} viewer - IfcViewerAPIExtended instance
 * @param {object} model - Loaded IFC model (from Loader)
 * @return {Promise<object|null>} Location data or null
 */
export async function extractLocation(viewer, model) {
  try {
    const manager = viewer.IFC.loader.ifcManager
    const structure = await manager.getSpatialStructure(0, true)
    const root = Array.isArray(structure) ? structure[0] : structure
    if (!root) {
      return null
    }

    // Find IfcSite node in spatial structure
    const siteNode = findNodeByType(root, 'IFCSITE')
    if (!siteNode) {
      debug().log('LocationExtractor: No IfcSite found')
      return null
    }

    // Get full properties for the site
    const props = await viewer.getProperties(0, siteNode.expressID)
    if (!props) {
      return null
    }

    const latDms = extractDmsArray(props.RefLatitude)
    const lonDms = extractDmsArray(props.RefLongitude)

    if (!latDms || !lonDms) {
      debug().log('LocationExtractor: IfcSite has no lat/lon')
      return null
    }

    const lat = dmsToDecimal(latDms)
    const lon = dmsToDecimal(lonDms)

    if (lat === null || lon === null || (lat === 0 && lon === 0)) {
      debug().log('LocationExtractor: Invalid coordinates', lat, lon)
      return null
    }

    if (!isInSwitzerland(lat, lon)) {
      debug().log('LocationExtractor: Coordinates outside Switzerland', lat, lon)
      return null
    }

    const elevation = extractNumber(props.RefElevation)
    const {east, north} = wgs84ToLV95(lat, lon)

    const location = {
      lat,
      lon,
      elevation: elevation || 0,
      lv95East: east,
      lv95North: north,
      hasMapConversion: false,
      coordinationMatrix: model.coordinationMatrix || null,
    }

    debug().log('LocationExtractor: Found Swiss location', location)
    return location
  } catch (e) {
    debug().log('LocationExtractor: Error extracting location:', e)
    return null
  }
}


/**
 * Recursively find a node by IFC type in the spatial structure tree.
 *
 * @param {object} node - Spatial structure node
 * @param {string} typeName - e.g. 'IFCSITE'
 * @return {object|null}
 */
function findNodeByType(node, typeName) {
  if (node.type === typeName) {
    return node
  }
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeByType(child, typeName)
      if (found) {
        return found
      }
    }
  }
  return null
}


/**
 * Extract a DMS array from an IFC property value.
 *
 * IFC properties come as arrays of {type, value} objects.
 * RefLatitude: [{type:4, value:46}, {type:4, value:40}, {type:4, value:0}, {type:4, value:40800}]
 *
 * @param {Array|null} propValue
 * @return {number[]|null} Array of numeric values, or null
 */
function extractDmsArray(propValue) {
  if (!propValue || !Array.isArray(propValue) || propValue.length < 3) {
    return null
  }
  return propValue.map((item) => {
    if (item && typeof item === 'object' && item.value !== undefined) {
      return item.value
    }
    if (typeof item === 'number') {
      return item
    }
    return 0
  })
}


/**
 * Extract a plain number from an IFC property value.
 *
 * @param {object|number|null} propValue - e.g. {type: 4, value: 1115.9} or 1115.9
 * @return {number|null}
 */
function extractNumber(propValue) {
  if (propValue === null || propValue === undefined) {
    return null
  }
  if (typeof propValue === 'number') {
    return propValue
  }
  if (typeof propValue === 'object' && propValue.value !== undefined) {
    return propValue.value
  }
  return null
}
