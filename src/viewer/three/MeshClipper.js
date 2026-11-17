import {Vector3, Plane, Raycaster, Vector2, Box3, Sphere, Matrix3} from 'three'
import {getMeshMaterials} from '../ShareModel'
import debug from '../../utils/debug'
import CutPlaneArrowHelper from './CutPlaneArrowHelper'
import {TOUCH_FADE_FLOOR, TOUCH_GRAB_PX, distanceWithin, fadeOpacity, screenAxis} from './arrowFade'
import {requestControlsPaint} from './hoverOverlay'
import {requestPaint} from './renderDemand'


/**
 * Manages clipping planes with interactive drag controls for any
 * mesh-based model — IFC, GLB/GLTF, STL, OBJ, etc. Renamed from
 * `GlbClipper` in slice 5d.2 of design/new/viewer-replacement.md when
 * it became the sole in-repo clipper, taking over the IFC path the
 * fork's `IfcClipper` used to drive. The implementation is format-
 * agnostic: clipping is applied by binding the renderer's clipping-
 * plane array onto every material under the model, which works
 * regardless of how the geometry was produced.
 *
 * Model-shape note: the model root may be a single `Mesh` (Conway-
 * direct cache-miss IFC — one Mesh, array material) or a `Group` of
 * child Meshes (cache-hit GLB — one Mesh per material group). The
 * material binding (`_bindClippingPlanesToMaterials`) walks from the
 * root inclusive, so both shapes are covered.
 *
 * The Q/W keyboard shortcuts (`createPlaneAtCursor` / `deletePlaneAtCursor`)
 * carry over the fork `IfcClipper`'s cursor-driven plane authoring:
 * Q raycasts the model under the pointer and drops a plane on the hit
 * face; W raycasts the existing plane arrows and removes the one under
 * the pointer.
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
export default class MeshClipper {
  /**
   * @param {object} viewer - The viewer instance
   * @param {object} model - The 3D model to apply clipping to
   * @param {object} [options]
   * @param {Function} [options.onPlaneMoved] called on every drag move of an
   *   arrow, after the plane has moved (Clipper#onPlaneMoved)
   */
  constructor(viewer, model, {onPlaneMoved = null} = {}) {
    this.viewer = viewer
    this.onPlaneMoved = onPlaneMoved
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

    // Where the pointer last was, for the arrows' fade (arrowFade.js):
    // `{x, y, floor}` in page coordinates, or null before it has moved over
    // the canvas, when the arrows stay opaque.
    this._fadePointer = null
    // The pointer dragging an arrow, so a second touch (a pinch) can't move
    // or release it; null for a mouse event without one (tests).
    this._dragPointerId = null

    // Bind event handlers
    this.onMouseDown = this.onMouseDown.bind(this)
    this.onMouseMove = this.onMouseMove.bind(this)
    this.onMouseUp = this.onMouseUp.bind(this)
    this.onPointerFade = this.onPointerFade.bind(this)
    this._applyFade = this._applyFade.bind(this)
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

    // Make arrow always visible over geometry. Transparent from the start,
    // so its fade (arrowFade.js) changes only `opacity`, which needs no new
    // program; no depth write, so a faded arrow leaves the depth buffer as
    // the model left it. The hover overlay draws it after the hover
    // (hoverOverlay.js#isDrawnOverHover).
    arrow.traverse((child) => {
      if (child.material) {
        child.material.depthTest = false
        child.material.depthWrite = false
        child.material.transparent = true
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

    debug().log('MeshClipper: Created plane', planeData)
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
   * Computes the arrow scale as a pure fraction of the model radius.
   *
   * The fraction is the whole rule, and it must not be clamped to
   * absolute world units. conway emits true-scale geometry, so a
   * millimetre part and a building are ~1e5 apart in radius; the
   * absolute [2, 40] clamp this replaced pinned a true-scale gear's
   * arrow at 2 world units against a 0.0033m part, i.e. ~600x the
   * model. Arrows draw `depthTest: false` at ARROW_RENDER_ORDER, so an
   * oversized one doesn't merely look wrong — it paints over the model
   * entirely. Same bug class as the #1742 camera near plane.
   *
   * DEFAULT_ARROW_SCALE is reserved for a model that yields no usable
   * radius, where there is no model scale to be a fraction of.
   *
   * @return {number}
   */
  computeArrowScale() {
    const radius = this.modelBoundingSphere?.radius
    // Covers a null sphere plus 0 / NaN / Infinity radius — every case
    // where the model carries no scale to derive from.
    if (!radius || !Number.isFinite(radius)) {
      return DEFAULT_ARROW_SCALE
    }
    return radius * ARROW_SCALE_RATIO
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

    debug().log('MeshClipper: Deleted all planes')
  }


  /**
   * Remove a single clipping plane — its arrow from the scene and its
   * `Plane` from the bound array. Re-syncs material bindings so the
   * shader variant matches the new (lower) plane count.
   *
   * @param {object} planeData an entry from `this.planes`.
   */
  deletePlane(planeData) {
    const index = this.planes.indexOf(planeData)
    if (index === -1) {
      return
    }
    this.viewer.context.getScene().remove(planeData.arrow)
    this.planes.splice(index, 1)
    const planeIndex = this._clippingPlanes.indexOf(planeData.plane)
    if (planeIndex !== -1) {
      this._clippingPlanes.splice(planeIndex, 1)
    }
    this._syncClippingBindings()
    debug().log('MeshClipper: Deleted plane', planeData)
  }


  /**
   * Create a clipping plane on the model face under the pointer (Q key).
   *
   * Carries over the fork `IfcClipper`'s cursor-driven authoring:
   * raycast the loaded model with the current pointer, take the hit
   * point + face normal (transformed to world space), and drop a plane
   * there. The normal is negated so the kept half-space is the side the
   * camera looks from — the same convention the fork used. Interaction
   * is enabled so the new plane's arrow is immediately draggable (the
   * Q shortcut, unlike the cut-plane menu, doesn't call
   * `setInteractionEnabled` itself).
   *
   * No-op when the pointer isn't over the model.
   *
   * @return {object|null} the created plane data, or null on a miss.
   */
  createPlaneAtCursor() {
    const hit = this.viewer.context.castRayIfc()
    if (!hit || !hit.point || !hit.face) {
      return null
    }
    // Face normal is in the hit object's local space; bring it to world
    // via the object's normal matrix before building the plane.
    const normalMatrix = new Matrix3().getNormalMatrix(hit.object.matrixWorld)
    const worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize().negate()
    const planeData = this.createPlane(worldNormal, hit.point.clone())
    this.setInteractionEnabled(true)
    return planeData
  }


  /**
   * Delete the clipping plane whose arrow is under the pointer (W key).
   *
   * Raycasts the existing plane arrows using the current pointer (the
   * shared context raycaster tracks the live cursor position) and
   * removes the matching plane. No-op when no arrow is under the pointer.
   */
  deletePlaneAtCursor() {
    if (this.planes.length === 0) {
      return
    }
    const arrows = this.planes.map((pd) => pd.arrow)
    const hits = this.viewer.context.castRay(arrows)
    if (!hits || hits.length === 0) {
      return
    }
    const hitObject = hits[0].object
    const planeData = this.planes.find((pd) => isSelfOrDescendant(hitObject, pd.arrow))
    if (planeData) {
      this.deletePlane(planeData)
    }
  }


  /**
   * Enables or disables user interaction controls for clipping arrows
   *
   * @param {boolean} enabled
   */
  setInteractionEnabled(enabled) {
    // Pointer events, not mouse events: a touch sends no mousemove, and
    // camera-controls' pointerdown handler suppresses the compatibility
    // mousedown, so on a phone the arrow was never grabbed (owner on #2171).
    if (enabled && !this.interactionEnabled) {
      this.canvas.addEventListener('pointerdown', this.onMouseDown)
      this.canvas.addEventListener('pointermove', this.onMouseMove)
      this.canvas.addEventListener('pointerup', this.onMouseUp)
      // The fade: pointer events, so a touch counts too (arrowFade.js).
      this.canvas.addEventListener('pointermove', this.onPointerFade)
      this.canvas.addEventListener('pointerdown', this.onPointerFade)
      // A camera move shifts the arrows under a still pointer (a wheel zoom,
      // camera-controls' damping after a release).
      this.viewer.context.getCameraControls?.()?.addEventListener?.('update', this._applyFade)
      this.interactionEnabled = true
    } else if (!enabled && this.interactionEnabled) {
      this.canvas.removeEventListener('pointerdown', this.onMouseDown)
      this.canvas.removeEventListener('pointermove', this.onMouseMove)
      this.canvas.removeEventListener('pointerup', this.onMouseUp)
      this.canvas.removeEventListener('pointermove', this.onPointerFade)
      this.canvas.removeEventListener('pointerdown', this.onPointerFade)
      this.viewer.context.getCameraControls?.()?.removeEventListener?.('update', this._applyFade)
      // Nothing tracks the pointer now: leave every arrow opaque.
      this._fadePointer = null
      this._applyFade()
      this.canvas.style.cursor = 'default'
      if (this.draggingArrow) {
        this.draggingArrow.arrow.userData.isDragging = false
      }
      window.removeEventListener('pointerup', this.onMouseUp)
      window.removeEventListener('pointercancel', this.onMouseUp)
      this._dragPointerId = null
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
    // Bind from the root inclusive: a Conway-direct cache-miss IFC model
    // is a single Mesh that carries the material on the root itself
    // (no child meshes), while a cache-hit GLB is a Group whose child
    // Meshes hold the materials. `bind(root)` covers both — it binds the
    // root's own materials, then recurses into any children.
    bind(this.model)
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
    // A colour is no change the render-on-demand hooks see. Only the arrow's
    // look changed, so with the hover overlay drawing the arrows this is an
    // overlay paint (hoverOverlay.js#requestControlsPaint).
    requestControlsPaint()
  }


  /**
   * Pointer moved or pressed over the canvas: fade the arrows by how far it
   * is from each (arrowFade.js).
   *
   * @param {PointerEvent} event
   */
  onPointerFade(event) {
    this._fadePointer = {
      x: event.clientX,
      y: event.clientY,
      floor: event.pointerType === 'touch' ? TOUCH_FADE_FLOOR : 0,
    }
    this._applyFade()
  }


  /**
   * Set each arrow's opacity from the last pointer position: opaque with no
   * pointer yet, and while dragged (the pointer can run ahead of the arrow).
   * Asks for a paint only when an opacity changed (it moves in steps,
   * arrowFade.js#FADE_STEPS).
   *
   * @private
   */
  _applyFade() {
    const pointer = this._fadePointer
    const canvasRect = pointer === null ? null : this.canvas.getBoundingClientRect()
    const camera = pointer === null ? null : this.viewer.context.getCamera()
    let isChanged = false
    for (const planeData of this.planes) {
      const material = planeData.arrow.material
      if (!material) {
        continue
      }
      const opacity = pointer === null || planeData === this.draggingArrow ? 1 :
        fadeOpacity(pointer, screenAxis(planeData.arrow, camera, canvasRect), canvasRect, pointer.floor)
      if (material.opacity !== opacity) {
        material.opacity = opacity
        isChanged = true
      }
    }
    if (isChanged) {
      requestControlsPaint()
    }
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
   * Pointer down handler - check if pressing on an arrow
   *
   * @param {PointerEvent} event
   */
  onMouseDown(event) {
    // The primary button, or any touch; a second finger while one drags
    // is left to the camera's pinch.
    if ((event.button !== undefined && event.button !== 0) || this.draggingArrow) {
      return
    }
    this.setMousePosition(event)
    this.raycaster.setFromCamera(this.mouse, this.viewer.context.getCamera())

    const planeData = this._arrowUnder(event)
    if (planeData === null) {
      return
    }
    this.draggingArrow = planeData
    // Only this pointer moves the arrow: a second touch is a pinch.
    this._dragPointerId = event.pointerId ?? null
    // Picks see this (pickControls.js): while the arrow is dragged, no
    // hover or click lands on the model, wherever the pointer gets to.
    // Re-run the hover pick now so a highlight from before the press
    // comes off rather than fighting the gizmo for the whole drag (hover
    // picks pause while a button is down, Containers/viewer.js).
    planeData.arrow.userData.isDragging = true
    this.viewer.highlightIfcItem?.()
    // The release can land anywhere, a panel or outside the window, not
    // only on the canvas the other listeners are on. Missing it would
    // leave the flag set, and every pick on the model blocked, until the
    // next pointerup on the canvas (review of #2171).
    window.addEventListener('pointerup', this.onMouseUp)
    window.addEventListener('pointercancel', this.onMouseUp)
    this.setArrowColor(planeData.arrow, planeData.arrow.userData.highlightColor)
    // camera-controls saw this press first (its listener is older) and
    // started an orbit; disabling it cancels that (camera-controls#cancel).
    const dragControls = this.viewer.context.getCameraControls()
    if (dragControls) {
      dragControls.enabled = false
    }
    this._applyFade()
    debug().log('MeshClipper: Started dragging arrow for direction', planeData.direction)
  }


  /**
   * The arrow a press lands on: the one the ray hits, or for a touch, which
   * is wider than the shaft, the nearest one whose axis is within
   * TOUCH_GRAB_PX on screen (arrowFade.js). The raycaster is already set
   * from the event.
   *
   * @param {PointerEvent} event
   * @return {object|null} the plane's entry in `this.planes`
   * @private
   */
  _arrowUnder(event) {
    const intersects = this.getIntersects()
    if (intersects.length > 0) {
      const hit = this.planes.find((planeData) => isSelfOrDescendant(intersects[0].object, planeData.arrow))
      if (hit) {
        return hit
      }
    }
    if (event.pointerType !== 'touch') {
      return null
    }
    const canvasRect = this.canvas.getBoundingClientRect()
    const camera = this.viewer.context.getCamera()
    const touch = {x: event.clientX, y: event.clientY}
    let nearest = null
    let nearestDistance = Infinity
    for (const planeData of this.planes) {
      const distance = distanceWithin(touch, screenAxis(planeData.arrow, camera, canvasRect), TOUCH_GRAB_PX)
      if (distance < nearestDistance) {
        nearest = planeData
        nearestDistance = distance
      }
    }
    return nearest
  }


  /**
   * Pointer move handler - update plane position if dragging
   *
   * @param {PointerEvent} event
   */
  onMouseMove(event) {
    if (this.draggingArrow && event.pointerId !== undefined && this._dragPointerId !== null &&
        event.pointerId !== this._dragPointerId) {
      return
    }
    this.setMousePosition(event)
    this.raycaster.setFromCamera(this.mouse, this.viewer.context.getCamera())

    if (!this.draggingArrow) {
      // A touch has no hover: its moves are orbits and pinches.
      if (event.pointerType !== 'touch') {
        this._handleHover()
      }
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
    //
    // That render has to be asked for. The scene probe sees the plane's
    // `constant` move (renderDemandHooks.js#createSceneProbe), but a drag is
    // the one pointer move here with camera-controls off and, with the hover
    // overlay on, no settle window behind it (attachSessionNets), so ask
    // directly rather than lean on the probe alone: a drag that showed
    // nothing until the release is what #2171's owner hit.
    requestPaint()
    // The permalink follows the plane (CutPlaneMenu debounces this).
    this.onPlaneMoved?.()
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
   * Pointer up (or cancelled) handler - stop dragging
   *
   * @param {PointerEvent} [event] absent when called directly
   */
  onMouseUp(event) {
    if (this.draggingArrow && event?.pointerId !== undefined && this._dragPointerId !== null &&
        event.pointerId !== this._dragPointerId) {
      return
    }
    window.removeEventListener('pointerup', this.onMouseUp)
    window.removeEventListener('pointercancel', this.onMouseUp)
    this._dragPointerId = null
    if (!this.draggingArrow) {
      return
    }
    debug().log('MeshClipper: Stopped dragging arrow')
    this.draggingArrow.arrow.userData.isDragging = false
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


// Only used when the model yields no usable radius; every other case
// derives from the model, so there are deliberately no absolute
// min/max companions here. See computeArrowScale.
const DEFAULT_ARROW_SCALE = 5
const ARROW_SCALE_RATIO = 0.25
const ARROW_RENDER_ORDER = 999
// Cut-plane arrow colors. Blue is deliberate (not a theme color): the
// arrows must read against the model, and green arrows washed out on
// green models — the Bldrs logo is a common test case. This restores
// the high-contrast blue + large heads of the pre-5d.2 fork clipper's
// gizmo. Highlight stays yellow (hover), which reads on both.
const ARROW_COLOR_DEFAULT = 0x0000ff
const ARROW_COLOR_HIGHLIGHT = 0xffff00


/**
 * Walk an Object3D's ancestor chain to test membership under `ancestor`.
 * A recursive raycast against an arrow returns the hit on one of the
 * arrow's child meshes (shaft / head / tail), so mapping a hit back to
 * its arrow means checking self-or-ancestor rather than identity.
 *
 * @param {object} obj the raycast hit object.
 * @param {object} ancestor the arrow Group to test against.
 * @return {boolean}
 */
function isSelfOrDescendant(obj, ancestor) {
  let cursor = obj
  while (cursor) {
    if (cursor === ancestor) {
      return true
    }
    cursor = cursor.parent
  }
  return false
}
