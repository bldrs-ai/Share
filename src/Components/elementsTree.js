import React from "react";
import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";

const useStyles = makeStyles((theme) => ({
  contextualMenu: {
    width: 300,
    height: 500,
    border: "1px solid lime",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-around",
    alignItems: "center",
  },
  paper: {
    padding: theme.spacing(2),
    display: "flex",
    overflow: "auto",
    flexDirection: "column",
    height: "120px",
    width: "220px",
  },
}));

const ElementsTree = () => {
  const classes = useStyles();
  return (
    <div
      className={classes.contextualMenu}
      style={{
        position: "absolute",
        top: 144,
        left: 24,
      }}
    >
      <Paper elevation={3} className={classes.paper} style={{ height: 80 }}>
        <div>ifc elements</div>
      </Paper>

      <Paper elevation={3} className={classes.paper}>
        <div>workflow menu 1</div>
      </Paper>

      <Paper elevation={3} className={classes.paper}>
        <div>workflow menu 2</div>
      </Paper>
    </div>
  );
};

export default ElementsTree;
