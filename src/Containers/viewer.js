import {Color} from 'three'
import {IfcViewerAPIExtended} from '../Infrastructure/IfcViewerAPIExtended'


/**
 * @param {string} pathPrefix E.g. /share/v/p
 * @param {string} backgroundColorStr CSS str like '#abcdef'
 * @return {object} IfcViewerAPIExtended viewer, width a .container property
 *     referencing its container.
 */
export function initViewer(pathPrefix, backgroundColorStr = '#abcdef') {
  const container = document.getElementById('viewer-container')

  // Clear any existing scene.
  container.textContent = ''
  const viewer = new IfcViewerAPIExtended({
    container,
    backgroundColor: new Color(backgroundColorStr),
  })

  // Path to web-ifc.wasm in serving directory.
  viewer.IFC.setWasmPath('./static/js/')
  viewer.clipper.active = true
  viewer.clipper.orthogonalY = false

  // Highlight items when hovering over them
  window.onmousemove = (event) => viewer.highlightIfcItem()

  viewer.container = container

  // This is necessary so that canvas can receive key events for shortcuts.
  const canvas = viewer.context.getDomElement()
  canvas.setAttribute('tabIndex', '0')

  return viewer
}
