import React from "react";
import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";

const useStyles = makeStyles((theme) => ({
  contextualMenu: {
    width: 240,
    height: 300,
    border: "1px solid lime",
    marginLeft: "24px",
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

const ElementsInfo = (elementProps) => {
  console.log('ElementsInfo, elementProps: ', elementProps);
  const classes = useStyles();
  return (
    <div
      className={classes.contextualMenu}
      style={{
        height: 460,
        position: "absolute",
        top: 130,
        right: 34,
      }}
    >
      <Paper elevation={3} className={classes.paper} style={{ height: 20 }}>
        <div>element data</div>
      </Paper>
      <Paper elevation={3} className={classes.paper} style={{ height: 40 }}>
        <div>parameters</div>
      </Paper>
      <Paper elevation={3} className={classes.paper} style={{ height: 20 }}>
        <div>comments</div>
      </Paper>
      <Paper elevation={3} className={classes.paper}>
        <div>...</div>
      </Paper>
      <Paper elevation={3} className={classes.paper}>
        <div>...</div>
      </Paper>
    </div>
  );
};

export default ElementsInfo;
