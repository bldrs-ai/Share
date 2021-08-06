import React, { useEffect, useState } from "react";
import { makeStyles } from "@material-ui/core/styles";
import MenuButton from "../Components/menuButton";
import ElementsTree from "../Components/elementsTree";
import ElementsInfo from "../Components/elementInfo";
import SearchInput from "../Components/searchInput";
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
    "@media (max-width: 900px)": {
      marginTop: "40px",
    },
  },
  elementsButton: {
    position: "absolute",
    top: 80,
    right: 20,
    display: "flex",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    "@media (max-width: 900px)": {
      marginTop: theme.spacing(5),
      top: 520,
      right: 15,
    },
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
  viewContainer: {
    position: "absolute",
    top: "0px",
    left: "0px",
    textAlign: "center",
    color: "blue",
    width: "100vw",
    height: "100vh",
    margin: "auto",
  },
  propertyViewContainer: {
    position: "absolute",
    top: "100px",
    right: "50px",
    width: "400px",
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

  const onClickShare = () => {
    setOpenShare(!openShare);
  };

  const onElementSelect = (expressID) => {
    viewer.pickIfcItemsByID(0, [expressID]);
    const props = viewer.getProperties(0, expressID);
    setElementProps(props);
    // setOpenRight(true);
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

  let isLoaded = Object.keys(ifcElement).length === 0;
  let isLoadedElement = Object.keys(elementProps).length === 0;

  return (
    <div>
      <div style={{ zIndex: 0 }}>
        <div className={classes.viewContainer} id="viewer-container"></div>
      </div>
      <div
        id="property-viewer-container"
        className={classes.propertyViewContainer}
      ></div>
      <div index={{ zIndex: 100 }}>
        <BuildrsToolBar fileOpen={fileOpen} onClickShare={onClickShare} />
        <div className={classes.searchContainer}>
          <SearchInput
            onClickMenu={() => setOpenLeft(!openLeft)}
            disabled={isLoaded}
          />
        </div>
        {openShare && (
          <div className={classes.shareContainer}>
            http://wwww.builders.com/kdjiui4kjh/dflakdjkfjlh
          </div>
        )}
        <div className={classes.elementsButton}>
          <MenuButton
            onClick={() => setOpenRight(!openRight)}
            disabled={isLoadedElement}
          />
        </div>

        {/* </div> */}
        <div className={classes.menuToolbarContainer}>
          <div>
            {openLeft ? (
              <ElementsTree
                viewer={viewer}
                ifcElement={ifcElement}
                onElementSelect={onElementSelect}
                elementProps={elementProps}
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
