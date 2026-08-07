import {BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene} from 'three'
import {OrbitControl} from './orbit-control'


/** IfcCamera constructor defaults the fix has to displace. */
const DEFAULT_NEAR = 1
const DEFAULT_FAR = 2000
/** activateOrbitControls' defaults, likewise. */
const DEFAULT_MIN_DISTANCE = 1
const DEFAULT_MAX_DISTANCE = 300
/** Edge length of the stand-in model, in scene units. */
const MODEL_SIZE = 1000


/**
 * Minimal stand-ins for IfcContext + IfcCamera: OrbitControl only reads
 * `context.getScene()`, `ifcCamera.perspectiveCamera` and
 * `ifcCamera.cameraControls` off them.
 *
 * @param {Scene} scene
 * @return {object} {control, camera, controls}
 */
function makeControl(scene) {
  const camera = new PerspectiveCamera()
  camera.near = DEFAULT_NEAR
  camera.far = DEFAULT_FAR
  const controls = {
    minDistance: DEFAULT_MIN_DISTANCE,
    maxDistance: DEFAULT_MAX_DISTANCE,
    // camera-controls' `distance` getter — the current dolly radius.
    distance: 0,
    truckSpeed: 0,
    fitToSphere: jest.fn(),
  }
  const context = {
    addComponent: () => {},
    getScene: () => scene,
  }
  const ifcCamera = {perspectiveCamera: camera, cameraControls: controls}
  return {control: new OrbitControl(context, ifcCamera), camera, controls}
}


/**
 * @param {number} size cube edge length
 * @return {Scene} scene holding one centered cube
 */
function sceneWithCube(size) {
  const scene = new Scene()
  scene.add(new Mesh(new BoxGeometry(size, size, size), new MeshBasicMaterial()))
  return scene
}


describe('viewer/three/context/camera/controls/orbit-control', () => {
  describe('fitCameraLimitsToModel', () => {
    // Regression for #1652: a permalink with a `#c:` camera hash skips
    // fitModelToFrame, and the un-sized far plane cut the model in half
    // while maxDistance = 300 yanked the camera in on first input.
    it('grows the clip planes and dolly range past the defaults', () => {
      const {control, camera, controls} = makeControl(sceneWithCube(MODEL_SIZE))

      const sphere = control.fitCameraLimitsToModel()

      expect(sphere).not.toBeNull()
      expect(controls.maxDistance).toBeGreaterThan(DEFAULT_MAX_DISTANCE)
      // minDistance scales with the model too — 1/1000 of the zoom-out
      // range — rather than staying at the 1-unit default.
      expect(controls.minDistance).not.toEqual(DEFAULT_MIN_DISTANCE)
      expect(controls.minDistance).toBeLessThan(controls.maxDistance)
      expect(camera.far).toBeGreaterThan(DEFAULT_FAR)
      // The whole zoom-out range has to stay inside the frustum, or the
      // model clips against the far plane at full zoom-out.
      expect(camera.far).toBeGreaterThan(controls.maxDistance + sphere.radius)
      expect(camera.near).toBeLessThan(controls.minDistance)
    })

    it('does not move the camera', () => {
      const {control, controls} = makeControl(sceneWithCube(MODEL_SIZE))
      control.fitCameraLimitsToModel()
      expect(controls.fitToSphere).not.toHaveBeenCalled()
    })

    it('keeps a permalinked pose inside the dolly range', () => {
      const {control, controls} = makeControl(sceneWithCube(MODEL_SIZE))
      // A pose restored by `setPosition` isn't clamped, but the first
      // dolly after it is — so the range has to cover where we already are.
      const farOutDistance = 1e6
      controls.distance = farOutDistance
      control.fitCameraLimitsToModel()
      expect(controls.maxDistance).toBeGreaterThanOrEqual(farOutDistance)
    })

    it('frames an explicit object rather than the last scene child', () => {
      const scene = sceneWithCube(MODEL_SIZE)
      const model = scene.children[0]
      // Stand in for the lights/helpers appended after the model.
      const speck = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())
      scene.add(speck)
      const {control} = makeControl(scene)

      const framed = control.fitCameraLimitsToModel(model)
      const lastChild = control.fitCameraLimitsToModel()

      expect(framed.radius).toBeGreaterThan(lastChild.radius)
    })

    it('returns null on an empty scene instead of poisoning the camera', () => {
      const {control, camera, controls} = makeControl(new Scene())

      expect(control.fitCameraLimitsToModel()).toBeNull()

      expect(camera.far).toEqual(DEFAULT_FAR)
      expect(controls.maxDistance).toEqual(DEFAULT_MAX_DISTANCE)
    })
  })


  describe('fitModelToFrame', () => {
    it('sizes the limits and then frames the model', async () => {
      const {control, camera, controls} = makeControl(sceneWithCube(MODEL_SIZE))

      await control.fitModelToFrame()

      expect(camera.far).toBeGreaterThan(DEFAULT_FAR)
      expect(controls.fitToSphere).toHaveBeenCalled()
    })

    it('frames the object it is handed, not the last scene child', async () => {
      const scene = sceneWithCube(MODEL_SIZE)
      const model = scene.children[0]
      scene.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()))
      const {control, controls} = makeControl(scene)

      await control.fitModelToFrame(model)

      const [fitted] = controls.fitToSphere.mock.calls[0]
      expect(fitted.radius).toBeGreaterThan(MODEL_SIZE / 2)
    })

    it('is a no-op while disabled', async () => {
      const {control, camera, controls} = makeControl(sceneWithCube(MODEL_SIZE))
      control.toggle(false)

      await control.fitModelToFrame()

      expect(camera.far).toEqual(DEFAULT_FAR)
      expect(controls.fitToSphere).not.toHaveBeenCalled()
    })
  })
})
