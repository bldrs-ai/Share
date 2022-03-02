import React, {useEffect} from 'react'
import {useLocation} from 'react-router'
import debug from '../utils/debug'
import {
  addHashListener,
  addHashParams,
  getHashParams,
  removeHashParams,
} from '../utils/location'
import {roundCoord} from '../utils/math'


// TODO(pablo): CameraControl has to be loaded into DOM for any of the
// handlers below to function, but we also decided not to display it
// as its own button.  So for now it's hidden.
/**
 * The CameraControl is a button that adds the current camera position
 * to the URL hash.  On load, this component also reads the current
 * URL hash and sets the camera position, as well as adds a hash
 * listener to do the same whenever the hash changes.
 *
 * @param {Object} viewer The IFC viewer, which contains the
 *   cameraControls
 * @return {Object} React component
 */
export default function CameraControl({viewer}) {
  const camera = viewer.IFC.context.ifcCamera.cameraControls
  const location = useLocation()
  useEffect(() => {
    onLoad(camera, location)
  }, [camera, location])
  // NOTE: NOT DISPLAYED
  return (
    <button
      style={{display: 'none'}}
      onClick={() => onClick(camera)}>
      Camera
    </button>
  )
}


/** The prefix to use for camera coordinate in the URL hash. */
export const CAMERA_PREFIX = 'c'


/**
 * Set camera position from window location hash and add listener for
 * hash change.
 * @param {Object} camera The IFCjs camera
 * @param {Object} location Either window.location or react-router location
 */
function onLoad(camera, location) {
  debug().log('CameraControl#onLoad')
  onHash(camera, location)
  addHashListener('camera', () => onHash(camera, location))
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
  const encodedParams = getHashParams(location, CAMERA_PREFIX)
  if (encodedParams == undefined) {
    return
  }
  const coords = parseHashParams(encodedParams)
  if (coords == undefined) {
    return
  }
  if (coords) {
    camera.setPosition(...coords, true) // true: animate to new coordinate
  }
}


const regex = new RegExp(
    `${CAMERA_PREFIX}:(-?\\d+(?:\\.\\d+)?),(-?\\d+(?:\\.\\d+)?),(-?\\d+(?:\\.\\d+)?)`)


/**
 * @param {string} encodedParams
 * @return {Object|undefined} The coordinates if present and valid else undefined
 */
function parseHashParams(encodedParams) {
  const match = encodedParams.match(regex)
  if (match) {
    const x = parseFloat(parseFloat(match[1]).toPrecision(5))
    const y = parseFloat(parseFloat(match[2]).toPrecision(5))
    const z = parseFloat(parseFloat(match[3]).toPrecision(5))
    debug().log('CameraControl#onHash: setting camera position x:(${x}), y:(${y}), z:(${z})')
    return [x, y, z]
  } else {
    debug().log('CameraControl#onHash, no camera coordinate present in hash: ', location.hash)
  }
}


/** @return {boolean} True iff the camera hash params are present. */
export function hasValidUrlParams() {
  const encoded = getHashParams(window.location, CAMERA_PREFIX)
  if (encoded && parseHashParams(encoded)) {
    return true
  }
  return false
}


/**
 * Adds camera coords to url.
 * @param {Object} viewer IFCjs viewer that contains a camera.
 */
export function addCameraUrlParams(viewer) {
  const camera = viewer.IFC.context.ifcCamera
  addHashParams(
      window.location,
      CAMERA_PREFIX,
      roundCoord(...camera.cameraControls.getPosition(), 4))
}


/** Removes camera params from the URL if present */
export function removeCameraUrlParams() {
  removeHashParams(window.location, CAMERA_PREFIX)
}


/**
 * Handler for onClick to add the camera position to the URL hash.
 * @param {Object} camera The IFCjs camera
 */
function onClick(camera) {
  // TODO(pablo): Ideally this would be hanled by react-router
  // location, but doesn't seem to be supported yet in v6.
  // See also https://stackoverflow.com/a/71210781/3630172
  addHashParams(window.location, CAMERA_PREFIX, roundCoord(...camera.getPosition(), 4))
}
