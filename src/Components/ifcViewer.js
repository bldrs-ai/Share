import React from "react";
import { IfcViewerAPI } from "web-ifc-viewer";
import Button from "@material-ui/core/Button";
import "../App.css";

export default class Viewer extends React.Component {
  state = {
    loaded: false,
    loading_ifc: false,
  };

  constructor(props) {
    super(props);
    this.viewer = null;
  }

  componentDidMount() {
    const container = document.getElementById("viewer-container");
    this.viewer = new IfcViewerAPI({ container });
    // No setWasmPath here. As of 1.0.14, the default is
    // http://localhost:3000/static/js/web-ifc.wasm, so just putting
    // the binary there in our public directory.
    this.viewer.addAxes();
    this.viewer.addGrid();
    window.onmousemove = this.viewer.prepickIfcItem;
    window.ondblclick = this.viewer.addClippingPlane;
    window.onkeydown = (event) => {
      this.viewer.removeClippingPlane();
    };
    //create load ifc input
    const inputElement = document.createElement("input");
    inputElement.setAttribute("type", "file");
    inputElement.classList.add("hidden");
    inputElement.addEventListener(
      "change",
      (event) => {
        this.loadIfc(event);
      },
      false
    );
    document.getElementById("fileInput").appendChild(inputElement);
  }

  async loadIfc(event) {
    this.setState({ loading_ifc: true });
    await this.viewer.loadIfc(event.target.files[0], true);
    this.setState({ loaded: true, loading_ifc: false });
  }

  openFileDialog() {
    const inputElement = document.createElement("input");
    inputElement.setAttribute("type", "file");
    inputElement.classList.add("hidden");
    inputElement.addEventListener(
      "change",
      (event) => {
        this.loadIfc(event);
      },
      false
    );
    document.getElementById("fileInput").appendChild(inputElement);
  }

  render() {
    return (
      <div>
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
    );
  }
}
