import React, { useState } from "react";
import { makeStyles } from "@material-ui/core/styles";
import AppBar from "@material-ui/core/AppBar";
import Toolbar from "@material-ui/core/Toolbar";
import Typography from "@material-ui/core/Typography";
import { useHistory } from "react-router-dom";
import Viewer from "../Components/ifcViewer";
import LoginMenu from "../Components/loginMenu";
import PrimaryButton from "../Components/primaryButton";
import MenuButton from "../Components/menuButton";
import ElementsTree from "../Components/elementsTree";
import ElementsInfo from "../Components/elementInfo";

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
    color: "WhiteSmoke",
    fontSize: 20,
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
    top: 84,
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
      <div style={{ zIndex: 0 }}>
        <Viewer />
      </div>
      <div index={{ zIndex: 100 }}>
        <AppBar elevation={0} position="static" color="primary">
          <Toolbar
            variant="regular"
            style={{
              borderBottom: "1px solid 	#585858",
              backgroundColor: "#787878",
            }}
          >
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
        <div className={classes.searchContainer}>search</div>
        {openShare && (
          <div className={classes.shareContainer}>
            http://wwww.builders.com/kdjiui4kjh/dflakdjkfjlh
          </div>
        )}
        <div className={classes.menuToolbarContainer}>
          <MenuButton onClick={() => setOpenLeft(!openLeft)} />
          <MenuButton onClick={() => setOpenRight(!openRight)} />
        </div>
        <div className={classes.menuToolbarContainer}>
          <div>{openLeft ? <ElementsTree /> : null}</div>
          <div>{openRight ? <ElementsInfo /> : null}</div>
        </div>
      </div>
    </div>
  );
};

export default CadView;
