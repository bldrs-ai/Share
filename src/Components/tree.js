import {useState} from "react";
import Tree from 'react-animated-tree-v2';
import '../styles/tree.css';


const ElementsTreeStructure = ({viewer, ifcElement, onElementSelect, showChildren, parentOpen = false }) => {


  if (showChildren === undefined) throw new Error();
  const [open, setOpen] = useState(showChildren);


  const onItemToggle = () => {
    console.log('#onItemToggle: calling setOpen(true)');
    setOpen(true);
  };


  const onSeachIconClick = e => {
    const expressID = parseInt(e.target.getAttribute('express-id'));
    onElementSelect(expressID);
  };


  const autoOpen = ifcElement => {
    switch(ifcElement.type) {
    case 'IFCBUILDING': ; // fallthrough
    case 'IFCPROJECT':  ; // fallthrough
    case 'IFCSITE':     ; // fallthrough
    case 'IFCSPACE': return true; // return ifcElement.children && ifcElement.children.length > 0;
    default: return false;
    }
  };


  const prettyType = ifcElement => {
    switch(ifcElement.type) {
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
    default: return ifcElement.type;
    }
  };


  const isSelectable = ifcElement => {
    switch(ifcElement.type) {
    case 'IFCBUILDING':      ; // fallthrough
    case 'IFCPROJECT':       ; // fallthrough
    case 'IFCSITE':          ; // fallthrough
    case 'IFCBUILDINGSTOREY': ; // fallthrough
    case 'IFCSPACE': return false;
    default: return true;
    }
  };


  const getText = ifcElement => {
    const props = viewer.getProperties(0, ifcElement.expressID);
    console.log(`${ifcElement.type}: props: `, props);
    return (props.Name ? props.Name.value : null) || prettyType(ifcElement);
    //return prettyType(ifcElement);
  }

  /** Hack to special-case the tree root to push it to top of
   * container. */
  const getStyle = ifcElement => {
    return ifcElement.type === 'IFCPROJECT' ? {
      position: 'absolute',
      top: 0,
      left: 10,
    } : {};
  };


  const getAction = ifcElement => {
    return isSelectable(ifcElement) ?
      (<button
         onClick={onSeachIconClick}
         express-id = {ifcElement.expressID}>
         🔍
       </button>)
      : null;
  };


  let i = 0;
  return (
      <Tree
        content = {getText(ifcElement)}
        open = {open}
        onItemToggle = {onItemToggle}
        style = {getStyle(ifcElement)}
        type = {getAction(ifcElement)}>
      {
        parentOpen ? (ifcElement.children.map(
          child => <ElementsTreeStructure
                     viewer = {viewer}
                     ifcElement = {child}
                     onElementSelect = {onElementSelect}
                     showChildren = {autoOpen(child)}
                     parentOpen = {open}
                     key = {i++} />))
          : null
      }
    </Tree>
  );
};

export default ElementsTreeStructure;
