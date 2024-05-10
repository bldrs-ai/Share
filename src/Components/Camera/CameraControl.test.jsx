import React from 'react'
import {__getIfcViewerAPIExtendedMockSingleton} from 'web-ifc-viewer'
import {act, render, screen, renderHook} from '@testing-library/react'
import useStore from '../../store/useStore'
import ShareMock from '../../ShareMock'
import CameraControl, {
  onHash,
  parseHashParams,
} from './CameraControl'
import {HASH_PREFIX_CAMERA} from './hashState'


describe('CameraControl', () => {
  it('parseHashParams, 3 params', () => {
    expect(parseHashParams(`${HASH_PREFIX_CAMERA}:1,2,3`)).toStrictEqual([1, 2, 3])
  })

  it('parseHashParams, 6 params', () => {
    expect(parseHashParams(`${HASH_PREFIX_CAMERA}:1,2,3,4,5,6`)).toStrictEqual([1, 2, 3, 4, 5, 6])
  })

  it('CameraControl', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const viewer = __getIfcViewerAPIExtendedMockSingleton()
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
})


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
