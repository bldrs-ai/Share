import React from 'react'
import {render, screen} from '@testing-library/react'
import ShareMock from '../ShareMock'
import CameraControl, {
  onHash,
  parseHashParams,
} from './CameraControl'


describe('CameraControl', () => {
  it('parseHashParams, 3 params', () => {
    // eslint-disable-next-line no-magic-numbers
    expect(parseHashParams('c:1,2,3')).toStrictEqual([1, 2, 3])
  })

  it('parseHashParams, 6 params', () => {
    // eslint-disable-next-line no-magic-numbers
    expect(parseHashParams('c:1,2,3,4,5,6')).toStrictEqual([1, 2, 3, 4, 5, 6])
  })

  it('CameraControl', () => {
    const viewer = {IFC: {context: {ifcCamera: {cameraControls: {}}}}}
    render(<ShareMock><CameraControl viewer={viewer}/></ShareMock>)
    expect(screen.getByText('Camera')).toBeInTheDocument()
  })

  it('onHash, position', () => {
    const cam = new MockCamera()
    const location = {hash: '#c:1,2,3'}
    onHash(location, cam)
    // eslint-disable-next-line no-magic-numbers
    const expectCam = new MockCamera(1, 2, 3)
    expectCam.setDoTween(true)
    expect(cam).toStrictEqual(expectCam)
  })

  it('onHash, target', () => {
    const cam = new MockCamera()
    const location = {hash: '#c:1,2,3,4,5,6'}
    onHash(location, cam)
    // eslint-disable-next-line no-magic-numbers
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
