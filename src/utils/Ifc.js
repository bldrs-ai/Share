function getType(elt, viewer) {
  const ifcMgr = viewer.IFC.loader.ifcManager;
  return ifcMgr.getIfcType(0, elt.expressID);
}


function prettyType(elt, viewer) {
  switch (getType(elt, viewer)) {
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
      return element.LongName.value.trim();
    }
  } else if (element.Name) {
    if (element.Name.value) {
      return element.Name.value.trim();
    }
  }
  return prettyType(element, viewer) + '';
}


function getDescription(element) {
  return getValueOrUndefined(element, 'Description');
}


export {
  getType,
  prettyType,
  getName,
  reifyName,
  getDescription
}
