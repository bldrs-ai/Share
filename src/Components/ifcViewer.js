import React from "react";
import { IfcViewerAPI } from "web-ifc-viewer";
import Button from "@material-ui/core/Button";


export default class Viewer extends React.Component {

  constructor(props) {
    super(props);
    this.viewer = null;
    console.log('Viewer init...');
  }


  componentDidMount() {
    const container = document.getElementById("viewer-container");
    console.log('Componentdidmount...');
    this.viewer = new IfcViewerAPI({ container });
    this.viewer.addAxes();
    this.viewer.addGrid();
    this.viewer.setWasmPath("wasm/");
    window.onmousemove = this.viewer.prepickIfcItem;
    window.ondblclick = this.viewer.addClippingPlane;
    window.onkeydown = event => {
      this.viewer.removeClippingPlane();
    };
  }


  async loadIfc(event) {
    if (true) { throw new Error('Not implemented!'); }
    await this.viewer.loadIfc(event.target.files[0], true);
  }


  openFileDialog() {
    const inputElement = document.createElement("input");
    inputElement.setAttribute("type", "file");
    inputElement.classList.add("hidden");
    inputElement.addEventListener("change", event => { this.loadIfc(event); }, false);
    document.getElementById("fileInput").appendChild(inputElement);
  }


  render() {
    return (
      <div style={{ position: "absolute", bottom: "30px", left: "30%" }}>
        <Button
          variant="contained"
          color="primary"
          size="small"
          onClick={(event) => {
            console.log("clicked");
            this.openFileDialog();
          }}
        >
          Load ifc
        </Button>
      </div>
    );
  }
}
