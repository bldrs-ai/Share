import {Color} from 'three'
import {getMeshMaterials} from '../viewer/ShareModel'
import {ShareViewer} from '../viewer/ShareViewer'
import {isFeatureEnabled} from '../FeatureFlags'
import {createFrameHoverPicker, createTimerHoverPicker} from '../viewer/hoverPick'


// Track the current viewer for cleanup so a subsequent call to
// initViewer() can dispose its WebGL/Three.js resources before
// constructing a new one.  Keeps GPU memory bounded across model loads.
let currentViewer = null
let mouseDownHandler = null
let mouseUpHandler = null
let mouseMoveHandler = null
let hoverPicker = null
let stopHoverFrame = null


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
    stopHoverFrame?.()
    stopHoverFrame = null
    hoverPicker?.dispose()
    hoverPicker = null
    mouseDownHandler = null
    mouseUpHandler = null
    mouseMoveHandler = null

    if (currentViewer._resizeObserver) {
      currentViewer._resizeObserver.disconnect()
      currentViewer._resizeObserver = null
    }

    // A degenerate scene (a partial test mock, or a viewer torn down before its
    // scene was built) has no `traverse` — skip the per-object GPU cleanup
    // rather than throwing into the outer catch, which logged "Error disposing
    // viewer: scene.traverse is not a function" on every such teardown.
    const scene = currentViewer.context.getScene()
    if (scene && typeof scene.traverse === 'function') {
      scene.traverse((obj) => {
        if (obj.geometry) {
          obj.geometry.dispose()
        }
        const materials = getMeshMaterials(obj)
        if (materials.length > 0) {
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
    }

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

    if (currentViewer.clipper && typeof currentViewer.clipper.dispose === 'function') {
      currentViewer.clipper.dispose()
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

  // Serving directory of Conway's conway-geom wasm + glue, which
  // `build-share-copy-wasm-conway-MT` copies into docs/static/js.
  viewer.IFC.setWasmPath('./static/js/')
  viewer.clipper.active = true
  viewer.clipper.orthogonalY = false

  mouseDownHandler = () => {
    viewer.clipper.clickDrag = true
  }
  mouseUpHandler = () => {
    viewer.clipper.clickDrag = false
    // A hover dropped while the button was down (the moves of a drag) is
    // caught up where the pointer let go: on the next frame under the frame
    // scheduler, at once under the timer one. A click that didn't move it
    // picks nothing.
    hoverPicker?.onMove()
  }

  // Highlight items when hovering over them (viewer/hoverPick.js). The
  // window's mousemove only marks the pointer dirty; the pick runs in the
  // render loop's frame, after the camera moves and before the paint
  // decision (ThreeContext#onFrame), so the highlight changes in the frame
  // whose input moved the pointer. Skipped while dragging (rotation) and while
  // the pointer hasn't moved over the canvas, spaced out by its own measured
  // cost when picks are dear, and skipped while the pointer sweeps fast over
  // a model whose paint is expensive (the last paint's cost, from the
  // viewer's RenderDemand). `?feature=disableFrameHover` puts back the timer
  // scheduler, which picks in the mousemove handler.
  const hoverDeps = {
    pick: () => viewer.highlightIfcItem(),
    isDragging: () => Boolean(viewer.clipper.clickDrag),
    pointer: () => viewer.context.getNormalizedMousePosition?.() ?? null,
    paintCostMs: () => viewer.context.getRenderDemand?.()?.paintCostMs?.() ?? 0,
  }
  if (isFeatureEnabled('disableFrameHover')) {
    hoverPicker = createTimerHoverPicker(hoverDeps)
  } else {
    hoverPicker = createFrameHoverPicker(hoverDeps)
    stopHoverFrame = viewer.context.onFrame?.(hoverPicker.onFrame) ?? null
  }
  mouseMoveHandler = hoverPicker.onMove

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
