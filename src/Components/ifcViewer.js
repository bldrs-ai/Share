import React from "react";
import { IfcViewerAPI } from "web-ifc-viewer";
import { createSideMenuButton } from "../utils/gui-creator";
import Button from "@material-ui/core/Button";

const Viewer = () => {
  const container = document.getElementById("viewer-container");
  const viewer = new IfcViewerAPI({ container });
  viewer.addAxes();
  viewer.addGrid();
  viewer.setWasmPath("wasm/");

  const loadIfc = async (event) => {
    await viewer.loadIfc(event.target.files[0], true);
  };
  // const inputElement = document.createElement("input");
  // inputElement.setAttribute("type", "file");
  // inputElement.classList.add("hidden");
  // inputElement.addEventListener("change", loadIfc, false);
  // document.getElementById("fileInput").appendChild(inputElement);

  const handleKeyDown = (event) => {
    viewer.removeClippingPlane();
  };

  window.onmousemove = viewer.prepickIfcItem;
  window.onkeydown = handleKeyDown;
  window.ondblclick = viewer.addClippingPlane;

  return (
    <div style={{ position: "absolute", bottom: "30px", left: "30%" }}>
      <Button
        variant="contained"
        color="primaryLight"
        size="smalls"
        onClick={(event) => {
          console.log("clicked");
        }}
      >
        Load ifc
      </Button>
    </div>
  );
};
export default Viewer;
