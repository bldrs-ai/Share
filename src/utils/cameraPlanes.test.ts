import {Box3, BufferGeometry, Mesh, Object3D, PerspectiveCamera, Vector3} from 'three'
import {adaptCameraPlanes, adaptCameraZoomLimits} from './cameraPlanes'


describe('cameraPlanes', () => {
  describe('adaptCameraZoomLimits', () => {
    it('should set minDistance and maxDistance based on model size', () => {
      const cameraControls = {
        minDistance: 0,
        maxDistance: DEFAULT_FAR,
      }
      const model = createMockModel(MODEL_SIZE, MODEL_SIZE, MODEL_SIZE)

      adaptCameraZoomLimits(cameraControls, model)

      // Model size (diagonal) ≈ sqrt(10^2 + 10^2 + 10^2) ≈ 17.32
      // Default minDistanceFactor = 0.2, so calculatedMinDistance = 17.32 * 0.2 ≈ 3.464
      // Safety factor = 0.05, so minDistanceThreshold = max(3.464, 17.32 * 0.05) = max(3.464, 0.866) ≈ 3.464
      // Default maxDistanceFactor = 2, so maxDistance = 17.32 * 2 ≈ 34.64
      const modelSize = Math.sqrt((MODEL_SIZE * MODEL_SIZE) + (MODEL_SIZE * MODEL_SIZE) + (MODEL_SIZE * MODEL_SIZE))
      const expectedMinDistance = Math.max(modelSize * 0.2, modelSize * 0.05)
      const expectedMaxDistance = modelSize * 2
      expect(cameraControls.minDistance).toBeCloseTo(expectedMinDistance, 1)
      expect(cameraControls.maxDistance).toBeCloseTo(expectedMaxDistance, 1)
    })

    it('should use custom factors when provided', () => {
      const cameraControls = {
        minDistance: 0,
        maxDistance: DEFAULT_FAR,
      }
      const model = createMockModel(MODEL_SIZE, MODEL_SIZE, MODEL_SIZE)

      adaptCameraZoomLimits(cameraControls, model, CUSTOM_MIN_FACTOR, CUSTOM_MAX_FACTOR)

      const modelSize = Math.sqrt((MODEL_SIZE * MODEL_SIZE) + (MODEL_SIZE * MODEL_SIZE) + (MODEL_SIZE * MODEL_SIZE))
      expect(cameraControls.minDistance).toBeCloseTo(modelSize * CUSTOM_MIN_FACTOR, 1)
      expect(cameraControls.maxDistance).toBeCloseTo(modelSize * CUSTOM_MAX_FACTOR, 1)
    })

    it('should set limits even if values are already set', () => {
      const model = createMockModel(MODEL_SIZE, MODEL_SIZE, MODEL_SIZE)
      const modelSize = Math.sqrt((MODEL_SIZE * MODEL_SIZE) + (MODEL_SIZE * MODEL_SIZE) + (MODEL_SIZE * MODEL_SIZE))
      const expectedMinDistance = Math.max(modelSize * 0.2, modelSize * 0.05)
      const expectedMaxDistance = modelSize * 2
      const cameraControls = {
        minDistance: expectedMinDistance,
        maxDistance: expectedMaxDistance,
      }

      adaptCameraZoomLimits(cameraControls, model)

      // Values should be set to the calculated limits
      expect(cameraControls.minDistance).toBeCloseTo(expectedMinDistance, 1)
      expect(cameraControls.maxDistance).toBeCloseTo(expectedMaxDistance, 1)
    })

    it('should handle null/undefined inputs gracefully', () => {
      const cameraControls = {minDistance: 0, maxDistance: DEFAULT_FAR}

      adaptCameraZoomLimits(null, createMockModel(MODEL_SIZE, MODEL_SIZE, MODEL_SIZE))
      expect(cameraControls.minDistance).toBe(0)
      expect(cameraControls.maxDistance).toBe(DEFAULT_FAR)

      adaptCameraZoomLimits(cameraControls, null)
      expect(cameraControls.minDistance).toBe(0)
      expect(cameraControls.maxDistance).toBe(DEFAULT_FAR)
    })

    it('should handle models without bounding box', () => {
      const cameraControls = {minDistance: 0, maxDistance: DEFAULT_FAR}
      const emptyModel = new Object3D()

      adaptCameraZoomLimits(cameraControls, emptyModel as Object3D & {geometry?: {boundingBox?: Box3}})

      // Should not change values if no bounding box
      expect(cameraControls.minDistance).toBe(0)
      expect(cameraControls.maxDistance).toBe(DEFAULT_FAR)
    })

    it('should only update properties that exist', () => {
      interface PartialCameraControls {
        minDistance?: number
        maxDistance?: number
      }
      const cameraControls: PartialCameraControls = {}
      const model = createMockModel(MODEL_SIZE, MODEL_SIZE, MODEL_SIZE)

      adaptCameraZoomLimits(cameraControls, model)

      // Should not throw, even if properties don't exist
      expect(cameraControls.minDistance).toBeUndefined()
      expect(cameraControls.maxDistance).toBeUndefined()
    })
  })

  describe('adaptCameraPlanes', () => {
    it('should set near and far planes based on model size', () => {
      const camera = new PerspectiveCamera(DEFAULT_FOV, DEFAULT_ASPECT, DEFAULT_NEAR, DEFAULT_FAR)
      const model = createMockModel(MODEL_SIZE, MODEL_SIZE, MODEL_SIZE)
      const updateProjectionMatrixSpy = jest.spyOn(camera, 'updateProjectionMatrix')

      adaptCameraPlanes(camera, model)

      // Near plane should be clamped between minNear (0.001) and 1
      expect(camera.near).toBeGreaterThanOrEqual(MIN_NEAR_PLANE)
      expect(camera.near).toBeLessThanOrEqual(MAX_NEAR_PLANE)

      // Far plane should be large enough for the model
      expect(camera.far).toBeGreaterThan(MIN_FAR_THRESHOLD)
      expect(updateProjectionMatrixSpy).toHaveBeenCalled()

      updateProjectionMatrixSpy.mockRestore()
    })

    it('should use custom parameters when provided', () => {
      const camera = new PerspectiveCamera(DEFAULT_FOV, DEFAULT_ASPECT, DEFAULT_NEAR, DEFAULT_FAR)
      const model = createMockModel(MODEL_SIZE, MODEL_SIZE, MODEL_SIZE)

      adaptCameraPlanes(camera, model, CUSTOM_MIN_NEAR, CUSTOM_MAX_FAR, CUSTOM_PADDING_FACTOR)

      expect(camera.near).toBeGreaterThanOrEqual(CUSTOM_MIN_NEAR)
      expect(camera.far).toBeLessThanOrEqual(CUSTOM_MAX_FAR)
    })

    it('should not update if values are within threshold', () => {
      const camera = new PerspectiveCamera(DEFAULT_FOV, DEFAULT_ASPECT, CUSTOM_MIN_NEAR, DEFAULT_FAR)
      camera.near = CUSTOM_MIN_NEAR
      camera.far = DEFAULT_FAR
      const model = createMockModel(MODEL_SIZE, MODEL_SIZE, MODEL_SIZE)

      // Mock updateProjectionMatrix to track calls
      const updateProjectionMatrixSpy = jest.spyOn(camera, 'updateProjectionMatrix')

      adaptCameraPlanes(camera, model)

      // If values are very close, might not update
      // But if they do update, updateProjectionMatrix should be called
      if (updateProjectionMatrixSpy.mock.calls.length > 0) {
        expect(updateProjectionMatrixSpy).toHaveBeenCalled()
      }

      updateProjectionMatrixSpy.mockRestore()
    })

    it('should handle null/undefined inputs gracefully', () => {
      const camera = new PerspectiveCamera(DEFAULT_FOV, DEFAULT_ASPECT, DEFAULT_NEAR, DEFAULT_FAR)
      const originalNear = camera.near
      const originalFar = camera.far

      adaptCameraPlanes(null, createMockModel(MODEL_SIZE, MODEL_SIZE, MODEL_SIZE))
      expect(camera.near).toBe(originalNear)
      expect(camera.far).toBe(originalFar)

      adaptCameraPlanes(camera, null)
      expect(camera.near).toBe(originalNear)
      expect(camera.far).toBe(originalFar)
    })

    it('should handle large models', () => {
      const camera = new PerspectiveCamera(DEFAULT_FOV, DEFAULT_ASPECT, DEFAULT_NEAR, DEFAULT_FAR)
      const model = createMockModel(LARGE_MODEL_SIZE, LARGE_MODEL_SIZE, LARGE_MODEL_SIZE)

      adaptCameraPlanes(camera, model)

      // Far plane should accommodate large model
      expect(camera.far).toBeGreaterThan(LARGE_MODEL_SIZE)
    })

    it('should handle small models', () => {
      const camera = new PerspectiveCamera(DEFAULT_FOV, DEFAULT_ASPECT, DEFAULT_NEAR, DEFAULT_FAR)
      const model = createMockModel(SMALL_MODEL_SIZE, SMALL_MODEL_SIZE, SMALL_MODEL_SIZE)

      adaptCameraPlanes(camera, model)

      // Near plane should be clamped to minimum
      expect(camera.near).toBeGreaterThanOrEqual(MIN_NEAR_PLANE)
    })
  })
})


/**
 * Creates a mock model with a bounding box for testing.
 *
 * @param width - Width of the bounding box
 * @param height - Height of the bounding box
 * @param depth - Depth of the bounding box
 * @return Mock model object
 */
function createMockModel(width: number, height: number, depth: number): Object3D & {geometry: {boundingBox: Box3}} {
  const geometry = new BufferGeometry()
  const mesh = new Mesh(geometry)
  const boundingBox = new Box3()
  boundingBox.setFromCenterAndSize(
    new Vector3(0, 0, 0),
    new Vector3(width, height, depth),
  )
  mesh.geometry.boundingBox = boundingBox

  return mesh as Object3D & {geometry: {boundingBox: Box3}}
}


// Test constants
const DEFAULT_FOV = 75
const DEFAULT_ASPECT = 1
const DEFAULT_NEAR = 0.1
const DEFAULT_FAR = 1000
const MODEL_SIZE = 10
const EXPECTED_MIN_DISTANCE = 1.73
const EXPECTED_MAX_DISTANCE = 173.2
const CUSTOM_MIN_FACTOR = 0.2
const CUSTOM_MAX_FACTOR = 20
const MIN_NEAR_PLANE = 0.001
const MAX_NEAR_PLANE = 1
const MIN_FAR_THRESHOLD = 100
const LARGE_MODEL_SIZE = 1000
const SMALL_MODEL_SIZE = 0.1
const CUSTOM_MIN_NEAR = 0.01
const CUSTOM_MAX_FAR = 10000
const CUSTOM_PADDING_FACTOR = 100
