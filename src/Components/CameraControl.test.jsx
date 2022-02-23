import React from 'react'
import {render, screen} from '@testing-library/react'
import {mockRoutes} from '../BaseRoutesMock.test'
import CameraControl, {
  onHash,
} from './CameraControl'


test('CameraControl', () => {
  const camera = {}
  render(mockRoutes(
      <CameraControl camera={camera} />,
  ))
  expect(screen.getByText('Camera')).toBeInTheDocument()
})


test('onHash', () => {
  const cam = new MockCamera(0, 0, 0, false)
  const location = {hash: '#c:1,2,3'}
  onHash(cam, location)
  expect(cam).toStrictEqual(new MockCamera(1, 2, 3, true))
})


/** Mocks the IFCjs camera. */
class MockCamera {
  /**
   * @param {Number} x
   * @param {Number} y
   * @param {Number} z
   * @param {boolean} doTween
   */
  constructor(x = 0, y = 0, z = 0, doTween = false) {
    this.x = 0
    this.y = 0
    this.z = 0
    this.doTween = false
    this.setPosition(x, y, z, doTween)
  }

  /**
   * @param {Number} x
   * @param {Number} y
   * @param {Number} z
   * @param {boolean} doTween
   */
  setPosition(x, y, z, doTween) {
    this.x = x
    this.y = y
    this.z = z
    this.doTween = doTween
  }
}
