import Tree from 'react-animated-tree';
import '../styles/tree.css';

const ElementsTreeStructure = ({ifcElement, onElementSelect}) => {

  const onElementClick = e => {
    const expressID = parseInt(e.target.getAttribute('express-id'));
    onElementSelect(expressID);
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
  }

  const shouldOpen = ifcElement => {
    switch(ifcElement.type) {
    case 'IFCBUILDING':  ; // fallthrough
    case 'IFCPROJECT':   ; // fallthrough
    case 'IFCSITE':      ; // fallthrough
    case 'IFCSPACE': return true;
    default: return false;
    }
  }

  const isSelectable = ifcElement => {
    switch(ifcElement.type) {
    case 'IFCBUILDING':      ; // fallthrough
    case 'IFCPROJECT':       ; // fallthrough
    case 'IFCSITE':          ; // fallthrough
    case 'IFCBUILDINGSTOREY': ; // fallthrough
    case 'IFCSPACE': return false;
    default: return true;
    }
  }

  let i = 0;
  // Hack here to special-case root tree element.  Should use
  // recursion depth or smth else.
  return (
      <Tree
        content = {prettyType(ifcElement)}
        open = {shouldOpen(ifcElement)}
        style = {ifcElement.type === 'IFCPROJECT' ? {
          position: 'absolute',
          top: 0,
          left: 10,
        } : {}}
    type = {
      isSelectable(ifcElement) ?
        (<button
         onClick={onElementClick}
         express-id = {ifcElement.expressID}>
           🔍
         </button>)
        : null}>
      {
        (ifcElement.children && ifcElement.children.length > 0) ?
          ifcElement.children.map(
            child => <ElementsTreeStructure ifcElement={child} onElementSelect={onElementSelect} key={i++}/>
          )
          : null
      }
    </Tree>
  );
};

export default ElementsTreeStructure;
