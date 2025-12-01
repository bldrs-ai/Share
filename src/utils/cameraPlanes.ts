import {
  Box3,
  Box3Helper,
  Color,
  MeshBasicMaterial,
  Mesh,
  Object3D,
  PerspectiveCamera,
  Scene,
  Sphere,
  SphereGeometry,
  Vector3,
} from 'three'
import { assertDefined } from './assert'


/**
 * Adaptively sets camera controls zoom limits (minDistance/maxDistance) based on model size.
 * Sets limits once when called - the camera controls library should respect these static limits.
 *
 * @param camera - Three.js PerspectiveCamera
 * @param cameraControls - Camera controls object (e.g., OrbitControls)
 * @param model - The loaded 3D model
 * @param scene - The three.js scene
 * @param minDistanceFactor - Minimum zoom distance as fraction of model size (default: 0.2)
 * @param maxDistanceFactor - Maximum zoom distance as multiple of model size (default: 2)
 */
export function adaptCameraZoomLimits(
  camera: PerspectiveCamera,
  cameraControls: CameraControls,
  model: ModelWithBoundingBox,
  scene: Scene,
  minDistanceFactor = 0.1,
  maxDistanceFactor = 10,
): void {
  assertDefined(camera, cameraControls, model, scene)

  cameraControls.dollyToCursor = false
  cameraControls.infinityDolly = false
  model.updateMatrixWorld(true)
  let boundingBox = getModelBoundingBox(model)
  if (!boundingBox) {
    throw new Error('Bounding box is not defined')
  }
  const size = new Vector3()
  boundingBox.getSize(size)

  // Calculate bounding sphere of model
  const bboxCenter = new Vector3()
  const bboxSize = new Vector3()
  const modelSize = size.length()
  boundingBox.getCenter(bboxCenter)
  boundingBox.getSize(bboxSize)
  const bsphereRadius = bboxSize.length() / 2
  const bsphere = new Sphere(bboxCenter, bsphereRadius)
  if (!Number.isFinite(bsphereRadius) || bsphereRadius <= 0) {
    throw new Error('Bounding sphere radius is invalid')
  }
  

  // create debug box
  const debugBox = new Box3Helper(boundingBox, new Color(0x00ff00))
  debugBox.position.copy(bboxCenter)
  scene.add(debugBox)
  // create debug sphere
  const debugSphere = new Mesh(new SphereGeometry(bsphereRadius, 32, 32), new MeshBasicMaterial({color: 0x00ff00, wireframe: true}))
  debugSphere.position.copy(bboxCenter)
  scene.add(debugSphere)
  /**/

  // Move camera to edge of bounding sphere
  cameraControls.fitToSphere(bsphere, false)

  if (typeof cameraControls.minDistance === 'undefined') {
    console.warn('cameraControls.minDistance is undefined')
  }
  cameraControls.minDistance = 1 // modelSize * minDistanceFactor
  if (typeof cameraControls.maxDistance === 'undefined') {
    console.warn('cameraControls.maxDistance is not defined')
  }
  cameraControls.maxDistance = modelSize * maxDistanceFactor
}


/**
 * Adaptively sets camera near/far planes based on model size.
 * Ensures the far plane is large enough to see the entire model when zoomed out.
 *
 * @param camera - Three.js PerspectiveCamera
 * @param model - The loaded 3D model
 * @param minNear - Minimum near plane distance (default: 0.001)
 * @param maxFar - Maximum far plane distance (default: 10000000)
 * @param paddingFactor - Multiplier for model size to ensure adequate zoom range (default: 1000)
 */
export function adaptCameraPlanes(
  camera: PerspectiveCamera,
  model: ModelWithBoundingBox,
  minNear = 0.1,
  maxFar = 1e5,
  paddingFactor = 1e3,
): void {
  assertDefined(camera, model)
  const boundingBox = getModelBoundingBox(model)
  if (!boundingBox) {
    throw new Error('Bounding box is not defined')
  }

  // Calculate model size (diagonal of bounding box)
  const size = new Vector3()
  boundingBox.getSize(size)
  const modelSize = size.length()

  // Set near plane: small enough to see close details, but not too small
  // Use a fraction of the model size, clamped to reasonable values
  // Ensure near plane is never zero or negative (prevents clipping when zoomed in very close)
  const minNearRatio = 0.001
  const calculatedNearPlane = modelSize * minNearRatio
  // Ensure near plane is at least a small fraction of model size to prevent clipping when very close
  const minNearPlane = Math.max(minNear, calculatedNearPlane)
  const nearPlane = Math.min(minNearPlane, 1)

  // Set far plane: large enough to see the entire model when zoomed out
  // Based on model size with padding, independent of camera position
  const farPlane = Math.min(
    maxFar,
    modelSize * paddingFactor,
  )

  // Only update if values have changed significantly (avoid unnecessary updates)
  const nearThreshold = 0.001
  const farThreshold = 1
  if (
    Math.abs(camera.near - nearPlane) > nearThreshold ||
    Math.abs(camera.far - farPlane) > farThreshold
  ) {
    camera.near = nearPlane
    camera.far = farPlane
    camera.updateProjectionMatrix()
  }
  console.log('nearPlane', nearPlane)
  console.log('farPlane', farPlane)
  console.log('camera.near', camera.near)
  console.log('camera.far', camera.far)
}


/**
 * Calculates the bounding box of a model, supporting both IFC and GLB formats.
 * Uses local bounding sphere for IFC models (size is constant regardless of position/rotation).
 * For other models, computes from object hierarchy.
 *
 * @param model - The 3D model object
 * @return The bounding box, or null if unable to compute
 */
function getModelBoundingBox(model: ModelWithBoundingBox | null | undefined): Box3 | null {
  if (!model) {
    return null
  }

  const box = new Box3()

  // IFC models have geometry.boundingBox (in local/model space)
  // Use local space - size is constant regardless of world transform
  if (model.geometry?.boundingBox) {
    box.copy(model.geometry.boundingBox)
  } else {
    // GLB and other models - compute from object hierarchy
    model.updateMatrixWorld(true)
    box.setFromObject(model)
  }

  if (box.isEmpty()) {
    return null
  }

  return box
}


/**
 * Camera controls interface with zoom distance limits.
 */
interface CameraControls {
  dampingFactor: number
  dollyToCursor: boolean
  draggingSmoothTime: number
  infinityDolly: boolean
  minDistance: number
  maxDistance: number
  smoothTime: number
  addEventListener: (event: string, callback: () => void) => void
  fitToBox: (box: Box3, animate: boolean) => void
  fitToSphere: (sphere: Sphere, animate: boolean) => void
}


/**
 * Model interface that may have geometry with bounding box.
 */
interface ModelWithBoundingBox extends Object3D {
  geometry?: {
    boundingBox?: Box3
  }
}
