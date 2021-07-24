import React, { useState } from "react";
import { makeStyles } from "@material-ui/core/styles";
import AppBar from "@material-ui/core/AppBar";
import Toolbar from "@material-ui/core/Toolbar";
import Typography from "@material-ui/core/Typography";

import MenuIcon from "@material-ui/icons/Menu";
import IconButton from "@material-ui/core/IconButton";

import Paper from "@material-ui/core/Paper";
import { useHistory } from "react-router-dom";
import Viewer from "../Components/ifcViewer";
import LoginMenu from "../Components/loginMenu";
import PrimaryButton from "../Components/primaryButton";

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
  button: {
    margin: theme.spacing(1),
  },
  menuButton: {
    marginLeft: 12,
    marginRight: 22,
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
  shareContiner: {},
}));

const CadView = () => {
  const classes = useStyles();

  const [openLeft, setOpenLeft] = useState(false);
  const [openRight, setOpenRight] = useState(false);
  const [openShare, setOpenShare] = useState(false);
  const history = useHistory();

  const onClickShare = () => {
    setOpenShare(!openShare);
  };

  return (
    <div>
      <AppBar elevation={0} position="static">
        <Toolbar variant="dense">
          <Typography
            variant="h6"
            className={classes.title}
            onClick={() => {
              history.push("/cards");
            }}
          >
            BUILDRS
          </Typography>
          <PrimaryButton name={"Share"} onClick={onClickShare} />
          <LoginMenu />
        </Toolbar>
      </AppBar>

      <div className={classes.menuToolbarContainer}>
        <IconButton
          edge="start"
          className={classes.menuButton}
          color="secondary"
          aria-label="menu"
          onClick={() => {
            setOpenLeft(!openLeft);
            console.log("open left is clicked");
          }}
        >
          <MenuIcon />
        </IconButton>
        <div
          style={{ position: "absolute", left: 60, top: 70 }}
          className={classes.searchContainer}
        >
          search
        </div>
        {openShare && (
          <div
            style={{ position: "absolute", right: 80, top: 66 }}
            className={classes.shareContainer}
          >
            http://wwww.builders.com/kdjiui4kjh/dflakdjkfjlh
          </div>
        )}

        <IconButton
          edge="start"
          className={classes.menuButton}
          color="inherit"
          aria-label="menu"
          onClick={() => {
            console.log("open right is clicked");
            setOpenRight(!openRight);
          }}
        >
          <MenuIcon />
        </IconButton>
      </div>
      <div className={classes.menuToolbarContainer}>
        <div style={{ position: "relative", left: 0 }}>
          {openLeft ? (
            <div
              className={classes.contextualMenu}
              style={{
                marginLeft: "24px",
              }}
            >
              <Paper
                elevation={3}
                className={classes.paper}
                style={{ height: 40 }}
              >
                <div>ifc elements</div>
              </Paper>

              <Paper elevation={3} className={classes.paper}>
                <div>workflow menu 1</div>
              </Paper>

              <Paper elevation={3} className={classes.paper}>
                <div>workflow menu 2</div>
              </Paper>
            </div>
          ) : null}
        </div>
        <div>
          {openRight ? (
            <div
              className={classes.contextualMenu}
              style={{
                marginRight: "34px",
                height: 460,
              }}
            >
              <Paper
                elevation={3}
                className={classes.paper}
                style={{ height: 20 }}
              >
                <div>element data</div>
              </Paper>
              <Paper
                elevation={3}
                className={classes.paper}
                style={{ height: 40 }}
              >
                <div>parameters</div>
              </Paper>
              <Paper
                elevation={3}
                className={classes.paper}
                style={{ height: 20 }}
              >
                <div>comments</div>
              </Paper>
              <Paper elevation={3} className={classes.paper}>
                <div>...</div>
              </Paper>

              <Paper elevation={3} className={classes.paper}>
                <div>...</div>
              </Paper>
            </div>
          ) : null}
        </div>
      </div>
      <Viewer />
    </div>
  );
};

export default CadView;
