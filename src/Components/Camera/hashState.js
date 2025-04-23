import {
  removeParamsFromHash as utilsRemoveParamsFromHash,
  removeHashParams,
} from '../../utils/location'


/** The prefix to use for the Camera state token */
export const HASH_PREFIX_CAMERA = 'c'


/**
 * @param {string} hash
 * @return {string} hash with camera params removed
 */
export function removeParamsFromHash(hash) {
  return utilsRemoveParamsFromHash(hash, HASH_PREFIX_CAMERA)
}


/** Removes camera params from the URL if present */
export function removeCameraUrlParams() {
  removeHashParams(window.location, HASH_PREFIX_CAMERA)
}
