/* eslint-disable no-magic-numbers */
import {BatchedMesh, BoxGeometry, EventDispatcher, Group, Matrix4, Vector3} from 'three'
import {requestPaint} from '../three/renderDemand'
import {BUDGET_SHARE} from './autoResidency'
import {MotionResidency, MotionResidencyMode, REST_FRAMES, REST_MS} from './MotionResidency'
import {ResidencyController, ResidencyMetric} from './ResidencyController'


jest.mock('../three/renderDemand', () => ({
  ...jest.requireActual('../three/renderDemand'),
  requestPaint: jest.fn(),
}))


/**
 * MotionResidency (B3): camera-controls `update` starts motion, `REST_MS`
 * without one is rest, and rest restores the at-rest set and asks for a
 * paint. Under Auto the overlay's fraction follows the GPU timer's samples.
 */


/**
 * @param {number} count instances, box i of edge i + 1 at x = 10 i
 * @return {{group: Group, mesh: BatchedMesh}}
 */
function makeModel(count) {
  const mesh = new BatchedMesh(count, 24 * count, 36 * count)
  mesh.instanceParents = new Uint32Array(Array.from({length: count}, (_, i) => 100 + i))
  for (let i = 0; i < count; i++) {
    const geometryId = mesh.addGeometry(new BoxGeometry(i + 1, i + 1, i + 1))
    const instanceId = mesh.addInstance(geometryId)
    mesh.setMatrixAt(instanceId, new Matrix4().makeTranslation(i * 10, 0, 0))
  }
  const group = new Group()
  group.add(mesh)
  return {group, mesh}
}


/**
 * @param {object} mesh
 * @param {number} count
 * @return {number} visible instances
 */
function visibleCount(mesh, count) {
  let visible = 0
  for (let i = 0; i < count; i++) {
    visible += mesh.getVisibleAt(i) ? 1 : 0
  }
  return visible
}


/**
 * A fence-only WebGL stand-in whose fences signal when the test says.
 *
 * @return {object}
 */
function fenceGl() {
  const gl = {
    SYNC_GPU_COMMANDS_COMPLETE: 1, TIMEOUT_EXPIRED: 2, ALREADY_SIGNALED: 3, WAIT_FAILED: 4,
    signalled: false,
    fenceSync: () => ({}),
    flush: () => undefined,
    clientWaitSync: () => (gl.signalled ? gl.ALREADY_SIGNALED : gl.TIMEOUT_EXPIRED),
    deleteSync: () => undefined,
  }
  return gl
}


/**
 * A viewer's worth of seams: camera-controls events, the per-frame hook, the
 * paint observers, a clock and a GPU whose frame time the test sets.
 *
 * @param {number} count instances
 * @param {object} [opts]
 * @param {number} [opts.restTarget] at-rest target
 * @return {object}
 */
function rig(count, {restTarget = 1} = {}) {
  const {group, mesh} = makeModel(count)
  const controller = new ResidencyController(group, {getCamera: () => ({position: new Vector3(0, 0, 200)})})
  if (restTarget < 1) {
    controller.setTarget(restTarget)
  }
  const controls = new EventDispatcher()
  const clock = {t: 1000}
  const frames = []
  const observers = []
  const tasks = []
  const gl = fenceGl()
  const renderDemand = {
    isFollowMoving: false,
    observePaints: (observer) => {
      observers.push(observer)
      return () => observers.splice(observers.indexOf(observer), 1)
    },
  }
  const driver = new MotionResidency(controller, {
    controls,
    onFrame: (fn) => {
      frames.push(fn)
      return () => frames.splice(frames.indexOf(fn), 1)
    },
    renderDemand,
    gl,
    now: () => clock.t,
    // Idle work runs at once, so a gesture starts from a prepared order.
    idle: (fn) => {
      fn()
      return () => undefined
    },
    timerOptions: {nextTask: (fn) => tasks.push(fn)},
  })
  /**
   * One 60 Hz animation frame: optionally a camera change, then the frame
   * hook, then a paint whose GPU time is `gpuMs(visibleShare)`.
   *
   * @param {object} [opts]
   * @param {boolean} [opts.move]
   * @param {Function} [opts.gpuMs]
   */
  const frame = ({move = false, gpuMs = null} = {}) => {
    clock.t += 1000 / 60
    if (move) {
      controls.dispatchEvent({type: 'update'})
    }
    frames.forEach((fn) => fn())
    observers.forEach((o) => o.beforePaint?.())
    observers.forEach((o) => o.afterPaint?.(1))
    if (gpuMs !== null && tasks.length > 0) {
      const start = clock.t
      clock.t = start + gpuMs(visibleCount(mesh, count) / count)
      gl.signalled = true
      while (tasks.length > 0) {
        tasks.shift()()
      }
      gl.signalled = false
      clock.t = start
    }
  }
  return {group, mesh, controller, controls, clock, driver, frame, frames, observers, renderDemand}
}


const MANUAL_25 = {mode: MotionResidencyMode.MANUAL, percent: 25, metric: ResidencyMetric.OCCUPANCY}


describe('MotionResidency', () => {
  beforeEach(() => requestPaint.mockClear())

  it('evicts in the frame the camera first moves and restores the at-rest set at rest', () => {
    const {mesh, driver, frame, controls} = rig(8, {restTarget: 0.75})
    driver.setSettings(MANUAL_25)
    expect(visibleCount(mesh, 8)).toBe(6)

    // The update event lands before the frame's paint: already evicted.
    controls.dispatchEvent({type: 'update'})
    expect(driver.moving).toBe(true)
    expect(visibleCount(mesh, 8)).toBe(2)
    for (let i = 0; i < 5; i++) {
      frame({move: true})
    }
    expect(visibleCount(mesh, 8)).toBe(2)

    // Under REST_MS without a change: still moving.
    const quietFrames = Math.floor(REST_MS / (1000 / 60)) - 1
    for (let i = 0; i < quietFrames; i++) {
      frame()
    }
    expect(driver.moving).toBe(true)
    expect(visibleCount(mesh, 8)).toBe(2)
    requestPaint.mockClear()
    frame()
    frame()
    expect(driver.moving).toBe(false)
    // Exactly the at-rest set, and a paint was asked for to show it.
    expect(visibleCount(mesh, 8)).toBe(6)
    expect(requestPaint).toHaveBeenCalled()
  })

  it('stays in motion through a slow GPU\'s frames that miss an update', () => {
    // SwiftShader-like: 380 ms frames, the camera changing on every other
    // one. Each quiet frame alone is past REST_MS; it is not rest.
    const {mesh, driver, controls, frames, clock} = rig(8)
    driver.setSettings(MANUAL_25)
    const slowFrame = (move) => {
      clock.t += 380
      if (move) {
        controls.dispatchEvent({type: 'update'})
      }
      frames.forEach((fn) => fn())
    }
    for (let i = 0; i < 10; i++) {
      slowFrame(i % 2 === 0)
      expect(driver.moving).toBe(true)
    }
    expect(visibleCount(mesh, 8)).toBe(2)
    for (let i = 0; i < REST_FRAMES; i++) {
      slowFrame(false)
    }
    expect(driver.moving).toBe(false)
    expect(visibleCount(mesh, 8)).toBe(8)
  })

  it('changes nothing at manual 100%, today\'s behaviour', () => {
    const {mesh, controller, driver, frame} = rig(8)
    driver.setSettings({...MANUAL_25, percent: 100})
    const setVisibleAt = jest.spyOn(mesh, 'setVisibleAt')
    for (let i = 0; i < 20; i++) {
      frame({move: true})
    }
    expect(driver.moving).toBe(false)
    expect(controller.isInMotion).toBe(false)
    expect(setVisibleAt).not.toHaveBeenCalled()
  })

  it('does not evict on a click that moves nothing', () => {
    const {mesh, driver, controls, frame} = rig(8)
    driver.setSettings(MANUAL_25)
    controls.dispatchEvent({type: 'controlstart'})
    controls.dispatchEvent({type: 'controlend'})
    frame()
    expect(driver.moving).toBe(false)
    expect(visibleCount(mesh, 8)).toBe(8)
  })

  it('ignores the load\'s own camera follow', () => {
    const {mesh, driver, renderDemand, frame} = rig(8)
    driver.setSettings(MANUAL_25)
    renderDemand.isFollowMoving = true
    frame({move: true})
    expect(driver.moving).toBe(false)
    expect(visibleCount(mesh, 8)).toBe(8)
  })

  it('keeps the biggest parts while moving under occupancy', () => {
    const {mesh, driver, frame} = rig(8)
    driver.setSettings(MANUAL_25)
    frame({move: true})
    // Boxes grow with their index: the last two are the biggest.
    expect([6, 7].map((i) => mesh.getVisibleAt(i))).toEqual([true, true])
    expect(visibleCount(mesh, 8)).toBe(2)
  })

  it('restores at rest when the setting changes mid-gesture', () => {
    const {mesh, driver, frame} = rig(8)
    driver.setSettings(MANUAL_25)
    frame({move: true})
    expect(visibleCount(mesh, 8)).toBe(2)
    driver.setSettings({...MANUAL_25, percent: 50})
    expect(visibleCount(mesh, 8)).toBe(8)
    frame({move: true})
    expect(visibleCount(mesh, 8)).toBe(4)
  })

  it('detaches and restores on dispose', () => {
    const {mesh, driver, frame, frames, observers, controls} = rig(8)
    driver.setSettings(MANUAL_25)
    frame({move: true})
    driver.dispose()
    expect(visibleCount(mesh, 8)).toBe(8)
    expect(frames).toHaveLength(0)
    expect(observers).toHaveLength(0)
    controls.dispatchEvent({type: 'update'})
    expect(visibleCount(mesh, 8)).toBe(8)
  })

  describe('Auto', () => {
    // PSB's shape (6 ms + the rest proportional, 47 ms at full detail),
    // scaled to the share of instances shown.
    const psb = (share) => 6 + (41 * share)
    const budget = BUDGET_SHARE * (1000 / 60)

    it('is the default, and converges into the frame budget while moving', () => {
      const {mesh, driver, frame} = rig(200)
      expect(driver.settings.mode).toBe(MotionResidencyMode.AUTO)
      for (let i = 0; i < 120; i++) {
        frame({move: true, gpuMs: psb})
      }
      const share = visibleCount(mesh, 200) / 200
      expect(psb(share)).toBeLessThanOrEqual(budget)
      expect(share).toBeGreaterThan(0.05)
      expect(driver.stats.samples).toBeGreaterThan(20)
    })

    it('starts the next gesture from where the last one settled', () => {
      const {mesh, driver, frame} = rig(200)
      for (let i = 0; i < 120; i++) {
        frame({move: true, gpuMs: psb})
      }
      const settled = visibleCount(mesh, 200)
      for (let i = 0; i < 20; i++) {
        frame()
      }
      expect(driver.moving).toBe(false)
      expect(visibleCount(mesh, 200)).toBe(200)
      // First moved frame of the next drag: already at the settled share.
      frame({move: true, gpuMs: psb})
      expect(Math.abs(visibleCount(mesh, 200) - settled)).toBeLessThanOrEqual(1)
    })

    it('measures nothing while the camera is still', () => {
      const {driver, frame} = rig(20)
      for (let i = 0; i < 30; i++) {
        frame({gpuMs: psb})
      }
      expect(driver.stats.samples).toBe(0)
    })
  })
})
