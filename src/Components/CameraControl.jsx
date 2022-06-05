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


// TODO(pablo): this is temporary global state solution for the camera logic
let camera


// TODO(pablo): CameraControl has to be loaded into DOM for any of the
// handlers below to function, but we also decided not to display it
// as its own button.  So for now it's hidden.
/**
 * The CameraControl is a button that adds the current camera position
 * to the URL hash.  On load, this component also reads the current
 * URL hash and sets the camera position, as well as adds a hash
 * listener to do the same whenever the hash changes.
 *
 * @param {Object} v The IFC viewer, which contains the
 *   cameraControls
 * @return {Object} React component
 */
export default function CameraControl({viewer}) {
  camera = viewer.IFC.context.ifcCamera
  const location = useLocation()
  useEffect(() => {
    onHash(location)
    onLoad(location)
  }, [location])
  // NOTE: NOT DISPLAYED
  return (
    <div style={{display: 'none'}}>Camera</div>
  )
}


/** The prefix to use for camera coordinate in the URL hash. */
export const CAMERA_PREFIX = 'c'


/**
 * Set camera position from window location hash and add listener for
 * hash change.
 * @param {Object} location Either window.location or react-router location
 */
function onLoad(location) {
  debug().log('CameraControl#onLoad')
  addHashListener('camera', () => onHash(location))
}


// exported for testing only
/**
 * Sets the camera position to the coordinate encoded in the URL
 * hash if it is present
 * @param {Object} location window.location
 */
export function onHash(location) {
  const encodedParams = getHashParams(location, CAMERA_PREFIX)
  if (encodedParams == undefined) {
    return
  }
  setCameraFromEncodedPosition(encodedParams)
}


/**
 * Get url
 * @param {String} urlStr url string that is pulled from the issue
 */
export function readUrlForEncodedPosition(urlStr) {
  const parts = urlStr.split('#')
  if (parts.length !== 2) {
    throw Error('Expected hash in URL')
  }
  const loc = {
    hash: parts[1],
  }
  const encodedParams = getHashParams(loc, CAMERA_PREFIX)
  setCameraFromEncodedPosition(encodedParams)
}

/**
 * Set the camera position
 * @param {String} encodedPosition camera position
 */
export function setCameraFromEncodedPosition(encodedPosition) {
  const coords = parseHashParams(encodedPosition)
  if (coords) {
    camera.cameraControls.setPosition(coords[0], coords[1], coords[2], true)
    if (coords.length == 6) {
      camera.cameraControls.setTarget(coords[3], coords[4], coords[5], true)
    }
  }
  addCameraUrlParams()
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


/** @return {boolean} True if the camera hash params are present. */
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
export function addCameraUrlParams() {
  if (!camera || !camera.cameraControls) {
    return
  }
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
