import debug from '../../utils/debug'
import {
  getObjectParams,
  addHashParams as utilsAddHashParams,
  getHashParams as utilsGetHashParams,
  removeHashParams as utilsRemoveHashParams,
} from '../../utils/location'
import {floatStrTrim, isNumeric} from '../../utils/strings'
import {getPlanesOffset} from './CutPlaneMenu'


/** The prefix to use for the CutPlane state token */
export const HASH_PREFIX_CUT_PLANE = 'cp'


/**
 * @param {object} location react-router location
 * @param {object} params
 */
export function addHashParams(location, params) {
  utilsAddHashParams(location, HASH_PREFIX_CUT_PLANE, params, true)
}


/**
 * @param {object} location - The location object
 * @return {object} params
 */
export function getHashParams(location) {
  return utilsGetHashParams(location, HASH_PREFIX_CUT_PLANE)
}


/**
 * Removes CutPlane hash state
 *
 * @param {object} location react-router location
 * @param {Array<string>} paramKeys param keys to remove from
 *     hash params. if empty, then remove all params
 */
export function removeHashParams(location, paramKeys) {
  utilsRemoveHashParams(location, HASH_PREFIX_CUT_PLANE, paramKeys)
}


/**
 * Get offset info of x, y, z from plane hash string
 *
 * @param {string} planeHash
 * @return {Array}
 */
export function getPlanesFromHash(planeHash) {
  if (!planeHash) {
    return []
  }
  const parts = planeHash.split(':')
  if (parts[0] !== HASH_PREFIX_CUT_PLANE || !parts[1]) {
    return []
  }
  const planeObjectParams = getObjectParams(planeHash)
  debug().log('CutPlaneMenu#getPlanes: planeObjectParams: ', planeObjectParams)
  const planes = []
  Object.entries(planeObjectParams).forEach((entry) => {
    const [key, value] = entry
    const removableParamKeys = []
    if (isNumeric(key)) {
      removableParamKeys.push(key)
    } else {
      planes.push({
        direction: key,
        offset: floatStrTrim(value),
      })
    }
    if (removableParamKeys.length) {
      removeHashParams(removableParamKeys)
    }
  })
  debug().log('CutPlaneMenu#getPlanes: planes: ', planes)
  return planes
}


/**
 * Add plane normal and the offset to the hash state
 *
 * @param {object} location from react-router
 * @param {object} viewer
 * @param {object} ifcModel
 */
export function addPlanesToHashState(location, viewer, ifcModel) {
  if (viewer.clipper.planes.length > 0) {
    const planeInfo = getPlanesOffset(viewer, ifcModel)
    debug().log('CutPlaneMenu#addPlaneLocationToUrl: planeInfo: ', planeInfo)
    addHashParams(window.location, planeInfo)
  }
}


/**
 * Removes cut plane params from hash state
 *
 * @param {object} location From react-router
 */
export function removePlanesFromHashState(location) {
  removeHashParams(location)
}
