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
 * Edge length of a millimetre-scale STEP part, in scene units: the 50 mm
 * `data/create-a-tube.step` from #1742, at the true size conway#458 (PR
 * conway#460) gives it.
 */
const SMALL_MODEL_SIZE = 0.05
/**
 * Digits of agreement for the scale-invariance quotients. Bounded by float32,
 * not by the math: the bounds come off BoxGeometry's Float32Array positions,
 * so the two cubes aren't exactly 20000x apart to begin with.
 */
const PRECISION = 6


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

    // Regression for #1742: the near plane used to be floored at an absolute
    // 0.1 scene units, which sits inside any part smaller than a couple of
    // metres — zooming in clipped it, and past 0.1 it vanished.
    it('keeps the near plane inside a millimetre-scale part', () => {
      const {control, camera, controls} = makeControl(sceneWithCube(SMALL_MODEL_SIZE))

      const sphere = control.fitCameraLimitsToModel()

      expect(sphere).not.toBeNull()
      // The closest the user can dolly still has to sit outside the near
      // plane, or the last bit of zoom eats the model.
      expect(camera.near).toBeGreaterThan(0)
      expect(camera.near).toBeLessThan(controls.minDistance)
      // And the near plane has to be small against the part itself, not
      // merely small against the old constant.
      expect(camera.near).toBeLessThan(SMALL_MODEL_SIZE)
    })

    // The other half of #1742: the frustum has to be scale-invariant, not just
    // "small enough" at one size. Guards the near/far ratio that drives depth
    // precision at both extremes the issue calls out.
    it('scales the whole frustum with the model rather than pinning a constant', () => {
      const big = makeControl(sceneWithCube(MODEL_SIZE))
      const small = makeControl(sceneWithCube(SMALL_MODEL_SIZE))

      big.control.fitCameraLimitsToModel()
      small.control.fitCameraLimitsToModel()

      // Same rig, same shape, 20000x apart in size — so each shape ratio
      // should agree. Compared as a quotient against 1 so the tolerance is
      // relative: these quantities are themselves 20000x apart in magnitude,
      // and toBeCloseTo's tolerance is absolute.
      const agree = (smallValue, bigValue) =>
        expect(smallValue / bigValue).toBeCloseTo(1, PRECISION)
      agree(small.camera.far / small.camera.near, big.camera.far / big.camera.near)
      agree(small.camera.near / small.controls.minDistance,
        big.camera.near / big.controls.minDistance)
      agree(small.camera.near / SMALL_MODEL_SIZE, big.camera.near / MODEL_SIZE)
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
