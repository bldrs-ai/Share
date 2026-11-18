import {EventDispatcher} from 'three'
import {USER_CAMERA_EVENT, noteUserCamera} from '../../viewer/three/renderDemand'
import {HASH_DEBOUNCE_WAIT_MS} from '../../utils/debounce'
import {USER_CAMERA_MOVE_EVENT, noteUserCameraMove, startLiveCameraLink} from './liveCameraLink'


describe('Camera/liveCameraLink', () => {
  let controls
  let write
  let isEnabled
  let link

  beforeEach(() => {
    jest.useFakeTimers()
    controls = new EventDispatcher()
    // Where camera-controls says the camera is heading (getPosition and
    // getTarget return the END of a move).
    controls.position = {x: 0, y: 0, z: 0}
    controls.target = {x: 0, y: 0, z: 0}
    controls.getPosition = () => ({...controls.position})
    controls.getTarget = () => ({...controls.target})
    write = jest.fn()
    isEnabled = true
    link = startLiveCameraLink(controls, {write, isEnabled: () => isEnabled})
  })

  afterEach(() => {
    link.dispose()
    jest.useRealTimers()
  })

  const update = () => controls.dispatchEvent({type: 'update'})
  const settle = () => jest.advanceTimersByTime(HASH_DEBOUNCE_WAIT_MS)

  it('writes nothing for camera moves before the user\'s own (load framing, a link\'s pose)', () => {
    update()
    // A link's or a note's pose is the user's for the load's camera follow
    // (renderDemand.js), not a move that starts the link.
    noteUserCamera(controls)
    update()
    settle()
    expect(write).not.toHaveBeenCalled()
    expect(link.isLive()).toBe(false)
  })

  const dispatch = (type) => controls.dispatchEvent({type})
  const moveTo = (x) => {
    controls.position = {x, y: 0, z: 0}
  }

  it.each([
    ['a canvas drag', () => {
      dispatch('controlstart')
      dispatch('control')
      moveTo(1)
      update()
    }],
    ['a wheel zoom (camera-controls sends no controlstart for it)', () => {
      dispatch('control')
      moveTo(1)
      update()
    }],
    ['a flick released before any frame applied it', () => {
      dispatch('controlstart')
      moveTo(1)
      dispatch('controlend')
    }],
    ['a ViewCube move', () => dispatch(USER_CAMERA_MOVE_EVENT)],
  ])('starts on %s, then writes once per settle, debounced', (_name, userMove) => {
    userMove()
    expect(link.isLive()).toBe(true)
    update()
    jest.advanceTimersByTime(HASH_DEBOUNCE_WAIT_MS - 1)
    update()
    jest.advanceTimersByTime(HASH_DEBOUNCE_WAIT_MS - 1)
    expect(write).not.toHaveBeenCalled()
    settle()
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith(controls)
  })

  it('doesn\'t start on a click or double-click that moves nothing (picking an element)', () => {
    // camera-controls sends controlstart on pointerdown, before any drag.
    for (let i = 0; i < 2; i++) {
      dispatch('controlstart')
      dispatch('controlend')
    }
    expect(link.isLive()).toBe(false)
    // And a later move the page makes (a fit) is still not the user's.
    moveTo(5)
    update()
    settle()
    expect(link.isLive()).toBe(false)
    expect(write).not.toHaveBeenCalled()
  })

  it('once live, follows programmatic moves too (a snap, a note\'s camera, a fit)', () => {
    noteUserCameraMove(controls)
    settle()
    write.mockClear()
    update()
    settle()
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('stays off while the Share dialog\'s camera switch is off, and resumes when it\'s on', () => {
    dispatch('controlstart')
    moveTo(1)
    update()
    expect(link.isLive()).toBe(true)
    // Switched off with a write pending: that write must not put back the
    // token the dialog just removed.
    isEnabled = false
    settle()
    update()
    settle()
    expect(write).not.toHaveBeenCalled()
    isEnabled = true
    update()
    settle()
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('dispose drops a pending write and stops listening', () => {
    dispatch('controlstart')
    update()
    expect(link.isLive()).toBe(true)
    link.dispose()
    settle()
    update()
    settle()
    expect(write).not.toHaveBeenCalled()
    for (const type of ['controlstart', 'control', 'controlend', 'update', USER_CAMERA_MOVE_EVENT]) {
      expect(controls._listeners?.[type] ?? []).toHaveLength(0)
    }
  })

  it('is not the renderDemand user-camera event', () => {
    expect(USER_CAMERA_MOVE_EVENT).not.toBe(USER_CAMERA_EVENT)
  })

  it('tolerates controls without events', () => {
    expect(() => noteUserCameraMove(null)).not.toThrow()
    expect(() => noteUserCameraMove({})).not.toThrow()
    expect(() => startLiveCameraLink({}, {write}).dispose()).not.toThrow()
  })
})
