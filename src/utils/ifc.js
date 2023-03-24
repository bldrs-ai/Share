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
    case 'IFCANNOTATION': return 'Note'
    case 'IFCBEAM': return 'Beam'
    case 'IFCBUILDING': return 'Building'
    case 'IFCBUILDINGSTOREY': return 'Storey'
    case 'IFCBUILDINGELEMENTPROXY': return 'Element (generic proxy)'
    case 'IFCCOLUMN': return 'Column'
    case 'IFCCOVERING': return 'Covering'
    case 'IFCDOOR': return 'Door'
    case 'IFCFLOWSEGMENT': return 'Flow Segment'
    case 'IFCFLOWTERMINAL': return 'Flow Terminal'
    case 'IFCPROJECT': return 'Project'
    case 'IFCRAILING': return 'Railing'
    case 'IFCROOF': return 'Roof'
    case 'IFCSITE': return 'Site'
    case 'IFCSLAB': return 'Slab'
    case 'IFCSPACE': return 'Space'
    case 'IFCWALL': return 'Wall'
    case 'IFCWALLSTANDARDCASE': return 'Wall (std. case)'
    case 'IFCWINDOW': return 'Window'
    default:
      return toTitleCase(type.substring(ifcPrefix.length))
  }
}


/**
 * Groups elements by theirtypes
 *
 * @param {object} root element.
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
