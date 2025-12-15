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

  window.onmousedown = () => {
    viewer.clipper.clickDrag = true
  }
  window.onmouseup = () => {
    viewer.clipper.clickDrag = false
  }

  let lastPickTime = 0
  const PICK_INTERVAL = 33 // 30fps
  // Highlight items when hovering over them. Sample when mouse-over.
  // Disable during a click-drag for rotation.
  window.onmousemove = () => {
    if (!viewer.clipper.clickDrag) {
      const now = performance.now()
      if (now - lastPickTime < PICK_INTERVAL) {
        return
      }
      lastPickTime = now
      // NB: This is VERY EXPENSIVE, so we sample it.
      // If we're dragging, we don't need to highlight.
      viewer.highlightIfcItem()
    }
  }

  viewer.container = container

  // This is necessary so that canvas can receive key events for shortcuts.
  const canvas = viewer.context.getDomElement()
  canvas.setAttribute('tabIndex', '0')

  return viewer
}
