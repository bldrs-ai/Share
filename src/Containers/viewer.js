import {Color} from 'three'
import {IfcViewerAPIExtended} from '../Infrastructure/IfcViewerAPIExtended'


// Track the current viewer for cleanup
let currentViewer = null
let mouseDownHandler = null
let mouseUpHandler = null
let mouseMoveHandler = null


/**
 * Dispose the previous viewer and all its resources.
 */
export function disposeViewer() {
  if (currentViewer) {
    try {
      // Remove global event handlers
      if (mouseDownHandler) window.removeEventListener('mousedown', mouseDownHandler)
      if (mouseUpHandler) window.removeEventListener('mouseup', mouseUpHandler)
      if (mouseMoveHandler) window.removeEventListener('mousemove', mouseMoveHandler)
      mouseDownHandler = null
      mouseUpHandler = null
      mouseMoveHandler = null

      // Dispose Three.js resources
      const scene = currentViewer.context.getScene()
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose()
        if (obj.material) {
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
          materials.forEach((mat) => {
            if (mat.map) mat.map.dispose()
            mat.dispose()
          })
        }
      })

      const renderer = currentViewer.context.getRenderer()
      if (renderer?.dispose) renderer.dispose()

      // Dispose clipper
      if (currentViewer.glbClipper) {
        currentViewer.glbClipper.dispose()
        currentViewer.glbClipper = null
      }

      currentViewer = null
    } catch (e) {
      console.warn('Error disposing viewer:', e)
    }
  }
}


/**
 * @param {string} pathPrefix E.g. /share/v/p
 * @param {string} backgroundColorStr CSS str like '#abcdef'
 * @return {object} IfcViewerAPIExtended viewer, with a .container property
 *     referencing its container.
 */
export function initViewer(pathPrefix, backgroundColorStr = '#abcdef') {
  // Dispose previous viewer first
  disposeViewer()

  const container = document.getElementById('viewer-container')
  container.textContent = ''

  const viewer = new IfcViewerAPIExtended({
    container,
    backgroundColor: new Color(backgroundColorStr),
  })

  viewer.IFC.setWasmPath('./static/js/')
  viewer.clipper.active = true
  viewer.clipper.orthogonalY = false

  // Use addEventListener so we can remove them later
  mouseDownHandler = () => { viewer.clipper.clickDrag = true }
  mouseUpHandler = () => { viewer.clipper.clickDrag = false }

  let lastPickTime = 0
  const PICK_INTERVAL = 33
  mouseMoveHandler = () => {
    if (!viewer.clipper.clickDrag) {
      const now = performance.now()
      if (now - lastPickTime < PICK_INTERVAL) {
        return
      }
      lastPickTime = now
      viewer.highlightIfcItem()
    }
  }

  window.addEventListener('mousedown', mouseDownHandler)
  window.addEventListener('mouseup', mouseUpHandler)
  window.addEventListener('mousemove', mouseMoveHandler)

  viewer.container = container

  const canvas = viewer.context.getDomElement()
  canvas.setAttribute('tabIndex', '0')

  currentViewer = viewer
  return viewer
}
