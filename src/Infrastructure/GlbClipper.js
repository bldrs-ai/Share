import {Vector3, Plane, ArrowHelper, Raycaster, Vector2} from 'three'
import debug from '../utils/debug'

/**
 * GLB Clipper - Manages clipping planes with interactive drag controls for GLB models
 */
export class GlbClipper {
  constructor(viewer, model) {
    this.viewer = viewer
    this.model = model
    this.planes = [] // Array of {plane, arrow, direction, offset}
    this.draggingArrow = null
    this.raycaster = new Raycaster()
    this.mouse = new Vector2()
    
    // Bind event handlers
    this.onMouseDown = this.onMouseDown.bind(this)
    this.onMouseMove = this.onMouseMove.bind(this)
    this.onMouseUp = this.onMouseUp.bind(this)
    
    // Add event listeners
    const canvas = this.viewer.context.getDomElement()
    canvas.addEventListener('mousedown', this.onMouseDown)
    canvas.addEventListener('mousemove', this.onMouseMove)
    canvas.addEventListener('mouseup', this.onMouseUp)
  }

  /**
   * Creates a clipping plane with interactive arrow control
   * 
   * @param {Vector3} normal - Plane normal
   * @param {Vector3} point - Point on the plane
   * @param {string} direction - Axis direction ('x', 'y', or 'z')
   * @param {number} offset - Offset from model center
   */
  createPlane(normal, point, direction, offset) {
    const plane = new Plane()
    plane.setFromNormalAndCoplanarPoint(normal, point)
    
    // Create arrow helpers for visualization and interaction (both directions)
    const arrowLength = 2
    const arrowColor = 0x0066ff
    
    // Positive direction arrow
    const arrow1 = new ArrowHelper(normal, point, arrowLength, arrowColor, 0.5, 0.3)
    arrow1.userData.isClippingControl = true
    arrow1.userData.planeData = {direction, offset}
    
    // Negative direction arrow
    const arrow2 = new ArrowHelper(normal.clone().negate(), point, arrowLength, arrowColor, 0.5, 0.3)
    arrow2.userData.isClippingControl = true
    arrow2.userData.planeData = {direction, offset}
    
    // Make arrows always visible over geometry
    arrow1.traverse((child) => {
      if (child.material) {
        child.material.depthTest = false
        child.renderOrder = 999
      }
    })
    arrow2.traverse((child) => {
      if (child.material) {
        child.material.depthTest = false
        child.renderOrder = 999
      }
    })
    
    this.viewer.context.getScene().add(arrow1)
    this.viewer.context.getScene().add(arrow2)
    
    // Store plane info
    const planeData = {
      plane,
      arrow1,
      arrow2,
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
   * Deletes all clipping planes and controls
   */
  deleteAllPlanes() {
    // Remove arrows from scene
    this.planes.forEach((planeData) => {
      this.viewer.context.getScene().remove(planeData.arrow1)
      this.viewer.context.getScene().remove(planeData.arrow2)
    })
    
    this.planes = []
    this.updateRendererPlanes()
    this.clearMaterialClipping()
    
    debug().log('GlbClipper: Deleted all planes')
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
    if (!this.model) return
    
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
    if (!this.model) return
    
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
   * Mouse down handler - check if clicking on an arrow
   */
  onMouseDown(event) {
    const canvas = this.viewer.context.getDomElement()
    const rect = canvas.getBoundingClientRect()
    
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    
    this.raycaster.setFromCamera(this.mouse, this.viewer.context.getCamera())
    
    // Check intersection with arrows
    const arrows = []
    this.planes.forEach((pd) => {
      arrows.push(pd.arrow1, pd.arrow2)
    })
    const intersects = this.raycaster.intersectObjects(arrows, true)
    
    if (intersects.length > 0) {
      // Find which plane's arrow was clicked
      for (const planeData of this.planes) {
        if (intersects[0].object === planeData.arrow1 || 
            intersects[0].object.parent === planeData.arrow1 ||
            intersects[0].object === planeData.arrow2 || 
            intersects[0].object.parent === planeData.arrow2) {
          this.draggingArrow = planeData
          
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
   */
  onMouseMove(event) {
    if (!this.draggingArrow) return
    
    const canvas = this.viewer.context.getDomElement()
    const rect = canvas.getBoundingClientRect()
    
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    
    this.raycaster.setFromCamera(this.mouse, this.viewer.context.getCamera())
    
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
        this.draggingArrow.normal.clone().multiplyScalar(projectedMovement)
      )
      
      this.draggingArrow.point.copy(newPoint)
      this.draggingArrow.plane.setFromNormalAndCoplanarPoint(
        this.draggingArrow.normal,
        newPoint
      )
      
      // Update arrow positions
      this.draggingArrow.arrow1.position.copy(newPoint)
      this.draggingArrow.arrow2.position.copy(newPoint)
      
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
    const canvas = this.viewer.context.getDomElement()
    canvas.removeEventListener('mousedown', this.onMouseDown)
    canvas.removeEventListener('mousemove', this.onMouseMove)
    canvas.removeEventListener('mouseup', this.onMouseUp)
    
    this.deleteAllPlanes()
  }
}
