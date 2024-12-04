import {getParams, hasParams, removeParams} from '../../utils/location'


/** The prefix to use for the Properties state token */
export const HASH_PREFIX_PROPERTIES = 'p'


/**
 * Return the Properties params in the hash
 *
 * @param {object} location from react-router
 * @return {object} Params present in state token
 */
export function getHashParams(location) {
  return getParams(location, HASH_PREFIX_PROPERTIES)
}


/** Remove properties hash param */
export function removeHashParams() {
  removeParams(HASH_PREFIX_PROPERTIES)
}


/** @return {boolean} */
export function isVisibleInitially() {
  return hasParams(HASH_PREFIX_PROPERTIES)
}
