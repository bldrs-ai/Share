import {PerspectiveCamera, Vector3} from 'three'
import CutPlaneArrowHelper from './CutPlaneArrowHelper'
import {
  ArrowFade, FADE_OUT_MS, IDLE_MS, TOUCH_FADE_FLOOR, distanceWithin, offsetFromAxis, screenAxis,
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


  // Owner on #2171: fade out after inactivity, back to full on activity near.
  describe('ArrowFade', () => {
    /** @return {object} a fade on a hand-driven clock, and its opacity changes */
    function makeFade() {
      const clock = {ms: 0, timers: [], frames: []}
      const seen = []
      const fade = new ArrowFade((opacity) => seen.push(opacity), {
        now: () => clock.ms,
        setTimer: (fn, ms) => {
          const timer = {fn, at: clock.ms + ms}
          clock.timers.push(timer)
          return timer
        },
        clearTimer: (timer) => {
          clock.timers = clock.timers.filter((t) => t !== timer)
        },
        nextFrame: (fn) => {
          clock.frames.push(fn)
          return fn
        },
        cancelFrame: (fn) => {
          clock.frames = clock.frames.filter((f) => f !== fn)
        },
      })
      /** @param {number} ms advance the clock, firing timers and 16 ms frames */
      const advance = (ms) => {
        const end = clock.ms + ms
        while (clock.ms < end) {
          clock.ms = Math.min(end, clock.ms + 16)
          for (const timer of clock.timers.filter((t) => t.at <= clock.ms)) {
            clock.timers = clock.timers.filter((t) => t !== timer)
            timer.fn()
          }
          const frames = clock.frames
          clock.frames = []
          frames.forEach((fn) => fn())
        }
      }
      return {fade, seen, advance}
    }

    it('stays opaque until idle, then fades out over FADE_OUT_MS to nothing', () => {
      const {fade, seen, advance} = makeFade()
      fade.wake()
      advance(IDLE_MS - 20)
      expect(fade.opacity).toBe(1)
      advance(40)
      expect(fade.opacity).toBeLessThan(1)
      expect(fade.opacity).toBeGreaterThan(0)
      advance(FADE_OUT_MS)
      expect(fade.opacity).toBe(0)
      // A fade, not a jump: several steps on the way down.
      expect(seen.length).toBeGreaterThan(5)
    })

    it('comes back to full at once on a wake, and the idle clock starts again', () => {
      const {fade, advance} = makeFade()
      fade.wake()
      advance(IDLE_MS + FADE_OUT_MS + 100)
      expect(fade.opacity).toBe(0)
      fade.wake()
      expect(fade.opacity).toBe(1)
      advance(IDLE_MS - 100)
      expect(fade.opacity).toBe(1)
      // Activity before the clock runs out puts it off again.
      fade.wake()
      advance(IDLE_MS - 100)
      expect(fade.opacity).toBe(1)
    })

    it('fades only to the floor it was last given (a touch device)', () => {
      const {fade, advance} = makeFade()
      fade.wake(TOUCH_FADE_FLOOR)
      advance(IDLE_MS + FADE_OUT_MS + 100)
      expect(fade.opacity).toBeCloseTo(TOUCH_FADE_FLOOR, 6)
    })

    it('stays opaque while held, for every reason, and idles from the last release', () => {
      const {fade, advance} = makeFade()
      fade.wake()
      fade.hold('hover')
      fade.hold('drag')
      advance(IDLE_MS * 3)
      expect(fade.opacity).toBe(1)
      fade.release('drag')
      advance(IDLE_MS * 3)
      expect(fade.opacity).toBe(1)
      fade.release('hover')
      advance(IDLE_MS - 100)
      expect(fade.opacity).toBe(1)
      advance(FADE_OUT_MS + 200)
      expect(fade.opacity).toBe(0)
    })

    it('a hold mid-fade brings it back to full', () => {
      const {fade, advance} = makeFade()
      fade.wake()
      advance(IDLE_MS + (FADE_OUT_MS / 2))
      expect(fade.opacity).toBeLessThan(1)
      fade.hold('drag')
      expect(fade.opacity).toBe(1)
      advance(FADE_OUT_MS * 3)
      expect(fade.opacity).toBe(1)
    })

    it('stops opaque with no clocks left running', () => {
      const {fade, advance} = makeFade()
      fade.wake()
      advance(IDLE_MS + 50)
      fade.stop()
      expect(fade.opacity).toBe(1)
      advance(IDLE_MS * 3)
      expect(fade.opacity).toBe(1)
      // A release after a stop doesn't restart it.
      fade.hold('drag')
      fade.stop()
      fade.release('drag')
      advance(IDLE_MS * 3)
      expect(fade.opacity).toBe(1)
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
