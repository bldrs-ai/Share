import {Vector3, Plane, Raycaster, Vector2, Box3, Sphere} from 'three'
import debug from '../utils/debug'
import CutPlaneGizmo from './CutPlaneGizmo'


/**
 * Unified clipping manager for all model types (IFC + GLB).
 *
 * For IFC: registers planes directly with viewer.clipper.context
 * and calls viewer.clipper.updateMaterials() — no IfcPlane objects,
 * no hidden controls, no dead code.
 *
 * For GLB: applies clipping via material.clippingPlanes.
 *
 * Visual: CutPlaneGizmo (translucent orange plane with border).
 */
export default class GlbClipper {
  constructor(viewer, model) {
    this.viewer = viewer
    this.canvas = viewer.context.getDomElement()
    this.model = model
    this.planes = []
    this.draggingPlane = null
    this.hoveredPlane = null
    this.raycaster = new Raycaster()
    this.mouse = new Vector2()
    this.interactionEnabled = false
    this.modelBoundingSphere = this.computeModelBoundingSphere()
    this.isIfcModel = !(viewer.IFC.type === 'glb' || viewer.IFC.type === 'gltf')

    this.onMouseDown = this.onMouseDown.bind(this)
    this.onMouseMove = this.onMouseMove.bind(this)
    this.onMouseUp = this.onMouseUp.bind(this)
  }


  /**
   * Creates a clipping plane with visual gizmo.
   *
   * @param {Vector3} normal
   * @param {Vector3} point
   * @param {string} direction - 'x', 'y', or 'z'
   * @param {number} offset
   * @return {object} planeData
   */
  createPlane(normal, point, direction, offset) {
    const plane = new Plane()
    plane.setFromNormalAndCoplanarPoint(normal, point)

    // Visual gizmo
    const gizmoSize = this.computeGizmoSize()
    const gizmo = new CutPlaneGizmo(normal, gizmoSize)
    gizmo.position.copy(point)
    this.viewer.context.getScene().add(gizmo)

    const planeData = {
      plane,
      gizmo,
      direction,
      offset,
      normal: normal.clone(),
      point: point.clone(),
    }
    this.planes.push(planeData)

    // Apply clipping via renderer + materials (works for all model types)
    this.updateRendererPlanes()
    this.applyClippingToMaterials()

    debug().log('GlbClipper: Created plane', direction)
    return planeData
  }


  deleteAllPlanes() {
    this.planes.forEach((pd) => {
      this.viewer.context.getScene().remove(pd.gizmo)
      if (pd.gizmo.dispose) pd.gizmo.dispose()
    })

    this.planes = []

    // Clear clipping on renderer + materials
    this.updateRendererPlanes()
    this.clearMaterialClipping()

    debug().log('GlbClipper: Deleted all planes')
  }


  computeModelBoundingSphere() {
    if (!this.model) return null
    const box = new Box3().setFromObject(this.model)
    if (box.isEmpty()) return null
    const sphere = new Sphere()
    box.getBoundingSphere(sphere)
    return sphere
  }


  computeGizmoSize() {
    if (!this.modelBoundingSphere) return 10
    const r = this.modelBoundingSphere.radius
    return (!r || Number.isNaN(r)) ? 10 : r * 2.5
  }


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


  // --- GLB clipping ---

  updateRendererPlanes() {
    const renderer = this.viewer.context.getRenderer()
    renderer.clippingPlanes = this.planes.map((pd) => pd.plane)
    renderer.localClippingEnabled = this.planes.length > 0
  }

  applyClippingToMaterials() {
    const scene = this.viewer.context.getScene()
    const clippingPlanes = this.planes.map((pd) => pd.plane)
    scene.traverse((node) => {
      if (node.material && !this.isGizmoChild(node)) {
        const mats = Array.isArray(node.material) ? node.material : [node.material]
        mats.forEach((mat) => {
          mat.clippingPlanes = clippingPlanes
          mat.clipIntersection = false
          mat.needsUpdate = true
        })
      }
    })
  }

  clearMaterialClipping() {
    const scene = this.viewer.context.getScene()
    scene.traverse((node) => {
      if (node.material) {
        const mats = Array.isArray(node.material) ? node.material : [node.material]
        mats.forEach((mat) => {
          mat.clippingPlanes = null
          mat.needsUpdate = true
        })
      }
    })
  }

  isGizmoChild(node) {
    let obj = node
    while (obj) {
      if (obj.name === 'CutPlaneGizmo') return true
      obj = obj.parent
    }
    return false
  }


  // --- Interaction ---

  setMousePosition(event) {
    const rect = this.canvas.getBoundingClientRect()
    this.mouse.x = (((event.clientX - rect.left) / rect.width) * 2) - 1
    this.mouse.y = -(((event.clientY - rect.top) / rect.height) * 2) + 1
  }

  getIntersects() {
    return this.raycaster.intersectObjects(
      this.planes.map((pd) => pd.gizmo), true,
    )
  }

  findPlaneForHit(obj) {
    for (const pd of this.planes) {
      let node = obj
      while (node) {
        if (node === pd.gizmo) return pd
        node = node.parent
      }
    }
    return null
  }


  onMouseDown(event) {
    this.setMousePosition(event)
    this.raycaster.setFromCamera(this.mouse, this.viewer.context.getCamera())
    const intersects = this.getIntersects()
    if (intersects.length > 0) {
      const pd = this.findPlaneForHit(intersects[0].object)
      if (pd) {
        this.draggingPlane = pd
        pd.gizmo.setHighlight(true)
        if (this.viewer.context.ifcCamera?.cameraControls) {
          this.viewer.context.ifcCamera.cameraControls.enabled = false
        }
      }
    }
  }


  onMouseMove(event) {
    this.setMousePosition(event)
    this.raycaster.setFromCamera(this.mouse, this.viewer.context.getCamera())

    if (!this.draggingPlane) {
      // Hover
      const intersects = this.getIntersects()
      if (this.hoveredPlane) {
        const still = intersects.length > 0 &&
          this.findPlaneForHit(intersects[0].object) === this.hoveredPlane
        if (!still) {
          this.hoveredPlane.gizmo.setHighlight(false)
          this.hoveredPlane = null
          this.canvas.style.cursor = 'default'
        }
      }
      if (intersects.length > 0 && !this.hoveredPlane) {
        const pd = this.findPlaneForHit(intersects[0].object)
        if (pd) {
          this.hoveredPlane = pd
          pd.gizmo.setHighlight(true)
          this.canvas.style.cursor = 'grab'
        }
      }
      return
    }

    // Drag
    this.canvas.style.cursor = 'grabbing'
    const cameraDir = new Vector3()
    this.viewer.context.getCamera().getWorldDirection(cameraDir)
    const dragPlane = new Plane()
    dragPlane.setFromNormalAndCoplanarPoint(cameraDir, this.draggingPlane.point)
    const hit = new Vector3()
    this.raycaster.ray.intersectPlane(dragPlane, hit)

    if (hit) {
      const movement = hit.clone().sub(this.draggingPlane.point)
      const proj = movement.dot(this.draggingPlane.normal)
      const newPoint = this.draggingPlane.point.clone().add(
        this.draggingPlane.normal.clone().multiplyScalar(proj),
      )

      this.draggingPlane.point.copy(newPoint)
      this.draggingPlane.plane.setFromNormalAndCoplanarPoint(
        this.draggingPlane.normal, newPoint,
      )
      this.draggingPlane.gizmo.position.copy(newPoint)
      this.draggingPlane.offset += proj

      this.updateRendererPlanes()
      this.applyClippingToMaterials()
    }
  }


  onMouseUp() {
    if (this.draggingPlane) {
      this.draggingPlane.gizmo.setHighlight(false)
      this.draggingPlane = null
      this.canvas.style.cursor = 'default'
      if (this.viewer.context.ifcCamera?.cameraControls) {
        this.viewer.context.ifcCamera.cameraControls.enabled = true
      }
    }
  }


  dispose() {
    this.setInteractionEnabled(false)
    this.deleteAllPlanes()
  }
}
