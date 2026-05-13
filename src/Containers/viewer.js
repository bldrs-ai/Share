import {Color} from 'three'
import {ShareViewer} from '../viewer/ShareViewer'


// Track the current viewer for cleanup so a subsequent call to
// initViewer() can dispose its WebGL/Three.js resources before
// constructing a new one.  Keeps GPU memory bounded across model loads.
let currentViewer = null
let mouseDownHandler = null
let mouseUpHandler = null
let mouseMoveHandler = null


// Texture map slots that may exist on a Three.js material; iterated by
// disposeViewer to release any GPU textures the scene holds.
const TEXTURE_MAP_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'emissiveMap',
  'aoMap',
  'bumpMap',
  'displacementMap',
  'alphaMap',
  'lightMap',
  'envMap',
]


/**
 * Dispose the previous viewer and all its resources.
 */
export function disposeViewer() {
  if (!currentViewer) {
    return
  }
  try {
    if (mouseDownHandler) {
      window.removeEventListener('mousedown', mouseDownHandler)
    }
    if (mouseUpHandler) {
      window.removeEventListener('mouseup', mouseUpHandler)
    }
    if (mouseMoveHandler) {
      window.removeEventListener('mousemove', mouseMoveHandler)
    }
    mouseDownHandler = null
    mouseUpHandler = null
    mouseMoveHandler = null

    if (currentViewer._resizeObserver) {
      currentViewer._resizeObserver.disconnect()
      currentViewer._resizeObserver = null
    }

    const scene = currentViewer.context.getScene()
    scene.traverse((obj) => {
      if (obj.geometry) {
        obj.geometry.dispose()
      }
      if (obj.material) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
        materials.forEach((mat) => {
          TEXTURE_MAP_SLOTS.forEach((slot) => {
            if (mat[slot]) {
              mat[slot].dispose()
            }
          })
          mat.dispose()
        })
      }
    })

    const renderer = currentViewer.context.getRenderer()
    if (renderer && typeof renderer.dispose === 'function') {
      renderer.dispose()
    }
    // renderer.dispose() does not free the WebGL context itself; force
    // context loss so the browser can reclaim it.  Browsers cap active
    // WebGL contexts (~16 in Chrome) and we'd otherwise hit it after
    // many model loads.
    if (renderer && typeof renderer.forceContextLoss === 'function') {
      renderer.forceContextLoss()
    }

    if (currentViewer.glbClipper && typeof currentViewer.glbClipper.dispose === 'function') {
      currentViewer.glbClipper.dispose()
      currentViewer.glbClipper = null
    }

    // Belt-and-suspenders: call any built-in dispose on the viewer for
    // subsystems the manual traverse above doesn't reach (controls,
    // post-processor, highlighter, isolator, viewsManager, etc.).
    if (typeof currentViewer.dispose === 'function') {
      try {
        currentViewer.dispose()
      } catch (e) {
        console.warn('viewer.dispose failed:', e)
      }
    }

    currentViewer = null
  } catch (e) {
    console.warn('Error disposing viewer:', e)
  }
}


/**
 * @param {string} pathPrefix E.g. /share/v/p
 * @param {string} backgroundColorStr CSS str like '#abcdef'
 * @return {object} ShareViewer instance, with a .container property
 *     referencing its container.
 */
export function initViewer(pathPrefix, backgroundColorStr = '#abcdef') {
  // Dispose previous viewer first so its WebGL context, geometries,
  // materials and textures are released before we allocate new ones.
  disposeViewer()

  const container = document.getElementById('viewer-container')

  // Clear any existing scene.
  container.textContent = ''
  const viewer = new ShareViewer({
    container,
    backgroundColor: new Color(backgroundColorStr),
  })

  // Path to web-ifc.wasm in serving directory.
  viewer.IFC.setWasmPath('./static/js/')
  viewer.clipper.active = true
  viewer.clipper.orthogonalY = false

  mouseDownHandler = () => {
    viewer.clipper.clickDrag = true
  }
  mouseUpHandler = () => {
    viewer.clipper.clickDrag = false
  }

  let lastPickTime = 0
  const PICK_INTERVAL = 33 // 30fps
  // Highlight items when hovering over them. Sample when mouse-over.
  // Disable during a click-drag for rotation.
  mouseMoveHandler = () => {
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

  window.addEventListener('mousedown', mouseDownHandler)
  window.addEventListener('mouseup', mouseUpHandler)
  window.addEventListener('mousemove', mouseMoveHandler)

  viewer.container = container

  // This is necessary so that canvas can receive key events for shortcuts.
  const canvas = viewer.context.getDomElement()
  canvas.setAttribute('tabIndex', '0')

  currentViewer = viewer
  return viewer
}
