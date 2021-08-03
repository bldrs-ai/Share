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
import IconButton from "@material-ui/core/IconButton";
import OpenInBrowserIcon from "@material-ui/icons/OpenInBrowser";
import CommentIcon from "@material-ui/icons/Comment";
import "../App.css";
import { IfcViewerAPI } from "web-ifc-viewer";
import BuildrsToolBar from "../Components/toolBar";

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
  const [elementProps, setElementProps] = useState({});
  const history = useHistory();

  const onClickShare = () => {
    setOpenShare(!openShare);
  };

  const onElementSelect = (expressID) => {
    try {
      viewer.pickIfcItemsByID(0, [expressID]);
      const props = viewer.getProperties(0, expressID);
      setElementProps(props);
      setOpenRight(true);
    } catch (e) {
      console.error(e);
    }
  };

  // Similar to componentDidMount and componentDidUpdate:
  useEffect(() => {
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
  }, []);

  const fileOpen = () => {
    const loadIfc = async (event) => {
      await viewer.loadIfc(event.target.files[0], true);
      const ifcRoot = viewer.getSpatialStructure(0);
      setIfcElement(ifcRoot);
      setOpenLeft(true);
    };

    const viewerContainer = document.getElementById("viewer-container");
    const fileInput = document.createElement("input");
    fileInput.setAttribute("type", "file");
    fileInput.classList.add("file-input");
    fileInput.addEventListener(
      "change",
      (event) => {
        loadIfc(event);
      },
      false
    );
    viewerContainer.appendChild(fileInput);
    fileInput.click();
  };

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
      </div>
      <div
        id="property-viewer-container"
        style={{
          position: "absolute",
          top: "100px",
          right: "50px",
          width: "400px",
        }}
      ></div>
      <div index={{ zIndex: 100 }}>
        <AppBar elevation={0} position="static" color="primary">
          <BuildrsToolBar fileOpen={fileOpen} onClickShare={onClickShare} />
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
              <ElementsTree
                ifcElement={ifcElement}
                onElementSelect={onElementSelect}
              />
            ) : null}
          </div>
          <div>
            {openRight ? <ElementsInfo elementProps={elementProps} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CadView;
