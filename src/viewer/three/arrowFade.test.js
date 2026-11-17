import {PerspectiveCamera, Vector3} from 'three'
import CutPlaneArrowHelper from './CutPlaneArrowHelper'
import {
  FADE_NEAR_PX, FADE_REACH, FADE_STEPS, TOUCH_FADE_FLOOR, distanceWithin, fadeOpacity, offsetFromAxis, screenAxis,
} from './arrowFade'


/* eslint-disable no-magic-numbers */


const CANVAS = {left: 0, top: 0, width: 800, height: 600}
// A vertical arrow, 100 px tip to tip, at the canvas centre.
const AXIS = {ax: 400, ay: 250, bx: 400, by: 350}


describe('viewer/three/arrowFade', () => {
  describe('offsetFromAxis', () => {
    it('measures to the nearest point of the segment, ends included', () => {
      expect(offsetFromAxis({x: 410, y: 300}, AXIS)).toEqual({dx: 10, dy: 0})
      expect(offsetFromAxis({x: 400, y: 200}, AXIS)).toEqual({dx: 0, dy: -50})
      expect(offsetFromAxis({x: 403, y: 354}, AXIS)).toEqual({dx: 3, dy: 4})
    })

    it('treats an end-on arrow (both ends at one point) as that point', () => {
      expect(offsetFromAxis({x: 3, y: 4}, {ax: 0, ay: 0, bx: 0, by: 0})).toEqual({dx: 3, dy: 4})
    })
  })


  describe('fadeOpacity', () => {
    it('is opaque on the arrow and within the near band of it', () => {
      expect(fadeOpacity({x: 400, y: 300}, AXIS, CANVAS)).toBe(1)
      expect(fadeOpacity({x: 400 + FADE_NEAR_PX, y: 260}, AXIS, CANVAS)).toBe(1)
      // From beyond a tip, as near as from beside the middle.
      expect(fadeOpacity({x: 400, y: 250 - FADE_NEAR_PX}, AXIS, CANVAS)).toBe(1)
    })

    it('reaches nothing a quarter of the canvas beyond the near band, on either axis', () => {
      expect(fadeOpacity({x: 400 + FADE_NEAR_PX + (CANVAS.width * FADE_REACH), y: 300}, AXIS, CANVAS)).toBe(0)
      expect(fadeOpacity({x: 400, y: 350 + FADE_NEAR_PX + (CANVAS.height * FADE_REACH)}, AXIS, CANVAS)).toBe(0)
      expect(fadeOpacity({x: 0, y: 0}, AXIS, CANVAS)).toBe(0)
    })

    it('fades linearly between, in steps', () => {
      expect(fadeOpacity({x: 400 + FADE_NEAR_PX + (CANVAS.width * FADE_REACH / 2), y: 300}, AXIS, CANVAS)).toBe(0.5)
      const near = fadeOpacity({x: 400 + FADE_NEAR_PX + 7, y: 300}, AXIS, CANVAS)
      expect(near).toBeLessThan(1)
      expect(near).toBeGreaterThan(0.9)
      expect(Number.isInteger(near * FADE_STEPS)).toBe(true)
    })

    it('never fades a touch below its floor', () => {
      expect(fadeOpacity({x: 0, y: 0}, AXIS, CANVAS, TOUCH_FADE_FLOOR)).toBe(TOUCH_FADE_FLOOR)
      expect(fadeOpacity({x: 400, y: 300}, AXIS, CANVAS, TOUCH_FADE_FLOOR)).toBe(1)
    })

    it('leaves the arrow opaque with no axis or no canvas', () => {
      expect(fadeOpacity({x: 0, y: 0}, null, CANVAS)).toBe(1)
      expect(fadeOpacity({x: 0, y: 0}, AXIS, {width: 0, height: 0})).toBe(1)
    })
  })


  describe('distanceWithin', () => {
    it('is the distance inside the reach, Infinity outside it or with no axis', () => {
      expect(distanceWithin({x: 410, y: 300}, AXIS, 24)).toBe(10)
      expect(distanceWithin({x: 430, y: 300}, AXIS, 24)).toBe(Infinity)
      expect(distanceWithin({x: 400, y: 300}, null, 24)).toBe(Infinity)
    })
  })


  describe('screenAxis', () => {
    /** @return {PerspectiveCamera} at z 10 looking at the origin */
    function camera() {
      const c = new PerspectiveCamera(50, CANVAS.width / CANVAS.height, 0.1, 100)
      c.position.set(0, 0, 10)
      c.lookAt(0, 0, 0)
      c.updateMatrixWorld(true)
      return c
    }

    it('projects the arrow\'s tips, through its direction and scale', () => {
      const arrow = new CutPlaneArrowHelper(new Vector3(1, 0, 0))
      arrow.scale.setScalar(2)
      const axis = screenAxis(arrow, camera(), CANVAS)
      // Along x, centred on the canvas, both tips on the centre line.
      expect(axis.ay).toBeCloseTo(300, 6)
      expect(axis.by).toBeCloseTo(300, 6)
      expect((axis.ax + axis.bx) / 2).toBeCloseTo(400, 6)
      expect(Math.abs(axis.ax - axis.bx)).toBeGreaterThan(100)
    })

    it('is null for an arrow behind the camera', () => {
      const arrow = new CutPlaneArrowHelper(new Vector3(0, 1, 0))
      arrow.position.set(0, 0, 20)
      expect(screenAxis(arrow, camera(), CANVAS)).toBeNull()
    })
  })
})
