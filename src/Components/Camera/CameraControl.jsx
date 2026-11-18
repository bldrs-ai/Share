import React, {ReactElement, useEffect} from 'react'
import {useLocation} from 'react-router-dom'
import useStore from '../../store/useStore'
import debug from '../../utils/debug'
import {
  addHashListener,
  addHashParams,
  getHashParams,
  removeHashListener,
  replaceHashParams,
} from '../../utils/location'
import {roundCoord} from '../../utils/math'
import {noteUserCamera} from '../../viewer/three/renderDemand'
import {
  HASH_PREFIX_CAMERA,
  forgetSyncedCameraToken,
  isCameraTokenSynced,
  noteCameraTokenSynced,
} from './hashState'
import {startLiveCameraLink} from './liveCameraLink'


/**
 * The CameraControl applies the URL hash's `#c:` camera when a link opens
 * (and when the location changes to a different `#c:`, e.g. Back), and keeps
 * the live camera link running: after the user's own first camera move the
 * `#c:` token follows the camera for the session (liveCameraLink.js).
 *
 * @return {ReactElement}
 */
export default function CameraControl() {
  const setCameraControls = useStore((state) => state.setCameraControls)
  const viewer = useStore((state) => state.viewer)

  const location = useLocation()

  const cameraControls = viewer.context.getCameraControls()

  useEffect(() => {
    setCameraControls(cameraControls)
    onLocation(location, cameraControls)
  }, [location, cameraControls, setCameraControls])

  // Keyed on the controls, not the location: the live link stays live across
  // navigations (selecting an element changes the path), and starts over —
  // waiting for a new first move — only with a new viewer's controls.
  useEffect(() => {
    addHashListener('camera', () => onHash(window.location, cameraControls))
    const liveLink = startLiveCameraLink(cameraControls, {
      write: replaceCameraUrlParams,
      isEnabled: () => useStore.getState().isCameraInUrl,
    })
    return () => {
      removeHashListener('camera')
      liveLink.dispose()
    }
  }, [cameraControls, viewer])

  return <div style={{display: 'none'}}>Camera</div>
}


/**
 * @param {object} cameraControls
 * @param {Location|object} location where a token was just written or applied;
 *   only the page's own URL is the camera's (a `{hash}` double is a composed link)
 */
function noteSyncedToken(cameraControls, location) {
  if (location === window.location) {
    noteCameraTokenSynced(cameraControls, getHashParams(window.location, HASH_PREFIX_CAMERA))
  }
}


// Exported for testing
/**
 * Apply the location's `#c:` camera unless it's the token we already hold.
 *
 * The effect calling this runs on EVERY location change, and with the live
 * camera link the token is in the URL for the whole session: selecting an
 * element navigates (utils/navigate.js#navWith carries the current hash), so
 * an unconditional onHash would re-apply the camera on each selection —
 * from rounded coords, animated (a small snap), or, if the live link's write
 * was still pending, from the PREVIOUS settle's token, yanking the camera
 * back mid-move. A token we wrote or applied for these controls is already
 * the camera's; only a different one (a link opened, Back to an entry left
 * at another pose) moves it.
 *
 * @param {object} location Either window.location or react-router location
 * @param {object} cameraControls obtained from the viewer
 * @return {boolean} whether a camera was applied
 */
export function onLocation(location, cameraControls) {
  const token = getHashParams(location, HASH_PREFIX_CAMERA)
  if (token === undefined) {
    // The camera has left the URL (the Share switch off, a note with no
    // camera): whatever it does next isn't written, so a later Back to the
    // entry with the old token must move it again (Sonnet review on #2175).
    forgetSyncedCameraToken()
    return false
  }
  if (isCameraTokenSynced(cameraControls, token)) {
    return false
  }
  const applied = onHash(location, cameraControls)
  if (applied) {
    noteSyncedToken(cameraControls, window.location)
  }
  return applied
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
    // A pose the user asked for, by link or by navigating to one: theirs, not
    // a load's camera follow's to overwrite (renderDemand.js#noteUserCamera).
    noteUserCamera(cameraControls)
    cameraControls.setPosition(coords[0], coords[1], coords[2], true)
    const extendedCoordsSize = 6
    if (coords.length === extendedCoordsSize) {
      cameraControls.setTarget(coords[3], coords[4], coords[5], true)
    }
  }

  addCameraUrlParams(cameraControls)
}


// The exponent group is load-bearing, not decoration. Camera coords are
// serialized with `String(number)`, which switches to exponential below
// 1e-6 -- reachable on a sub-millimetre part now that coords are rounded
// relative to scale rather than to 3 decimals. Without it such a link
// fails to match and restores no camera at all. Superset of the old
// grammar, so existing permalinks still parse.
const floatPattern = '(-?\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?)'
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
    // parseFloat, not floatStrTrim: re-rounding to 3 decimals on read
    // would undo the scale-aware rounding done on write, collapsing a
    // millimetre part's camera back to the origin. The regex has already
    // established each group is a well-formed number.
    const x = parseFloat(match[1])
    const y = parseFloat(match[2])
    const z = parseFloat(match[3])
    if (match[4] === undefined && match[5] === undefined && match[6] === undefined) {
      return [x, y, z]
    } else {
      return [x, y, z, parseFloat(match[4]), parseFloat(match[5]), parseFloat(match[6])]
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
 * Adds camera coords to url, as a new history entry: for a user action that
 * is a step of its own (the Share dialog's switch, a note's camera). The live
 * camera link uses replaceCameraUrlParams.
 *
 * @param {object} cameraControls obtained from the viewer
 * @param {object} [location] where to write the `#c:` token; a location-shaped
 *   `{hash}` double lets a caller compose a link without touching the page's
 *   URL (the Assist `share.permalink` tool, viewer/tools/shareTools.js)
 */
export function addCameraUrlParams(cameraControls, location = window.location) {
  // addCameraUrlParams is accessed from the issue card and it is undefined on the first render
  if (!cameraControls) {
    return
  }
  addHashParams(location, HASH_PREFIX_CAMERA, cameraUrlParams(cameraControls))
  noteSyncedToken(cameraControls, location)
}


/**
 * Writes the camera into the page's `#c:` token in place: no history entry,
 * no `hashchange` (utils/location.js#replaceHashParams). The live camera
 * link's writer (liveCameraLink.js).
 *
 * @param {object} cameraControls obtained from the viewer
 */
export function replaceCameraUrlParams(cameraControls) {
  if (!cameraControls) {
    return
  }
  replaceHashParams(window.location, HASH_PREFIX_CAMERA, cameraUrlParams(cameraControls))
  noteSyncedToken(cameraControls, window.location)
}


/**
 * The `#c:` values for the camera's pose: position, then target, each
 * rounded scale-aware (utils/math.js#roundCoord); a target at the origin is
 * written as a single 0.
 *
 * @param {object} cameraControls
 * @return {Array<number>}
 */
function cameraUrlParams(cameraControls) {
  const position = cameraControls.getPosition()
  let camArr = roundCoord(...position)
  const target = cameraControls.getTarget()
  if (target.x === 0 && target.y === 0 && target.z === 0) {
    camArr = camArr.concat(0)
  } else {
    camArr = camArr.concat(roundCoord(...target))
  }
  return camArr
}
