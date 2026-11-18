/* eslint-disable no-magic-numbers */
import React from 'react'
import {__getShareViewerMockSingleton} from '../../../__mocks__/shareViewerTestHarness'
import {act, render, renderHook, screen} from '@testing-library/react'
import useStore from '../../store/useStore'
import ShareMock from '../../ShareMock'
import {HASH_DEBOUNCE_WAIT_MS} from '../../utils/debounce'
import CameraControl, {
  addCameraUrlParams,
  onHash,
  onLocation,
  parseHashParams,
} from './CameraControl'
import {HASH_PREFIX_CAMERA, removeCameraUrlParams} from './hashState'
import {noteUserCameraMove} from './liveCameraLink'


describe('CameraControl', () => {
  it('parseHashParams, 3 params', () => {
    expect(parseHashParams(`${HASH_PREFIX_CAMERA}:1,2,3`)).toStrictEqual([1, 2, 3])
  })

  it('parseHashParams, 6 params', () => {
    expect(parseHashParams(`${HASH_PREFIX_CAMERA}:1,2,3,4,5,6`)).toStrictEqual([1, 2, 3, 4, 5, 6])
  })

  it('parseHashParams keeps sub-millimetre precision', () => {
    // Read used to re-round to 3 decimals via floatStrTrim, which undid
    // the write-side precision and parsed a small part's camera back to
    // the origin however carefully it had been serialized.
    expect(parseHashParams(`${HASH_PREFIX_CAMERA}:0.00042,0.00013,0.00021`))
      .toStrictEqual([0.00042, 0.00013, 0.00021])
  })

  it('parseHashParams accepts exponential notation', () => {
    // String(1e-7) is '1e-7' -- reachable on a sub-millimetre part, and
    // rejected outright by the pre-fix grammar.
    expect(parseHashParams(`${HASH_PREFIX_CAMERA}:1e-7,-2.5e-8,3E+2`))
      .toStrictEqual([1e-7, -2.5e-8, 300])
  })

  it('CameraControl', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const viewer = __getShareViewerMockSingleton()
    await act(() => {
      result.current.setViewer(viewer)
    })
    render(<ShareMock><CameraControl/></ShareMock>)
    expect(screen.getByText('Camera')).toBeInTheDocument()
  })

  it('onHash, position', () => {
    const cam = new MockCamera()
    const location = {hash: `#${HASH_PREFIX_CAMERA}:1,2,3`}
    onHash(location, cam)
    const expectCam = new MockCamera(1, 2, 3)
    expectCam.setDoTween(true)
    expect(cam).toStrictEqual(expectCam)
  })

  it('onHash, target', () => {
    const cam = new MockCamera()
    const location = {hash: `#${HASH_PREFIX_CAMERA}:1,2,3,4,5,6`}
    onHash(location, cam)
    const expectCam = new MockCamera(1, 2, 3, 4, 5, 6)
    expectCam.setDoTween(true)
    expect(cam).toStrictEqual(expectCam)
  })

  describe('the live camera link', () => {
    const MODEL_PATH = '/share/v/p/index.ifc'
    let controls
    let pushSpy
    let unmount

    beforeEach(() => {
      jest.useFakeTimers()
      window.history.replaceState(null, '', `${MODEL_PATH}#share:;n`)
      controls = new LiveControls()
      const viewer = __getShareViewerMockSingleton()
      jest.spyOn(viewer.context, 'getCameraControls').mockReturnValue(controls)
      useStore.setState({viewer, isCameraInUrl: true})
      pushSpy = jest.spyOn(window.history, 'pushState')
      ;({unmount} = render(<ShareMock><CameraControl/></ShareMock>))
    })

    afterEach(() => {
      unmount?.()
      pushSpy.mockRestore()
      jest.restoreAllMocks()
      jest.useRealTimers()
      window.history.replaceState(null, '', '/')
    })

    const update = () => act(() => controls.dispatchEvent({type: 'update'}))
    const settle = () => act(() => jest.advanceTimersByTime(HASH_DEBOUNCE_WAIT_MS))
    const cameraToken = () => window.location.hash.substring(1).split(';').find((set) => set.startsWith('c:'))

    it('writes no #c: for camera moves the page made (load framing)', () => {
      controls.move(10, 20, 30, 1, 2, 3)
      update()
      settle()
      expect(cameraToken()).toBeUndefined()
      expect(window.location.hash).toBe('#share:;n')
    })

    it('after the user\'s own move, keeps #c: on the live camera: debounced, in place, other tokens untouched', () => {
      const lengthBefore = window.history.length
      act(() => controls.dispatchEvent({type: 'controlstart'}))
      controls.move(10.12345, 20, 30, 1, 2, 3)
      update()
      controls.move(123.45678, 20, 30, 1, 2, 3)
      update()
      act(() => jest.advanceTimersByTime(HASH_DEBOUNCE_WAIT_MS - 1))
      expect(cameraToken()).toBeUndefined()
      act(() => jest.advanceTimersByTime(1))
      expect(cameraToken()).toBe('c:123.457,20,30,1,2,3')
      expect(window.location.hash).toBe('#share:;n;c:123.457,20,30,1,2,3')
      expect(window.location.pathname).toBe(MODEL_PATH)
      expect(pushSpy).not.toHaveBeenCalled()
      expect(window.history.length).toBe(lengthBefore)

      // It stays on, following later moves, whoever made them.
      controls.move(-4, 5, 6, 0.5, 0.5, 0.5)
      update()
      settle()
      expect(cameraToken()).toBe('c:-4,5,6,0.5,0.5,0.5')
      expect(window.history.length).toBe(lengthBefore)
    })

    it('starts on a ViewCube move too', () => {
      act(() => noteUserCameraMove(controls))
      controls.move(1, 2, 3, 4, 5, 6)
      update()
      settle()
      expect(cameraToken()).toBe('c:1,2,3,4,5,6')
    })

    it('stops while the Share dialog\'s camera switch is off and resumes when it\'s on', () => {
      act(() => controls.dispatchEvent({type: 'controlstart'}))
      controls.move(1, 2, 3, 4, 5, 6)
      update()
      act(() => useStore.getState().setIsCameraInUrl(false))
      settle()
      controls.move(7, 8, 9, 4, 5, 6)
      update()
      settle()
      expect(cameraToken()).toBeUndefined()
      act(() => useStore.getState().setIsCameraInUrl(true))
      update()
      settle()
      expect(cameraToken()).toBe('c:7,8,9,4,5,6')
    })

    it('unmounting drops a pending write and stops following', () => {
      act(() => controls.dispatchEvent({type: 'controlstart'}))
      update()
      unmount()
      unmount = null
      settle()
      controls.move(1, 2, 3, 4, 5, 6)
      update()
      settle()
      expect(cameraToken()).toBeUndefined()
      expect(controls._listeners.update).toHaveLength(0)
    })

    it('a location change that carries the token we wrote doesn\'t re-apply it; a different one does', () => {
      act(() => controls.dispatchEvent({type: 'controlstart'}))
      controls.move(1, 2, 3, 4, 5, 6)
      update()
      settle()
      // Selecting an element navigates with the current hash (navWith): the
      // camera is already there, and may be mid-move to a newer pose.
      controls.move(9, 9, 9, 4, 5, 6)
      const setPosition = jest.spyOn(controls, 'setPosition')
      expect(onLocation(window.location, controls)).toBe(false)
      expect(setPosition).not.toHaveBeenCalled()
      // Back to an entry left at another pose.
      expect(onLocation({hash: '#c:7,7,7,4,5,6'}, controls)).toBe(true)
      expect(setPosition).toHaveBeenCalledWith(7, 7, 7, true)
    })

    it('a token another writer pushed is the camera\'s too', () => {
      controls.move(1, 2, 3, 4, 5, 6)
      act(() => addCameraUrlParams(controls))
      const setPosition = jest.spyOn(controls, 'setPosition')
      expect(onLocation(window.location, controls)).toBe(false)
      expect(setPosition).not.toHaveBeenCalled()
    })

    // Sonnet review on #2175: the token left the URL, the camera moved with
    // nothing written, and Back returned to the entry with the old token.
    it.each([
      ['the Share switch or a note removed it', () => act(() => removeCameraUrlParams())],
      ['a location without it was seen', () => {
        expect(onLocation({hash: '#share:;n'}, controls)).toBe(false)
      }],
    ])('a token seen again after it left the URL (%s) is applied', (_how, leave) => {
      act(() => controls.dispatchEvent({type: 'controlstart'}))
      controls.move(1, 2, 3, 4, 5, 6)
      update()
      settle()
      const t1 = window.location.hash
      expect(cameraToken()).toBe('c:1,2,3,4,5,6')
      leave()
      act(() => useStore.getState().setIsCameraInUrl(false))
      controls.move(9, 9, 9, 4, 5, 6)
      update()
      settle()
      const setPosition = jest.spyOn(controls, 'setPosition')
      expect(onLocation({hash: t1}, controls)).toBe(true)
      expect(setPosition).toHaveBeenCalledWith(1, 2, 3, true)
    })
  })
})


/**
 * camera-controls' events and pose, as the live link uses them. Not three's
 * EventDispatcher / Vector3: the viewer harness automocks three.
 */
class LiveControls {
  /** */
  constructor() {
    this._listeners = {}
    this.move(0, 0, 0, 0, 0, 0)
  }

  /**
   * @param {string} type
   * @param {Function} fn
   */
  addEventListener(type, fn) {
    (this._listeners[type] ??= []).push(fn)
  }

  /**
   * @param {string} type
   * @param {Function} fn
   */
  removeEventListener(type, fn) {
    this._listeners[type] = (this._listeners[type] ?? []).filter((f) => f !== fn)
  }

  /** @param {object} event */
  dispatchEvent(event) {
    [...(this._listeners[event.type] ?? [])].forEach((fn) => fn(event))
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number} tx
   * @param {number} ty
   * @param {number} tz
   */
  move(x, y, z, tx, ty, tz) {
    this.position = vec3(x, y, z)
    this.target = vec3(tx, ty, tz)
  }

  /** @return {object} */
  getPosition() {
    return this.position
  }

  /** @return {object} */
  getTarget() {
    return this.target
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  setPosition(x, y, z) {
    this.position = vec3(x, y, z)
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  setTarget(x, y, z) {
    this.target = vec3(x, y, z)
  }
}


/**
 * A Vector3 as the camera code reads one: `.x/.y/.z`, and spreadable.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @return {object}
 */
function vec3(x, y, z) {
  return {x, y, z, * [Symbol.iterator]() {
    yield x
    yield y
    yield z
  }}
}


/** Mocks the IFCjs camera. */
class MockCamera {
  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number} tx
   * @param {number} ty
   * @param {number} tz
   * @param {boolean} doTween
   */
  constructor(x = 0, y = 0, z = 0, tx = 0, ty = 0, tz = 0, doTween = false) {
    this.x = x
    this.y = y
    this.z = z
    this.tx = tx
    this.ty = ty
    this.tz = tz
    this.doTween = doTween
  }


  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {boolean} doTween
   */
  setPosition(x, y, z, doTween) {
    this.x = x
    this.y = y
    this.z = z
    this.doTween = doTween
  }


  /**
   * @return {Array} camera position
   */
  getPosition() {
    return [this.x, this.y, this.z]
  }


  /**
   * @return {Array} camera target
   */
  getTarget() {
    return [this.x, this.y, this.z]
  }


  /**
   * @param {number} tx
   * @param {number} ty
   * @param {number} tz
   * @param {boolean} doTween
   */
  setTarget(tx, ty, tz, doTween) {
    this.tx = tx
    this.ty = ty
    this.tz = tz
    this.doTween = doTween
  }


  /**
   * @param {boolean} doTween
   */
  setDoTween(doTween) {
    this.doTween = doTween
  }
}
