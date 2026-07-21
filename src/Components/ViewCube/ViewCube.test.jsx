import {BoxGeometry, Mesh, Vector3} from 'three'
import {dragRotation, pickDirection, snapToDirection} from './ViewCube'


// Cube half-edge and a small in-face offset, kept as named values so the
// coordinate literals below do not trip the no-magic-numbers rule.
const HALF = 0.5
const NEAR_CENTER = 0.05
const SMALL = 0.01
const SENSITIVITY = 0.008

describe('ViewCube', () => {
  const cube = new Mesh(new BoxGeometry(1, 1, 1))

  /**
   * Build a fake raycaster hit against the cube.
   *
   * @param {Array<number>} point Local/world hit point (cube is at origin)
   * @param {Array<number>} normal Face normal
   * @return {object}
   */
  function makeHit(point, normal) {
    return {
      point: new Vector3(...point),
      face: {normal: new Vector3(...normal)},
    }
  }

  describe('pickDirection', () => {
    it('resolves a face-center click to the face normal', () => {
      const hit = makeHit([NEAR_CENTER, -NEAR_CENTER, HALF], [0, 0, 1])
      expect(pickDirection(hit, cube)).toStrictEqual(new Vector3(0, 0, 1))
    })

    it('resolves an edge click to a normalized edge diagonal', () => {
      // Near the top edge of the front face: the front and top axes are active.
      const hit = makeHit([NEAR_CENTER, HALF, HALF], [0, 0, 1])
      const dir = pickDirection(hit, cube)
      const expected = new Vector3(0, 1, 1).normalize()
      expect(dir.x).toBeCloseTo(expected.x)
      expect(dir.y).toBeCloseTo(expected.y)
      expect(dir.z).toBeCloseTo(expected.z)
    })

    it('resolves a corner click to a normalized diagonal', () => {
      const hit = makeHit([HALF, HALF, HALF], [0, 0, 1])
      const dir = pickDirection(hit, cube)
      const expected = new Vector3(1, 1, 1).normalize()
      expect(dir.x).toBeCloseTo(expected.x)
      expect(dir.y).toBeCloseTo(expected.y)
      expect(dir.z).toBeCloseTo(expected.z)
    })
  })

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
