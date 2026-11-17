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

  it.each([
    ['a canvas drag', 'controlstart'],
    ['a wheel zoom (camera-controls sends no controlstart for it)', 'control'],
    ['a ViewCube move', USER_CAMERA_MOVE_EVENT],
  ])('starts on %s, then writes once per settle, debounced', (_name, type) => {
    controls.dispatchEvent({type})
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

  it('once live, follows programmatic moves too (a snap, a note\'s camera, a fit)', () => {
    noteUserCameraMove(controls)
    settle()
    write.mockClear()
    update()
    settle()
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('stays off while the Share dialog\'s camera switch is off, and resumes when it\'s on', () => {
    controls.dispatchEvent({type: 'controlstart'})
    update()
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
    controls.dispatchEvent({type: 'controlstart'})
    update()
    link.dispose()
    settle()
    update()
    settle()
    expect(write).not.toHaveBeenCalled()
    for (const type of ['controlstart', 'control', 'update', USER_CAMERA_MOVE_EVENT]) {
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
