import React from "react";
import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import ElementsTreeStructure from './tree.js';

const useStyles = makeStyles((theme) => ({
  contextualMenu: {
    width: 308,
    border: "none",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-around",
    alignItems: "center",
    overflow: "scroll",
    marginLeft: '-5px'
  },
  paper: {
    padding: theme.spacing(2),
    display: "flex",
    overflow: "auto",
    flexDirection: "column",
    width: "220px",
    backgroundColor: "lightGray",
  },
}));


const ElementsTree = ({ ifcElement, onElementSelect }) => {
  const classes = useStyles();
  return (
    <Paper
      className = {classes.contextualMenu}
      style = {{
        position: 'absolute',
        top: 144,
        left: 24,
        height: '70%',
        overflow: 'auto'
      }}
    >
      <ElementsTreeStructure
        ifcElement = {ifcElement}
        onElementSelect = {onElementSelect} />
    </Paper>
  );
};

export default ElementsTree;
