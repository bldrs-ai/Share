/* eslint-disable no-magic-numbers */
import {Sphere, Vector3} from 'three'
import {applyCameraLimits, cameraLimitsForSphere, fitDistanceForRadius} from './cameraLimits'


/** @return {object} A perspective-camera stand-in. */
function makeCamera() {
  return {fov: 45, aspect: 1.5, near: 1, far: 100, updateProjectionMatrix: jest.fn()}
}


/** @return {object} Controls at the OrbitControl activation defaults. */
function makeControls() {
  return {minDistance: 1, maxDistance: 300}
}


/**
 * @param {number} radius
 * @return {Sphere}
 */
function sphereOf(radius) {
  return new Sphere(new Vector3(0, 0, 0), radius)
}


describe('cameraLimits', () => {
  describe('cameraLimitsForSphere', () => {
    it('keeps the model reachable and unclipped at millimetre scale', () => {
      // A true-scale mm PCB: ~0.1 scene units, so its framing radius is
      // well under the activation defaults of minDistance/near = 1.
      const camera = makeCamera()
      const sphere = sphereOf(0.075)
      const limits = cameraLimitsForSphere(camera, sphere)

      const wantDistance = fitDistanceForRadius(camera, sphere.radius)
      expect(wantDistance).toBeGreaterThan(limits.minDistance)
      expect(wantDistance).toBeLessThan(limits.maxDistance)
      // Near in front of the model's leading edge, not beyond it.
      expect(limits.near).toBeLessThan(wantDistance - sphere.radius)
      expect(limits.far).toBeGreaterThan(wantDistance + sphere.radius)
    })

    it('holds every limit at the same ratio across a 1e6 size difference', () => {
      // Scale invariance is the property that makes one shared derivation
      // correct for a mm part and a km site alike.
      const camera = makeCamera()
      const tiny = cameraLimitsForSphere(camera, sphereOf(0.001))
      const huge = cameraLimitsForSphere(camera, sphereOf(1000))

      expect(tiny.minDistance / 0.001).toBeCloseTo(huge.minDistance / 1000, 6)
      expect(tiny.maxDistance / 0.001).toBeCloseTo(huge.maxDistance / 1000, 6)
      expect(tiny.near / 0.001).toBeCloseTo(huge.near / 1000, 6)
      expect(tiny.far / 0.001).toBeCloseTo(huge.far / 1000, 6)
    })

    it('floors maxDistance at where the camera already sits', () => {
      // The end-of-load fit passes the settled dolly radius so a
      // shrinking range can't snap an already-dollied-out camera inwards.
      const camera = makeCamera()
      const sphere = sphereOf(1)
      const free = cameraLimitsForSphere(camera, sphere)
      const floored = cameraLimitsForSphere(camera, sphere, free.maxDistance * 3)

      expect(floored.maxDistance).toBeCloseTo(free.maxDistance * 3, 6)
      expect(floored.far).toBeGreaterThan(free.far)
      // The inward limits are unaffected by the outward floor.
      expect(floored.minDistance).toBeCloseTo(free.minDistance, 6)
      expect(floored.near).toBeCloseTo(free.near, 6)
    })
  })


  describe('applyCameraLimits', () => {
    it('writes all four limits, bringing the inward pair down off the defaults', () => {
      const camera = makeCamera()
      const controls = makeControls()
      const limits = cameraLimitsForSphere(camera, sphereOf(0.075))

      applyCameraLimits(camera, controls, limits)

      expect(controls.minDistance).toBe(limits.minDistance)
      expect(controls.maxDistance).toBe(limits.maxDistance)
      expect(camera.near).toBe(limits.near)
      expect(camera.far).toBe(limits.far)
      expect(camera.near).toBeLessThan(1)
      expect(controls.minDistance).toBeLessThan(1)
      expect(camera.updateProjectionMatrix).toHaveBeenCalled()
    })

    it('growOnly holds the outward range but still lowers minDistance and near', () => {
      // The streaming follow's contract: its union only grows, so the
      // outward range must not fall back between refits and pop the
      // projection -- but the inward pair still has to come down off the
      // defaults or a sub-metre model is clamped and clipped all load.
      const camera = makeCamera()
      const controls = makeControls()
      const limits = cameraLimitsForSphere(camera, sphereOf(0.075))

      applyCameraLimits(camera, controls, limits, true)

      expect(controls.maxDistance).toBe(300)
      expect(camera.far).toBe(100)
      expect(controls.minDistance).toBe(limits.minDistance)
      expect(camera.near).toBe(limits.near)
    })

    it('growOnly still widens the outward range for a large model', () => {
      const camera = makeCamera()
      const controls = makeControls()
      const limits = cameraLimitsForSphere(camera, sphereOf(500))

      applyCameraLimits(camera, controls, limits, true)

      expect(controls.maxDistance).toBe(limits.maxDistance)
      expect(controls.maxDistance).toBeGreaterThan(300)
      expect(camera.far).toBe(limits.far)
    })
  })
})
