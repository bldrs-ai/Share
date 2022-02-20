import debug from './debug'
import {stoi} from './strings'


/**
 * Check whether both type and value properties are defined and non-null on the object.
 * @param {Object} obj IFC element.
 * @return {boolean} True if and only if
 * the both type and value properties are defined on the object.
 */
export function isTypeValue(obj) {
  return obj['type'] != null && obj['value'] != null
}


/**
 * Get the IFC type.
 * @param {Object} model IFC model.
 * @param {Object} elt IFC element.
 * @return {string} String representation of an IFC element type, e.g. 'IFCELEMENT'
 */
export function getType(model, elt) {
  // return model.ifcManager.getIfcType(0, elt.expressID)
  return model.getIfcType(elt.expressID)
}


/**
 * Format the type, e.g. given an element of type 'IFCANNOTATION' return 'Note'.
 * @param {Object} model IFC model.
 * @param {Object} elt IFC element.
 * @return {string} A nice human-readable string of the element type of the given element.
 */
export function prettyType(model, elt) {
  switch (getType(model, elt)) {
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
 * Helper to get the named property value from the given element,
 * or else undefined. Equivalent to `element[propertyName].value`, but with checks.
 * @param {Object} element IFC element.
 * @param {string} propertyName Name of the property of the element to retrieve.
 * @return {any|undefined} The property's value.
 */
function getValueOrUndefined(element, propertyName) {
  if (element[propertyName]) {
    if (element[propertyName].value) {
      return element[propertyName].value
    }
  }
  return undefined
}


/**
 * Return the name of the given element if it exists otherwise null.
 * @param {Object} elt IFC element.
 * @return {string|null} The element name.
 */
export function getName(elt) {
  return elt.Name ? elt.Name.value.trim() : null
}


/**
 * Return legible name.
 * @param {Object} model IFC model.
 * @param {Object} element IFC element.
 * @return {string} A human-readable name.
 */
export function reifyName(model, element) {
  if (element.LongName) {
    if (element.LongName.value) {
      return decodeIFCString(element.LongName.value.trim())
    }
  } else if (element.Name) {
    if (element.Name.value) {
      return decodeIFCString(element.Name.value.trim())
    }
  }
  return prettyType(model, element) + ''
}


/**
 * Get the 'Description' property of the given element.
 * The string will also be decoded for non-ascii characters.
 * @param {Object} element IFC element.
 * @return {function|string} The element's description property.
 */
export function getDescription(element) {
  const val = getValueOrUndefined(element, 'Description')
  return val ? decodeIFCString(val) : val
}


// https://github.com/tomvandig/web-ifc/issues/58#issuecomment-870344068
/**
 * Decode multi-byte character encodings.
 * @param {Object} ifcString IFC element.
 * @return {string} A decoded string.
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
 * Recursive dereference of nested IFC. If ref.type is (1-4), viewer and typeValCb will not be used.
 * @param {Object} ref The element to dereference
 * @param {Object} model IFC model
 * @param {Number} serial Serial number for react IDs
 * @param {function} typeValCb async callback for rendering sub-object
 * @return {any} A flattened version of the referenced element.  TODO(pablo): clarify type.
 */
export async function deref(ref, model = null, serial = 0, typeValCb = null) {
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
        // TODO, only recursion uses the model, serial.
        const refId = stoi(ref.value)
        return await typeValCb(
            await model.getItemProperties(refId), model, serial)
      }
      default:
        return 'Unknown type: ' + ref.value
    }
  } else if (Array.isArray(ref)) {
    return (await Promise.all(ref.map(
        async (v, ndx) => isTypeValue(v) ?
        await deref(v, model, ndx, typeValCb) :
        await typeValCb(v, model, ndx),
    )))
  }
  if (typeof ref === 'object') {
    debug().warn('should not be object: ', ref)
  }
  return ref // typically number or string.
}
