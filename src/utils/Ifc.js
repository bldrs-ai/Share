import { stoi } from './strings'


export function isTypeValue(obj) {
  return obj['type'] != null && obj['value'] != null;
}


export function getType(elt, viewer) {
  const ifcMgr = viewer.IFC.loader.ifcManager;
  return ifcMgr.getIfcType(0, elt.expressID);
}


export function prettyType(elt, viewer) {
  switch (getType(elt, viewer)) {
  case 'IFCANNOTATION': return 'Note';
  case 'IFCBEAM': return 'Beam';
  case 'IFCBUILDING': return 'Building';
  case 'IFCBUILDINGSTOREY': return 'Storey';
  case 'IFCBUILDINGELEMENTPROXY': return 'Element (generic proxy)';
  case 'IFCCOLUMN': return 'Column';
  case 'IFCCOVERING': return 'Covering';
  case 'IFCDOOR': return 'Door';
  case 'IFCFLOWSEGMENT': return 'Flow Segment';
  case 'IFCFLOWTERMINAL': return 'Flow Terminal';
  case 'IFCPROJECT': return 'Project';
  case 'IFCRAILING': return 'Railing';
  case 'IFCROOF': return 'Roof';
  case 'IFCSITE': return 'Site';
  case 'IFCSLAB': return 'Slab';
  case 'IFCSPACE': return 'Space';
  case 'IFCWALL': return 'Wall';
  case 'IFCWALLSTANDARDCASE': return 'Wall (std. case)';
  case 'IFCWINDOW': return 'Window';
  default:
    return elt.type;
  }
}


function getValueOrUndefined(element, param) {
  if (element[param]) {
    if (element[param].value) {
      return element[param].value;
    }
  }
  return undefined;
}


export function getName(elt) {
  return elt.Name ? elt.Name.value.trim() : null;
}


export function reifyName(element, viewer) {
  if (element.LongName) {
    if (element.LongName.value) {
      return decodeIFCString(element.LongName.value.trim());
    }
  } else if (element.Name) {
    if (element.Name.value) {
      return decodeIFCString(element.Name.value.trim());
    }
  }
  return prettyType(element, viewer) + '';
}


export function getDescription(element) {
  const val = getValueOrUndefined(element, 'Description');
  return val ? decodeIFCString(val) : val;
}


// https://github.com/tomvandig/web-ifc/issues/58#issuecomment-870344068
export function decodeIFCString (ifcString) {
  const ifcUnicodeRegEx = /\\X2\\(.*?)\\X0\\/uig;
  let resultString = ifcString;
  let match = ifcUnicodeRegEx.exec (ifcString);
  while (match) {
    const unicodeChar = String.fromCharCode (parseInt (match[1], 16));
    resultString = resultString.replace (match[0], unicodeChar);
    match = ifcUnicodeRegEx.exec (ifcString);
  }
  return resultString;
}


/**
 * Recursive dereference of nested IFC. If ref.type is (1-4),
 * viewer and typeValCb will not be used.
 * @param typeValCb async callback for rendering sub-object
 */
export async function deref(ref, viewer = null, serial = 0, typeValCb = null) {
  if (ref === null || ref === undefined) {
    throw new Error('Ref undefined or null: ', ref);
  }
  if (isTypeValue(ref)) {
    switch (ref.type) {
      case 1: return decodeIFCString(ref.value); // typically strings.
      case 2: return ref.value; // no idea.
      case 3: return ref.value; // no idea.. values are typically in CAPS
      case 4: return ref.value; // typically measures of space, time or angle.
      case 5:
        const refId = stoi(ref.value);
        // TODO, only recursion uses the viewer, serial.
        return await typeValCb(
          await viewer.getProperties(0, refId), viewer, serial);
      default:
        return 'Unknown type: ' + ref.value;
    }
  } else if (Array.isArray(ref)) {
    let listNdx = 0;
    return (await Promise.all(ref.map(
      async (v, ndx) => isTypeValue(v)
        ? await deref(v, viewer, ndx, typeValCb)
        : await typeValCb(v, viewer, ndx)
    )));
  }
  if (typeof ref === 'object') {
    console.warn('should not be object: ', ref);
  }
  return ref; // typically number or string.
}
