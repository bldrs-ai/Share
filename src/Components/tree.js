import Tree from "react-animated-tree";
import "../styles/tree.css";

const treeStyles = {
  position: "absolute",
  top: 20,
  left: 14,
  color: "black",
  fill: "black",
  width: "100%",
};

const typeStyles = {
  fontSize: "2em",
  verticalAlign: "middle",
};

const ElementsTreeStructure = () => (
  <Tree content="TopLevel" type="ITEM" open style={treeStyles}>
    <Tree content="hello" type={<span style={typeStyles}>TopLevel</span>} />
    <Tree content="subtree with children">
      <Tree content="hello" open />
      <Tree content="sub-subtree with children">
        <Tree content="child 1" />
        <Tree content="child 2" />
        <Tree content="child 3" />
      </Tree>
      <Tree content="hello" />
    </Tree>
    <Tree content="hello" canHide />
    <Tree content="hello" canHide />
  </Tree>
);

export default ElementsTreeStructure;
