import { useState } from 'react';
import Tree from 'react-animated-tree-v2';
import '../styles/tree.css';


const NavTree = ({
  viewer,
  element,
  onElementSelect,
  showChildren,
  parentOpen = false,
}) => {
  if (showChildren === undefined) throw new Error();
  const [open, setOpen] = useState(showChildren);

  const onItemToggle = () => {
    console.log('#onItemToggle: calling setOpen(true)');
    setOpen(true);
  };


  const onSeachIconClick = e => {
    onElementSelect(element);
  };


  const autoOpen = element => {
    switch(element.type) {
    case 'IFCBUILDING': ; // fallthrough
    case 'IFCPROJECT':  ; // fallthrough
    case 'IFCSITE':     ; // fallthrough
    case 'IFCSPACE': return true; // return element.children && element.children.length > 0;
    default: return false;
    }
  };


  const prettyType = element => {
    switch(element.type) {
    case 'IFCBUILDING': return 'Building';
    case 'IFCBUILDINGSTOREY': return 'Storey';
    case 'IFCDOOR': return 'Door';
    case 'IFCFLOWTERMINAL': return 'Flow Terminal';
    case 'IFCPROJECT': return 'Project';
    case 'IFCROOF': return 'Roof';
    case 'IFCSITE': return 'Site';
    case 'IFCSLAB': return 'Slab';
    case 'IFCSPACE': return 'Space';
    case 'IFCWALL': return 'Wall';
    case 'IFCWALLSTANDARDCASE': return 'Wall (std. case)';
    case 'IFCWINDOW': return 'Window';
    default: return element.type;
    }
  };


  const isSelectable = element => {
    if (true) return true;
    switch(element.type) {
    case 'IFCBUILDING':      ; // fallthrough
    case 'IFCPROJECT':       ; // fallthrough
    case 'IFCSITE':          ; // fallthrough
    case 'IFCBUILDINGSTOREY': ; // fallthrough
    case 'IFCSPACE': return false;
    default: return true;
    }
  };


  const getText = element => {
    const props = viewer.getProperties(0, element.expressID);
    // TODO: e.g. when there's no model loaded.
    if (props === null) {
      return '';
    }
    return (props.Name ? props.Name.value : null) || prettyType(element);
  };


  const getAction = element => {
    return isSelectable(element) ?
      (<button
         onClick={onSeachIconClick}
         express-id = {element.expressID}>
         🔍
       </button>)
      : null;

  };


  /** Unclear why absolute position is needed.  With relative or
   * static, the container doesn't scroll when there's overflow. */
  const getStyle = element => {
    return element.type === 'IFCPROJECT' ? {
      position: 'absolute',
      top: 10,
      left: 10,
    } : {};
  };


  let i = 0;
  return (
      <Tree
        content = {getText(element)}
        open = {open}
        onItemToggle = {onItemToggle}
        style = {getStyle(element)}
        type = {getAction(element)}>
      {
        parentOpen && element.children && element.children.length > 0 ? (element.children.map(
          child => <NavTree
                     viewer = {viewer}
                     element = {child}
                     onElementSelect = {onElementSelect}
                     showChildren = {autoOpen(child)}
                     parentOpen = {open}
                     key = {i++} />))
          : null
      }
    </Tree>
  );
};

export default NavTree;
