import {Vector3, Plane, Raycaster, Vector2, Box3, Sphere} from 'three'
import debug from '../utils/debug'
import CutPlaneArrowHelper from './CutPlaneArrowHelper'


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
    this.planes = [] // Array of {plane, arrow, direction, offset}
    this.draggingArrow = null
    this.hoveredArrow = null
    this.raycaster = new Raycaster()
    this.mouse = new Vector2()
    this.interactionEnabled = false
    this.modelBoundingSphere = this.computeModelBoundingSphere()
    this.arrowScale = this.computeArrowScale()

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

    const arrowColor = 0x00ff00
    const arrowColorHighlight = 0xffff00

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
        child.renderOrder = 999
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
    // Remove arrows from scene
    this.planes.forEach((planeData) => {
      this.viewer.context.getScene().remove(planeData.arrow)
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
      this.draggingArrow = null
      this.hoveredArrow = null
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

    // Check intersection with arrows
    const intersects = this.getIntersects()

    if (intersects.length > 0) {
      // Find which plane's arrow was clicked
      for (const planeData of this.planes) {
        if (intersects[0].object === planeData.arrow ||
            intersects[0].object.parent === planeData.arrow) {
          this.draggingArrow = planeData

          // Highlight the selected arrow
          this.setArrowColor(planeData.arrow, planeData.arrow.userData.highlightColor)

          // Disable orbit controls while dragging
          if (this.viewer.context.ifcCamera && this.viewer.context.ifcCamera.cameraControls) {
            this.viewer.context.ifcCamera.cameraControls.enabled = false
          }

          debug().log('GlbClipper: Started dragging arrow for direction', planeData.direction)
          break
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
    if (!this.draggingArrow) {
      const intersects = this.getIntersects()

      // Reset previous hover
      if (this.hoveredArrow && (!intersects.length ||
          (intersects[0].object !== this.hoveredArrow.arrow &&
           intersects[0].object.parent !== this.hoveredArrow.arrow))) {
        this.setArrowColor(this.hoveredArrow.arrow, this.hoveredArrow.arrow.userData.defaultColor)
        this.hoveredArrow = null
        this.canvas.style.cursor = 'default'
      }

      // Set new hover
      if (intersects.length > 0) {
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
      return
    }

    // Create a plane perpendicular to camera and containing the arrow
    const cameraDirection = new Vector3()
    this.viewer.context.getCamera().getWorldDirection(cameraDirection)
    const dragPlane = new Plane()
    dragPlane.setFromNormalAndCoplanarPoint(cameraDirection, this.draggingArrow.point)

    // Find intersection point
    const intersectionPoint = new Vector3()
    this.raycaster.ray.intersectPlane(dragPlane, intersectionPoint)

    if (intersectionPoint) {
      // Project movement onto the plane normal direction
      const movement = intersectionPoint.clone().sub(this.draggingArrow.point)
      const projectedMovement = movement.dot(this.draggingArrow.normal) * this.draggingArrow.normal.length()

      // Update plane position
      const newPoint = this.draggingArrow.point.clone().add(
        this.draggingArrow.normal.clone().multiplyScalar(projectedMovement),
      )

      this.draggingArrow.point.copy(newPoint)
      this.draggingArrow.plane.setFromNormalAndCoplanarPoint(
        this.draggingArrow.normal,
        newPoint,
      )

      // Update arrow positions
      this.draggingArrow.arrow.position.copy(newPoint)

      // Update offset
      this.draggingArrow.offset += projectedMovement

      // Update rendering
      this.updateRendererPlanes()
      this.applyClippingToMaterials()
    }
  }


  /**
   * Mouse up handler - stop dragging
   */
  onMouseUp() {
    if (this.draggingArrow) {
      debug().log('GlbClipper: Stopped dragging arrow')

      // Reset arrow color to default (will be re-highlighted by hover if still over it)
      this.setArrowColor(this.draggingArrow.arrow, this.draggingArrow.arrow.userData.defaultColor)

      this.draggingArrow = null

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


const DEFAULT_ARROW_SCALE = 5
const ARROW_SCALE_RATIO = 0.25
const MIN_ARROW_SCALE = 2
const MAX_ARROW_SCALE = 40
