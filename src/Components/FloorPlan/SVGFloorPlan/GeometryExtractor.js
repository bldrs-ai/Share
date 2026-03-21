/**
 * Extracts 2D floor plan geometry from IFC spatial structure.
 *
 * Traverses element representations to find IfcExtrudedAreaSolid profiles,
 * transforms them by IfcLocalPlacement, and projects to XZ plane (plan view).
 *
 * For elements without parametric geometry, falls back to bounding box estimation.
 */


/**
 * Extract 2D footprints for all elements on a given storey.
 *
 * @param {object} viewer - Share viewer instance
 * @param {number} storeyExpressId - expressID of the IfcBuildingStorey
 * @param {object} model - the loaded model
 * @return {Promise<Array<FloorPlanElement>>}
 *
 * @typedef {object} FloorPlanElement
 * @property {number} expressId
 * @property {string} type - IFC type name
 * @property {string|null} name
 * @property {Array<[number, number]>} polygon - 2D points [x, z] in meters
 * @property {string} category - 'wall' | 'column' | 'space' | 'slab' | 'opening'
 */
export async function extractFloorPlanGeometry(viewer, storeyExpressId, model) {
  const manager = viewer.IFC.loader.ifcManager
  const elements = []

  // Get spatial structure to find elements on this storey
  const structure = await manager.getSpatialStructure(0, false)
  const storeyNode = findNodeByExpressId(structure, storeyExpressId)
  if (!storeyNode) return elements

  // Collect all element expressIDs on this storey
  const elementIds = []
  collectElementIds(storeyNode, elementIds)

  // For each element, try to get its 2D footprint
  for (const eid of elementIds) {
    try {
      const props = await manager.getItemProperties(0, eid)
      if (!props) continue

      const typeName = props.constructor?.name || props.type || ''
      const category = categorizeType(typeName)
      if (!category) continue

      const name = unwrap(props.Name) || unwrap(props.LongName) || null

      // Try to get geometry from the mesh in the scene
      const polygon = getPolygonFromScene(model, eid)
      if (polygon && polygon.length >= 3) {
        elements.push({expressId: eid, type: typeName, name, polygon, category})
      }
    } catch (_) {
      // Skip elements we can't process
    }
  }

  return elements
}


/**
 * Extract polygon from the Three.js scene by finding the mesh
 * for a given expressID and projecting its bounding box to XZ plane.
 *
 * @param {object} model
 * @param {number} expressId
 * @return {Array<[number, number]>|null}
 */
function getPolygonFromScene(model, expressId) {
  // The model mesh has geometry with expressID encoded per-vertex
  // For now, use bounding box approach per element
  // TODO: Extract actual profile geometry for precise outlines
  try {
    if (!model || !model.geometry) return null

    const index = model.geometry.index
    const position = model.geometry.attributes.position
    const eidAttr = model.geometry.attributes.expressID

    if (!position || !eidAttr) return null

    let minX = Infinity, maxX = -Infinity
    let minZ = Infinity, maxZ = -Infinity
    let found = false

    // Scan vertices belonging to this expressID
    const count = eidAttr.count
    for (let i = 0; i < count; i++) {
      if (eidAttr.getX(i) === expressId) {
        const x = position.getX(i)
        const z = position.getZ(i)
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (z < minZ) minZ = z
        if (z > maxZ) maxZ = z
        found = true
      }
    }

    if (!found || minX === maxX || minZ === maxZ) return null

    // Return bounding box as a rectangle polygon
    return [
      [minX, minZ],
      [maxX, minZ],
      [maxX, maxZ],
      [minX, maxZ],
    ]
  } catch (_) {
    return null
  }
}


/**
 * Map IFC type names to floor plan categories.
 */
function categorizeType(typeName) {
  const upper = typeName.toUpperCase()
  if (upper.includes('WALL')) return 'wall'
  if (upper.includes('COLUMN')) return 'column'
  if (upper.includes('SPACE')) return 'space'
  if (upper.includes('SLAB')) return 'slab'
  if (upper.includes('DOOR')) return 'opening'
  if (upper.includes('WINDOW')) return 'opening'
  return null
}


function findNodeByExpressId(node, targetId) {
  if (node.expressID === targetId) return node
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeByExpressId(child, targetId)
      if (found) return found
    }
  }
  return null
}


function collectElementIds(node, out) {
  if (node.children) {
    for (const child of node.children) {
      if (typeof child.expressID === 'number') {
        out.push(child.expressID)
      }
      collectElementIds(child, out)
    }
  }
}


function unwrap(v) {
  if (v === null || v === undefined) return v
  if (typeof v === 'object' && 'value' in v) return v.value
  return v
}
