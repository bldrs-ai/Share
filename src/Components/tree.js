import Tree from "react-animated-tree";
import "../styles/tree.css";
import AssistantIcon from "@material-ui/icons/Assistant";

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

const typeStyles = {
  fontSize: "20px",
  verticalAlign: "middle",
};

const ElementsTreeStructure = () => (
  <Tree content="House" open style={treeStyles}>
    <Tree
      content="Annotations"
      type={
        <span style={typeStyles}>
          <AssistantIcon style={{ width: 15, height: 15 }} />
        </span>
      }
    />
    <Tree content="beam">
      <Tree content="type1" open />
      <Tree content="type2">
        <Tree content="child 1" />
        <Tree content="child 2" />
        <Tree content="child 3" />
      </Tree>
      <Tree content="door" />
    </Tree>
    <Tree content="openning" canHide />
    <Tree content="slab" canHide />
  </Tree>
);

export default ElementsTreeStructure;
