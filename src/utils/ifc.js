import {toTitleCase} from './strings'

/**
 * Gets pretty type name
 *
 * @param {string} type name
 * @return {string} prettified type name
 */
export function prettyType(type) {
  const ifcPrefix = 'IFC'
  switch (type) {
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
      if (!type) {
        return ''
      }
      let titleCased = toTitleCase(type.substring(ifcPrefix.length))
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
