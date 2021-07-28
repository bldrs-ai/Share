import React, { useEffect, useState } from "react";
import { makeStyles } from "@material-ui/core/styles";
import AppBar from "@material-ui/core/AppBar";
import Toolbar from "@material-ui/core/Toolbar";
import Typography from "@material-ui/core/Typography";
import { useHistory } from "react-router-dom";
import LoginMenu from "../Components/loginMenu";
import PrimaryButton from "../Components/primaryButton";
import MenuButton from "../Components/menuButton";
import ElementsTree from "../Components/elementsTree";
import ElementsInfo from "../Components/elementInfo";
import SearchInput from "../Components/searchInput";
import FolderIcon from "@material-ui/icons/Folder";
import IconButton from "@material-ui/core/IconButton";
import OpenInBrowserIcon from "@material-ui/icons/OpenInBrowser";
import CommentIcon from "@material-ui/icons/Comment";
import "../App.css";
import { IfcViewerAPI } from "web-ifc-viewer";

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
    justifyContent: "flex-end",
    marginTop: "10px",
  },
  title: {
    flexGrow: 1,
    color: "WhiteSmoke",
    fontSize: 20,
    marginRight: "20px",
  },
  shareContainer: {
    width: 540,
    height: 30,
    paddingLeft: 10,
    color: "aqua",
    border: "1px solid aqua",
    display: "flex",
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    position: "absolute",
    right: 80,
    top: 86,
  },
  searchContainer: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    position: "absolute",
    left: 20,
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
  const [viewer, setViewer] = useState({});
  const [ifcElement, setIfcElement] = useState({});
  const history = useHistory();

  const onClickShare = () => {
    setOpenShare(!openShare);
  };

  // Similar to componentDidMount and componentDidUpdate:
  useEffect(() => {

    const loadIfc = async event => {
      await viewer.loadIfc(event.target.files[0], true);
      try {
        // v1.0.14
        //const ifcRoot = viewer.ifcManager.loader.getSpatialStructure(0);
        // v1.0.20
        const ifcRoot = viewer.IFC.loader.ifcManager.getSpatialStructure(0);
        console.log('setIfcElement to ifcRoot: ', ifcRoot);
        setIfcElement(ifcRoot);
      } catch (e) {
        console.error(e);
      }
    };

    const container = document.getElementById("viewer-container");
    const viewer = new IfcViewerAPI({ container });
    setViewer(viewer);
    // No setWasmPath here. As of 1.0.14, the default is
    // http://localhost:3000/static/js/web-ifc.wasm, so just putting
    // the binary there in our public directory.
    viewer.addAxes();
    viewer.addGrid();
    window.onmousemove = viewer.prepickIfcItem;
    window.ondblclick = viewer.addClippingPlane;
    window.onkeydown = (event) => {
      viewer.removeClippingPlane();
    };
    //create load ifc input
    const inputElement = document.createElement("input");
    inputElement.setAttribute("type", "file");
    inputElement.classList.add("hidden");
    inputElement.addEventListener(
      "change",
      event => {
        loadIfc(event);
      },
      false
    );
    document.getElementById("fileInput").appendChild(inputElement);
  }, []);

  return (
    <div>
      <div style={{ zIndex: 0 }}>
        <div
          id="viewer-container"
          style={{
            position: "absolute",
            top: "0px",
            left: "0px",
            textAlign: "center",
            color: "blue",
            width: "100vw",
            height: "100vh",
            margin: "auto",
          }}
        ></div>
        <div
          id="fileInput"
          style={{
            position: "absolute",
            bottom: "30px",
            width: 300,
            height: 30,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            left: "43%",
            color: "blue",
            textAlign: "center",
            overflow: "hidden",
            border: "1px solid lime",
          }}
        ></div>
      </div>
      <div
        id="property-viewer-container"
        style={{
          position: 'absolute',
          top: '100px',
          right: '50px',
          width: '400px',
        }}
      ></div>
      <div index={{ zIndex: 100 }}>
        <AppBar elevation={0} position="static" color="primary">
          <Toolbar
            variant="regular"
            style={{
              borderBottom: "1px solid 	#585858",
              backgroundColor: "#787878",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                justifyContent: "flex-start",
                alignItems: "center",
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

              <IconButton
                edge="start"
                color="secondary"
                aria-label="menu"
                style={{ position: "relative" }}
              >
                <FolderIcon
                  style={{
                    width: 30,
                    height: 30,
                    color: "whiteSmoke",
                  }}
                />
              </IconButton>
              <IconButton
                edge="start"
                color="secondary"
                aria-label="menu"
                style={{ position: "relative" }}
              >
                <OpenInBrowserIcon
                  style={{
                    width: 30,
                    height: 30,
                    color: "whiteSmoke",
                  }}
                />
              </IconButton>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                justifyContent: "flex-start",
                alignItems: "center",
              }}
            >
              <IconButton
                edge="start"
                color="secondary"
                aria-label="menu"
                style={{ position: "relative", right: 10 }}
              >
                <CommentIcon
                  style={{
                    width: 30,
                    height: 30,
                    color: "whiteSmoke",
                  }}
                />
              </IconButton>
              <PrimaryButton name={"Share"} onClick={onClickShare} />
              <LoginMenu />
            </div>
          </Toolbar>
        </AppBar>
        <div className={classes.searchContainer}>
          <SearchInput onClickMenu={() => setOpenLeft(!openLeft)} />
        </div>
        {openShare && (
          <div className={classes.shareContainer}>
            http://wwww.builders.com/kdjiui4kjh/dflakdjkfjlh
          </div>
        )}
        <div className={classes.menuToolbarContainer}>
          {/* <MenuButton onClick={() => setOpenLeft(!openLeft)} /> */}
          <MenuButton onClick={() => setOpenRight(!openRight)} />
        </div>
        <div className={classes.menuToolbarContainer}>
          <div>
            {openLeft ? (
              <ElementsTree id="elements-tree" viewer={viewer} ifcElement={ifcElement} />
            ) : null}
          </div>
          <div>{openRight ? <ElementsInfo /> : null}</div>
        </div>
      </div>
    </div>
  );
};

export default CadView;
