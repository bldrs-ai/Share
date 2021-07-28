import Tree from "react-animated-tree";
import "../styles/tree.css";
/*
const treeStyles = {
  position: "absolute",
  top: 20,
  left: 14,
  color: "black",
  fill: "black",
  width: "100%",
  fontSize: "16px",
  fontFamily: "Roboto",
};
*/
const ElementsTreeStructure = ({ifcElement}) => {
  let i = 0;
  return (
    <Tree content={ifcElement.type} open>
      {
        (ifcElement.children && ifcElement.children.length > 0) ?
          ifcElement.children.map(child => <ElementsTreeStructure ifcElement={child} key={i++}/>)
          : null
      }
    </Tree>
  );
};

export default ElementsTreeStructure;
