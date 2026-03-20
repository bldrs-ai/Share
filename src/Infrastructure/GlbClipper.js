import {Vector3, Plane, Raycaster, Vector2, Box3, Sphere} from 'three'
import debug from '../utils/debug'
import CutPlaneGizmo from './CutPlaneGizmo'


/**
 * Manages clipping planes with interactive drag controls for GLB models.
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
    this.planes = [] // Array of {plane, gizmo, direction, offset}
    this.draggingPlane = null
    this.hoveredPlane = null
    this.raycaster = new Raycaster()
    this.mouse = new Vector2()
    this.interactionEnabled = false
    this.modelBoundingSphere = this.computeModelBoundingSphere()

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

    const gizmoColor = 0xFF6B35
    const gizmoSize = this.computeGizmoSize()
    const gizmo = new CutPlaneGizmo(normal, gizmoSize, gizmoColor)
    gizmo.position.copy(point)
    gizmo.userData.isClippingControl = true
    gizmo.userData.planeData = {direction, offset}

    this.viewer.context.getScene().add(gizmo)

    // Store plane info
    const planeData = {
      plane,
      gizmo,
      direction,
      offset,
      normal: normal.clone(),
      point: point.clone(),
    }
    this.planes.push(planeData)

    // Update renderer clipping planes
    this.updateRendererPlanes()

    // Apply clipping to all materials
    this.applyClippingToMaterials()

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
   * Computes gizmo plane size based on model bounding sphere
   *
   * @return {number}
   */
  computeGizmoSize() {
    if (!this.modelBoundingSphere) {
      return 10
    }
    const radius = this.modelBoundingSphere.radius
    if (!radius || Number.isNaN(radius)) {
      return 10
    }
    return radius * 2.5
  }


  /**
   * Deletes all clipping planes and controls
   */
  deleteAllPlanes() {
    // Remove gizmos from scene
    this.planes.forEach((planeData) => {
      this.viewer.context.getScene().remove(planeData.gizmo)
    })

    this.planes = []
    this.updateRendererPlanes()
    this.clearMaterialClipping()

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
      this.draggingPlane = null
      this.hoveredPlane = null
      this.interactionEnabled = false
    }
  }


  /**
   * Updates the renderer's clipping planes array
   */
  updateRendererPlanes() {
    const renderer = this.viewer.context.renderer
    renderer.clippingPlanes = this.planes.map((pd) => pd.plane)
    renderer.localClippingEnabled = this.planes.length > 0
  }


  /**
   * Applies clipping planes to all materials in the model
   */
  applyClippingToMaterials() {
    if (!this.model) {
      return
    }

    const clippingPlanes = this.planes.map((pd) => pd.plane)

    const setClipping = (node) => {
      if (node.material) {
        const materials = Array.isArray(node.material) ? node.material : [node.material]
        materials.forEach((mat) => {
          mat.clippingPlanes = clippingPlanes
          mat.clipIntersection = false
          mat.needsUpdate = true
        })
      }

      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          setClipping(child)
        }
      }
    }

    for (const child of this.model.children) {
      setClipping(child)
    }
  }


  /**
   * Clears clipping from all materials
   */
  clearMaterialClipping() {
    if (!this.model) {
      return
    }

    const clearClipping = (node) => {
      if (node.material) {
        const materials = Array.isArray(node.material) ? node.material : [node.material]
        materials.forEach((mat) => {
          mat.clippingPlanes = null
          mat.needsUpdate = true
        })
      }

      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          clearClipping(child)
        }
      }
    }

    for (const child of this.model.children) {
      clearClipping(child)
    }
  }


  /**
   * Sets gizmo highlight state
   *
   * @param {object} gizmo - CutPlaneGizmo object
   * @param {boolean} highlighted - Whether gizmo is highlighted
   */
  setGizmoHighlight(gizmo, highlighted) {
    if (gizmo.setHighlight) {
      gizmo.setHighlight(highlighted)
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
    const gizmos = []
    this.planes.forEach((pd) => {
      gizmos.push(pd.gizmo)
    })
    return this.raycaster.intersectObjects(gizmos, true)
  }


  /**
   * Mouse down handler - check if clicking on an arrow
   *
   * @param {MouseEvent} event
   */
  onMouseDown(event) {
    this.setMousePosition(event)
    this.raycaster.setFromCamera(this.mouse, this.viewer.context.getCamera())

    // Check intersection with arrows
    const intersects = this.getIntersects()

    if (intersects.length > 0) {
      // Find which plane's gizmo was clicked
      for (const planeData of this.planes) {
        let obj = intersects[0].object
        while (obj) {
          if (obj === planeData.gizmo) {
            this.draggingPlane = planeData
            this.setGizmoHighlight(planeData.gizmo, true)

            // Disable orbit controls while dragging
            if (this.viewer.context.ifcCamera && this.viewer.context.ifcCamera.cameraControls) {
              this.viewer.context.ifcCamera.cameraControls.enabled = false
            }

            debug().log('GlbClipper: Started dragging plane for direction', planeData.direction)
            return
          }
          obj = obj.parent
        }
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

    // Handle hover highlighting when not dragging
    if (!this.draggingPlane) {
      const intersects = this.getIntersects()

      // Reset previous hover
      if (this.hoveredPlane) {
        let stillHovered = false
        if (intersects.length > 0) {
          let obj = intersects[0].object
          while (obj) {
            if (obj === this.hoveredPlane.gizmo) {
              stillHovered = true
              break
            }
            obj = obj.parent
          }
        }
        if (!stillHovered) {
          this.setGizmoHighlight(this.hoveredPlane.gizmo, false)
          this.hoveredPlane = null
          this.canvas.style.cursor = 'default'
        }
      }

      // Set new hover
      if (intersects.length > 0 && !this.hoveredPlane) {
        for (const planeData of this.planes) {
          let obj = intersects[0].object
          while (obj) {
            if (obj === planeData.gizmo) {
              this.hoveredPlane = planeData
              this.setGizmoHighlight(planeData.gizmo, true)
              this.canvas.style.cursor = 'grab'
              break
            }
            obj = obj.parent
          }
          if (this.hoveredPlane) break
        }
      }
      return
    }

    this.canvas.style.cursor = 'grabbing'

    // Create a plane perpendicular to camera and containing the gizmo
    const cameraDirection = new Vector3()
    this.viewer.context.getCamera().getWorldDirection(cameraDirection)
    const dragPlane = new Plane()
    dragPlane.setFromNormalAndCoplanarPoint(cameraDirection, this.draggingPlane.point)

    // Find intersection point
    const intersectionPoint = new Vector3()
    this.raycaster.ray.intersectPlane(dragPlane, intersectionPoint)

    if (intersectionPoint) {
      // Project movement onto the plane normal direction
      const movement = intersectionPoint.clone().sub(this.draggingPlane.point)
      const projectedMovement = movement.dot(this.draggingPlane.normal) * this.draggingPlane.normal.length()

      // Update plane position
      const newPoint = this.draggingPlane.point.clone().add(
        this.draggingPlane.normal.clone().multiplyScalar(projectedMovement),
      )

      this.draggingPlane.point.copy(newPoint)
      this.draggingPlane.plane.setFromNormalAndCoplanarPoint(
        this.draggingPlane.normal,
        newPoint,
      )

      // Update gizmo position
      this.draggingPlane.gizmo.position.copy(newPoint)

      // Update offset
      this.draggingPlane.offset += projectedMovement

      // Update rendering
      this.updateRendererPlanes()
      this.applyClippingToMaterials()
    }
  }


  /**
   * Mouse up handler - stop dragging
   */
  onMouseUp() {
    if (this.draggingPlane) {
      debug().log('GlbClipper: Stopped dragging plane')

      this.setGizmoHighlight(this.draggingPlane.gizmo, false)
      this.draggingPlane = null
      this.canvas.style.cursor = 'default'

      // Re-enable orbit controls
      if (this.viewer.context.ifcCamera && this.viewer.context.ifcCamera.cameraControls) {
        this.viewer.context.ifcCamera.cameraControls.enabled = true
      }
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


