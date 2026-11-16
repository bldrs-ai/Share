import {MotionAO} from './motionAO'
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
    suspended: false,
    getAOEnabled() {
      return this.enabled
    },
    setAOSuspended(v) {
      this.suspended = v
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
  const motion = new MotionAO(pp, {
    controls,
    onFrame: (fn) => {
      frames.push(fn)
      return () => frames.splice(frames.indexOf(fn), 1)
    },
    renderDemand: {isFollowMoving: follow},
    now: () => t,
    paint,
  })
  const frame = (dtMs = 16) => {
    t += dtMs
    frames.forEach((fn) => fn())
  }
  return {motion, controls, pp, paint, frame, frames}
}


describe('viewer/motionAO', () => {
  it('drops AO on the camera change itself, before that frame paints', () => {
    // camera-controls fires `update` inside controls.update(), before the
    // frame's paint, so AO must already be off when the update returns:
    // that frame is the first one motion residency's Auto times.
    const {controls, pp} = setup()
    controls.update()
    expect(pp.suspended).toBe(true)
  })

  it('keeps AO off through the gesture and back on only at rest, with a paint', () => {
    const {controls, pp, paint, frame} = setup()
    const gestureFrames = 20
    for (let i = 0; i < gestureFrames; i++) {
      controls.update()
      frame()
      expect(pp.suspended).toBe(true)
    }
    // Quiet frames, but not yet REST_MS: still moving (damping can pause).
    for (let i = 0; i < REST_FRAMES; i++) {
      frame(1)
    }
    expect(pp.suspended).toBe(true)
    expect(paint).not.toHaveBeenCalled()
    frame(REST_MS)
    expect(pp.suspended).toBe(false)
    expect(paint).toHaveBeenCalledTimes(1)
  })

  it('needs REST_FRAMES quiet frames as well as REST_MS (a slow frame is not rest)', () => {
    const {controls, pp, frame} = setup()
    controls.update()
    frame(REST_MS * 2)
    expect(pp.suspended).toBe(true)
  })

  it('does nothing when AO is off, or for the load\'s own camera follow', () => {
    const off = setup({enabled: false})
    off.controls.update()
    expect(off.pp.suspended).toBe(false)
    const follow = setup({follow: true})
    follow.controls.update()
    expect(follow.pp.suspended).toBe(false)
  })

  it('puts AO back and detaches on dispose', () => {
    const {motion, controls, pp, frames} = setup()
    controls.update()
    motion.dispose()
    expect(pp.suspended).toBe(false)
    expect(controls.count()).toBe(0)
    expect(frames).toHaveLength(0)
  })
})
