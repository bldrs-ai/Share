import React from 'react'
import {render, screen} from '@testing-library/react'
import {MockRoutes} from '../BaseRoutesMock.test'
import CameraControl, {
  onHash,
  parseHashParams,
} from './CameraControl'


test('parseHashParams, 3 params', () => {
  expect(parseHashParams('c:1,2,3')).toStrictEqual([1, 2, 3])
})


test('parseHashParams, 6 params', () => {
  expect(parseHashParams('c:1,2,3,4,5,6')).toStrictEqual([1, 2, 3, 4, 5, 6])
})


test('CameraControl', () => {
  const viewer = {IFC: {context: {ifcCamera: {cameraControls: {}}}}}
  render(<MockRoutes contentElt={<CameraControl viewer={viewer}/>}/>)
  expect(screen.getByText('Camera')).toBeInTheDocument()
})


test('onHash, position', () => {
  const cam = new MockCamera()
  const location = {hash: '#c:1,2,3'}
  onHash(cam, location)
  const expectCam = new MockCamera(1, 2, 3)
  expectCam.setDoTween(true)
  expect(cam).toStrictEqual(expectCam)
})


test('onHash, target', () => {
  const cam = new MockCamera()
  const location = {hash: '#c:1,2,3,4,5,6'}
  onHash(cam, location)
  const expectCam = new MockCamera(1, 2, 3, 4, 5, 6)
  expectCam.setDoTween(true)
  expect(cam).toStrictEqual(expectCam)
})


/** Mocks the IFCjs camera. */
class MockCamera {
  /**
   * @param {Number} x
   * @param {Number} y
   * @param {Number} z
   * @param {Number} tx
   * @param {Number} ty
   * @param {Number} tz
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
   * @param {Number} x
   * @param {Number} y
   * @param {Number} z
   * @param {Boolean} doTween
   */
  setPosition(x, y, z, doTween) {
    this.x = x
    this.y = y
    this.z = z
    this.doTween = doTween
  }


  /**
   * @param {Number} tx
   * @param {Number} ty
   * @param {Number} tz
   * @param {Boolean} doTween
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
