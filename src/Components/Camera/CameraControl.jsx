import React, {ReactElement, useEffect} from 'react'
import {useLocation} from 'react-router-dom'
import useStore from '../../store/useStore'
import debug from '../../utils/debug'
import {
  addHashListener,
  addHashParams,
  getHashParams,
} from '../../utils/location'
import {roundCoord} from '../../utils/math'
import {floatStrTrim} from '../../utils/strings'
import {
  HASH_PREFIX_CAMERA,
  removeCameraUrlParams,
} from './hashState'


/**
 * The CameraControl is a button that adds the current camera position
 * to the URL hash.  On load, this component also reads the current
 * URL hash and sets the camera position, as well as adds a hash
 * listener to do the same whenever the hash changes.
 *
 * @return {ReactElement}
 */
export default function CameraControl() {
  const setCameraControls = useStore((state) => state.setCameraControls)
  const viewer = useStore((state) => state.viewer)

  const location = useLocation()

  const cameraControls = viewer.IFC.context.ifcCamera.cameraControls

  useEffect(() => {
    setCameraControls(cameraControls)
    onHash(location, cameraControls)
    onLoad(location, cameraControls, viewer)
  }, [location, cameraControls, setCameraControls, viewer])

  return <div style={{display: 'none'}}>Camera</div>
}


/**
 * Set camera position from window location hash and add listener for
 * hash change.
 *
 * @param {object} location Either window.location or react-router location
 * @param {object} cameraControls obtained from the viewer
 * @param {object} viewer the viewer, for null testing
 */
function onLoad(location, cameraControls, viewer) {
  addHashListener('camera', () => onHash(location, cameraControls))
  const canvas = document.querySelector('canvas')
  if (viewer && canvas) {
    let isMouseMoved = false
    const onMouseMove = () => {
      isMouseMoved = true
    }
    const onMouseUp = () => {
      if (isMouseMoved) {
        removeCameraUrlParams()
      }
      isMouseMoved = false
    }
    canvas.removeEventListener('mousemove', onMouseMove)
    canvas.addEventListener('mousemove', onMouseMove)

    // https://stackoverflow.com/questions/3515446/jquery-mousewheel-detecting-when-the-wheel-stops/28371047#28371047
    const onWheel = () => {
      clearTimeout(document.wheeling)
      document.wheeling = setTimeout(() => {
        document.wheeling = undefined
        removeCameraUrlParams()
      }, WHEEL_DEBOUNCE_WAIT_MS)
    }
    canvas.addEventListener('wheel', onWheel)

    canvas.removeEventListener('mouseup', onMouseUp)
    canvas.removeEventListener('touchend', onMouseUp)
    canvas.addEventListener('mouseup', onMouseUp)
  }
}


// exported for testing only
/**
 * Sets the camera position to the coordinate encoded in the URL
 * hash if it is present
 *
 * @param {object} location window.location
 * @param {object} cameraControls obtained from the viewer
 * @return {boolean} Whether the hash had camera position.  e.g. false on first
 * load useEffect
 */
export function onHash(location, cameraControls) {
  const encodedParams = getHashParams(location, HASH_PREFIX_CAMERA)
  if (encodedParams === undefined) {
    return false
  }
  setCameraFromParams(encodedParams, cameraControls)
  return true
}


/**
 * Set the camera position
 *
 * @param {string} encodedParams camera position
 * @param {object} cameraControls obtained from the viewer
 */
export function setCameraFromParams(encodedParams, cameraControls) {
  // addCameraUrlParams is accessed from the issue card and it is undefined on the first render
  if (!cameraControls) {
    return
  }
  const coords = parseHashParams(encodedParams)
  // console.trace('setCameraFromParams', coords, new Error())
  if (coords) {
    cameraControls.setPosition(coords[0], coords[1], coords[2], true)
    const extendedCoordsSize = 6
    if (coords.length === extendedCoordsSize) {
      cameraControls.setTarget(coords[3], coords[4], coords[5], true)
    }
  }

  addCameraUrlParams(cameraControls)
}


const floatPattern = '(-?\\d+(?:\\.\\d+)?)'
const coordPattern = `${floatPattern},${floatPattern},${floatPattern}`
const paramPattern = `${HASH_PREFIX_CAMERA}:${coordPattern}(?:,${coordPattern})?`
const paramRegex = new RegExp(paramPattern)


// Exported for testing
/**
 * @param {string} encodedParams
 * @return {object|undefined} The coordinates if present and valid else undefined
 */
export function parseHashParams(encodedParams) {
  const match = encodedParams.match(paramRegex)

  debug().log('CameraControl#onHash: match: ', match)

  if (match && match[1] !== undefined && match[2] !== undefined && match[3] !== undefined) {
    const x = floatStrTrim(match[1])
    const y = floatStrTrim(match[2])
    const z = floatStrTrim(match[3])
    if (match[4] === undefined && match[5] === undefined && match[6] === undefined) {
      return [x, y, z]
    } else {
      return [x, y, z, floatStrTrim(match[4]), floatStrTrim(match[5]), floatStrTrim(match[6])]
    }
  } else {
    debug().warn('CameraControl#onHash, no camera coordinate present in hash: ', location.hash)
  }
}


/** @return {boolean} True iff the camera hash params are present. */
export function hasValidUrlParams() {
  const encoded = getHashParams(window.location, HASH_PREFIX_CAMERA)
  if (encoded && parseHashParams(encoded)) {
    return true
  }
  return false
}


/**
 * Adds camera coords to url.
 *
 * @param {object} cameraControls obtained from the viewer
 */
export function addCameraUrlParams(cameraControls) {
  // addCameraUrlParams is accessed from the issue card and it is undefined on the first render
  if (!cameraControls) {
    return
  }
  const position = cameraControls.getPosition()
  let camArr = roundCoord(...position)
  const target = cameraControls.getTarget()
  if (target.x === 0 && target.y === 0 && target.z === 0) {
    camArr = camArr.concat(0)
  } else {
    camArr = camArr.concat(roundCoord(...target))
  }
  addHashParams(window.location, HASH_PREFIX_CAMERA, camArr)
}


export const WHEEL_DEBOUNCE_WAIT_MS = 250
