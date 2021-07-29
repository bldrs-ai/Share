import Tree from 'react-animated-tree';
import '../styles/tree.css';

const ElementsTreeStructure = ({ifcElement, onElementSelect}) => {

  const foo = e => {
    const expressID = parseInt(e.target.getAttribute('express-id'));
    onElementSelect(expressID);
  };


  const prettyType = formalType => {
    switch(formalType) {
    case 'IFCPROJECT': return 'Project';
    case 'IFCSITE': return 'Site';
    case 'IFCBUILDING': return 'Building';
    case 'IFCBUILDINGSTOREY': return 'Storey';
    case 'IFCSPACE': return 'Space';
    case 'IFCWALLSTANDARDCASE': return 'Wall';
    case 'IFCSLAB': return 'Slab';
    case 'IFCDOOR': return 'Door';
    case 'IFCWINDOW': return 'Window';
    default: return formalType;
    }
  }

  let i = 0;
  // Hack here to special-case root tree element.  Should use
  // recursion depth or smth else.
  return (
      <Tree
        content = {prettyType(ifcElement.type)}
        style = {ifcElement.type === 'IFCPROJECT' ? {
          position: 'absolute',
          top: 0,
          left: 10,
        } : {}}
        type = {<button
                onClick={foo}
                express-id = {ifcElement.expressID}>
             🔍
            </button>}
        >
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
