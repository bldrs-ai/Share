/* eslint-disable no-magic-numbers */
import {FADE_IN_MS, FADE_OUT_MS, MotionAO} from './motionAO'
import {REST_FRAMES, REST_MS} from './residency/MotionResidency'


/** @return {object} a camera-controls stand-in that can emit `update` */
function fakeControls() {
  const listeners = new Set()
  return {
    addEventListener: (type, fn) => type === 'update' && listeners.add(fn),
    removeEventListener: (type, fn) => listeners.delete(fn),
    update: () => listeners.forEach((fn) => fn()),
    count: () => listeners.size,
  }
}


/**
 * @param {boolean} [enabled] whether AO is enabled
 * @return {object} the post-processor surface MotionAO drives
 */
function fakePostProcessor(enabled = true) {
  return {
    enabled,
    level: 1,
    getAOEnabled() {
      return this.enabled
    },
    getAOLevel() {
      return this.level
    },
    setAOLevel(v) {
      this.level = v
    },
  }
}


/**
 * @param {object} [opts]
 * @return {object} a MotionAO wired to fakes, plus the fakes
 */
function setup({enabled = true, follow = false} = {}) {
  let t = 0
  const frames = []
  const controls = fakeControls()
  const pp = fakePostProcessor(enabled)
  const paint = jest.fn()
  const renderDemand = {isFollowMoving: follow, isLoading: false}
  const motion = new MotionAO(pp, {
    controls,
    onFrame: (fn) => {
      frames.push(fn)
      return () => frames.splice(frames.indexOf(fn), 1)
    },
    renderDemand,
    now: () => t,
    paint,
  })
  const frame = (dtMs = 16) => {
    t += dtMs
    frames.forEach((fn) => fn())
  }
  return {motion, controls, pp, paint, frame, frames, renderDemand}
}


/**
 * Drag: a camera change every frame for `n` frames.
 *
 * @param {object} s from setup
 * @param {number} n
 * @param {number} [dtMs]
 */
function drag(s, n, dtMs = 16) {
  for (let i = 0; i < n; i++) {
    s.controls.update()
    s.frame(dtMs)
  }
}


/**
 * Come to rest: quiet frames past REST_MS and REST_FRAMES.
 *
 * @param {object} s from setup
 */
function rest(s) {
  for (let i = 0; i < REST_FRAMES; i++) {
    s.frame(1)
  }
  s.frame(REST_MS)
}


describe('viewer/motionAO', () => {
  it('fades AO out over FADE_OUT_MS from the drag\'s first frame, without a cut', () => {
    const s = setup()
    s.controls.update()
    s.frame(0)
    // The first moved frame still has (nearly) all of it: a fade, not a pop.
    expect(s.pp.level).toBeCloseTo(1, 5)
    s.controls.update()
    s.frame(FADE_OUT_MS / 2)
    expect(s.pp.level).toBeGreaterThan(0)
    expect(s.pp.level).toBeLessThan(1)
    drag(s, 1, FADE_OUT_MS)
    expect(s.pp.level).toBe(0)
  })

  it('keeps AO out through the gesture, and fades it in over FADE_IN_MS at rest with a paint each step', () => {
    const s = setup()
    drag(s, 20)
    expect(s.pp.level).toBe(0)
    s.paint.mockClear()
    rest(s)
    // Rest found: the fade-in has begun, not jumped.
    expect(s.pp.level).toBeLessThan(1)
    s.frame(FADE_IN_MS / 2)
    const mid = s.pp.level
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
    s.frame(FADE_IN_MS)
    expect(s.pp.level).toBe(1)
    // Every step painted, so a fade on a still camera is drawn.
    expect(s.paint.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('needs REST_FRAMES quiet frames as well as REST_MS (a slow frame is not rest)', () => {
    const s = setup()
    drag(s, 1, FADE_OUT_MS)
    s.frame(REST_MS * 2)
    expect(s.pp.level).toBe(0)
  })

  it('drops AO at once for a load, and fades it in when the load ends', () => {
    const s = setup()
    s.renderDemand.isLoading = true
    s.frame()
    expect(s.pp.level).toBe(0)
    for (let i = 0; i < 10; i++) {
      s.frame(REST_MS)
    }
    expect(s.pp.level).toBe(0)
    s.renderDemand.isLoading = false
    s.frame()
    s.frame(FADE_IN_MS)
    expect(s.pp.level).toBe(1)
  })

  it('keeps AO out when the camera rests mid-load, and fades in only once both are done', () => {
    const s = setup()
    s.renderDemand.isLoading = true
    drag(s, 1)
    rest(s)
    s.frame(FADE_IN_MS)
    expect(s.pp.level).toBe(0)
    s.renderDemand.isLoading = false
    s.frame()
    s.frame(FADE_IN_MS)
    expect(s.pp.level).toBe(1)
  })

  it('ignores the load\'s own camera follow, and paints nothing for a fade with AO off', () => {
    const follow = setup({follow: true})
    follow.controls.update()
    follow.frame(FADE_OUT_MS)
    expect(follow.pp.level).toBe(1)
    const off = setup({enabled: false})
    drag(off, 3, FADE_OUT_MS)
    expect(off.paint).not.toHaveBeenCalled()
  })

  it('puts AO back at full and detaches on dispose', () => {
    const s = setup()
    drag(s, 3, FADE_OUT_MS)
    s.motion.dispose()
    expect(s.pp.level).toBe(1)
    expect(s.controls.count()).toBe(0)
    expect(s.frames).toHaveLength(0)
  })
})
