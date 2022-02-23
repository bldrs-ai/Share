import React, {useEffect} from 'react'
import {useLocation} from 'react-router'
import debug from '../utils/debug'
import {addHashParams} from '../utils/location'


/**
 * The CameraControl is a button that adds the current camera position
 * to the URL hash.  On load, this component also reads the current
 * URL hash and sets the camera position, as well as adds a hash
 * listener to do the same whenever the hash changes.
 *
 * @param {Object} camera The camera object from IFCjs/Threejs.
 * @return {Object} React component
 */
export default function CameraControl({camera}) {
  debug().log('CameraControl: camera: ', camera)
  const location = useLocation()

  useEffect(() => {
    onLoad(camera, location)
  }, [camera, location])

  return <button onClick={() => onClick(camera)}>Camera</button>
}


/** The prefix to use for camera coordinate in the URL hash. */
export const HASH_PREFIX = 'c'


/**
 * Set camera position from window location hash and add listener for
 * hash change.
 * @param {Object} camera The IFCjs camera
 * @param {Object} location Either window.location or react-router location
 */
function onLoad(camera, location) {
  debug().log('CameraControl#onLoad')
  onHash(camera, location)
  window.onhashchange = () => onHash(camera, location)
}


// exported for testing only
/**
 * Sets the camera position to the coordinate encoded in the URL
 * hash if it is present
 * @param {Object} camera The IFCjs camera
 * @param {Object} location window.location
 */
export function onHash(camera, location) {
  debug().log('CameraControl#onHash')
  const regex = new RegExp(
      `#${HASH_PREFIX}:(-?\\d+(?:\\.\\d+)?),(-?\\d+(?:\\.\\d+)?),(-?\\d+(?:\\.\\d+)?)`)
  const match = location.hash.match(regex)
  if (match) {
    const x = parseFloat(parseFloat(match[1]).toPrecision(5))
    const y = parseFloat(parseFloat(match[2]).toPrecision(5))
    const z = parseFloat(parseFloat(match[3]).toPrecision(5))
    debug().log('CameraControl#onHash: setting camera position x:(${x}), y:(${y}), z:(${z})')
    camera.setPosition(x, y, z, true) // true: animate to new coordinate
  } else {
    debug().log('CameraControl#onHash, no camera coordinate present in hash: ', location.hash)
  }
}


/**
 * Handler for onClick to add the camera position to the URL hash.
 * @param {Object} camera The IFCjs camera
 */
function onClick(camera) {
  // TODO(pablo): Ideally this would be hanled by react-router
  // location, but doesn't seem to be supported yet in v6.
  // See also https://stackoverflow.com/a/71210781/3630172
  addHashParams(window.location, HASH_PREFIX, camera.getPosition())
}
