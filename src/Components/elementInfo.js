import React from "react";
import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";

const useStyles = makeStyles((theme) => ({
  root: {
    ...theme.typography.button,
    backgroundColor: theme.palette.background.paper,
    padding: theme.spacing(1),
    flexGrow: 1,
  },
  menuToolbarContainer: {
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    marginTop: "10px",
  },
  title: {
    flexGrow: 1,
  },
  contextualMenu: {
    width: 240,
    height: 300,
    border: "4px solid lime",
    marginLeft: "24px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-around",
    alignItems: "center",
  },
  shareContainer: {
    width: 440,
    height: 30,
    paddingLeft: 10,
    border: "4px solid aqua",
    display: "flex",
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    position: "absolute",
    right: 80,
    top: 66,
  },
  searchContainer: {
    width: 200,
    height: 30,
    paddingLeft: 10,
    border: "1px solid grey",
    display: "flex",
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    position: "absolute",
    left: 60,
    top: 70,
  },
  paper: {
    padding: theme.spacing(2),
    display: "flex",
    overflow: "auto",
    flexDirection: "column",
    height: "50px",
    width: "160px",
  },
  ifcBackGround: {
    height: "400px",
    width: "600px",
    display: "flex",
    overflow: "auto",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
  },
}));

const ElementsInfo = () => {
  const classes = useStyles();
  return (
    <div
      className={classes.contextualMenu}
      style={{
        marginRight: "34px",
        height: 460,
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
