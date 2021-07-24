import React from "react";
import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";

const useStyles = makeStyles((theme) => ({
  contextualMenu: {
    width: 240,
    height: 300,
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
    height: "50px",
    width: "160px",
  },
}));

const ElementsTree = () => {
  const classes = useStyles();
  return (
    <div
      className={classes.contextualMenu}
      style={{
        position: "absolute",
        top: 130,
        left: 34,
      }}
    >
      <Paper elevation={3} className={classes.paper} style={{ height: 40 }}>
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
