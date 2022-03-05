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
    <>Camera</>
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
  const encodedParams = getHashParams(location, CAMERA_PREFIX)
  if (encodedParams == undefined) {
    return
  }
  const coords = parseHashParams(encodedParams)
  if (coords == undefined) {
    return
  }
  if (coords) {
    camera.setPosition(coords[0], coords[1], coords[2], true)
    if (coords.length == 6) {
      camera.setTarget(coords[3], coords[4], coords[5], true)
    }
  }
}


const floatPattern = '(-?\\d+(?:\\.\\d+)?)'
const coordPattern = `${floatPattern},${floatPattern},${floatPattern}`
const paramPattern = `${CAMERA_PREFIX}:${coordPattern}(?:,${coordPattern})?`
const regex = new RegExp(paramPattern)


// Exported for testing
/**
 * @param {string} encodedParams
 * @return {Object|undefined} The coordinates if present and valid else undefined
 */
export function parseHashParams(encodedParams) {
  const match = encodedParams.match(regex)
  const stof = (str) => {
    const val = parseFloat(parseFloat(str).toFixed(2))
    if (isFinite(val)) {
      const rounded = parseFloat(val.toFixed(0))
      return rounded == val ? rounded : val
    } else {
      console.warn('Invalid coordinate: ', str)
    }
  }
  debug().log('CameraControl#onHash: match: ', match)
  if (match && match[1] !== undefined && match[2] !== undefined && match[3] !== undefined) {
    const x = stof(match[1])
    const y = stof(match[2])
    const z = stof(match[3])
    if (match[4] === undefined && match[5] === undefined && match[6] === undefined) {
      return [x, y, z]
    } else {
      return [x, y, z, stof(match[4]), stof(match[5]), stof(match[6])]
    }
  } else {
    debug().warn('CameraControl#onHash, no camera coordinate present in hash: ', location.hash)
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
  const position = camera.cameraControls.getPosition()
  let camArr = roundCoord(...position, 2)
  const target = camera.cameraControls.getTarget()
  if (target.x == 0 && target.y == 0 && target.z == 0) {
    camArr = camArr.concat(0)
  } else {
    camArr = camArr.concat(roundCoord(...target, 2))
  }
  addHashParams(window.location, CAMERA_PREFIX, camArr)
}


/** Removes camera params from the URL if present */
export function removeCameraUrlParams() {
  removeHashParams(window.location, CAMERA_PREFIX)
}
