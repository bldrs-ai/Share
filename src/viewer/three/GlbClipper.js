import {Vector3, Plane, Raycaster, Vector2, Box3, Sphere} from 'three'
import {getMeshMaterials} from '../ShareModel'
import debug from '../../utils/debug'
import CutPlaneArrowHelper from './CutPlaneArrowHelper'


/**
 * Manages clipping planes with interactive drag controls for GLB
 * (and other unstructured-mesh) models.
 *
 * Perf notes (relevant when dragging an arrow at 60Hz):
 *
 *  - **Clipping planes are bound to materials ONCE per add/remove.**
 *    A drag tick only mutates the existing `Plane` in place
 *    (normal/constant). Three.js re-reads `material.clippingPlanes`
 *    uniforms every frame, so plane-equation changes propagate for
 *    free without re-walking the scene tree. The previous implementation
 *    re-walked the tree + set `needsUpdate = true` on every drag tick,
 *    which forced a shader recompile per affected material per tick —
 *    on a 1000-mesh model that translated to dozens of ms per frame.
 *
 *  - **`needsUpdate = true` only fires when the plane *count* changes**
 *    (createPlane / deleteAllPlanes), because Three.js compiles a
 *    shader variant per clipping-plane count. Plane-value mutations
 *    re-use the existing shader.
 *
 *  - **Stable array reference for `_clippingPlanes`.** Bound to both
 *    `renderer.clippingPlanes` and `mat.clippingPlanes` at first
 *    `createPlane()`. Subsequent add/remove mutates the array in place
 *    so all consumers see the change automatically.
 *
 *  - **Scratch Vector3 / Plane preallocation in mouse handlers.** Avoids
 *    5+ allocations per dragged mousemove event. Cumulative GC pressure
 *    fix; small per-event but compounds at 60Hz.
 */
export default class GlbClipper {
  /**
   * @param {object} viewer - The viewer instance
   * @param {object} model - The 3D model to apply clipping to
   */
  constructor(viewer, model) {
    this.viewer = viewer
    this.canvas = viewer.context.getDomElement()
    this.model = model
    this.planes = [] // Array of {plane, arrow, direction, offset, normal, point}
    this.draggingArrow = null
    this.hoveredArrow = null
    this.raycaster = new Raycaster()
    this.mouse = new Vector2()
    this.interactionEnabled = false
    this.modelBoundingSphere = this.computeModelBoundingSphere()
    this.arrowScale = this.computeArrowScale()

    // Stable clipping-planes array — bound once to renderer and to each
    // material's `clippingPlanes`. Mutated in place by createPlane /
    // deleteAllPlanes; drag-time plane updates need not touch this
    // array. See class docstring §perf notes.
    this._clippingPlanes = []
    this._lastBoundPlaneCount = 0

    // Pre-allocated scratch for the drag mouse-move hot path. The
    // previous implementation allocated 5x Vector3 + 1x Plane per
    // tick, which at 60Hz dragging meant ~360 allocations/sec.
    this._scratchCameraDir = new Vector3()
    this._scratchDragPlane = new Plane()
    this._scratchIntersection = new Vector3()
    this._scratchMovement = new Vector3()
    this._scratchNormalScaled = new Vector3()
    this._scratchNewPoint = new Vector3()

    // Bind event handlers
    this.onMouseDown = this.onMouseDown.bind(this)
    this.onMouseMove = this.onMouseMove.bind(this)
    this.onMouseUp = this.onMouseUp.bind(this)
  }


  /**
   * Creates a clipping plane with interactive arrow control
   *
   * @param {Vector3} normal - Plane normal
   * @param {Vector3} point - Point on the plane
   * @param {string} direction - Axis direction ('x', 'y', or 'z')
   * @param {number} offset - Offset from model center
   * @return {object} The created plane data object
   */
  createPlane(normal, point, direction, offset) {
    const plane = new Plane()
    plane.setFromNormalAndCoplanarPoint(normal, point)

    const arrowColor = ARROW_COLOR_DEFAULT
    const arrowColorHighlight = ARROW_COLOR_HIGHLIGHT

    const arrow = new CutPlaneArrowHelper(normal, arrowColor)
    const scale = this.arrowScale
    arrow.scale.set(scale, scale, scale)
    arrow.position.copy(point)
    arrow.userData.isClippingControl = true
    arrow.userData.planeData = {direction, offset}
    arrow.userData.defaultColor = arrowColor
    arrow.userData.highlightColor = arrowColorHighlight

    // Make arrow always visible over geometry
    arrow.traverse((child) => {
      if (child.material) {
        child.material.depthTest = false
        child.renderOrder = ARROW_RENDER_ORDER
      }
    })

    this.viewer.context.getScene().add(arrow)

    // Store plane info
    const planeData = {
      plane,
      arrow,
      direction,
      offset,
      normal: normal.clone(),
      point: point.clone(),
    }
    this.planes.push(planeData)
    this._clippingPlanes.push(plane)

    // Sync renderer + material bindings (only walks the tree when the
    // plane *count* changed — see _syncClippingBindings).
    this._syncClippingBindings()

    debug().log('GlbClipper: Created plane', planeData)
    return planeData
  }


  /**
   * Computes the bounding sphere for the model
   *
   * @return {Sphere|null}
   */
  computeModelBoundingSphere() {
    if (!this.model) {
      return null
    }

    const box = new Box3().setFromObject(this.model)
    if (box.isEmpty()) {
      return null
    }

    const boundingSphere = new Sphere()
    box.getBoundingSphere(boundingSphere)
    return boundingSphere
  }


  /**
   * Computes an appropriate arrow scale based on the model bounding sphere
   *
   * @return {number}
   */
  computeArrowScale() {
    if (!this.modelBoundingSphere) {
      return DEFAULT_ARROW_SCALE
    }

    const radius = this.modelBoundingSphere.radius
    if (!radius || Number.isNaN(radius)) {
      return DEFAULT_ARROW_SCALE
    }

    const scaled = radius * ARROW_SCALE_RATIO
    return Math.min(MAX_ARROW_SCALE, Math.max(MIN_ARROW_SCALE, scaled))
  }


  /**
   * Deletes all clipping planes and controls
   */
  deleteAllPlanes() {
    this.planes.forEach((planeData) => {
      this.viewer.context.getScene().remove(planeData.arrow)
    })
    this.planes = []
    this._clippingPlanes.length = 0
    this._syncClippingBindings()

    debug().log('GlbClipper: Deleted all planes')
  }


  /**
   * Enables or disables user interaction controls for clipping arrows
   *
   * @param {boolean} enabled
   */
  setInteractionEnabled(enabled) {
    if (enabled && !this.interactionEnabled) {
      this.canvas.addEventListener('mousedown', this.onMouseDown)
      this.canvas.addEventListener('mousemove', this.onMouseMove)
      this.canvas.addEventListener('mouseup', this.onMouseUp)
      this.interactionEnabled = true
    } else if (!enabled && this.interactionEnabled) {
      this.canvas.removeEventListener('mousedown', this.onMouseDown)
      this.canvas.removeEventListener('mousemove', this.onMouseMove)
      this.canvas.removeEventListener('mouseup', this.onMouseUp)
      this.canvas.style.cursor = 'default'
      this.draggingArrow = null
      this.hoveredArrow = null
      this.interactionEnabled = false
    }
  }


  /**
   * Update the renderer's clipping-planes array and re-bind materials
   * if the plane *count* changed since the last sync. Plane-value
   * mutations alone (drag updates) do NOT need this call — the renderer
   * + materials already hold a reference to the stable array, and
   * Three.js re-reads plane uniforms each frame.
   *
   * Called from createPlane / deleteAllPlanes.
   *
   * @private
   */
  _syncClippingBindings() {
    // NB: this writes to the fork's `IfcRenderer` wrapper object, not
    // the underlying WebGLRenderer — clipping for GLB is driven by
    // per-material `clippingPlanes` (the renderer-level array is the
    // "global" pool affecting everything else). The wrapper hop goes
    // away in Phase 5 of design/new/viewer-replacement.md when
    // `ThreeContext` owns the WebGLRenderer directly and we can write
    // straight to its `clippingPlanes` slot.
    const renderer = this.viewer.context.getLegacyRendererWrapper()
    renderer.clippingPlanes = this._clippingPlanes
    renderer.localClippingEnabled = this._clippingPlanes.length > 0

    const planeCount = this._clippingPlanes.length
    if (planeCount === this._lastBoundPlaneCount) {
      // Plane *count* unchanged → existing shader variant still applies.
      // Skip the tree walk + needsUpdate flag entirely.
      return
    }
    this._lastBoundPlaneCount = planeCount
    this._bindClippingPlanesToMaterials()
  }


  /**
   * Walk the model tree and bind the stable `_clippingPlanes` array
   * to each material's `clippingPlanes` slot. Sets `needsUpdate = true`
   * because the plane *count* has changed and Three.js needs to compile
   * a shader variant for the new count.
   *
   * Called only when the plane count changes (see _syncClippingBindings).
   *
   * @private
   */
  _bindClippingPlanesToMaterials() {
    if (!this.model) {
      return
    }
    const bindArray = this._clippingPlanes.length > 0 ? this._clippingPlanes : null

    const bind = (node) => {
      const materials = getMeshMaterials(node)
      if (materials.length > 0) {
        materials.forEach((mat) => {
          mat.clippingPlanes = bindArray
          mat.clipIntersection = false
          mat.needsUpdate = true
        })
      }
      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          bind(child)
        }
      }
    }
    for (const child of this.model.children) {
      bind(child)
    }
  }


  /**
   * Sets arrow color
   *
   * @param {object} arrow - Arrow helper object
   * @param {number} color - Hex color value
   */
  setArrowColor(arrow, color) {
    arrow.traverse((child) => {
      if (child.material) {
        child.material.color.setHex(color)
      }
    })
  }


  /**
   * Sets the mouse position
   *
   * @param {MouseEvent} event
   */
  setMousePosition(event) {
    const rect = this.canvas.getBoundingClientRect()
    this.mouse.x = (((event.clientX - rect.left) / rect.width) * 2) - 1
    this.mouse.y = -(((event.clientY - rect.top) / rect.height) * 2) + 1
  }


  /**
   * Gets the intersects with the arrows
   *
   * @return {Array<object>} Intersection objects with the arrows (if any).
   */
  getIntersects() {
    const arrows = []
    this.planes.forEach((pd) => {
      arrows.push(pd.arrow)
    })
    return this.raycaster.intersectObjects(arrows, true)
  }


  /**
   * Mouse down handler - check if clicking on an arrow
   *
   * @param {MouseEvent} event
   */
  onMouseDown(event) {
    this.setMousePosition(event)
    this.raycaster.setFromCamera(this.mouse, this.viewer.context.getCamera())

    const intersects = this.getIntersects()
    if (intersects.length === 0) {
      return
    }
    for (const planeData of this.planes) {
      if (intersects[0].object === planeData.arrow ||
          intersects[0].object.parent === planeData.arrow) {
        this.draggingArrow = planeData
        this.setArrowColor(planeData.arrow, planeData.arrow.userData.highlightColor)
        const dragControls = this.viewer.context.getCameraControls()
        if (dragControls) {
          dragControls.enabled = false
        }
        debug().log('GlbClipper: Started dragging arrow for direction', planeData.direction)
        break
      }
    }
  }


  /**
   * Mouse move handler - update plane position if dragging
   *
   * @param {MouseEvent} event
   */
  onMouseMove(event) {
    this.setMousePosition(event)
    this.raycaster.setFromCamera(this.mouse, this.viewer.context.getCamera())

    if (!this.draggingArrow) {
      this._handleHover()
      return
    }

    // Drag path. Pre-allocated scratch (see constructor comment).
    this.viewer.context.getCamera().getWorldDirection(this._scratchCameraDir)
    this._scratchDragPlane.setFromNormalAndCoplanarPoint(this._scratchCameraDir, this.draggingArrow.point)

    // Ray.intersectPlane returns `target` on hit, `null` on miss
    // (ray parallel to plane). The result is the canonical hit-test;
    // do NOT trust `_scratchIntersection` truthiness — it's an
    // always-present scratch object.
    const hit = this.raycaster.ray.intersectPlane(this._scratchDragPlane, this._scratchIntersection)
    if (!hit) {
      return
    }

    this._scratchMovement.copy(this._scratchIntersection).sub(this.draggingArrow.point)
    const projectedMovement = this._scratchMovement.dot(this.draggingArrow.normal) * this.draggingArrow.normal.length()

    this._scratchNormalScaled.copy(this.draggingArrow.normal).multiplyScalar(projectedMovement)
    this._scratchNewPoint.copy(this.draggingArrow.point).add(this._scratchNormalScaled)

    this.draggingArrow.point.copy(this._scratchNewPoint)
    this.draggingArrow.plane.setFromNormalAndCoplanarPoint(
      this.draggingArrow.normal,
      this._scratchNewPoint,
    )
    this.draggingArrow.arrow.position.copy(this._scratchNewPoint)
    this.draggingArrow.offset += projectedMovement

    // No tree walk + no renderer rebind here — the plane object is
    // already bound to renderer.clippingPlanes and to each material's
    // clippingPlanes uniform. Mutation in place is picked up by the
    // next frame's render.
  }


  /**
   * Hover-only path inside onMouseMove. Updates the hover-highlight
   * arrow + cursor based on raycaster intersections.
   *
   * @private
   */
  _handleHover() {
    const intersects = this.getIntersects()

    // Reset previous hover when leaving the arrow.
    if (this.hoveredArrow && (!intersects.length ||
        (intersects[0].object !== this.hoveredArrow.arrow &&
         intersects[0].object.parent !== this.hoveredArrow.arrow))) {
      this.setArrowColor(this.hoveredArrow.arrow, this.hoveredArrow.arrow.userData.defaultColor)
      this.hoveredArrow = null
      this.canvas.style.cursor = 'default'
    }

    if (intersects.length === 0) {
      return
    }
    for (const planeData of this.planes) {
      if (intersects[0].object === planeData.arrow ||
          intersects[0].object.parent === planeData.arrow) {
        if (this.hoveredArrow !== planeData) {
          this.hoveredArrow = planeData
          this.setArrowColor(planeData.arrow, planeData.arrow.userData.highlightColor)
          this.canvas.style.cursor = 'pointer'
        }
        break
      }
    }
  }


  /**
   * Mouse up handler - stop dragging
   */
  onMouseUp() {
    if (!this.draggingArrow) {
      return
    }
    debug().log('GlbClipper: Stopped dragging arrow')
    this.setArrowColor(this.draggingArrow.arrow, this.draggingArrow.arrow.userData.defaultColor)
    this.draggingArrow = null
    const releaseControls = this.viewer.context.getCameraControls()
    if (releaseControls) {
      releaseControls.enabled = true
    }
  }


  /**
   * Cleanup - remove event listeners
   */
  dispose() {
    this.setInteractionEnabled(false)
    this.deleteAllPlanes()
  }
}


const DEFAULT_ARROW_SCALE = 5
const ARROW_SCALE_RATIO = 0.25
const MIN_ARROW_SCALE = 2
const MAX_ARROW_SCALE = 40
const ARROW_RENDER_ORDER = 999
const ARROW_COLOR_DEFAULT = 0x00ff00
const ARROW_COLOR_HIGHLIGHT = 0xffff00
