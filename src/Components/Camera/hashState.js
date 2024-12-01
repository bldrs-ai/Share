import {
  removeParamsFromHash as utilsRemoveParamsFromHash,
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
