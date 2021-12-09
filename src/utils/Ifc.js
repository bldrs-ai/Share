function getType(elt, viewer) {
  const ifcMgr = viewer.IFC.loader.ifcManager;
  return ifcMgr.getIfcType(0, elt.expressID);
}


function prettyType(elt, viewer) {
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


function getName(elt) {
  return elt.Name ? elt.Name.value.trim() : null;
}


function reifyName(element, viewer) {
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


function getDescription(element) {
  const val = getValueOrUndefined(element, 'Description');
  return val ? decodeIFCString(val) : val;
}


// https://github.com/tomvandig/web-ifc/issues/58#issuecomment-870344068
function decodeIFCString (ifcString) {
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


export {
  decodeIFCString,
  getDescription,
  getName,
  getType,
  prettyType,
  reifyName
}
