import Tree from 'react-animated-tree';
import '../styles/tree.css';

const treeStyle = {
  color: 'black',
  fill: 'red',
  width: '100%',
  fontSize: '10px',
  fontFamily: 'Roboto',
  padding: 0,
  margin: 0
};

const ElementsTreeStructure = ({viewer, ifcElement}) => {

  const foo = e => {
    const expressID = parseInt(e.target.getAttribute('express-id'));
    try {
      viewer.IFC.pickIfcItemsByID(0, [expressID]);
    } catch (e) {
      console.error(e);
    }
  };

  let i = 0;
  return (
      <Tree content={ifcElement.type} open style={treeStyle}>
      <button onClick={foo} express-id={ifcElement.expressID}>🔍</button>
      {
        (ifcElement.children && ifcElement.children.length > 0) ?
          ifcElement.children.map(child => <ElementsTreeStructure viewer={viewer} ifcElement={child} key={i++}/>)
          : null
      }
    </Tree>
  );
};

export default ElementsTreeStructure;
