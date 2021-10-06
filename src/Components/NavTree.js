import React from 'react';
//import { useState } from 'react';
import '../styles/tree.css';
import TreeItem from '@mui/lab/TreeItem';


const NavTree = ({
  viewer,
  element,
  onElementSelect,
  showChildren,
  keyPrefix = ''
}) => {

  // TODO(pablo): finish refactor
  // const [open, setOpen] = useState(showChildren);


  const prettyType = elt => {
    switch (elt.type) {
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
    default: return elt.type;
    }
  };


  // TODO(pablo): finish refactor
  /*
  const onItemToggle = () => {
    console.log('#onItemToggle: calling setOpen(true)');
    setOpen(true);
  };
  */


  // TODO(pablo): finish refactor
  /*
  const onSeachIconClick = e => {
    onElementSelect(element);
  };
  */


  // TODO(pablo): finish refactor
  const autoOpen = elt => {
    switch(elt.type) {
    case 'IFCBUILDING': ; // fallthrough
    case 'IFCPROJECT':  ; // fallthrough
    case 'IFCSITE':     ; // fallthrough
    case 'IFCSPACE': return true; // return elt.children && elt.children.length > 0;
    default: return false;
    }
  };


  // TODO(pablo): finish refactor
  /*
  const isSelectable = elt => {
    switch(elt.type) {
    case 'IFCBUILDING':      ; // fallthrough
    case 'IFCPROJECT':       ; // fallthrough
    case 'IFCSITE':          ; // fallthrough
    case 'IFCBUILDINGSTOREY': ; // fallthrough
    case 'IFCSPACE': return false;
    default: return true;
    }
  };
  */

  // TODO(pablo): finish refactor
  const getText = elt => {
    const props = viewer.getProperties(0, elt.expressID);
    // TODO: e.g. when there's no model loaded.
    if (props === null) {
      return 'YO';
    }
    return (props.Name ? props.Name.value : null) || prettyType(elt);
  };


  // TODO(pablo): finish refactor
  /*
  const getAction = elt => {
    return isSelectable(elt) ?
      (<button
         onClick={onSeachIconClick}
         express-id = {elt.expressID}>
         🔍
       </button>)
      : null;

  };
  */

  // TODO(pablo): finish refactor
  /** Unclear why absolute position is needed.  With relative or
   * static, the container doesn't scroll when there's overflow. */
  /*
  const getStyle = elt => {
    return elt.type === 'IFCPROJECT' ? {
      position: 'absolute',
      top: 10,
      left: 10,
    } : {};
  };
  */

  let i = 0;
  // TODO(pablo): Had to add this React.Fragment wrapper to get rid of
  // warning about missing a unique key foreach item.  Don't really understand it.
  return (
    <TreeItem nodeId={keyPrefix} label={getText(element)}
              onClick = {() => onElementSelect(element)}>
      {
        element.children && element.children.length > 0 ? element.children.map(
          child => {
            const childKey = `${keyPrefix}-${i++}`;
            return (<React.Fragment key={childKey}>
                      <NavTree
                        viewer = {viewer}
                        element = {child}
                        onElementSelect = {onElementSelect}
                        showChildren = {autoOpen(child)}
                        keyPrefix = {childKey} />
                    </React.Fragment>);
          }
        )
          : null
      }
    </TreeItem>
  );
};

export default NavTree;
