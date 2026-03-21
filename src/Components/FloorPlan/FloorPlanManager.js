import {Vector3, Box3, Plane, GridHelper} from 'three'
import debug from '../../utils/debug'


const DEFAULT_CUT_HEIGHT = 1.2
const CAMERA_HEIGHT_ABOVE = 50
const GRID_SIZE = 200
const GRID_DIVISIONS = 200


/**
 * Manages floor plan mode.
 *
 * Clipping uses viewer.clipper.context.addClippingPlane() directly —
 * the same Three.js clipping mechanism that GlbClipper uses for IFC,
 * but without creating visual gizmos.
 *
 * Camera uses cameraControls.setPosition/setTarget for top-down view.
 */
export default class FloorPlanManager {
  constructor(viewer, model) {
    this.viewer = viewer
    this.model = model
    this.savedCameraState = null
    this.bottomClipPlane = null
    this.topClipPlane = null
    this.grid = null
    this.active = false
    this.floors = null // cached after first extraction
  }


  /**
   * Extract storey info from the spatial structure.
   * Groups storeys by building for multi-building models.
   * Caches the result to avoid repeated getSpatialStructure calls.
   *
   * @return {Promise<Array<{expressId, globalId, name, elevation, nextElevation, buildingName}>>}
   */
  async getFloors() {
    // Return cached floors if available
    if (this.floors !== null) return this.floors

    try {
      const manager = this.viewer.IFC.loader.ifcManager
      const structure = await manager.getSpatialStructure(0, true)
      const root = Array.isArray(structure) ? structure[0] : structure
      if (!root) return []

      const buildings = []
      this.collectBuildings(root, buildings)

      // If no explicit buildings found, treat root as a single building
      if (buildings.length === 0) {
        buildings.push({name: 'Building', node: root})
      }

      const allStoreys = []
      for (const building of buildings) {
        const storeys = []
        this.collectStoreys(building.node, storeys)
        storeys.sort((a, b) => a.elevation - b.elevation)

        // Compute nextElevation from subsequent storey
        for (let i = 0; i < storeys.length; i++) {
          storeys[i].buildingName = building.name
          if (i < storeys.length - 1) {
            storeys[i].nextElevation = storeys[i + 1].elevation
          } else if (storeys.length >= 2) {
            // Use average storey height for top floor
            const avgHeight = (storeys[i].elevation - storeys[0].elevation) / i
            storeys[i].nextElevation = storeys[i].elevation + (avgHeight || 3000)
          } else {
            storeys[i].nextElevation = storeys[i].elevation + 3000
          }
        }

        allStoreys.push(...storeys)
      }

      // Final sort by elevation across all buildings
      allStoreys.sort((a, b) => a.elevation - b.elevation)

      // Detect unit scale: compare IFC elevation range to model's actual Y range.
      // IFC files may use mm (elev=3000) while viewer geometry is in meters (Y=3.0).
      const unitScale = this.detectUnitScale(allStoreys)
      if (unitScale !== 1) {
        for (const s of allStoreys) {
          s.elevation *= unitScale
          s.nextElevation *= unitScale
        }
      }

      this.floors = allStoreys
      debug().log('FloorPlanManager: Found', allStoreys.length, 'floors, unitScale=', unitScale)
      return allStoreys
    } catch (e) {
      debug().log('FloorPlanManager: Error getting floors:', e)
      this.floors = []
      return []
    }
  }


  /**
   * Enter floor plan mode for a specific floor.
   *
   * @param {object} floor - from getFloors()
   * @param {number} cutHeight - meters above floor for top clip
   */
  enterFloorPlan(floor, cutHeight = DEFAULT_CUT_HEIGHT) {
    if (this.active) {
      this.updateFloor(floor, cutHeight)
      return
    }

    const cameraControls = this.viewer.IFC.context.ifcCamera.cameraControls

    // Save current camera
    this.savedCameraState = {
      position: cameraControls.getPosition(),
      target: cameraControls.getTarget(),
    }

    // Apply section clipping
    this.setClipping(floor.elevation, cutHeight)

    // Add grid at floor level
    this.addGrid(floor.elevation)

    // Move camera above, looking down
    this.setCameraTopDown(floor.elevation)

    this.active = true
    debug().log('FloorPlanManager: Entered floor plan at', floor.name, 'elevation', floor.elevation)
  }


  updateFloor(floor, cutHeight = DEFAULT_CUT_HEIGHT) {
    if (!this.active) return
    this.setClipping(floor.elevation, cutHeight)
    if (this.grid) this.grid.position.y = floor.elevation + 0.01
    this.setCameraTopDown(floor.elevation)
  }


  updateCutHeight(floor, cutHeight) {
    if (!this.active) return
    this.setClipping(floor.elevation, cutHeight)
  }


  exitFloorPlan() {
    if (!this.active) return

    this.clearClipping()
    this.removeGrid()

    // Restore camera
    if (this.savedCameraState) {
      const cc = this.viewer.IFC.context.ifcCamera.cameraControls
      const p = this.savedCameraState.position
      const t = this.savedCameraState.target
      cc.setPosition(p.x, p.y, p.z, true)
      cc.setTarget(t.x, t.y, t.z, true)
      this.savedCameraState = null
    }

    this.active = false
    debug().log('FloorPlanManager: Exited')
  }


  // --- Clipping ---
  //
  // Direct approach: set clipping planes on the WebGL renderer AND
  // on every material in the scene. This bypasses the IFC clipper
  // context entirely, avoiding all its quirks with add/remove/indexOf.
  //
  // Three.js Plane(normal, constant): plane equation is  normal·p + constant = 0
  //   Bottom (normal UP):   keeps y >= elevation     →  constant = -elevation
  //   Top    (normal DOWN): keeps y <= elevation+cut  →  constant = elevation+cutHeight

  setClipping(elevation, cutHeight) {
    if (!this.bottomClipPlane) {
      this.bottomClipPlane = new Plane(new Vector3(0, 1, 0), -elevation)
      this.topClipPlane = new Plane(new Vector3(0, -1, 0), elevation + cutHeight)
    } else {
      this.bottomClipPlane.constant = -elevation
      this.topClipPlane.constant = elevation + cutHeight
    }

    const planes = [this.bottomClipPlane, this.topClipPlane]

    // Set on renderer
    const renderer = this.viewer.context.getRenderer()
    renderer.clippingPlanes = planes
    renderer.localClippingEnabled = true

    // Set on all materials in the scene (required for IFC models)
    const scene = this.viewer.context.getScene()
    scene.traverse((node) => {
      if (node.material) {
        const mats = Array.isArray(node.material) ? node.material : [node.material]
        mats.forEach((mat) => {
          mat.clippingPlanes = planes
          mat.needsUpdate = true
        })
      }
    })

    // Log for debugging
    const box = new Box3().setFromObject(this.model)
    debug().log(
      'FloorPlan clip: Y', elevation.toFixed(2), '→', (elevation + cutHeight).toFixed(2),
      '| model Y:', box.min.y.toFixed(2), '→', box.max.y.toFixed(2),
    )
  }

  clearClipping() {
    // Clear renderer
    try {
      const renderer = this.viewer.context.getRenderer()
      renderer.clippingPlanes = []
      renderer.localClippingEnabled = false
    } catch (_) { /* ignore */ }

    // Clear all materials
    try {
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
    } catch (_) { /* ignore */ }

    this.bottomClipPlane = null
    this.topClipPlane = null
  }


  // --- Camera ---

  setCameraTopDown(elevation) {
    const box = new Box3().setFromObject(this.model)
    const center = new Vector3()
    box.getCenter(center)

    const cc = this.viewer.IFC.context.ifcCamera.cameraControls
    cc.setPosition(center.x, elevation + CAMERA_HEIGHT_ABOVE, center.z, true)
    cc.setTarget(center.x, elevation, center.z, true)
  }


  // --- Grid ---

  addGrid(elevation) {
    this.removeGrid()
    this.grid = new GridHelper(GRID_SIZE, GRID_DIVISIONS, 0x444444, 0x2a2a2a)
    this.grid.position.y = elevation + 0.01
    this.grid.material.transparent = true
    this.grid.material.opacity = 0.3
    this.grid.name = 'FloorPlanGrid'
    this.viewer.context.getScene().add(this.grid)
  }

  removeGrid() {
    if (this.grid) {
      this.viewer.context.getScene().remove(this.grid)
      this.grid = null
    }
  }


  dispose() {
    if (this.active) this.exitFloorPlan()
  }


  /**
   * Detect the unit scale between IFC elevation values and the viewer's
   * coordinate system. IFC files may use mm, cm, or m for elevation.
   * The viewer geometry is always in meters (Conway converts on load).
   *
   * Compares the IFC elevation range to the model's Y bounding box range.
   * Returns a multiplier to convert IFC elevations to viewer Y coords.
   */
  detectUnitScale(storeys) {
    if (storeys.length < 2) return 1

    try {
      const box = new Box3().setFromObject(this.model)
      if (!box || !box.max || !box.min) return 1
      var modelHeight = box.max.y - box.min.y
    } catch (_) {
      return 1
    }
    if (!modelHeight || modelHeight <= 0 || !isFinite(modelHeight)) return 1

    const ifcElevRange = storeys[storeys.length - 1].elevation - storeys[0].elevation
    if (ifcElevRange <= 0) return 1

    const ratio = ifcElevRange / modelHeight
    debug().log('FloorPlanManager: unitScale detection — ifcRange:', ifcElevRange,
      'modelHeight:', modelHeight.toFixed(2), 'ratio:', ratio.toFixed(1))

    // If IFC elevations are ~1000x the model height → millimeters
    if (ratio > 500) return 0.001
    // If ~100x → centimeters
    if (ratio > 50) return 0.01
    // If ~10x → decimeters (rare)
    if (ratio > 5) return 0.1
    // Otherwise assume same units (meters)
    return 1
  }


  // --- Spatial structure traversal ---

  /** @private Find IfcBuilding nodes */
  collectBuildings(node, out) {
    if (node.type === 'IFCBUILDING') {
      out.push({
        name: unwrapIfcValue(node.Name) || unwrapIfcValue(node.LongName) || 'Building',
        node,
      })
      return // Don't recurse into building — storeys are direct children
    }
    if (node.children) {
      for (const child of node.children) {
        this.collectBuildings(child, out)
      }
    }
  }

  /** @private Find IfcBuildingStorey nodes (only direct children of building) */
  collectStoreys(node, out) {
    if (node.type === 'IFCBUILDINGSTOREY') {
      out.push({
        expressId: node.expressID,
        globalId: String(unwrapIfcValue(node.GlobalId) || `storey-${node.expressID}`),
        name: String(unwrapIfcValue(node.Name) || unwrapIfcValue(node.LongName) || `Level ${out.length + 1}`),
        elevation: Number(unwrapIfcValue(node.properties?.Elevation) ?? unwrapIfcValue(node.Elevation) ?? 0),
      })
      return // Don't recurse into storey children
    }
    if (node.children) {
      for (const child of node.children) {
        this.collectStoreys(child, out)
      }
    }
  }
}


function unwrapIfcValue(v) {
  if (v === null || v === undefined) return v
  if (typeof v === 'object' && 'value' in v) return v.value
  return v
}
