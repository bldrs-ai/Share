import React from "react";
import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import ElementsTreeStructure from './tree.js';

const useStyles = makeStyles((theme) => ({
  contextualMenu: {
    width: 300,
    border: "1px solid lime",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-around",
    alignItems: "center",
    overflow: "scroll",
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


const ElementsTree = ({ viewer, ifcElement }) => {
  const classes = useStyles();
  return (
    <Paper
      className={classes.contextualMenu}
      style={{
        position: "absolute",
        top: 144,
        left: 24,
      }}
    >
      <ElementsTreeStructure viewer={viewer} ifcElement={ifcElement}/>
      {/* <Paper elevation={3} className={classes.paper}></Paper> */}

      {/* <Paper elevation={3} className={classes.paper}>
        <div>workflow menu 1</div>
      </Paper>

      <Paper elevation={3} className={classes.paper}>
        <div>workflow menu 2</div>
      </Paper> */}
    </Paper>
  );
};

export default ElementsTree;
