import {stoi} from './strings'

/**
 * Determing if the given object is a type/value pair.
 * @param {Object} obj IFC element.
 * @return {boolean} The sum of the two numbers.
 */
export function isTypeValue(obj) {
  return obj['type'] != null && obj['value'] != null
}

/**
 * Get the IFC type.
 * @param {Object} elt IFC element.
 * @param {Object} viewer Instance of a viewer.
 * @return {string} The sum of the two numbers.
 */
export function getType(elt, viewer) {
  const ifcMgr = viewer.IFC.loader.ifcManager
  return ifcMgr.getIfcType(0, elt.expressID)
}

/**
 * Format the type.
 * @param {Object} elt IFC element.
 * @param {Object} viewer Instance of a viewer.
 * @return {string} string.
 */
export function prettyType(elt, viewer) {
  switch (getType(elt, viewer)) {
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
      return elt.type
  }
}

/**
 * Return undefined if no value exists.
 * @param {Object} element IFC element.
 * @param {string} param Instance of a viewer.
 * @return {string|undefined} The sum of the two numbers.
 */
function getValueOrUndefined(element, param) {
  if (element[param]) {
    if (element[param].value) {
      return element[param].value
    }
  }
  return undefined
}

/**
 * Retutn the name if it exist.
 * @param {Object} elt IFC element.
 * @return {string|null} The sum of the two numbers.
 */
export function getName(elt) {
  return elt.Name ? elt.Name.value.trim() : null
}

/**
 * Return legible name.
 * @param {Object} element IFC element.
 * @param {Object} viewer IFC element.
 * @return {function} The sum of the two numbers.
 */
export function reifyName(element, viewer) {
  if (element.LongName) {
    if (element.LongName.value) {
      return decodeIFCString(element.LongName.value.trim())
    }
  } else if (element.Name) {
    if (element.Name.value) {
      return decodeIFCString(element.Name.value.trim())
    }
  }
  return prettyType(element, viewer) + ''
}

/**
 * Elements description.
 * @param {Object} element IFC element.
 * @return {function|string} The sum of the two numbers.
 */
export function getDescription(element) {
  const val = getValueOrUndefined(element, 'Description')
  return val ? decodeIFCString(val) : val
}


// https://github.com/tomvandig/web-ifc/issues/58#issuecomment-870344068
/**
 * get the ifc string
 * @param {string} ifcString IFC element.
 * @param {Object} viewer IFC element.
 * @return {function} The sum of the two numbers.
 */
export function decodeIFCString(ifcString) {
  const ifcUnicodeRegEx = /\\X2\\(.*?)\\X0\\/uig
  let resultString = ifcString
  let match = ifcUnicodeRegEx.exec(ifcString)
  while (match) {
    const unicodeChar = String.fromCharCode(parseInt(match[1], 16))
    resultString = resultString.replace(match[0], unicodeChar)
    match = ifcUnicodeRegEx.exec(ifcString)
  }
  return resultString
}


/**
 * Recursive dereference of nested IFC. If ref.type is (1-4),
 * viewer and typeValCb will not be used.
 * @param {Object} ref async callback for rendering sub-object
 * @param {Object} viewer async callback for rendering sub-object
 * @param {Number} serial async callback for rendering sub-object
 * @param {string} typeValCb async callback for rendering sub-object
 */
export async function deref(ref, viewer = null, serial = 0, typeValCb = null) {
  if (ref === null || ref === undefined) {
    throw new Error('Ref undefined or null: ', ref)
  }
  if (isTypeValue(ref)) {
    switch (ref.type) {
      case 1: return decodeIFCString(ref.value) // typically strings.
      case 2: return ref.value // no idea.
      case 3: return ref.value // no idea.. values are typically in CAPS
      case 4: return ref.value // typically measures of space, time or angle.
      case 5: {
        // TODO, only recursion uses the viewer, serial.
        const refId = stoi(ref.value)
        return await typeValCb(
            await viewer.getProperties(0, refId), viewer, serial)
      }
      default:
        return 'Unknown type: ' + ref.value
    }
  } else if (Array.isArray(ref)) {
    return (await Promise.all(ref.map(
        async (v, ndx) => isTypeValue(v) ?
        await deref(v, viewer, ndx, typeValCb) :
        await typeValCb(v, viewer, ndx),
    )))
  }
  if (typeof ref === 'object') {
    console.warn('should not be object: ', ref)
  }
  return ref // typically number or string.
}
