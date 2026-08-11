import {toTitleCase} from './strings'

/**
 * Gets pretty type name
 *
 * @param {string} type name
 * @return {string} prettified type name
 */
export function prettyType(type) {
  const ifcPrefix = 'IFC'
  // Managers disagree on case ('IFCWALL' vs 'IfcWall'); normalize so
  // both hit the same cases. Non-IFC type names pass through untouched
  // rather than losing their first three characters below.
  const upper = typeof type === 'string' ? type.toUpperCase() : type
  if (typeof upper === 'string' && !upper.startsWith(ifcPrefix)) {
    return type
  }
  switch (upper) {
    case 'IFCREINFORCINGBAR': return 'Reinforcing Bar'
    case 'IFCREINFORCINGMESH': return 'Reinforcing Mesh'
    case 'IFCTENDONANCHOR': return 'Tendon Anchor'
    case 'IFCBUILDINGSTOREY': return 'Building Storey'
    case 'IFCELEMENTASSEMBLY': return 'Element Assembly'
    case 'IFCBUILDINGELEMENTPART': return 'Building Element Part'
    case 'IFCELECTRICAPPLIANCE': return 'Electric Appliance'
    case 'IFCRAMPFLIGHT': return 'Ramp Flight'
    case 'IFCSANITARYTERMINAL': return 'Sanitary Terminal'
    case 'IFCBUILDINGELEMENTPROXY': return 'Element (generic proxy)'
    case 'IFCSTAIRFLIGHT': return 'Stair Flight'
    case 'IFCBUILDINGELEMENTCOMPONENT': return 'Building Element Component'
    case 'IFCFLOWSEGMENT': return 'Flow Segment'
    case 'IFCFLOWTERMINAL': return 'Flow Terminal'
    case 'IFCFLOWFITTING': return 'Flow Fitting'
    case 'IFCWALLSTANDARDCASE': return 'Wall (std. case)'
    case 'IFCCURTAINWALL': return 'Curtain Wall'
    default: {
      if (!upper) {
        return ''
      }
      let titleCased = toTitleCase(upper.substring(ifcPrefix.length))
      if (titleCased.endsWith('element')) {
        titleCased = `${titleCased.replace('element', '')} Element`
      }
      return titleCased
    }
  }
}


/**
 * Recursively visit the given element and its children, accumulating their
 * types in the given elementTypes map
 *
 * @param {object} element Element tree
 * @param {Array} elementTypes Element types map
 * @return {Array} element types
 */
export function groupElementsByTypes(element, elementTypes) {
  const type = prettyType(element.type)
  if (elementTypes === undefined) {
    elementTypes = []
  }
  const lookup = elementTypes.filter((t) => t.name === type)
  if (lookup.length === 0) {
    elementTypes.push({
      name: type,
      elements: [{expressID: element.expressID,
        Name: element.Name,
        LongName: element.LongName}],
    })
  } else {
    lookup[0].elements.push({expressID: element.expressID,
      Name: element.Name,
      LongName: element.LongName})
  }
  if (element.children.length > 0) {
    element.children.forEach((e) => {
      groupElementsByTypes(e, elementTypes)
    })
  }
  return elementTypes
}
