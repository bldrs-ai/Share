import {Vector3} from 'three'
import {dragRotation, snapToDirection} from './ViewCube'


// Named values so the coordinate literals below do not trip no-magic-numbers.
const SMALL = 0.01
const SENSITIVITY = 0.008


describe('ViewCube', () => {
  describe('snapToDirection', () => {
    it('snaps FRONT to azimuth 0, polar pi/2', () => {
      const controls = {rotateTo: jest.fn()}
      snapToDirection(controls, new Vector3(0, 0, 1))
      const [azimuth, polar, transition] = controls.rotateTo.mock.calls[0]
      expect(azimuth).toBeCloseTo(0)
      expect(polar).toBeCloseTo(Math.PI / 2)
      expect(transition).toBe(true)
    })

    it('snaps RIGHT to azimuth pi/2', () => {
      const controls = {rotateTo: jest.fn()}
      snapToDirection(controls, new Vector3(1, 0, 0))
      const [azimuth, polar] = controls.rotateTo.mock.calls[0]
      expect(azimuth).toBeCloseTo(Math.PI / 2)
      expect(polar).toBeCloseTo(Math.PI / 2)
    })

    it('snaps TOP near the pole without hitting it exactly', () => {
      const controls = {rotateTo: jest.fn()}
      snapToDirection(controls, new Vector3(0, 1, 0))
      const [, polar] = controls.rotateTo.mock.calls[0]
      expect(polar).toBeGreaterThan(0)
      expect(polar).toBeLessThan(SMALL)
    })

    it('is a no-op when controls are missing', () => {
      expect(() => snapToDirection(null, new Vector3(0, 0, 1))).not.toThrow()
    })
  })

  describe('dragRotation', () => {
    it('maps horizontal drag to negated azimuth', () => {
      const {azimuth, polar} = dragRotation(10, 0, SENSITIVITY)
      expect(azimuth).toBeCloseTo(-10 * SENSITIVITY)
      expect(polar).toBeCloseTo(0)
    })

    it('maps vertical drag to negated polar', () => {
      const {azimuth, polar} = dragRotation(0, 10, SENSITIVITY)
      expect(azimuth).toBeCloseTo(0)
      expect(polar).toBeCloseTo(-10 * SENSITIVITY)
    })
  })
})
