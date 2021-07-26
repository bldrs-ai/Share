import React from "react";
import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import ElementsTreeStructure from "./tree";

const useStyles = makeStyles((theme) => ({
  contextualMenu: {
    width: 300,
    height: 500,
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
    height: "120px",
    width: "220px",
    backgroundColor: "lightGray",
  },
}));

const ElementsTree = () => {
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
      <ElementsTreeStructure />
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
